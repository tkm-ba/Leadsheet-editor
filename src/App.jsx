import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Settings, Printer, Plus, Trash2, CornerDownLeft, 
  ArrowRight, ArrowLeft, ArrowUp, ArrowDown, Type,
  Music, Scissors, AlertCircle, Hash, ChevronDown, ChevronUp,
  Minus, Download, Upload, Wand2
} from 'lucide-react';

// --- Constants ---
const PITCH_CLASSES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const ROMAN_NUMERALS = ['Ⅰ', '♭Ⅱ', 'Ⅱ', '♭Ⅲ', 'Ⅲ', 'Ⅳ', '♭Ⅴ', 'Ⅴ', '♭Ⅵ', 'Ⅵ', '♭Ⅶ', 'Ⅶ'];

const QUALITY_OPTIONS = ['M', 'm', 'M7', 'm7', '7', 'dim', 'aug'];
const OPTION_OPTIONS = ['sus4', 'add9', '-5'];
const SECTION_MARKERS = ['Intro', 'A', 'B', 'C', 'Chorus', 'Interlude', 'Solo', 'Outro'];

const DEFAULT_MEASURES_PER_ROW = 4;

// --- Helper Functions ---
const generateId = (prefix) => `${prefix}-${Math.random().toString(36).substr(2, 9)}`;

const shiftNote = (note, amount) => {
  if (!note) return note;
  const idx = PITCH_CLASSES.indexOf(note);
  if (idx === -1) return note;
  return PITCH_CLASSES[(idx + amount + 12) % 12];
};

const getMinorKey = (majorKey) => {
  if (!majorKey) return '';
  const idx = PITCH_CLASSES.indexOf(majorKey);
  if (idx === -1) return '';
  const minorIdx = (idx - 3 + 12) % 12; 
  return `${PITCH_CLASSES[minorIdx]}m`;
};

const formatKeyDisp = (key) => {
  if (!key) return '';
  return `${key} / ${getMinorKey(key)}`;
};

const getEffectiveKey = (measures, targetIndex, globalKey) => {
  let currentKey = globalKey;
  for (let i = 0; i <= targetIndex; i++) {
    if (measures[i] && measures[i].customKey) {
      currentKey = measures[i].customKey;
    }
  }
  return currentKey;
};

const guessKey = (measures) => {
  const orderedChords = measures.flatMap(m => [...m.chords].sort((a, b) => a.position - b.position));
  if (orderedChords.length === 0) return 'C'; 

  let bestKey = 'C';
  let maxScore = -1;

  PITCH_CLASSES.forEach((testKey, keyIdx) => {
    let score = 0;
    
    const diatonicQualities = {
      0: ['M', 'M7', 'add9', '6', 'sus4', ''], 
      2: ['m', 'm7'],                          
      4: ['m', 'm7'],                          
      5: ['M', 'M7', 'add9', '6'],             
      7: ['M', '7', 'sus4'],                   
      9: ['m', 'm7'],                          
      11: ['dim', '-5', 'm7b5', 'm']           
    };

    orderedChords.forEach((chord) => {
      const rootIdx = PITCH_CLASSES.indexOf(chord.root);
      if (rootIdx === -1) return;
      const relativeIdx = (rootIdx - keyIdx + 12) % 12;
      
      if (diatonicQualities[relativeIdx]) {
        score += 1; 
        if (diatonicQualities[relativeIdx].includes(chord.quality)) {
           score += 2; 
        }
      }
    });

    const firstChord = orderedChords[0];
    if (firstChord) {
       const rootIdx = PITCH_CLASSES.indexOf(firstChord.root);
       const relativeIdx = (rootIdx - keyIdx + 12) % 12;
       if (relativeIdx === 0 || relativeIdx === 9) score += 3;
    }
    
    const lastChord = orderedChords[orderedChords.length - 1];
    if (lastChord) {
       const rootIdx = PITCH_CLASSES.indexOf(lastChord.root);
       const relativeIdx = (rootIdx - keyIdx + 12) % 12;
       if (relativeIdx === 0 || relativeIdx === 9) score += 5; 
    }

    if (score > maxScore) {
      maxScore = score;
      bestKey = testKey;
    }
  });

  return bestKey;
};

