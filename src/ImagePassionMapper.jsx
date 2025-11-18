import React, { useState, useEffect, useRef } from 'react';
import { 
  RefreshCw, Upload, Sparkles, Image as ImageIcon, X, ImagePlus, AlertTriangle, 
  Calendar, Camera, MapPin, Anchor, Music, Waves
} from 'lucide-react';

// --- Constants and Configuration ---

const MAX_FILES = 25;
const API_MODEL = "gemini-2.5-flash-preview-09-2025";
const apiKey = ""; // The execution environment provides the key at runtime.
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=`;

// Updated List based on Summit at Sea 2024 Itinerary
const SUMMIT_ITINERARY_ITEMS = [
  // --- Music & Entertainment ---
  "Sail Away Party & Concert (RELAPSE)",
  "DJ Sets (Diplo, Moodymann, D-Nice)",
  "Live Music (Dames Brown, Mandrake)",
  "Multimedia Performances (Eduardo Castillo)",
  
  // --- Talks & Conversations ---
  "Diplo & Just Blaze: Culture, Music & Art",
  "Megan Rapinoe & Sue Bird Conversation",
  "Tibetan Wisdom (Robert Thurman)",
  "D-Nice & Dream Hampton Conversation",
  "Morning Lectures & Leadership Panels",
  
  // --- Wellness & Nature ---
  "Wellness: Music For Mushrooms (East Forest)",
  "Ship Exploration & Caribbean Views",
  "Ocean Conservancy & Sustainability Talks",
  "Morning Yoga & Wellness Workshops",
  
  // --- Community & Lifestyle ---
  "Community Stage & Networking",
  "Culinary Program & Fine Dining",
  "Art Installations & Exhibits",
  "RD Member Get Together (Vortex Lounge)"
];

const PROMPT_TEMPLATE = (passionList, metadataContext) => `
Analyze the provided image.
${metadataContext ? `Metadata Context: ${metadataContext}` : ''}

Context: The user is interested in the 'Summit at Sea' event (a creative leadership conference on a cruise ship). 
The goal is to match the *vibe* or *content* of their uploaded photo to specific items on the Summit at Sea itinerary.

1. Describe the main activity or vibe of the photo in one concise sentence.
2. Based on the visual cues, map the image to the provided Summit at Sea itinerary list: [${passionList.join(', ')}].
   - Example: A photo of a party or concert -> Match to "DJ Sets" or "Sail Away Party".
   - Example: A photo of nature/ocean -> Match to "Ocean Conservancy" or "Ship Exploration".
   - Example: A photo of food/drink -> Match to "Culinary Program".
   - Example: A photo of art/museums -> Match to "Art Installations" or "Culture Talks".
   - Example: A photo of sports/fitness -> Match to "Megan Rapinoe Conversation" or "Wellness Workshops".
   - Example: A photo of books/learning -> Match to "Morning Lectures" or "Tibetan Wisdom".

3. Select the most relevant itinerary items and categorize them:
   - 'High' confidence: Select a minimum of 1 and a maximum of 5 items.
   - 'Suggested' confidence: Select a minimum of 1 and a maximum of 5 items.
   - **DO NOT** use any other confidence labels.
