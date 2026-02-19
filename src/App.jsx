import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Square, Volume2, BookOpen, AlertCircle, RefreshCw, LayoutGrid, X, Languages, Search, ExternalLink, BookText } from 'lucide-react';

// --- Utility: Transliteration Generator ---
const generateTransliteration = (hebrewStr) => {
  // Strip cantillation marks (te'amim) and Sof Pasuq
  let cleanStr = hebrewStr.replace(/[\u0591-\u05AF\u05C3]/g, '');
  // Replace maqaf with hyphen
  cleanStr = cleanStr.replace(/\u05BE/g, '-');

  const charMap = {
    'א': '', 'ב': 'v', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'v', 'ז': 'z', 'ח': 'ch', 'ט': 't', 'י': 'y',
    'כ': 'ch', 'ך': 'ch', 'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': "'",
    'פ': 'f', 'ף': 'f', 'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't'
  };

  const dageshMap = { 'ב': 'b', 'כ': 'k', 'פ': 'p', 'ת': 't' };

  const vowelMap = {
    '\u05B0': 'e', '\u05B1': 'e', '\u05B2': 'a', '\u05B3': 'o', 
    '\u05B4': 'i', '\u05B5': 'e', '\u05B6': 'e', '\u05B7': 'a', 
    '\u05B8': 'a', '\u05B9': 'o', '\u05BB': 'u', '\u05C7': 'o'
  };

  let result = '';
  for (let i = 0; i < cleanStr.length; i++) {
    const char = cleanStr[i];
    const nextChar = cleanStr[i + 1];

    if (char === 'ש') {
      if (nextChar === '\u05C2') { result += 's'; i++; } 
      else if (nextChar === '\u05C1') { result += 'sh'; i++; } 
      else { result += 'sh'; }
    } else if (char === 'ו' && nextChar === '\u05BC') { result += 'u'; i++; } 
      else if (char === 'ו' && nextChar === '\u05B9') { result += 'o'; i++; } 
      else if (charMap[char] !== undefined) {
      if (nextChar === '\u05BC') {
        result += dageshMap[char] || charMap[char];
        i++;
      } else { result += charMap[char]; }
    } else if (vowelMap[char] !== undefined) {
      result += vowelMap[char];
    } else {
      result += char; 
    }
  }

  // Formatting cleanup for nicer readability
  return result
    .replace(/iy/g, 'i')
    .replace(/uw/g, 'u')
    .replace(/h /g, 'h ')
    .replace(/^'+|'+$/g, '')
    .replace(/ '+/g, ' ')
    .replace(/-+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
};

// --- Utility: Process Hebrew HTML for Highlighting & TTS ---
const processHebrewText = (htmlText) => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlText || "";
  
  let wordIndex = 0;
  const ttsWordsArray = [];
  
  const walk = (node) => {
    if (node.nodeType === 3) { // Text node
      const text = node.nodeValue;
      const words = text.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      
      words.forEach(word => {
         if (/[A-Za-z\u0590-\u05FF0-9]/.test(word)) {
           const span = document.createElement('span');
           span.textContent = word;
           span.setAttribute('data-word-index', wordIndex++);
           // Added cursor-pointer and hover effects so users know it's clickable
           span.className = "transition-all duration-150 rounded-md px-1 -mx-1 cursor-pointer hover:bg-stone-100 hover:text-blue-600 active:bg-blue-100";
           fragment.appendChild(span);
           ttsWordsArray.push(word);
         } else {
           fragment.appendChild(document.createTextNode(word));
         }
      });
      node.parentNode.replaceChild(fragment, node);
    } else if (node.nodeType === 1) { 
      Array.from(node.childNodes).forEach(walk);
    }
  };
  
  Array.from(tempDiv.childNodes).forEach(walk);
  
  return {
    wrappedHe: tempDiv.innerHTML,
    ttsText: ttsWordsArray.join(' ')
  };
};

export default function App() {
  const [chapter, setChapter] = useState(1);
  const [verses, setVerses] = useState([]);
  const [hebrewTitle, setHebrewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const [showTranslit, setShowTranslit] = useState(false);
  
  // Audio state
  const audioRef = useRef(null);
  const [isPlayingChapter, setIsPlayingChapter] = useState(false);
  const [playingVerseNum, setPlayingVerseNum] = useState(null);
  const [highlightedWordIndex, setHighlightedWordIndex] = useState(null);
  const highlightIntervalRef = useRef(null);

  // Word Dictionary Modal State
  const [wordModal, setWordModal] = useState({
    show: false,
    originalWord: "",
    cleanWord: "",
    data: [],
    loading: false,
    error: null
  });

  useEffect(() => {
    fetchPsalm(chapter);
    
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.load();
      setIsPlayingChapter(false);
    }
    stopVerseAudio();
  }, [chapter]);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const handlePlay = () => setIsPlayingChapter(true);
    const handlePause = () => setIsPlayingChapter(false);
    const handleEnded = () => setIsPlayingChapter(false);

    audioEl.addEventListener('play', handlePlay);
    audioEl.addEventListener('pause', handlePause);
    audioEl.addEventListener('ended', handleEnded);

    return () => {
      audioEl.removeEventListener('play', handlePlay);
      audioEl.removeEventListener('pause', handlePause);
      audioEl.removeEventListener('ended', handleEnded);
    };
  }, [verses]);

  // Clean up the highlight timer if the component unmounts
  useEffect(() => {
    return () => clearInterval(highlightIntervalRef.current);
  }, []);

  const fetchPsalm = async (chapNum) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`https://www.sefaria.org/api/texts/Psalms.${chapNum}?context=0`);
      if (!response.ok) throw new Error("Failed to fetch the text.");
      
      const data = await response.json();
      setHebrewTitle(data.heRef || `תהילים ${chapNum}`);
      
      const hebrewArray = data.he || [];
      const englishArray = data.text || [];
      
      const combined = hebrewArray.map((heText, index) => {
        const processed = processHebrewText(heText);
        return {
          num: index + 1,
          wrappedHe: processed.wrappedHe,
          ttsText: processed.ttsText,
          transliteration: generateTransliteration(processed.ttsText),
          en: englishArray[index] || ""
        };
      });
      
      setVerses(combined);
    } catch (err) {
      console.error(err);
      setError("Could not load the Psalm. Please check your internet connection.");
    } finally {
      setLoading(false);
    }
  };

  // Fetch Dictionary Data for Clicked Word
  const handleWordClick = async (rawWord) => {
    // Strip cantillation (te'amim) so Sefaria lexicon can match the root word, but keep vowels
    const cleanWord = rawWord.replace(/[\u0591-\u05AF\u05C3]/g, '').trim();
    
    setWordModal({
      show: true,
      originalWord: rawWord,
      cleanWord: cleanWord,
      data: [],
      loading: true,
      error: null
    });

    try {
      const response = await fetch(`https://www.sefaria.org/api/words/${encodeURIComponent(cleanWord)}`);
      if (!response.ok) throw new Error("Dictionary lookup failed.");
      
      const data = await response.json();
      setWordModal(prev => ({ ...prev, loading: false, data: Array.isArray(data) ? data : [] }));
    } catch (err) {
      console.error(err);
      setWordModal(prev => ({ ...prev, loading: false, error: "Could not fetch dictionary definition." }));
    }
  };

  const getChapterAudioUrl = (chap) => {
    const paddedChap = String(chap).padStart(2, '0');
    return `https://mechon-mamre.org/mp3/t26${paddedChap}.mp3`;
  };

  const playVerse = (ttsText, verseNum) => {
    if (!('speechSynthesis' in window)) {
      alert("Text-to-speech is not supported in your browser. Please try Chrome or Safari.");
      return;
    }

    try {
      if (audioRef.current && isPlayingChapter) {
        audioRef.current.pause();
      }
      window.speechSynthesis.cancel();
      clearInterval(highlightIntervalRef.current);
      
      const utterance = new SpeechSynthesisUtterance(ttsText);
      utterance.lang = 'he-IL'; 
      utterance.rate = 1.0;     

      const totalWords = ttsText.trim() === '' ? 0 : ttsText.trim().split(/\s+/).length;

      utterance.onstart = () => {
        setPlayingVerseNum(verseNum);
        setHighlightedWordIndex(0);
        
        let currentWord = 0;
        // Move the highlight independently of the audio at a fixed speed (350ms per word)
        highlightIntervalRef.current = setInterval(() => {
          currentWord++;
          if (currentWord >= totalWords) {
            clearInterval(highlightIntervalRef.current);
          } else {
            setHighlightedWordIndex(currentWord);
          }
        }, 350);
      };

      utterance.onend = () => {
        clearInterval(highlightIntervalRef.current);
        setPlayingVerseNum(null);
        setHighlightedWordIndex(null);
      };
      
      utterance.onerror = () => {
        clearInterval(highlightIntervalRef.current);
        setPlayingVerseNum(null);
        setHighlightedWordIndex(null);
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error("TTS Error:", e);
      clearInterval(highlightIntervalRef.current);
      setPlayingVerseNum(null);
      setHighlightedWordIndex(null);
    }
  };

  const stopVerseAudio = () => {
    clearInterval(highlightIntervalRef.current);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setPlayingVerseNum(null);
    setHighlightedWordIndex(null);
  };

  const toggleChapterAudio = () => {
    if (!audioRef.current) return;
    if (isPlayingChapter) {
      audioRef.current.pause();
    } else {
      stopVerseAudio();
      audioRef.current.play();
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 pb-24 selection:bg-blue-100 relative">
      <header className="sticky top-0 bg-white/90 backdrop-blur-md border-b border-stone-200 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                <BookOpen size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-stone-800 tracking-tight">Tehillim Reader</h1>
                <p className="text-sm text-stone-500 font-medium">{hebrewTitle || `Psalm ${chapter}`}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 bg-stone-100 p-1.5 rounded-2xl">
              <button 
                disabled={chapter <= 1 || loading} 
                onClick={() => setChapter(c => c - 1)}
                className="p-2 hover:bg-white hover:shadow-sm rounded-xl disabled:opacity-40 transition-all"
                title="Previous Psalm"
              >
                <ChevronLeft size={20} />
              </button>
              
              <button 
                onClick={() => setShowChapterModal(true)}
                disabled={loading}
                className="flex items-center gap-2 bg-transparent hover:bg-white hover:shadow-sm px-4 py-2 font-bold text-stone-700 rounded-xl transition-all min-w-[120px] justify-center disabled:opacity-40"
              >
                <LayoutGrid size={18} className="text-stone-400" />
                <span>Psalm {chapter}</span>
              </button>
              
              <button 
                disabled={chapter >= 150 || loading} 
                onClick={() => setChapter(c => c + 1)}
                className="p-2 hover:bg-white hover:shadow-sm rounded-xl disabled:opacity-40 transition-all"
                title="Next Psalm"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between bg-stone-100/80 p-3 rounded-2xl border border-stone-200 gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                onClick={toggleChapterAudio}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold transition-all flex-1 sm:flex-none justify-center ${
                  isPlayingChapter 
                    ? "bg-stone-800 text-white hover:bg-stone-700" 
                    : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20"
                }`}
              >
                 {isPlayingChapter ? <Square fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} />}
                 {isPlayingChapter ? "Pause Chapter" : "Listen to Chapter"}
              </button>
              
              <button 
                onClick={() => setShowTranslit(!showTranslit)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold transition-all ${
                  showTranslit ? 'bg-blue-100 text-blue-700 border border-transparent' : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
                title="Toggle Phonetic Transliteration"
              >
                <Languages size={18} />
                <span className="hidden md:inline">Phonetics</span>
              </button>
            </div>
            
            <div className="flex-1 w-full max-w-sm flex items-center justify-end">
               <audio 
                 ref={audioRef} 
                 src={getChapterAudioUrl(chapter)} 
                 controls 
                 controlsList="nodownload"
                 className="h-10 w-full"
               />
            </div>
          </div>
        </div>
      </header>

      {/* Chapter Selection Modal */}
      {showChapterModal && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center p-5 md:p-6 border-b border-stone-100 bg-white z-10">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-stone-800 tracking-tight">Select Psalm</h2>
                <p className="text-sm text-stone-500 font-medium mt-1">Jump to any of the 150 chapters</p>
              </div>
              <button 
                onClick={() => setShowChapterModal(false)}
                className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            <div className="overflow-y-auto p-5 md:p-6 flex-1 bg-stone-50/50">
              <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 sm:gap-3">
                {Array.from({ length: 150 }, (_, i) => i + 1).map(c => (
                  <button
                    key={c}
                    onClick={() => {
                      setChapter(c);
                      setShowChapterModal(false);
                    }}
                    className={`aspect-square sm:aspect-auto sm:py-3 rounded-2xl font-bold text-center transition-all flex items-center justify-center text-lg ${
                      chapter === c
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 ring-2 ring-blue-600 ring-offset-2 ring-offset-stone-50'
                        : 'bg-white text-stone-700 hover:bg-blue-50 hover:text-blue-700 border border-stone-200 hover:border-blue-200 hover:shadow-sm'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Word Dictionary Modal */}
      {wordModal.show && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            
            <div className="flex justify-between items-start p-6 border-b border-stone-100 bg-white">
              <div>
                <div className="flex items-center gap-2 text-stone-500 mb-1">
                  <BookText size={16} />
                  <span className="text-xs font-bold uppercase tracking-wider">Word Study</span>
                </div>
                <h2 className="text-4xl font-serif text-stone-900 mt-2" dir="rtl">{wordModal.cleanWord}</h2>
              </div>
              <button 
                onClick={() => setWordModal({ ...wordModal, show: false })}
                className="p-2 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 flex-1 bg-stone-50">
              {wordModal.loading && (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-stone-200 rounded w-3/4"></div>
                  <div className="h-4 bg-stone-200 rounded w-1/2"></div>
                  <div className="h-4 bg-stone-200 rounded w-5/6"></div>
                </div>
              )}

              {wordModal.error && !wordModal.loading && (
                <div className="text-stone-500 text-center py-4">
                  <p>{wordModal.error}</p>
                </div>
              )}

              {!wordModal.loading && !wordModal.error && wordModal.data.length === 0 && (
                <div className="text-stone-500 text-center py-4">
                  <p>No exact dictionary definition found for this prefix/suffix combination.</p>
                  <p className="mt-2 text-sm">Click below to search its usage across the Tanakh.</p>
                </div>
              )}

              {!wordModal.loading && wordModal.data.length > 0 && (
                <div className="space-y-6">
                  {wordModal.data.map((entry, idx) => {
                    // Extract definitions safely based on Sefaria's Lexicon API structures
                    let definition = "Definition available on Sefaria.";
                    if (entry.content && entry.content.senses && entry.content.senses.length > 0) {
                      definition = entry.content.senses[0].definition || entry.content.senses[0].meaning;
                    } else if (entry.headword) {
                      definition = "Related to root: " + entry.headword;
                    }

                    // Clean out Sefaria's HTML tags for strong/em if they exist
                    if(definition && typeof definition === 'string') {
                        definition = definition.replace(/<[^>]*>?/gm, '');
                    }

                    return (
                      <div key={idx} className="bg-white p-4 rounded-2xl border border-stone-200 shadow-sm">
                        <div className="flex justify-between items-baseline mb-2">
                          <span className="font-bold text-stone-800 font-serif text-xl" dir="rtl">{entry.headword}</span>
                          <span className="text-xs font-semibold px-2 py-1 bg-blue-50 text-blue-700 rounded-lg">
                            {entry.lexicon}
                          </span>
                        </div>
                        {entry.morphology && entry.morphology.partOfSpeech && (
                          <div className="text-xs font-medium text-stone-400 uppercase tracking-wide mb-2">
                            {entry.morphology.partOfSpeech}
                          </div>
                        )}
                        <p className="text-stone-700 text-sm leading-relaxed">
                          {definition}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            
            <div className="p-4 bg-white border-t border-stone-100">
              <a 
                href={`https://www.sefaria.org/search?q=${encodeURIComponent(wordModal.cleanWord)}&tab=text&textSort=relevance&tvar=1&tsort=relevance&svar=1&ssort=relevance`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full py-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl font-bold transition-colors"
              >
                <Search size={18} />
                <span>Search in Tanakh</span>
                <ExternalLink size={16} className="ml-1 opacity-70" />
              </a>
            </div>

          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading && (
          <div className="space-y-6 animate-pulse">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-stone-100">
                <div className="flex justify-between items-start mb-6">
                  <div className="h-6 w-20 bg-stone-200 rounded-full"></div>
                  <div className="h-10 w-10 bg-stone-200 rounded-full"></div>
                </div>
                <div className="space-y-4 mb-8">
                  <div className="h-10 bg-stone-200 rounded-lg w-full"></div>
                  <div className="h-10 bg-stone-200 rounded-lg w-5/6 ml-auto"></div>
                </div>
                <div className="space-y-3">
                  <div className="h-4 bg-stone-100 rounded w-full"></div>
                  <div className="h-4 bg-stone-100 rounded w-4/5"></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-4">
            <AlertCircle size={48} className="text-red-400" />
            <p className="text-lg font-medium">{error}</p>
            <button 
              onClick={() => fetchPsalm(chapter)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 rounded-full font-semibold border border-red-200 hover:bg-red-50 transition"
            >
              <RefreshCw size={16} /> Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <div className="space-y-6">
            {verses.map((v) => (
              <VerseItem 
                key={v.num}
                v={v}
                playingVerseNum={playingVerseNum}
                highlightedWordIndex={highlightedWordIndex}
                playVerse={playVerse}
                stopVerseAudio={stopVerseAudio}
                showTranslit={showTranslit}
                onWordClick={handleWordClick}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function VerseItem({ v, playingVerseNum, highlightedWordIndex, playVerse, stopVerseAudio, showTranslit, onWordClick }) {
  const isPlayingThisVerse = playingVerseNum === v.num;
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    const activeSpans = containerRef.current.querySelectorAll('.bg-blue-200');
    activeSpans.forEach(el => {
      el.classList.remove('bg-blue-200', 'text-blue-900', 'shadow-sm');
    });
    
    if (isPlayingThisVerse && highlightedWordIndex !== null) {
      const targetSpan = containerRef.current.querySelector(`span[data-word-index="${highlightedWordIndex}"]`);
      if (targetSpan) {
        targetSpan.classList.add('bg-blue-200', 'text-blue-900', 'shadow-sm');
      }
    }
  }, [highlightedWordIndex, isPlayingThisVerse]);

  // Handle clicking on individual words mapped in the HTML
  const handleTextClick = (e) => {
    if (e.target.tagName === 'SPAN' && e.target.hasAttribute('data-word-index')) {
      onWordClick(e.target.textContent);
    }
  };

  return (
    <div className={`bg-white p-6 md:p-8 rounded-3xl shadow-sm border transition duration-300 ${
      isPlayingThisVerse ? "border-blue-300 shadow-blue-100/50 bg-blue-50/10" : "border-stone-100 hover:shadow-md"
    }`}>
      <div className="flex justify-between items-start mb-6">
        <span className="bg-stone-100 text-stone-500 px-3 py-1 rounded-full text-sm font-bold tracking-wide uppercase">
          Verse {v.num}
        </span>
        
        <button 
          onClick={() => isPlayingThisVerse ? stopVerseAudio() : playVerse(v.ttsText, v.num)}
          className={`p-3 rounded-full transition-all flex items-center gap-2 ${
            isPlayingThisVerse 
              ? "bg-blue-600 text-white shadow-md shadow-blue-600/30 hover:bg-blue-700" 
              : "bg-blue-50 text-blue-600 hover:bg-blue-100"
          }`}
          title="Play verse audio"
        >
          {isPlayingThisVerse ? <Square size={18} fill="currentColor" /> : <Volume2 size={18} />}
          <span className="text-sm font-bold hidden sm:inline-block pr-1">
            {isPlayingThisVerse ? "Stop" : "Read"}
          </span>
        </button>
      </div>
      
      <div 
        ref={containerRef}
        onClick={handleTextClick}
        className="text-4xl md:text-5xl text-right font-serif mb-8 text-stone-900 break-words leading-loose" 
        style={{ lineHeight: '1.9' }}
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: v.wrappedHe }}
      />
      
      {showTranslit && (
        <div className="mb-6 text-xl md:text-2xl font-medium text-blue-900/80 leading-relaxed tracking-wide">
          {v.transliteration}
        </div>
      )}
      
      <div className="pt-6 border-t border-stone-100">
        <div 
          className="text-lg md:text-xl leading-relaxed text-stone-600 font-medium"
          dangerouslySetInnerHTML={{ __html: v.en }}
        />
      </div>
    </div>
  );
}