export default function App() {
  // --- State ---
  const [title, setTitle] = useState('タイトル');
  const [bpm, setBpm] = useState(120);
  const [durationSec, setDurationSec] = useState(180);
  const [measuresPerRow, setMeasuresPerRow] = useState(DEFAULT_MEASURES_PER_ROW);
  const [gridDivisions, setGridDivisions] = useState(8); 
  const [keySignature, setKeySignature] = useState('C');
  const [isRoman, setIsRoman] = useState(false);
  const [isPaletteOpen, setIsPaletteOpen] = useState(true);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const [measures, setMeasures] = useState(
    Array.from({ length: 16 }, () => ({ id: generateId('m'), chords: [], section: null, isBreak: false, isEnd: false, customKey: null, isRest: false }))
  );
  
  const [lyrics, setLyrics] = useState({});

  // Palette State
  const [activeTab, setActiveTab] = useState('chord'); 
  const [pendingChord, setPendingChord] = useState({ root: 'C', quality: 'M', option: '', onChord: '' });
  const [isCustomQuality, setIsCustomQuality] = useState(false);
  const [isCustomOption, setIsCustomOption] = useState(false);
  const [pendingSection, setPendingSection] = useState(SECTION_MARKERS[0]);
  const [customSection, setCustomSection] = useState('');
  
  // Selection & Clipboard State
  const [selectedChords, setSelectedChords] = useState([]); 
  const [selectedMeasures, setSelectedMeasures] = useState([]); 
  const [clipboardMeasures, setClipboardMeasures] = useState([]); 
  const [isPasteMode, setIsPasteMode] = useState(false);

  const fileInputRef = useRef(null);

  // --- Dynamic Grid Snapping ---
  const snapToGrid = useCallback((position) => {
    if (gridDivisions === 0) return position; 
    const gridSize = 100 / gridDivisions; 
    const index = Math.max(0, Math.min(gridDivisions - 1, Math.floor(position / gridSize)));
    return (index * gridSize) + (gridSize / 2);
  }, [gridDivisions]);

  // --- Keyboard Shortcuts (Delete) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if (selectedChords.length > 0) {
          setMeasures(prev => prev.map(m => {
            const chordsToRemove = selectedChords.filter(sc => sc.measureId === m.id).map(sc => sc.chordId);
            if (chordsToRemove.length > 0) {
              return { ...m, chords: m.chords.filter(c => !chordsToRemove.includes(c.id)) };
            }
            return m;
          }));
          setSelectedChords([]);
        } else if (selectedMeasures.length > 0 && activeTab === 'measure') {
            setMeasures(prev => prev.filter(m => !selectedMeasures.includes(m.id)));
            setSelectedMeasures([]);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedChords, selectedMeasures, activeTab]);

  // --- Actions ---
  const calculateMeasures = () => {
    const totalBeats = (bpm / 60) * durationSec;
    const required = Math.ceil(totalBeats / 4);
    if (required > measures.length) {
      const added = Array.from({ length: required - measures.length }, () => ({
        id: generateId('m'), chords: [], section: null, isBreak: false, isEnd: false, customKey: null, isRest: false
      }));
      const updatedMeasures = measures.map((m, i) => 
        i === measures.length - 1 ? { ...m, isEnd: false } : m
      );
      setMeasures([...updatedMeasures, ...added]);
    } else {
        alert(`現在の設定で必要な小節数は約${required}小節です。`);
    }
  };

  const handleGlobalTranspose = (amount) => {
    setKeySignature(prev => shiftNote(prev, amount));
    setMeasures(prev => prev.map(m => ({
      ...m,
      customKey: m.customKey ? shiftNote(m.customKey, amount) : m.customKey,
      chords: m.chords.map(c => ({
        ...c,
        root: shiftNote(c.root, amount),
        onChord: shiftNote(c.onChord, amount)
      }))
    })));
  };

  const handlePrintClick = () => {
    setSelectedChords([]);
    setSelectedMeasures([]);
    setIsPasteMode(false);
    setIsPreviewMode(true);
  };

  // ----------------------------------------------------
  // 直接PDFを生成してダウンロードするロジック
  // ----------------------------------------------------
  const executeDirectPdfDownload = async () => {
    setIsGeneratingPdf(true);
    try {
      const { default: html2canvas } = await import('html2canvas');
      const { jsPDF } = await import('jspdf');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const margin = 15; // 左右上下の余白(mm)
      const contentWidth = pdfWidth - margin * 2;
      let currentY = margin;

      // 1. タイトル部分の描画
      const titleEl = document.getElementById('print-title');
      if (titleEl) {
        const titleCanvas = await html2canvas(titleEl, { scale: 2, logging: false });
        const tImg = titleCanvas.toDataURL('image/png');
        const tHeight = (titleCanvas.height * contentWidth) / titleCanvas.width;
        pdf.addImage(tImg, 'PNG', margin, currentY, contentWidth, tHeight);
        currentY += tHeight + 5; // タイトル下の余白
      }

      // 2. 行（段）ごとの描画と改ページ判定
      const rowElements = document.querySelectorAll('.score-row');
      for (let i = 0; i < rowElements.length; i++) {
        const rowEl = rowElements[i];
        const rowCanvas = await html2canvas(rowEl, { scale: 2, logging: false });
        const rImg = rowCanvas.toDataURL('image/png');
        const rHeight = (rowCanvas.height * contentWidth) / rowCanvas.width;

        // 次の行を描画するとページの下端を超える場合は改ページ
        if (currentY + rHeight > pdfHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }

        pdf.addImage(rImg, 'PNG', margin, currentY, contentWidth, rHeight);
        currentY += rHeight; // 余白はコンポーネント自体のマージンを利用
      }

      pdf.save(`${title || 'chord-score'}.pdf`);
    } catch (err) {
      console.error('PDF出力エラー:', err);
      alert('PDFの作成に失敗しました。\n(html2canvas, jspdfがインストールされているか確認してください)');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleExport = () => {
    const data = { title, bpm, durationSec, measuresPerRow, gridDivisions, keySignature, isRoman, measures, lyrics };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'chord-score'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        setTitle(data.title || 'タイトル');
        setBpm(data.bpm || 120);
        setDurationSec(data.durationSec || 180);
        setMeasuresPerRow(data.measuresPerRow || 4);
        setGridDivisions(data.gridDivisions !== undefined ? data.gridDivisions : 8);
        setKeySignature(data.keySignature || 'C');
        setIsRoman(data.isRoman || false);
        setMeasures(data.measures || []);
        setLyrics(data.lyrics || {});
      } catch (err) {
        alert('ファイルの読み込みに失敗しました。データが破損している可能性があります。');
      }
    };
    reader.readAsText(file);
    e.target.value = null; 
  };

  const updatePendingAndSelected = (updates) => {
    setPendingChord(prev => ({ ...prev, ...updates }));
    
    if (selectedChords.length > 0) {
      setMeasures(prev => prev.map(m => {
        const hasSelectedInMeasure = selectedChords.some(sc => sc.measureId === m.id);
        if (!hasSelectedInMeasure) return m;
        
        return {
          ...m,
          chords: m.chords.map(c => {
            const isSelected = selectedChords.some(sc => sc.chordId === c.id);
            if (isSelected) {
              return { ...c, ...updates };
            }
            return c;
          })
        };
      }));
    }
  };

  // --- Measure / Chord Interactions ---
  const handleMeasureClick = (measureId, e) => {
    if (isPreviewMode) return;
    if (e.target.closest('.chord-element')) return;

    if (isPasteMode && clipboardMeasures.length > 0) {
      const targetIdx = measures.findIndex(m => m.id === measureId);
      if (targetIdx === -1) return;

      setMeasures(prev => {
        const nextMeasures = [...prev];
        
        for (let i = 0; i < clipboardMeasures.length; i++) {
          const writeIdx = targetIdx + i;
          const sourceM = clipboardMeasures[i];
          const newChords = sourceM.chords.map(c => ({ ...c, id: generateId('c') }));
          
          if (writeIdx < nextMeasures.length) {
            nextMeasures[writeIdx] = {
              ...nextMeasures[writeIdx],
              chords: newChords,
              section: sourceM.section,
              isBreak: sourceM.isBreak,
              isEnd: sourceM.isEnd,
              customKey: sourceM.customKey,
              isRest: sourceM.isRest
            };
          } else {
            nextMeasures.push({
              id: generateId('m'),
              chords: newChords,
              section: sourceM.section,
              isBreak: sourceM.isBreak,
              isEnd: sourceM.isEnd,
              customKey: sourceM.customKey,
              isRest: sourceM.isRest
            });
          }
        }
        return nextMeasures;
      });
      return; 
    }

    if (activeTab === 'chord') {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rawPosition = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const position = snapToGrid(rawPosition); 
      
      const newChord = { ...pendingChord, id: generateId('c'), position };
      setMeasures(prev => prev.map(m => {
        if (m.id === measureId) {
          return { ...m, chords: [...m.chords, newChord].sort((a,b) => a.position - b.position) };
        }
        return m;
      }));
      setSelectedChords([]); 
    } else if (activeTab === 'section') {
      const sectionText = customSection || pendingSection;
      if (sectionText) {
          setMeasures(prev => prev.map(m => m.id === measureId ? { ...m, section: sectionText } : m));
      }
    } else if (activeTab === 'measure') {
      if (e.shiftKey) {
        if (selectedMeasures.includes(measureId)) {
          setSelectedMeasures(prev => prev.filter(id => id !== measureId));
        } else {
          setSelectedMeasures(prev => [...prev, measureId]);
        }
      } else {
        if (selectedMeasures.includes(measureId) && selectedMeasures.length === 1) {
          setSelectedMeasures([]);
        } else {
          setSelectedMeasures([measureId]);
        }
      }
    }
  };

  const handleChordClick = (measureId, chordId, e) => {
    if (isPreviewMode) return;
    if (isPasteMode) return; 

    e.stopPropagation();
    if (activeTab !== 'chord') {
       setActiveTab('chord');
    }
    
    const chordIdent = { measureId, chordId };
    const isAlreadySelected = selectedChords.some(sc => sc.chordId === chordId);

    if (e.shiftKey) {
      if (isAlreadySelected) {
        setSelectedChords(prev => prev.filter(sc => sc.chordId !== chordId));
      } else {
        setSelectedChords(prev => [...prev, chordIdent]);
      }
    } else {
      if (isAlreadySelected && selectedChords.length === 1) {
         setSelectedChords([]);
      } else {
         setSelectedChords([chordIdent]);
      }
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetMeasureId) => {
    if (isPasteMode) return;
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      if (data.type !== 'chord') return;

      const { measureId: sourceMeasureId, chordId } = data;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const rawPosition = Math.max(0, Math.min(100, (x / rect.width) * 100));
      const newPosition = snapToGrid(rawPosition);

      setMeasures(prev => {
        let movedChord = null;
        let next = prev.map(m => {
          if (m.id === sourceMeasureId) {
            movedChord = m.chords.find(c => c.id === chordId);
            return { ...m, chords: m.chords.filter(c => c.id !== chordId) };
          }
          return m;
        });

        if (movedChord) {
          movedChord.position = newPosition;
          next = next.map(m => {
            if (m.id === targetMeasureId) {
              return { ...m, chords: [...m.chords, movedChord].sort((a,b) => a.position - b.position) };
            }
            return m;
          });
        }
        return next;
      });
    } catch (err) {
      console.error("Drop error", err);
    }
  };

  // --- Measure Operations ---
  const addMeasure = (position) => {
    if (selectedMeasures.length === 0) return;
    const targetId = selectedMeasures[0];
    const idx = measures.findIndex(m => m.id === targetId);
    if (idx === -1) return;
    const newMeasure = { id: generateId('m'), chords: [], section: null, isBreak: false, isEnd: false, customKey: null, isRest: false };
    const next = [...measures];

    if (position === 'after' && next[idx].isEnd) {
      next[idx].isEnd = false;
    }

    next.splice(position === 'before' ? idx : idx + 1, 0, newMeasure);
    setMeasures(next);
  };

  const removeMeasure = () => {
    if (selectedMeasures.length === 0) return;
    setMeasures(prev => prev.filter(m => !selectedMeasures.includes(m.id)));
    setSelectedMeasures([]);
  };

  const handleCopyMeasure = () => {
    if (selectedMeasures.length === 0) return;
    
    const indices = selectedMeasures
      .map(id => measures.findIndex(m => m.id === id))
      .filter(idx => idx !== -1)
      .sort((a, b) => a - b);

    if (indices.length === 0) return;

    let isContinuous = true;
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] !== indices[i - 1] + 1) {
        isContinuous = false;
        break;
      }
    }

    if (!isContinuous) {
      alert('エラー：連続した小節を選択してください。');
      return;
    }

    const copiedMeasures = indices.map(idx => measures[idx]);
    setClipboardMeasures(copiedMeasures);
    setIsPasteMode(true);
  };

  const toggleBreak = () => {
    if (selectedMeasures.length === 0) return;
    const target = measures.find(m => m.id === selectedMeasures[0]);
    const newState = !target.isBreak;
    setMeasures(prev => prev.map(m => selectedMeasures.includes(m.id) ? { ...m, isBreak: newState } : m));
  };

  const toggleRest = () => {
    if (selectedMeasures.length === 0) return;
    const target = measures.find(m => m.id === selectedMeasures[0]);
    const newState = !target.isRest;
    setMeasures(prev => prev.map(m => selectedMeasures.includes(m.id) ? { ...m, isRest: newState } : m));
  };

  const toggleEndMark = () => {
    if (selectedMeasures.length === 0) return;
    const targetId = selectedMeasures[0];
    const idx = measures.findIndex(m => m.id === targetId);
    if (idx === -1) return;

    const measure = measures[idx];

    if (measure.isEnd) {
      setMeasures(prev => prev.map(m => m.id === targetId ? { ...m, isEnd: false } : m));
      return;
    }

    const hasContentAfter = measures.slice(idx + 1).some(m => m.chords.length > 0 || m.section);
    if (hasContentAfter) {
      if (!window.confirm('エンドマークより後ろにコードやセクションが配置されています。削除してよろしいですか？')) {
        return;
      }
    }

    const next = measures.map((m, i) => {
      if (i === idx) return { ...m, isEnd: true };
      if (i < idx) return { ...m, isEnd: false };
      return null;
    }).filter(Boolean);
    
    setMeasures(next);
    setSelectedMeasures([targetId]); 
  };

  const executePartialTranspose = (amount) => {
    if (selectedMeasures.length === 0) return;
    const indices = selectedMeasures.map(id => measures.findIndex(m => m.id === id)).filter(idx => idx !== -1);
    const minIdx = Math.min(...indices);

    const currentEffectiveKey = getEffectiveKey(measures, minIdx, keySignature);
    const newKey = shiftNote(currentEffectiveKey, amount);

    setMeasures(prev => prev.map((m, i) => {
      if (i === minIdx) {
        return {
          ...m,
          customKey: newKey,
          chords: m.chords.map(c => ({
            ...c,
            root: shiftNote(c.root, amount),
            onChord: shiftNote(c.onChord, amount)
          }))
        };
      }
      if (i > minIdx) {
        return {
          ...m,
          customKey: m.customKey ? shiftNote(m.customKey, amount) : m.customKey,
          chords: m.chords.map(c => ({
            ...c,
            root: shiftNote(c.root, amount),
            onChord: shiftNote(c.onChord, amount)
          }))
        };
      }
      return m;
    }));
  };

  // --- Display Logic ---
  const getChordDisplay = (chord, effectiveKey) => {
    let rootDisp = chord.root;
    let onDisp = chord.onChord;

    if (isRoman) {
      const keyIdx = PITCH_CLASSES.indexOf(effectiveKey);
      if (keyIdx !== -1) {
        const rootIdx = PITCH_CLASSES.indexOf(chord.root);
        if (rootIdx !== -1) rootDisp = ROMAN_NUMERALS[(rootIdx - keyIdx + 12) % 12];
        
        if (chord.onChord) {
          const onIdx = PITCH_CLASSES.indexOf(chord.onChord);
          if (onIdx !== -1) onDisp = ROMAN_NUMERALS[(onIdx - keyIdx + 12) % 12];
        }
      }
    }

    const qualityDisp = chord.quality === 'M' ? '' : chord.quality;
    return { main: `${rootDisp}${qualityDisp}${chord.option || ''}`, on: onDisp };
  };

  const rows = [];
  let currentRow = [];
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    currentRow.push(m);
    
    if (currentRow.length === measuresPerRow || m.isBreak || m.isEnd || i === measures.length - 1) {
      rows.push({ id: `row-${rows.length}`, measures: currentRow });
      currentRow = [];
    }
  }

  return (
    <div className={`min-h-screen flex flex-col text-gray-900 font-sans ${isPreviewMode ? 'bg-white' : 'bg-gray-50'}`}>

      {/* Paste Mode Floating Banner */}
      {isPasteMode && !isPreviewMode && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-6 py-2 rounded-full shadow-lg z-50 flex items-center gap-4 animate-bounce">
          <span className="font-bold text-sm">貼付モード中：起点となる小節をクリックして上書き</span>
          <button onClick={() => setIsPasteMode(false)} className="bg-white text-blue-600 px-3 py-1 rounded text-xs font-bold hover:bg-blue-50 transition">
            終了
          </button>
        </div>
      )}

      {isPreviewMode && (
        <div className="fixed top-4 right-4 flex flex-col items-end gap-2 z-50">
          <div className="flex gap-4">
            <button 
              onClick={() => setIsPreviewMode(false)} 
              disabled={isGeneratingPdf}
              className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg shadow-md hover:bg-gray-50 transition font-bold disabled:opacity-50"
            >
              編集に戻る
            </button>
            <button 
              onClick={executeDirectPdfDownload} 
              disabled={isGeneratingPdf}
              className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg shadow-md hover:bg-blue-700 transition font-bold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-5 h-5" /> 
              {isGeneratingPdf ? 'PDF生成中...' : 'PDFをダウンロード'}
            </button>
          </div>
          <p className="text-xs text-gray-700 bg-white/90 p-2 rounded shadow-md border border-gray-200">
            ※ 画質や文字選択を重視する場合は、一旦「編集に戻る」からブラウザの印刷機能をご利用ください。
          </p>
        </div>
      )}

      {!isPreviewMode && (
        <header className="bg-white border-b px-6 py-3 flex flex-wrap gap-6 items-center shadow-sm z-10">
          <div className="flex items-center gap-2">
              <Music className="w-5 h-5 text-blue-500" />
              <h1 className="font-bold text-lg hidden sm:block">ChordEditor</h1>
          </div>
          
          <div className="flex flex-wrap items-center gap-4 text-sm bg-gray-100 p-2 rounded-lg">
            <label className="flex items-center gap-1">
              BPM: <input type="number" value={bpm} onChange={e => setBpm(Number(e.target.value))} className="w-16 p-1 border rounded" />
            </label>
            <label className="flex items-center gap-1">
              時間(秒): <input type="number" value={durationSec} onChange={e => setDurationSec(Number(e.target.value))} className="w-16 p-1 border rounded" />
            </label>
            <button onClick={calculateMeasures} className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition">小節数計算</button>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm bg-gray-100 p-2 rounded-lg">
            <label className="flex items-center gap-1">
              Key: 
              <select value={keySignature} onChange={e => setKeySignature(e.target.value)} className="p-1 border rounded">
                {PITCH_CLASSES.map(p => <option key={p} value={p}>{formatKeyDisp(p)}</option>)}
              </select>
            </label>
            <button 
              onClick={() => {
                const guessedKey = guessKey(measures);
                setKeySignature(guessedKey);
              }}
              className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 transition font-bold shadow-sm"
              title="入力されたコードからキーを自動判定します"
            >
              <Wand2 className="w-3 h-3" /> 自動判定
            </button>
            <label className="flex items-center gap-1 cursor-pointer ml-2 border-l border-gray-300 pl-4">
              <input type="checkbox" checked={isRoman} onChange={e => setIsRoman(e.target.checked)} />
              度数表記 (Ⅰ-Ⅶ)
            </label>
            <div className="flex items-center gap-1 border-l pl-4 border-gray-300">
              <span className="text-gray-600">全体移調</span>
              <button onClick={() => handleGlobalTranspose(1)} className="p-1 bg-white border rounded hover:bg-gray-50" title="半音上げ">♯</button>
              <button onClick={() => handleGlobalTranspose(-1)} className="p-1 bg-white border rounded hover:bg-gray-50" title="半音下げ">♭</button>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-4">
            <label className="flex items-center gap-1 text-sm text-gray-600">
              配置グリッド: 
              <select value={gridDivisions} onChange={e => setGridDivisions(Number(e.target.value))} className="p-1 border rounded bg-white w-16">
                <option value={4}>4分割</option>
                <option value={6}>6分割</option>
                <option value={8}>8分割</option>
                <option value={0}>自由</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-sm text-gray-600 border-l border-gray-300 pl-4">
              基本改行: 
              <input type="number" min="1" max="8" value={measuresPerRow} onChange={e => setMeasuresPerRow(Number(e.target.value))} className="w-12 p-1 border rounded" />
            </label>

            <div className="flex gap-2 border-l border-gray-300 pl-4">
              <button onClick={handleExport} className="flex items-center gap-1 bg-emerald-600 text-white px-3 py-2 rounded-lg hover:bg-emerald-700 transition shadow-sm text-sm" title="データをPCに保存">
                <Download className="w-4 h-4" /> 保存
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 bg-amber-600 text-white px-3 py-2 rounded-lg hover:bg-amber-700 transition shadow-sm text-sm" title="保存したデータを読み込む">
                <Upload className="w-4 h-4" /> 読込
              </button>
              <input type="file" ref={fileInputRef} onChange={handleImport} accept=".json" className="hidden" />
            </div>

            <button onClick={handlePrintClick} className="flex items-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition ml-2 shadow-sm text-sm">
              <Printer className="w-4 h-4" /> プレビュー / PDF
            </button>
          </div>
        </header>
      )}

      {/* HTML2Canvas Capture Target: Title */}
      <div id="print-title" className={`${isPreviewMode ? 'block' : 'hidden'} text-center mt-12 mb-4 relative max-w-4xl mx-auto w-full`}>
         <h1 className="text-3xl font-bold border-b-2 border-black inline-block px-8 pb-2 bg-white">{title}</h1>
         <span className="absolute right-0 bottom-2 text-xl font-bold bg-white px-2">Key: {formatKeyDisp(keySignature)}</span>
      </div>

      <main className={`flex-1 overflow-auto p-4 sm:p-8 ${isPreviewMode ? 'bg-white sm:px-12 py-0' : 'bg-transparent'} transition-all duration-300 ${!isPreviewMode && isPaletteOpen ? 'pb-80' : 'pb-24'}`}>
        
        {!isPreviewMode && (
          <div className="max-w-4xl mx-auto mb-8 relative flex justify-center items-end">
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                className="w-2/3 text-center text-3xl font-bold p-2 border-b-2 border-transparent focus:border-blue-500 outline-none bg-transparent"
                placeholder="タイトルを入力..."
              />
              <div className="absolute right-0 bottom-2 text-xl font-bold text-gray-700">
                 Key: {formatKeyDisp(keySignature)}
              </div>
          </div>
        )}

        <div className="max-w-5xl mx-auto bg-white">
          {rows.map((row, rowIndex) => (
            <div key={row.id} className="score-row mb-2 pt-6 relative bg-white">
              <div className="flex w-full items-end">
                {row.measures.map((measure, mIndex) => {
                  const isMeasureSelected = selectedMeasures.includes(measure.id);
                  const globalIndex = measures.findIndex(m => m.id === measure.id);
                  const effectiveKey = getEffectiveKey(measures, globalIndex, keySignature);

                  // Calculate overlap offsets
                  const THRESHOLD = 15; 
                  const processedChords = [];
                  measure.chords.forEach((chord) => {
                    let level = 0;
                    processedChords.forEach((pc) => {
                      if (Math.abs(chord.position - pc.position) < THRESHOLD) {
                        level = Math.max(level, pc.overlapLevel + 1);
                      }
                    });
                    processedChords.push({ ...chord, overlapLevel: level });
                  });

                  return (
                    <div 
                      key={measure.id}
                      className="flex flex-col min-w-0"
                      style={{
                        flex: `0 0 ${100 / measuresPerRow}%`,
                        maxWidth: `${100 / measuresPerRow}%`
                      }}
                    >
                      <div 
                        className={`
                          relative h-24 w-full group 
                          ${!isPreviewMode ? 'cursor-crosshair' : ''}
                          ${!isPreviewMode && activeTab === 'measure' ? 'hover:bg-blue-50' : ''}
                          ${!isPreviewMode && isMeasureSelected ? 'bg-blue-100 ring-2 ring-blue-500 ring-inset' : ''}
                        `}
                        onClick={(e) => handleMeasureClick(measure.id, e)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, measure.id)}
                      >
                        {!isPreviewMode && gridDivisions > 0 && Array.from({ length: gridDivisions }).map((_, i) => {
                          const gridSize = 100 / gridDivisions;
                          return (
                            <div 
                              key={`grid-${i}`} 
                              className="absolute top-1/4 bottom-1/4 w-[1px] border-l border-dashed border-gray-200 z-0 pointer-events-none" 
                              style={{ left: `${(i * gridSize) + (gridSize / 2)}%` }}
                            ></div>
                          );
                        })}

                        <div className="absolute -top-6 -left-2 flex gap-1 z-10">
                          {measure.section && (
                            <div className={`border border-gray-800 px-2 py-0.5 text-xs font-bold bg-white ${isPreviewMode ? 'shadow-none' : 'shadow-sm'}`}>
                              {measure.section}
                              {!isPreviewMode && (
                                <button 
                                   className="ml-2 text-gray-400 hover:text-red-500 text-[10px]"
                                   onClick={(e) => { e.stopPropagation(); setMeasures(prev => prev.map(m => m.id === measure.id ? {...m, section: null} : m)); }}
                                >×</button>
                              )}
                            </div>
                          )}
                          {measure.customKey && (
                            <div className={`border border-blue-600 px-2 py-0.5 text-xs font-bold bg-blue-50 text-blue-800 ${isPreviewMode ? 'shadow-none border-black bg-transparent text-black' : 'shadow-sm'}`}>
                              Key: {formatKeyDisp(measure.customKey)}
                              {!isPreviewMode && (
                                <button 
                                   className="ml-2 text-blue-400 hover:text-red-500 text-[10px]"
                                   onClick={(e) => { e.stopPropagation(); setMeasures(prev => prev.map(m => m.id === measure.id ? {...m, customKey: null} : m)); }}
                                >×</button>
                              )}
                            </div>
                          )}
                        </div>

                        {!isPreviewMode && measure.isBreak && <CornerDownLeft className="absolute top-1 right-1 w-4 h-4 text-blue-500 opacity-50" />}
                        {measure.isEnd && <div className="absolute bottom-5 right-1 font-bold text-black text-xs sm:text-sm z-10">End</div>}

                        {measure.isRest && (
                          <div className="absolute top-5 left-2 right-2 border-t-2 border-dashed border-gray-800 z-10 pointer-events-none"></div>
                        )}

                        {processedChords.map(chord => {
                          const disp = getChordDisplay(chord, effectiveKey);
                          const isChordSelected = selectedChords.some(sc => sc.chordId === chord.id);
                          return (
                            <div 
                              key={chord.id}
                              draggable={!isPreviewMode && !isPasteMode}
                              onDragStart={(e) => {
                                e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'chord', measureId: measure.id, chordId: chord.id }));
                              }}
                              className={`
                                absolute -translate-x-1/2 flex flex-col items-center leading-tight z-20
                                ${!isPreviewMode && !isPasteMode ? 'cursor-move hover:scale-110 hover:z-30 transition-transform chord-element' : 'chord-element'}
                                ${isChordSelected ? 'text-red-600 font-bold scale-110 z-30' : 'text-gray-900 font-bold'}
                                bg-white px-0.5 rounded
                              `}
                              style={{ 
                                left: `${chord.position}%`, 
                                top: chord.overlapLevel > 0 ? `-1.5rem` : '0.25rem' 
                              }}
                              onClick={(e) => handleChordClick(measure.id, chord.id, e)}
                            >
                              <span className={`tracking-tighter ${disp.on ? 'text-[11px] md:text-xs' : 'text-sm md:text-base'}`}>{disp.main}</span>
                              {disp.on && (
                                <div className="flex flex-col items-center w-full bg-white">
                                  <div className={`w-[120%] h-[1.5px] my-[1px] ${isChordSelected ? 'bg-red-600' : 'bg-gray-800'}`}></div>
                                  <span className="tracking-tighter text-[11px] md:text-xs">{disp.on}</span>
                                </div>
                              )}
                            </div>
                          )
                        })}

                        <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-gray-600"></div>
                        {(mIndex === 0) && <div className="absolute top-1/3 bottom-1/3 left-0 w-[1.5px] bg-gray-600"></div>}
                        <div className="absolute top-1/3 bottom-1/3 right-0 w-[1.5px] bg-gray-600"></div>
                      </div>
                      
                      <input 
                        type="text" 
                        readOnly={isPreviewMode}
                        value={lyrics[measure.id] || ''}
                        onChange={e => setLyrics({...lyrics, [measure.id]: e.target.value})}
                        placeholder={isPreviewMode ? "" : "歌詞"} 
                        className={`
                          w-full text-center -mt-5 py-0 text-sm md:text-base outline-none transition-colors relative z-10 leading-tight
                          ${isPreviewMode 
                            ? 'border-none bg-transparent text-black' 
                            : 'text-gray-700 border-b border-dashed border-gray-300 focus:border-blue-500 bg-gray-50/50'}
                        `}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      {!isPreviewMode && (
        <footer className={`fixed bottom-0 left-0 right-0 bg-[#42b9f5] rounded-t-[2rem] shadow-[0_-10px_20px_rgba(0,0,0,0.15)] flex flex-col z-20 transition-transform duration-300 ${isPaletteOpen ? 'translate-y-0' : 'translate-y-[16.5rem]'}`}>
          <div 
            className="absolute -top-7 left-1/2 -translate-x-1/2 bg-[#42b9f5] px-6 py-1 rounded-t-xl cursor-pointer hover:brightness-110 flex items-center justify-center shadow-[0_-5px_10px_rgba(0,0,0,0.1)] transition-colors"
            onClick={() => setIsPaletteOpen(!isPaletteOpen)}
            title="パレットを開閉"
          >
            {isPaletteOpen ? <ChevronDown className="w-5 h-5 text-white" /> : <ChevronUp className="w-5 h-5 text-white" />}
          </div>

          <div className="flex justify-center gap-2 p-3 pb-0">
            {[
              { id: 'chord', label: 'コード入力', icon: Hash },
              { id: 'section', label: 'セクション', icon: Type },
              { id: 'measure', label: '小節・転調操作', icon: Scissors }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-1 px-6 py-2 rounded-t-xl font-bold text-sm transition-colors
                  ${activeTab === tab.id ? 'bg-white text-blue-600' : 'bg-white/40 text-gray-800 hover:bg-white/60'}
                `}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="bg-white p-4 h-64 overflow-y-auto">
            {activeTab === 'chord' && (
              <div className="flex h-full gap-2 max-w-6xl mx-auto px-1">
                <div className="flex-[1.2] flex flex-col">
                  <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 text-center">ルート</div>
                  <div className="grid grid-cols-3 gap-1 flex-1">
                    {PITCH_CLASSES.map(p => (
                      <button 
                        key={p} 
                        onClick={() => updatePendingAndSelected({ root: p })}
                        className={`rounded border text-xs sm:text-sm font-bold ${pendingChord.root === p ? 'bg-blue-500 text-white border-blue-600' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >{p}</button>
                    ))}
                  </div>
                </div>
                
                <div className="w-px bg-gray-200"></div>
                
                <div className="flex-[1.2] flex flex-col">
                   <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 text-center">クオリティ</div>
                   <div className="grid grid-cols-2 gap-1 flex-1">
                    <button onClick={() => updatePendingAndSelected({ quality: 'M' })} className={`rounded border text-[10px] sm:text-xs py-1 ${pendingChord.quality === 'M' ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}>Major</button>
                    {QUALITY_OPTIONS.filter(q => q !== 'M').map(q => (
                      <button key={q} onClick={() => updatePendingAndSelected({ quality: q })} className={`rounded border text-[10px] sm:text-xs py-1 ${pendingChord.quality === q ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}>{q}</button>
                    ))}
                    {isCustomQuality ? (
                      <input
                        type="text"
                        autoFocus
                        value={pendingChord.quality}
                        onChange={e => updatePendingAndSelected({ quality: e.target.value })}
                        onBlur={() => setIsCustomQuality(false)}
                        onKeyDown={e => { if (e.key === 'Enter') setIsCustomQuality(false); }}
                        className="border-2 border-blue-500 rounded px-1 text-xs outline-none w-full text-black"
                        placeholder="任意"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setIsCustomQuality(true);
                          if (QUALITY_OPTIONS.includes(pendingChord.quality)) updatePendingAndSelected({ quality: '' });
                        }}
                        className={`rounded border text-[10px] sm:text-xs py-1 ${!QUALITY_OPTIONS.includes(pendingChord.quality) ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        {!QUALITY_OPTIONS.includes(pendingChord.quality) && pendingChord.quality !== '' ? pendingChord.quality : '任意'}
                      </button>
                    )}
                   </div>
                </div>

                <div className="w-px bg-gray-200"></div>

                <div className="flex-1 flex flex-col">
                   <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 text-center">オプション</div>
                   <div className="grid grid-cols-2 gap-1 flex-1">
                    <button onClick={() => updatePendingAndSelected({ option: '' })} className={`col-span-2 rounded border text-[10px] sm:text-xs py-1 ${pendingChord.option === '' ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}>なし</button>
                    {OPTION_OPTIONS.map(o => (
                      <button key={o} onClick={() => updatePendingAndSelected({ option: o })} className={`rounded border text-[10px] sm:text-xs py-1 ${pendingChord.option === o ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}>{o}</button>
                    ))}
                    {isCustomOption ? (
                       <input
                        type="text"
                        autoFocus
                        value={pendingChord.option}
                        onChange={e => updatePendingAndSelected({ option: e.target.value })}
                        onBlur={() => setIsCustomOption(false)}
                        onKeyDown={e => { if (e.key === 'Enter') setIsCustomOption(false); }}
                        className="border-2 border-blue-500 rounded px-1 text-xs outline-none w-full text-black"
                        placeholder="任意"
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setIsCustomOption(true);
                          if (pendingChord.option === '' || OPTION_OPTIONS.includes(pendingChord.option)) updatePendingAndSelected({ option: '' });
                        }}
                        className={`rounded border text-[10px] sm:text-xs py-1 ${pendingChord.option !== '' && !OPTION_OPTIONS.includes(pendingChord.option) ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}
                      >
                        {pendingChord.option !== '' && !OPTION_OPTIONS.includes(pendingChord.option) ? pendingChord.option : '任意'}
                      </button>
                    )}
                   </div>
                </div>

                <div className="w-px bg-gray-200"></div>

                <div className="flex-[1.2] flex flex-col">
                  <div className="text-[10px] sm:text-xs font-bold text-gray-500 mb-1 text-center">分数 (ベース)</div>
                  <div className="grid grid-cols-3 gap-1 flex-1">
                    <button onClick={() => updatePendingAndSelected({ onChord: '' })} className={`col-span-3 rounded border text-[10px] sm:text-xs py-1 ${pendingChord.onChord === '' ? 'bg-blue-500 text-white' : 'bg-gray-50 hover:bg-gray-100'}`}>なし</button>
                    {PITCH_CLASSES.map(p => (
                      <button key={p} onClick={() => updatePendingAndSelected({ onChord: p })} className={`rounded border text-[10px] sm:text-xs py-1 ${pendingChord.onChord === p ? 'bg-blue-500 text-white border-blue-600' : 'bg-gray-50 hover:bg-gray-100'}`}>/{p}</button>
                    ))}
                  </div>
                </div>

                <div className="w-32 sm:w-40 flex flex-col gap-2 justify-center border-l pl-2 sm:pl-4 border-gray-200">
                  <div className="text-center p-2 bg-gray-100 rounded-lg shadow-inner">
                    <div className="text-[9px] sm:text-xs text-gray-500 mb-1">配置予定コード</div>
                    <div className="text-base sm:text-xl font-bold text-blue-700 leading-none flex flex-col items-center justify-center">
                       <span>{pendingChord.root}{pendingChord.quality === 'M' ? '' : pendingChord.quality}{pendingChord.option}</span>
                       {pendingChord.onChord && (
                          <div className="flex flex-col items-center w-full px-4">
                            <div className="w-full h-[2px] bg-blue-700 my-[2px]"></div>
                            <span>{pendingChord.onChord}</span>
                          </div>
                       )}
                    </div>
                    <div className="text-[9px] sm:text-[10px] text-gray-400 mt-1">小節をクリックで配置</div>
                  </div>
                  
                  {selectedChords.length > 0 ? (
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setSelectedChords([])}
                        className="flex-1 flex items-center justify-center p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition text-[10px] sm:text-xs font-bold"
                      >
                        完了
                      </button>
                      <button 
                        onClick={() => {
                          setMeasures(prev => prev.map(m => {
                            const chordsToRemove = selectedChords.filter(sc => sc.measureId === m.id).map(sc => sc.chordId);
                            if (chordsToRemove.length > 0) {
                              return { ...m, chords: m.chords.filter(c => !chordsToRemove.includes(c.id)) };
                            }
                            return m;
                          }));
                          setSelectedChords([]);
                        }}
                        className="flex-1 flex items-center justify-center p-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition text-[10px] sm:text-xs"
                      >
                        <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                  ) : (
                    <button 
                      disabled
                      className="flex items-center justify-center gap-1 p-1.5 bg-gray-100 text-gray-400 rounded cursor-not-allowed text-[10px] sm:text-xs"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" /> 選択削除
                    </button>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'section' && (
              <div className="max-w-2xl mx-auto h-full flex flex-col items-center justify-center gap-6">
                <div className="flex flex-wrap justify-center gap-3">
                  {SECTION_MARKERS.map(sec => (
                    <button
                      key={sec}
                      onClick={() => { setPendingSection(sec); setCustomSection(''); }}
                      className={`px-6 py-3 rounded-full font-bold shadow-sm transition-transform hover:scale-105 ${pendingSection === sec && !customSection ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700'}`}
                    >
                      {sec}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
                  <span className="text-sm font-bold text-gray-600">任意入力:</span>
                  <input 
                    type="text" 
                    value={customSection}
                    onChange={e => setCustomSection(e.target.value)}
                    placeholder="例: Bridge"
                    className="px-3 py-1 border rounded outline-none focus:border-blue-500"
                  />
                </div>
                <p className="text-sm text-gray-500 flex items-center gap-1"><AlertCircle className="w-4 h-4"/> 小節をクリックしてマーカーを配置</p>
              </div>
            )}

            {activeTab === 'measure' && (
              <div className="max-w-4xl mx-auto h-full flex flex-col items-center justify-center gap-6">
                <div className="w-full flex gap-4 overflow-x-auto px-2">
                  
                  <div className="flex-1 min-w-[200px] bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-3">
                    <h3 className="font-bold text-gray-700 text-center mb-2 border-b pb-2">小節の追加・削除</h3>
                    <div className="flex gap-2">
                      <button onClick={() => addMeasure('before')} disabled={selectedMeasures.length === 0} className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-gray-300 rounded hover:bg-blue-50 text-sm disabled:opacity-50">
                        <Plus className="w-4 h-4"/> 前に追加
                      </button>
                      <button onClick={() => addMeasure('after')} disabled={selectedMeasures.length === 0} className="flex-1 flex items-center justify-center gap-1 py-2 bg-white border border-gray-300 rounded hover:bg-blue-50 text-sm disabled:opacity-50">
                        後ろに追加 <Plus className="w-4 h-4"/>
                      </button>
                    </div>
                    <button onClick={removeMeasure} disabled={selectedMeasures.length === 0} className="w-full flex items-center justify-center gap-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 text-sm mt-auto disabled:opacity-50">
                      <Trash2 className="w-4 h-4"/> 選択小節を削除
                    </button>
                  </div>

                  <div className="flex-1 min-w-[200px] bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-3">
                    <h3 className="font-bold text-gray-700 text-center mb-2 border-b pb-2">コピー＆ペースト</h3>
                    <button onClick={handleCopyMeasure} disabled={selectedMeasures.length === 0} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-300 rounded hover:bg-blue-50 text-sm disabled:opacity-50 font-bold text-blue-700">
                      選択小節をコピー
                    </button>
                    <button onClick={() => setIsPasteMode(!isPasteMode)} disabled={clipboardMeasures.length === 0} className={`w-full flex items-center justify-center gap-2 py-2 rounded text-sm transition-colors mt-auto font-bold ${isPasteMode ? 'bg-blue-600 text-white shadow-inner' : 'bg-white border border-gray-300 hover:bg-blue-50 text-gray-700 disabled:opacity-50'}`}>
                      {isPasteMode ? '貼付モード: ON' : '貼付モード: OFF'}
                    </button>
                    <div className="text-[10px] text-gray-500 text-center leading-tight">
                      ※ONの状態で小節をクリックすると<br/>コピー元で上書きされます
                    </div>
                  </div>

                  <div className="flex-1 min-w-[200px] bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-3">
                    <h3 className="font-bold text-gray-700 text-center mb-2 border-b pb-2">小節の設定</h3>
                    <button onClick={toggleBreak} disabled={selectedMeasures.length === 0} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-300 rounded hover:bg-blue-50 text-sm disabled:opacity-50">
                      <CornerDownLeft className="w-4 h-4"/> 強制改行 (ON/OFF)
                    </button>
                    <button onClick={toggleRest} disabled={selectedMeasures.length === 0} className="w-full flex items-center justify-center gap-2 py-2 bg-white border border-gray-300 rounded hover:bg-blue-50 text-sm disabled:opacity-50">
                      <Minus className="w-4 h-4"/> 休み（破線）(ON/OFF)
                    </button>
                    <button onClick={toggleEndMark} disabled={selectedMeasures.length === 0} className="w-full flex items-center justify-center gap-2 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 text-sm mt-auto shadow-sm leading-tight disabled:opacity-50">
                      エンドマーク (以降削除)
                    </button>
                  </div>

                  <div className="flex-1 min-w-[200px] bg-gray-50 p-4 rounded-xl border border-gray-200 flex flex-col gap-3">
                     <h3 className="font-bold text-gray-700 text-center mb-2 border-b pb-2">部分転調 (選択以降)</h3>
                     <p className="text-xs text-gray-500 text-center leading-tight">最も左の選択小節以降の<br/>コードを移調します。</p>
                     <div className="flex gap-2 mt-auto">
                      <button onClick={() => executePartialTranspose(1)} disabled={selectedMeasures.length === 0} className="flex-1 py-3 bg-white border border-gray-300 rounded hover:bg-blue-50 font-bold text-lg disabled:opacity-50">
                        ♯
                      </button>
                      <button onClick={() => executePartialTranspose(-1)} disabled={selectedMeasures.length === 0} className="flex-1 py-3 bg-white border border-gray-300 rounded hover:bg-blue-50 font-bold text-lg disabled:opacity-50">
                        ♭
                      </button>
                     </div>
                  </div>

                </div>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
}