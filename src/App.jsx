import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Play, Square, Volume2, BookOpen, AlertCircle, RefreshCw, LayoutGrid, X, Languages, Search, ExternalLink, BookText, Moon, Sun } from 'lucide-react';

// --- Utility: Transliteration Generator ---
const generateTransliteration = (hebrewStr) => {
  let cleanStr = hebrewStr.replace(/[\u0591-\u05AF\u05C3]/g, '');
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

  return result
    .replace(/iy/g, 'i')
    .replace(/uw/g, 'u')
    .replace(/h /g, 'h ')
    .replace(/^'+'|'+'$/g, '')
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
    if (node.nodeType === 3) { 
      const text = node.nodeValue;
      const words = text.split(/(\s+)/);
      const fragment = document.createDocumentFragment();
      
      words.forEach(word => {
         if (/[A-Za-z\u0590-\u05FF0-9]/.test(word)) {
           const span = document.createElement('span');
           span.textContent = word;
           span.setAttribute('data-word-index', wordIndex++);
           // Simplified class. Hover and Active states are now managed via dynamic CSS injection below
           span.className = "hebrew-word";
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
  
  // Theme State (Persists to localStorage)
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('tehillim-dark-mode') === 'true';
    }
    return false;
  });

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

  // Save theme preference
  useEffect(() => {
    localStorage.setItem('tehillim-dark-mode', isDarkMode);
  }, [isDarkMode]);

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

  const handleWordClick = async (rawWord) => {
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
      alert("Text-to-speech is not supported in your browser.");
      return;
    }

    try {
      if (audioRef.current && isPlayingChapter) audioRef.current.pause();
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
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
    <div 
      className={`min-h-screen font-sans pb-24 relative overflow-hidden transition-colors duration-500 ${isDarkMode ? 'theme-dark text-slate-200 selection:bg-blue-900/50' : 'theme-light text-stone-900 selection:bg-blue-100'}`}
      style={{
        backgroundColor: isDarkMode ? '#0f172a' : '#f4ebd8', // Deep slate vs Papyrus
        backgroundImage: 'url("https://www.transparenttextures.com/patterns/aged-paper.png")',
        colorScheme: isDarkMode ? 'dark' : 'light'
      }}
    >
      {/* Dynamic CSS for Hebrew Word highlighting so it respects dark mode accurately */}
      <style>{`
        .hebrew-word { transition: all 150ms; border-radius: 0.375rem; padding: 0 0.25rem; margin: 0 -0.25rem; cursor: pointer; }
        .theme-light .hebrew-word:hover { background-color: #f5f5f4; color: #2563eb; }
        .theme-light .hebrew-word.active-word { background-color: #bfdbfe; color: #1e3a8a; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
        
        .theme-dark .hebrew-word:hover { background-color: #334155; color: #60a5fa; }
        .theme-dark .hebrew-word.active-word { background-color: #2563eb; color: #ffffff; box-shadow: 0 1px 2px 0 rgba(0,0,0,0.05); }
      `}</style>

      {/* Ancient Papyrus Hebrew Watermark Overlay */}
      <div 
        className={`fixed inset-0 z-0 pointer-events-none text-[6rem] md:text-[8rem] font-serif leading-none overflow-hidden select-none flex flex-wrap content-start transition-opacity duration-500 ${isDarkMode ? 'text-slate-500 opacity-[0.03]' : 'text-amber-900 opacity-[0.04]'}`} 
        dir="rtl"
        style={{ transform: 'rotate(-2deg) scale(1.1)' }}
      >
        {"תהילים לדוד יהוה רעי לא אחסר בנאות דשא ירביצני על מי מנוחות ינהלני נפשי ישובב ינחני במעגלי צדק למען שמו גם כי אלך בגיא צלמות לא אירא רע כי אתה עמדי שבטך ומשענתך המה ינחמני תערוך לפני שלחן נגד צררי דשנת בשמן ראשי כוסי רויה ".repeat(30)}
      </div>

      <div className="relative z-10">
        <header className={`sticky top-0 backdrop-blur-md border-b z-30 shadow-sm transition-colors duration-300 ${isDarkMode ? 'bg-slate-900/90 border-slate-800' : 'bg-white/90 border-stone-200'}`}>
          <div className="max-w-4xl mx-auto px-4 py-4">
            
            {/* Top Navigation Row */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl transition-colors ${isDarkMode ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'}`}>
                  <BookOpen size={24} />
                </div>
                <div>
                  <h1 className={`text-xl font-bold tracking-tight transition-colors ${isDarkMode ? 'text-slate-100' : 'text-stone-800'}`}>Tehillim Reader</h1>
                  <p className={`text-sm font-medium transition-colors ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>{hebrewTitle || `Psalm ${chapter}`}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {/* Theme Toggle Button */}
                <button 
                  onClick={() => setIsDarkMode(!isDarkMode)}
                  className={`p-2.5 rounded-full transition-all ${isDarkMode ? 'bg-slate-800 text-yellow-400 hover:bg-slate-700' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}
                  title="Toggle Night Mode"
                >
                  {isDarkMode ? <Moon size={18} className="fill-current" /> : <Sun size={18} className="fill-current" />}
                </button>

                <div className={`flex items-center gap-1 p-1.5 rounded-2xl transition-colors ${isDarkMode ? 'bg-slate-800' : 'bg-stone-100'}`}>
                  <button 
                    disabled={chapter <= 1 || loading} 
                    onClick={() => setChapter(c => c - 1)}
                    className={`p-2 rounded-xl disabled:opacity-40 transition-all ${isDarkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-white text-stone-700'}`}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  
                  <button 
                    onClick={() => setShowChapterModal(true)}
                    disabled={loading}
                    className={`flex items-center gap-2 px-4 py-2 font-bold rounded-xl transition-all min-w-[120px] justify-center disabled:opacity-40 ${isDarkMode ? 'text-slate-200 hover:bg-slate-700' : 'text-stone-700 hover:bg-white bg-transparent'}`}
                  >
                    <LayoutGrid size={18} className={isDarkMode ? 'text-slate-400' : 'text-stone-400'} />
                    <span>Psalm {chapter}</span>
                  </button>
                  
                  <button 
                    disabled={chapter >= 150 || loading} 
                    onClick={() => setChapter(c => c + 1)}
                    className={`p-2 rounded-xl disabled:opacity-40 transition-all ${isDarkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-white text-stone-700'}`}
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
              </div>
            </div>

            {/* Audio Controls Row */}
            <div className={`flex flex-col sm:flex-row items-center justify-between p-3 rounded-2xl border gap-4 transition-colors duration-300 ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-stone-100/80 border-stone-200'}`}>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button 
                  onClick={toggleChapterAudio}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-semibold transition-all flex-1 sm:flex-none justify-center ${
                    isPlayingChapter 
                      ? (isDarkMode ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-stone-800 text-white hover:bg-stone-700") 
                      : (isDarkMode ? "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/30" : "bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-600/20")
                  }`}
                >
                   {isPlayingChapter ? <Square fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} />}
                   {isPlayingChapter ? "Pause Chapter" : "Listen to Chapter"}
                </button>
                
                <button 
                  onClick={() => setShowTranslit(!showTranslit)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full font-semibold transition-all border ${
                    showTranslit 
                      ? (isDarkMode ? 'bg-blue-900/60 text-blue-300 border-transparent' : 'bg-blue-100 text-blue-700 border-transparent') 
                      : (isDarkMode ? 'bg-slate-800 text-slate-300 border-slate-600 hover:bg-slate-700' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50')
                  }`}
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
                   className={`h-10 w-full rounded-full overflow-hidden ${isDarkMode ? 'opacity-90' : ''}`}
                 />
              </div>
            </div>
          </div>
        </header>

        {/* Chapter Selection Modal */}
        {showChapterModal && (
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300 ${isDarkMode ? 'bg-slate-900/80' : 'bg-stone-900/40'}`}>
            <div className={`rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
              <div className={`flex justify-between items-center p-5 md:p-6 border-b z-10 ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-stone-100 bg-white'}`}>
                <div>
                  <h2 className={`text-xl md:text-2xl font-bold tracking-tight ${isDarkMode ? 'text-slate-100' : 'text-stone-800'}`}>Select Psalm</h2>
                  <p className={`text-sm font-medium mt-1 ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>Jump to any of the 150 chapters</p>
                </div>
                <button 
                  onClick={() => setShowChapterModal(false)}
                  className={`p-2 rounded-full transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'}`}
                >
                  <X size={24} />
                </button>
              </div>
              <div className={`overflow-y-auto p-5 md:p-6 flex-1 ${isDarkMode ? 'bg-slate-900/50' : 'bg-stone-50/50'}`}>
                <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2 sm:gap-3">
                  {Array.from({ length: 150 }, (_, i) => i + 1).map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        setChapter(c);
                        setShowChapterModal(false);
                      }}
                      className={`aspect-square sm:aspect-auto sm:py-3 rounded-2xl font-bold text-center transition-all flex items-center justify-center text-lg border ${
                        chapter === c
                          ? `bg-blue-600 text-white shadow-lg border-blue-600 ${isDarkMode ? 'shadow-blue-900/40 ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-900' : 'shadow-blue-600/30 ring-2 ring-blue-600 ring-offset-2 ring-offset-stone-50'}`
                          : (isDarkMode 
                              ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-blue-400 hover:border-slate-600' 
                              : 'bg-white text-stone-700 hover:bg-blue-50 hover:text-blue-700 border-stone-200 hover:border-blue-200 hover:shadow-sm')
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
          <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm transition-colors duration-300 ${isDarkMode ? 'bg-slate-900/80' : 'bg-stone-900/40'}`}>
            <div className={`rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 ${isDarkMode ? 'bg-slate-800' : 'bg-white'}`}>
              
              <div className={`flex justify-between items-start p-6 border-b ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-stone-100 bg-white'}`}>
                <div>
                  <div className={`flex items-center gap-2 mb-1 ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>
                    <BookText size={16} />
                    <span className="text-xs font-bold uppercase tracking-wider">Word Study</span>
                  </div>
                  <h2 className={`text-4xl font-serif mt-2 ${isDarkMode ? 'text-slate-100' : 'text-stone-900'}`} dir="rtl">{wordModal.cleanWord}</h2>
                </div>
                <button 
                  onClick={() => setWordModal({ ...wordModal, show: false })}
                  className={`p-2 rounded-full transition-colors ${isDarkMode ? 'bg-slate-700 hover:bg-slate-600 text-slate-300' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'}`}
                >
                  <X size={24} />
                </button>
              </div>

              <div className={`overflow-y-auto p-6 flex-1 ${isDarkMode ? 'bg-slate-900/50' : 'bg-stone-50'}`}>
                {wordModal.loading && (
                  <div className="space-y-4 animate-pulse">
                    <div className={`h-4 rounded w-3/4 ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                    <div className={`h-4 rounded w-1/2 ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                    <div className={`h-4 rounded w-5/6 ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                  </div>
                )}

                {wordModal.error && !wordModal.loading && (
                  <div className={`text-center py-4 ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>
                    <p>{wordModal.error}</p>
                  </div>
                )}

                {!wordModal.loading && !wordModal.error && wordModal.data.length === 0 && (
                  <div className={`text-center py-4 ${isDarkMode ? 'text-slate-400' : 'text-stone-500'}`}>
                    <p>No exact dictionary definition found for this prefix/suffix combination.</p>
                    <p className="mt-2 text-sm">Click below to search its usage across the Tanakh.</p>
                  </div>
                )}

                {!wordModal.loading && wordModal.data.length > 0 && (
                  <div className="space-y-6">
                    {wordModal.data.map((entry, idx) => {
                      let definition = "Definition available on Sefaria.";
                      if (entry.content && entry.content.senses && entry.content.senses.length > 0) {
                        definition = entry.content.senses[0].definition || entry.content.senses[0].meaning;
                      } else if (entry.headword) {
                        definition = "Related to root: " + entry.headword;
                      }

                      if(definition && typeof definition === 'string') {
                          definition = definition.replace(/<[^>]*>?/gm, '');
                      }

                      return (
                        <div key={idx} className={`p-4 rounded-2xl border shadow-sm ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-stone-200'}`}>
                          <div className="flex justify-between items-baseline mb-2">
                            <span className={`font-bold font-serif text-xl ${isDarkMode ? 'text-slate-100' : 'text-stone-800'}`} dir="rtl">{entry.headword}</span>
                            <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-50 text-blue-700'}`}>
                              {entry.lexicon}
                            </span>
                          </div>
                          {entry.morphology && entry.morphology.partOfSpeech && (
                            <div className={`text-xs font-medium uppercase tracking-wide mb-2 ${isDarkMode ? 'text-slate-500' : 'text-stone-400'}`}>
                              {entry.morphology.partOfSpeech}
                            </div>
                          )}
                          <p className={`text-sm leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-stone-700'}`}>
                            {definition}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              
              <div className={`p-4 border-t ${isDarkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-stone-100'}`}>
                <a 
                  href={`https://www.sefaria.org/search?q=${encodeURIComponent(wordModal.cleanWord)}&tab=text&textSort=relevance&tvar=1&tsort=relevance&svar=1&ssort=relevance`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center justify-center gap-2 w-full py-3 text-white rounded-xl font-bold transition-colors ${isDarkMode ? 'bg-slate-900 hover:bg-slate-950' : 'bg-stone-900 hover:bg-stone-800'}`}
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
                <div key={i} className={`backdrop-blur-sm p-6 md:p-8 rounded-3xl shadow-sm border ${isDarkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white/80 border-stone-200'}`}>
                  <div className="flex justify-between items-start mb-6">
                    <div className={`h-6 w-20 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                    <div className={`h-10 w-10 rounded-full ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                  </div>
                  <div className="space-y-4 mb-8">
                    <div className={`h-10 rounded-lg w-full ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                    <div className={`h-10 rounded-lg w-5/6 ml-auto ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                  </div>
                  <div className="space-y-3">
                    <div className={`h-4 rounded w-full ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                    <div className={`h-4 rounded w-4/5 ${isDarkMode ? 'bg-slate-700' : 'bg-stone-200'}`}></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div className={`p-6 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 border ${isDarkMode ? 'bg-red-900/20 border-red-900/50 text-red-400' : 'bg-red-50 border-red-200 text-red-700'}`}>
              <AlertCircle size={48} className="text-red-400" />
              <p className="text-lg font-medium">{error}</p>
              <button 
                onClick={() => fetchPsalm(chapter)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold border transition ${isDarkMode ? 'bg-slate-800 text-red-400 border-red-900 hover:bg-slate-700' : 'bg-white text-red-600 border-red-200 hover:bg-red-50'}`}
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
                  isDarkMode={isDarkMode}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function VerseItem({ v, playingVerseNum, highlightedWordIndex, playVerse, stopVerseAudio, showTranslit, onWordClick, isDarkMode }) {
  const isPlayingThisVerse = playingVerseNum === v.num;
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Manage dynamic highlight class instead of hardcoded tailwind classes
    const activeSpans = containerRef.current.querySelectorAll('.active-word');
    activeSpans.forEach(el => el.classList.remove('active-word'));
    
    if (isPlayingThisVerse && highlightedWordIndex !== null) {
      const targetSpan = containerRef.current.querySelector(`span[data-word-index="${highlightedWordIndex}"]`);
      if (targetSpan) targetSpan.classList.add('active-word');
    }
  }, [highlightedWordIndex, isPlayingThisVerse]);

  const handleTextClick = (e) => {
    if (e.target.tagName === 'SPAN' && e.target.hasAttribute('data-word-index')) {
      onWordClick(e.target.textContent);
    }
  };

  return (
    <div className={`backdrop-blur-sm p-6 md:p-8 rounded-3xl shadow-sm border transition-all duration-300 ${
      isPlayingThisVerse 
        ? (isDarkMode ? "border-blue-500/50 bg-blue-900/20" : "border-blue-300 shadow-blue-100/50 bg-blue-50/90") 
        : (isDarkMode ? "bg-slate-800/90 border-slate-700 hover:bg-slate-800" : "bg-white/90 border-stone-200 hover:shadow-md hover:bg-white")
    }`}>
      <div className="flex justify-between items-start mb-6">
        <span className={`px-3 py-1 rounded-full text-sm font-bold tracking-wide uppercase ${isDarkMode ? 'bg-slate-700 text-slate-300' : 'bg-stone-200 text-stone-600'}`}>
          Verse {v.num}
        </span>
        
        <button 
          onClick={() => isPlayingThisVerse ? stopVerseAudio() : playVerse(v.ttsText, v.num)}
          className={`p-3 rounded-full transition-all flex items-center gap-2 ${
            isPlayingThisVerse 
              ? (isDarkMode ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40 hover:bg-blue-500" : "bg-blue-600 text-white shadow-md shadow-blue-600/30 hover:bg-blue-700") 
              : (isDarkMode ? "bg-slate-700 text-blue-400 hover:bg-slate-600" : "bg-blue-50 text-blue-600 hover:bg-blue-100")
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
        className={`text-4xl md:text-5xl text-right font-serif mb-8 break-words leading-loose ${isDarkMode ? 'text-slate-100' : 'text-stone-900'}`} 
        style={{ lineHeight: '1.9' }}
        dir="rtl"
        dangerouslySetInnerHTML={{ __html: v.wrappedHe }}
      />
      
      {showTranslit && (
        <div className={`mb-6 text-xl md:text-2xl font-medium leading-relaxed tracking-wide ${isDarkMode ? 'text-blue-300/80' : 'text-blue-900/80'}`}>
          {v.transliteration}
        </div>
      )}
      
      <div className={`pt-6 border-t ${isDarkMode ? 'border-slate-700' : 'border-stone-200'}`}>
        <div 
          className={`text-lg md:text-xl leading-relaxed font-medium ${isDarkMode ? 'text-slate-300' : 'text-stone-600'}`}
          dangerouslySetInnerHTML={{ __html: v.en }}
        />
      </div>
    </div>
  );
}