import React, { useState, useEffect, useRef } from 'react';
import { 
  RefreshCw, Upload, Sparkles, Image as ImageIcon, X, ImagePlus, AlertTriangle, 
  Tv, Banknote, Mail, ClipboardList
} from 'lucide-react';

// --- Constants and Configuration ---

const MAX_FILES = 25;

/** * NOTE FOR LOCAL/VERCEL DEPLOYMENT:
 * Environment variables in Vite/Vercel are accessed differently depending on the bundler.
 */
const getEnvApiKey = () => {
  // 1. Internal environment key (for Canvas preview)
  if (typeof __gemini_api_key !== 'undefined' && __gemini_api_key) return __gemini_api_key;
  
  // 2. Try Vite's environment access (Standard for Vite/Vercel React apps)
  // We use a try-catch to prevent crashes in environments where import.meta is restricted
  try {
    // @ts-ignore
    const viteKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (viteKey) return viteKey;
  } catch (e) {}

  // 3. Try standard process.env (Standard for Next.js/Webpack)
  try {
    if (typeof process !== 'undefined' && process.env) {
      return process.env.VITE_GEMINI_API_KEY || 
             process.env.NEXT_PUBLIC_GEMINI_API_KEY || 
             process.env.REACT_APP_GEMINI_API_KEY || "";
    }
  } catch (e) {}

  return ""; 
};

// Updated as requested
const API_MODEL = "gemini-3-flash-preview"; 
const apiKey = getEnvApiKey();

const SKY_SUBSCRIPTION_ITEMS = [
  "Netflix",
  "Disney+",
  "Apple TV+",
  "Paramount+",
  "Discovery+",
  "Sky Cinema",
  "Sky Sports",
  "Sky Kids",
  "BT Sport / TNT Sports",
  "Amazon Prime Video",
  "YouTube Premium",
  "Spotify",
  "DAZN",
  "Rakuten TV",
  "NOW TV"
];

const PROMPT_TEMPLATE = (passionList, metadataContext) => `
Analyze the provided image of a TV home screen or app menu.
${metadataContext ? `Metadata Context: ${metadataContext}` : ''}

Context: The user wants to detect which streaming service app icons are present on their TV to see if they can save money by switching to a 'Sky Essentials' combined subscription.

1. Describe the TV setup or the variety of apps visible in one concise sentence.
2. Based on the visual icons, map the image to the provided subscription list: [${passionList.join(', ')}].
3. Select the detected apps and categorize them:
   - 'High' confidence: Clearly visible icons found in the list.
   - 'Suggested' confidence: Partially visible or related service icons.
4. Provide the output only in JSON format.
`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { "type": "STRING", "description": "A brief, 1-sentence summary of the detected apps." },
    matchedPassions: {
      "type": "ARRAY",
      "description": "A list of detected streaming subscriptions from the provided list.",
      "items": {
        "type": "OBJECT",
        "properties": {
          "passionName": { "type": "STRING", "description": "The name of the subscription service from the provided list." },
          "confidence": { "type": "STRING", "description": "Must be one of: 'High' or 'Suggested'." }
        },
        "required": ["passionName", "confidence"]
      }
    }
  },
  required: ["description", "matchedPassions"]
};

// --- Utility Functions ---

const toBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = () => resolve(reader.result.split(',')[1]);
  reader.onerror = (error) => reject(error);
});

const exponentialBackoffFetch = async (url, options, maxRetries = 5) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      
      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};

// --- React Components ---