4. Provide the output only in the requested JSON format.
`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { "type": "STRING", "description": "A brief, 1-sentence summary of the photo's vibe." },
    matchedPassions: {
      "type": "ARRAY",
      "description": "A list of recommended Summit at Sea itinerary items based on the photo.",
      "items": {
        "type": "OBJECT",
        "properties": {
          "passionName": { "type": "STRING", "description": "The name of the itinerary item from the provided list." },
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

const exponentialBackoffFetch = async (url, options, maxRetries = 3) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      if (response.status === 429 && attempt < maxRetries - 1) {
        const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
        console.warn(`Retrying API call in ${delay}ms... (Attempt ${attempt + 1})`);
        continue;
      }
      throw new Error(`API call failed with status: ${response.status} ${response.statusText}`);
    } catch (error) {
      if (attempt === maxRetries - 1) {
        console.error("Fetch failed after all retries:", error);
        throw error;
      }
      const delay = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, delay));
      console.warn(`Retrying network failure in ${delay}ms... (Attempt ${attempt + 1})`);
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
    <div className="relative w-full aspect-square rounded-lg overflow-hidden shadow-sm border border-gray-200">
      {previewUrl ? (
        <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-50">
          <ImageIcon className="w-8 h-8 text-gray-400" />
        </div>
      )}
      {isProcessing && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <RefreshCw className="w-6 h-6 text-white animate-spin" />
        </div>
      )}
      {onRemove && (
        <button
          onClick={() => onRemove(index)}
          className="absolute top-1 right-1 bg-white text-gray-700 rounded-full p-1 shadow-md hover:bg-gray-100 transition"
          aria-label={`Remove ${file.name}`}
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
    switch (confidence) {
      case 'High':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'Suggested':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const isError = result.error;
  // Metadata support is simplified here as ExifReader was removed
  const { metadata } = result;

  return (
    <div className={`flex flex-col md:flex-row gap-4 p-4 rounded-lg border ${isError ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'} shadow-sm`}>
      <div className="flex-shrink-0 w-full md:w-36 h-36 rounded-md overflow-hidden bg-gray-100 flex items-center justify-center">
        {previewUrl ? (
          <img src={previewUrl} alt={result.fileName} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-10 h-10 text-gray-400" />
        )}
      </div>
      <div className="flex-grow">
        <h3 className="text-xl font-semibold text-gray-800 mb-2">{result.fileName}</h3>
        
        {isError ? (
          <p className="text-red-600 font-medium flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Error: {result.error}
          </p>
        ) : (
          <>
            <p className="text-gray-600 mb-3 text-sm leading-relaxed">
              <span className="font-medium text-gray-700">Vibe Analysis:</span> {result.description || 'No description provided.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
              {(result.matchedPassions || []).map((match, i) => (
                <span key={i} className={`text-xs font-medium py-1 px-3 rounded-full border ${getConfidenceClass(match.confidence)}`}>
                  {match.passionName} <span className="text-gray-500">({match.confidence})</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// --- Main App Component ---

const App = () => {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [results, setResults] = useState([]); // Stores { file, data, error, processing, metadata }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Inject Tailwind CSS
  useEffect(() => {
    if (!document.querySelector('#tailwind-script')) {
      const script = document.createElement('script');
      script.id = 'tailwind-script';
      script.src = 'https://cdn.tailwindcss.com';
      document.head.appendChild(script);
    }
  }, []);

  const handleFileChange = (event) => {
    setError(null);
    const newFiles = Array.from(event.target.files).filter(file => file.type.startsWith('image/'));

    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }

    if (selectedFiles.length + newFiles.length > MAX_FILES) {
      setError(`Maximum of ${MAX_FILES} photos allowed. Please select fewer files.`);
      return;
    }

    setSelectedFiles(prev => {
      const updated = [...prev, ...newFiles].slice(0, MAX_FILES);
      if (prev.length !== updated.length) setResults([]);
      return updated;
    });
  };

  const removeFile = (indexToRemove) => {
    if (loading) return;
    setSelectedFiles(prev => {
      const updatedFiles = prev.filter((_, i) => i !== indexToRemove);
      setResults([]);
      return updatedFiles;
    });
  };

  const analyzeImages = async () => {
    if (selectedFiles.length === 0 || loading) return;

    setLoading(true);
    setError(null);

    const processedFilesData = await Promise.all(selectedFiles.map(async (file) => {
      try {
        const base64Data = await toBase64(file);
        
        // Removed ExifReader dependency to prevent build errors
        // Metadata logic is simplified to placeholders or empty for now
        let metadataContext = ""; 
        let extractedMetadata = { date: null, camera: null, location: null };
        
        return { file, base64Data, metadata: extractedMetadata, metadataContext, error: null };

      } catch (preprocessingError) {
        console.error(`Failed to preprocess ${file.name}:`, preprocessingError);
        return { file, base64Data: null, metadata: null, metadataContext: null, error: preprocessingError.message || "Failed to read file" };
      }
    }));

    const initialResults = processedFilesData.map(pf => ({
      file: pf.file,
      data: null,
      error: pf.error,
      processing: !pf.error,
      metadata: pf.metadata
    }));
    setResults(initialResults);

    const apiUrlWithKey = API_URL + apiKey;
    let currentResults = [...initialResults];

    for (let i = 0; i < processedFilesData.length; i++) {
      const pf = processedFilesData[i];
      
      if (pf.error) continue; 
      
      try {
        const prompt = PROMPT_TEMPLATE(SUMMIT_ITINERARY_ITEMS, pf.metadataContext);
        const mimeType = pf.file.type;

        const payload = {
          contents: [{
            parts: [
              { text: prompt },
              { inlineData: { mimeType, data: pf.base64Data } }
            ]
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA
          }
        };

        const response = await exponentialBackoffFetch(apiUrlWithKey, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const apiResult = await response.json();
        const candidate = apiResult.candidates?.[0];
        const jsonText = candidate?.content?.parts?.[0]?.text;

        if (jsonText) {
          const parsedJson = JSON.parse(jsonText);
          currentResults[i] = { ...currentResults[i], data: parsedJson, error: null, processing: false };
        } else {
          const errorMessage = apiResult.error?.message || apiResult.error?.details?.[0]?.message || "Model response was empty or malformed.";
          console.error(`Error processing ${pf.file.name}:`, apiResult);
          currentResults[i] = { ...currentResults[i], data: null, error: errorMessage, processing: false };
        }
      } catch (fileError) {
        console.error(`Error with file ${pf.file.name}:`, fileError);
        currentResults[i] = { ...currentResults[i], data: null, error: fileError.message || 'File processing failed', processing: false };
      }

      setResults([...currentResults]);
    }
    
    setLoading(false);
  };

  const isButtonDisabled = loading || selectedFiles.length === 0;
  const numProcessed = results.filter(r => !r.processing && (r.data || r.error)).length;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        <header className="text-center mb-12">
            <div className="flex items-center justify-center gap-3 mb-4">
                <Anchor className="w-10 h-10 text-indigo-600" />
            </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-800 flex flex-col items-center justify-center gap-2">
            Summit at Sea
            <span className="text-2xl sm:text-3xl font-semibold text-indigo-600">Experience Matcher</span>
          </h1>
          <p className="text-gray-600 mt-3 text-lg sm:text-xl">Upload your photos to find your perfect itinerary matches.</p>
        </header>

        <section className="mb-12 p-6 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center gap-3">
            <ImagePlus className="w-6 h-6 text-indigo-500" /> Upload Your Vibe (Max {MAX_FILES})
          </h2>
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center p-10 border-2 border-dashed border-indigo-300 rounded-lg cursor-pointer hover:bg-indigo-50 transition duration-200 text-center"
          >
            <Upload className="w-12 h-12 text-indigo-500 mb-4" />
            <p className="text-indigo-600 font-medium text-lg">Click to browse or drag your photos here</p>
            <p className="text-sm text-gray-500 mt-2">
              JPG, PNG, GIF up to {MAX_FILES} files
            </p>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
              multiple
              onChange={handleFileChange}
              className="hidden"
              ref={fileInputRef}
            />
          </label>

          {error && <div className="mt-6 p-4 bg-red-100 text-red-700 rounded-md font-medium">{error}</div>}

          {selectedFiles.length > 0 && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {selectedFiles.map((file, index) => (
                <ImagePreview
                  key={file.name + index}
                  file={file}
                  isProcessing={results.find(r => r.file === file)?.processing || false}
                  onRemove={removeFile}
                  index={index}
                />
              ))}
            </div>
          )}
        </section>

        {selectedFiles.length > 0 && (
          <section className="mb-12 text-center">
            <button
              onClick={analyzeImages}
              disabled={isButtonDisabled}
              className={`w-full max-w-lg py-4 px-8 rounded-full text-xl font-bold transition-all duration-300 shadow-lg
                ${isButtonDisabled
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-300 hover:scale-[1.01]'
                }
                flex items-center justify-center gap-3`}
            >
              {loading ? (
                <>
                  <RefreshCw className="w-6 h-6 animate-spin" />
                  Matching Itinerary ({Math.min(numProcessed + 1, selectedFiles.length)} of {selectedFiles.length})...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" />
                  Find My Events
                </>
              )}
            </button>
          </section>
        )}

        {/* --- Results Display Area --- */}
        {results.length > 0 && (
          <section className="p-6 bg-white rounded-lg shadow-md border border-gray-100">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 border-b pb-4 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-indigo-500" /> Your Summit Recommendations
            </h2>
            <div className="space-y-6">
              {results.map((result, index) => (
                (!result.processing && (result.data || result.error)) && (
                  <ResultCard 
                    key={result.file.name + index} 
                    result={{ 
                      ...result.data, 
                      fileName: result.file.name, 
                      error: result.error,
                      metadata: result.metadata
                    }} 
                    file={result.file} 
                  />
                )
              ))}
              {loading && results.some(r => r.processing) && (
                 <div className="flex items-center justify-center py-6 text-gray-500 text-lg">
                   <RefreshCw className="w-5 h-5 animate-spin mr-3" /> Still processing some images...
                 </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};

export default App;
