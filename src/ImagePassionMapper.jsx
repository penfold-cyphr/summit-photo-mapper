import React, { useState, useEffect, useRef } from 'react';
import { 
  RefreshCw, Upload, Sparkles, Image as ImageIcon, X, ImagePlus, AlertTriangle, 
  Calendar, Camera, MapPin 
} from 'lucide-react';
import * as ExifReader from 'exifreader';

// --- Constants and Configuration ---

const MAX_FILES = 25;
const API_MODEL = "gemini-2.5-flash-preview-09-2025";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=`;

const VERCEL_EMBEDDED_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

const ALL_PASSIONS = [
  // --- Headline Talks & Thought Leadership ---
  "Keynote Talks (Main Stage)", "AI & Future Tech", "Business & Leadership", 
  "Social Impact & Conservation", "Psychedelics & Healing", "Poetry & Storytelling",

  // --- Music & Nightlife ---
  "Live Music Performances", "DJ Sets & Dance Parties", "Vinyl Listening (Dante's HiFi+)", 
  "Electronic & House Music", "Hip Hop & Culture", "Sunrise/Sunset Sets",

  // --- Wellness & Embodiment ---
  "Morning Yoga & Flow", "Functional Fitness (Wimberlean)", "Meditation & Breathwork", 
  "Neurosculpting & Mindset", "Sound Healing", "Intimacy & Connection Workshops", 
  "Spa & Recovery",

  // --- Arts & Entertainment ---
  "Art Installations & Sculpture", "Live Painting", "Comedy Shows", "Interactive Performance", 
  "Film Screenings", "The Great Bingo Revival",

  // --- Food & Drink ---
  "Culinary Experiences", "Michelin-Starred Dining", "Community Brunch (Kishi Bros)", 
  "Mixology & Spirits", "Casual Dining",

  // --- Community & Connection ---
  "Singles Mixers", "Founder & Investor Meetups", "Climate & Impact Gatherings", 
  "Women+ Community", "Workshops & Masterclasses",

  // --- Nature & Adventure ---
  "Ocean & Marine Life", "Caribbean Views", "Sailing & Cruising"
];

const PROMPT_TEMPLATE = (passionList, metadataContext) => `
Analyze the provided image and its metadata to recommend specific itinerary items for **Summit at Sea 2024**.
Metadata Context: ${metadataContext}

The user is attending Summit at Sea 2024. Use the visual cues to map the image to the following specific lineup:

**Key Lineup & Vibe Context:**
- **Music & Nightlife:** Matches Diplo, Moodymann, D-Nice, Just Blaze, Dante's HiFi+ (Vinyl Listening), Walshy Fire, Natasha Diggs (Soul in the Horn), DJ Whoo Kid, Heimlich Knüller, DRĖĖĖMY, Stolen Nova, or Matthew O. Brimer.
- **Talks & Ideas:** Matches Megan Rapinoe & Sue Bird, Dr. Mark Hyman (Longevity), Steven Kotler (Flow State), Imran Chaudhri (Humane/AI), Kevin Plank (Under Armour), Jennifer Morris (Nature Conservancy), Robert Thurman (Buddhism), or Fab 5 Freddy.
- **Wellness & Movement:** Matches Wimberlean (Jason Wimberly), Ziva Meditation (Emily Fletcher), Neurosculpting (Lisa Wimberger), The Class, or Morning Yoga.
- **Art & Performance:** Matches Leo Villareal (Light Art), Nikolai Haas (Sculpture), J. Ivy (Poetry), The Great Bingo Revival, or Comedy with Ben Gleib.
- **Food & Community:** Matches Kishi Brothers Brunch, Michelin-inspired dining, Singles Mixers, or Climate Investors Meetup.

**Instructions:**
1. **Describe** the main activity or vibe of the photo in one concise sentence.
2. **Map** the image content to the provided Summit at Sea 2024 itinerary items: [${passionList.join(', ')}].
   - *Example:* A gym/workout photo matches "Functional Fitness (Wimberlean)".
   - *Example:* A nature/ocean photo matches "Social Impact & Conservation" or "Ocean & Marine Life".
   - *Example:* A party photo matches "DJ Sets & Dance Parties" or specific vibes like "Electronic & House Music".
3. **Select** the most relevant itinerary items:
   - 'High' confidence: Select 1-5 items.
   - 'Suggested' confidence: Select 1-5 items.