const ImagePreview = ({ file, isProcessing, onRemove, index }) => {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  return (
    <div className="relative w-full aspect-square rounded-lg overflow-hidden shadow-sm border border-gray-200 bg-gray-50">
      {previewUrl ? (
        <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      {isProcessing && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-white animate-spin" />
        </div>
      )}
      {!isProcessing && onRemove && (
        <button
          onClick={() => onRemove(index)}
          className="absolute top-1 right-1 bg-white/90 text-gray-700 rounded-full p-1 shadow-md hover:bg-white transition"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};

const ResultCard = ({ result, file }) => {
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [file]);

  const getConfidenceClass = (confidence) => {
    return confidence === 'High' 
      ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
      : 'bg-teal-50 text-teal-700 border-teal-200';
  };

  return (
    <div className={`flex flex-col md:flex-row gap-4 p-4 rounded-xl border ${result.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'} shadow-sm transition-all`}>
      <div className="flex-shrink-0 w-full md:w-40 h-40 rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
        {previewUrl ? (
          <img src={previewUrl} alt="Analysis Target" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-gray-300" />
          </div>
        )}
      </div>
      <div className="flex-grow">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-lg font-bold text-gray-800 truncate max-w-[250px]">{result.fileName}</h3>
          {result.error && <AlertTriangle className="w-5 h-5 text-red-500" />}
        </div>
        
        {result.error ? (
          <p className="text-red-600 text-sm font-medium">Error: {result.error}</p>
        ) : (
          <>
            <p className="text-gray-600 text-sm italic mb-4">"{result.description}"</p>
            <div className="flex flex-wrap gap-2">
              {result.matchedPassions?.length > 0 ? (
                result.matchedPassions.map((match, i) => (
                  <span key={i} className={`text-xs font-semibold py-1.5 px-3 rounded-lg border ${getConfidenceClass(match.confidence)}`}>
                    {match.passionName}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-400">No matching subscriptions detected.</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    setError(null);
    const newFiles = Array.from(event.target.files).filter(file => file.type.startsWith('image/'));

    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      setError(`Maximum of ${MAX_FILES} photos allowed.`);
      return;
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setResults([]); 
    }
    
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  const removeFile = (indexToRemove) => {
    if (loading) return;
    setSelectedFiles(prev => prev.filter((_, i) => i !== indexToRemove));
    setResults([]);
  };

  const analyzeImages = async () => {
    if (selectedFiles.length === 0 || loading) return;

    if (!apiKey) {
      setError("API Key is missing. If running locally, set VITE_GEMINI_API_KEY in your environment variables. On Vercel, ensure it's added to Project Settings.");
      return;
    }

    setLoading(true);
    setError(null);
    
    const initialResults = selectedFiles.map(file => ({
      file,
      data: null,
      error: null,
      processing: true
    }));
    setResults(initialResults);

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${apiKey}`;

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];
      try {
        const base64Data = await toBase64(file);
        const prompt = PROMPT_TEMPLATE(SKY_SUBSCRIPTION_ITEMS, "");

        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType: file.type, data: base64Data } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA
          }
        };

        const response = await exponentialBackoffFetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const apiResult = await response.json();
        const jsonText = apiResult.candidates?.[0]?.content?.parts?.[0]?.text;

        if (jsonText) {
          const parsedJson = JSON.parse(jsonText);
          setResults(prev => {
            const newRes = [...prev];
            newRes[i] = { ...newRes[i], data: parsedJson, processing: false };
            return newRes;
          });
        } else {
          throw new Error("Invalid model response. The model might not be accessible or content filters were triggered.");
        }
      } catch (err) {
        setResults(prev => {
          const newRes = [...prev];
          newRes[i] = { ...newRes[i], error: err.message, processing: false };
          return newRes;
        });
      }
    }
    setLoading(false);
  };

  const numProcessed = results.filter(r => !r.processing && (r.data || r.error)).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 bg-indigo-600 rounded-2xl mb-4 shadow-lg">
            <Tv className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-slate-800">
            Sky Essentials <span className="text-indigo-600">Savings</span>
          </h1>
          <p className="text-slate-500 mt-2 text-lg">Upload your TV home screen to find subscription overlaps.</p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-8">
          {[
            { icon: ClipboardList, label: "Manual Quiz" },
            { icon: Banknote, label: "Open Banking" },
            { icon: Mail, label: "Connect Gmail" }
          ].map((item, idx) => (
            <button key={idx} className="flex items-center justify-center gap-3 p-4 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-300 hover:bg-indigo-50 transition-colors group">
              <item.icon className="w-5 h-5 text-indigo-500 group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-slate-700">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="mb-8 p-6 bg-white rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <ImagePlus className="w-5 h-5 text-indigo-500" /> Photo Upload
            </h2>
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Max {MAX_FILES} files</span>
          </div>

          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-all group"
          >
            <Upload className="w-10 h-10 text-slate-300 group-hover:text-indigo-500 mb-4 transition-colors" />
            <p className="text-slate-600 font-medium">Click to select photos of your TV apps</p>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
              ref={fileInputRef}
              disabled={loading}
            />
          </label>

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> {error}
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="mt-6 grid grid-cols-3 sm:grid-cols-5 gap-3">
              {selectedFiles.map((file, index) => (
                <ImagePreview
                  key={index}
                  file={file}
                  isProcessing={results[index]?.processing}
                  onRemove={removeFile}
                  index={index}
                />
              ))}
            </div>
          )}
        </div>

        {selectedFiles.length > 0 && (
          <div className="flex justify-center mb-10">
            <button
              onClick={analyzeImages}
              disabled={loading}
              className={`w-full max-w-md py-4 rounded-2xl text-lg font-bold shadow-xl transition-all flex items-center justify-center gap-3
                ${loading 
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0'
                }`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Analyzing ({numProcessed}/{selectedFiles.length})
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Calculate Potential Savings
                </>
              )}
            </button>
          </div>
        )}

        {results.some(r => r.data || r.error) && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-yellow-500" /> Detected Subscriptions
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {results.map((result, idx) => (
                (!result.processing && (result.data || result.error)) && (
                  <ResultCard 
                    key={idx} 
                    file={result.file}
                    result={{ ...result.data, fileName: result.file.name, error: result.error }} 
                  />
                )
              ))}
            </div>

            <div className="mt-8 p-6 bg-gradient-to-br from-indigo-600 to-violet-700 text-white rounded-3xl shadow-xl text-center">
              <p className="text-xl font-bold mb-4">Combine these into one Sky Essentials package and save up to £25/month!</p>
              <a 
                href="https://www.sky.com/deals" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-block py-3 px-8 bg-white text-indigo-600 rounded-full font-black hover:bg-indigo-50 transition-colors"
              >
                Explore Sky Deals
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;