4. Provide the output only in the requested JSON format.
`;

const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    description: { "type": "STRING", "description": "A brief, 1-sentence summary of the main activity/context found in the photo." },
    matchedPassions: {
      "type": "ARRAY",
      "description": "A list of 2 to 10 itinerary items from the provided list that best match the photo's content, categorized by confidence level (High or Suggested).",
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

// --- THIS COMPONENT CONTAINS THE FIX ---
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
        return 'bg-green-50 text-green-700 border-green-200';
      case 'Suggested':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const isError = result.error;
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
        
        {metadata && (metadata.date || metadata.camera || metadata.location) && (
          <div className="text-xs text-gray-500 mb-3 flex flex-wrap gap-x-4 gap-y-1 items-center">
            {metadata.date && (
              <span className="flex items-center gap-1.5" title="Date Taken">
                <Calendar className="w-3.5 h-3.5" /> {metadata.date}
              </span>
            )}
            {metadata.camera && (
              <span className="flex items-center gap-1.5" title="Camera Model">
                <Camera className="w-3.5 h-3.5" /> {metadata.camera}
              </span>
            )}
            {/* --- FIX IS HERE --- */}
            {metadata.location && (
              <a 
                // Use the correct, standard Google Maps URL
                href={`https://www.google.com/maps?q=${metadata.location.lat},${metadata.location.lng}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-blue-600 hover:underline"
                title="View on Map"
              >
                <MapPin className="w-3.5 h-3.5" /> View Map
              </a>
            )}
            {/* --- END FIX --- */}
          </div>
        )}

        {isError ? (
          <p className="text-red-600 font-medium flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" /> Error: {result.error}
          </p>
        ) : (
          <>
            <p className="text-gray-600 mb-3 text-sm leading-relaxed">
              <span className="font-medium text-gray-700">Context:</span> {result.description || 'No description provided.'}
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

    const currentApiKey = VERCEL_EMBEDDED_API_KEY; 
    if (!currentApiKey) {
      setError("API Key Missing! Please set the VITE_GEMINI_API_KEY environment variable.");
      return;
    }

    setLoading(true);
    setError(null);

    const processedFilesData = await Promise.all(selectedFiles.map(async (file) => {
      try {
        const [base64Data, tags] = await Promise.all([
          toBase64(file),
          ExifReader.load(file).catch(err => {
            console.warn(`Could not read EXIF data for ${file.name}:`, err);
            return {};
          })
        ]);

        let metadataContext = "No additional metadata available.";
        let extractedMetadata = { date: null, camera: null, location: null };
        
        const date = tags.DateTimeOriginal?.description;
        const camera = tags.Model?.description;
        const lat = tags.GPSLatitude?.description;
        const lng = tags.GPSLongitude?.description;

        let metadataParts = [];
        if (date) {
          metadataParts.push(`Date taken: ${date}`);
          extractedMetadata.date = date;
        }
        if (camera) {
          metadataParts.push(`Camera: ${camera}`);
          extractedMetadata.camera = camera;
        }
        if (lat !== undefined && lng !== undefined) {
          extractedMetadata.location = { lat, lng };
          metadataParts.push(`Location: (${lat.toFixed(6)}, ${lng.toFixed(6)})`);
        }
        if (metadataParts.length > 0) {
          metadataContext = "Use the following metadata to improve the analysis: " + metadataParts.join('; ');
        }
        
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

    const apiUrlWithKey = API_URL + currentApiKey;
    let currentResults = [...initialResults];

    for (let i = 0; i < processedFilesData.length; i++) {
      const pf = processedFilesData[i];
      
      if (pf.error) continue; 
      
      try {
        const prompt = PROMPT_TEMPLATE(ALL_PASSIONS, pf.metadataContext);
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

  const displayApiKey = VERCEL_EMBEDDED_API_KEY;
  const isButtonDisabled = loading || selectedFiles.length === 0 || !displayApiKey;
  const numProcessed = results.filter(r => !r.processing && (r.data || r.error)).length;

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      <div className="max-w-4xl mx-auto px-4 py-8 sm:px-6 lg:px-8">
        
        <header className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-800 flex flex-col items-center justify-center gap-2">
            Summit Photo Passions
          </h1>
          <p className="text-gray-600 mt-3 text-lg sm:text-xl">Discover the passions hidden in your travel photos.</p>
        </header>

        {!displayApiKey && (
          <div className="mb-8 p-4 bg-yellow-100 text-yellow-800 rounded-lg border border-yellow-300 font-medium text-center flex items-center justify-center gap-2">
            <AlertTriangle className="w-5 h-5" /> 
            **API Key Required:** Please deploy to Vercel and set the `VITE_GEMINI_API_KEY` environment variable.
          </div>
        )}

        <section className="mb-12 p-6 bg-gray-50 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-2xl font-semibold text-gray-800 mb-6 flex items-center gap-3">
            <ImagePlus className="w-6 h-6 text-indigo-500" /> Upload Your Memories (Max {MAX_FILES})
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
                  Analyzing {Math.min(numProcessed + 1, selectedFiles.length)} of {selectedFiles.length} photos...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" />
                  Analyze Photos
                </>
              )}
            </button>
          </section>
        )}

        {/* --- Results Display Area --- */}
        {results.length > 0 && (
          <section className="p-6 bg-white rounded-lg shadow-md border border-gray-100">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6 border-b pb-4 flex items-center gap-3">
              <Sparkles className="w-6 h-6 text-indigo-500" /> Your Photo Passions
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
