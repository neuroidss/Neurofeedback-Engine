
export const GENERATIVE_CANVAS_CODE = `
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// --- Configuration Access ---
const audioInputMode = runtime.getState().apiConfig.audioInputMode || 'transcription';

// --- Neural Metrics ---
const lucidity = processedData?.lucidity ?? 0.5;
const activeBiases = processedData?.activeBiases || [];
const vetoSignal = processedData?.vetoSignal ?? 0;
const distortionLevel = Math.max(0, 1.0 - lucidity);

// --- State ---
const [gameState, setGameState] = useState({
    narrative: "The session begins. The world is undefined. Focus to materialize the Game Master's reality.",
    history: [],
    imageUrl: null,
    audioUrl: null,
    worldGraph: { currentLocation: { name: "Void", description: "Empty space" }, nodes: [] }
});

const [nextSceneBuffer, setNextSceneBuffer] = useState(null);
const [suggestedActions, setSuggestedActions] = useState(["Observe surroundings", "Focus inward"]);
const [debugInfo, setDebugInfo] = useState(null); 
const [showGmScreen, setShowGmScreen] = useState(false);
const [isWaitingForAI, setIsWaitingForAI] = useState(false);
const [isAudioPlaying, setIsAudioPlaying] = useState(false);

const [isDonghuaMode, setIsDonghuaMode] = useState(false);
const [enablePrebuffering, setEnablePrebuffering] = useState(true);
const [isRecording, setIsRecording] = useState(false);

const [targetLanguage, setTargetLanguage] = useState('English');
const LANGUAGES = ['English', 'Russian', 'Spanish', 'Japanese', 'Chinese', 'French', 'German'];

const preGenAttemptedRef = useRef(false);
const currentAudioIdRef = useRef(null); 

const [musicEnabled, setMusicEnabled] = useState(false);
const synthRef = useRef(null);

const audioCtxRef = useRef(null);
const recognitionRef = useRef(null);
const mediaRecorderRef = useRef(null);
const audioChunksRef = useRef([]);

// --- Helper: Blob to Base64 ---
const blobToBase64 = (blob) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64 = reader.result.split(',')[1];
        resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// --- Playback Logic ---
const playPcmAudio = useCallback(async (base64String) => {
    setIsAudioPlaying(true);
    try {
        if (!audioCtxRef.current) {
            audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') await ctx.resume();

        const binaryString = atob(base64String);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);
        const arrayBuffer = bytes.buffer;
        const dataInt16 = new Int16Array(arrayBuffer);
        const frameCount = dataInt16.length;
        const audioBuffer = ctx.createBuffer(1, frameCount, 24000); 
        const channelData = audioBuffer.getChannelData(0);
        for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i] / 32768.0;
        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => setIsAudioPlaying(false);
        source.start();
    } catch (e) { 
        console.error("Audio Playback Error:", e);
        setIsAudioPlaying(false);
    }
}, []);

useEffect(() => { if (gameState.audioUrl) playPcmAudio(gameState.audioUrl); }, [gameState.audioUrl]);

// --- Generative Ambient Music Engine ---
useEffect(() => {
    if (musicEnabled && !synthRef.current) {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioContext();
            const masterGain = ctx.createGain();
            masterGain.gain.value = 0.2;
            masterGain.connect(ctx.destination);
            
            const frequencies = [110, 164.81, 196.00, 220]; 
            const oscs = [];

            frequencies.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                osc.type = i === 0 ? 'triangle' : 'sine';
                osc.frequency.value = freq;
                
                const gain = ctx.createGain();
                gain.gain.value = 0.1;
                
                const lfo = ctx.createOscillator();
                lfo.frequency.value = 0.05 + Math.random() * 0.1; 
                const lfoGain = ctx.createGain();
                lfoGain.gain.value = 0.05; 
                lfo.connect(lfoGain);
                lfoGain.connect(gain.gain);
                
                const panner = ctx.createStereoPanner();
                panner.pan.value = (Math.random() * 2) - 1;
                
                osc.connect(gain);
                gain.connect(panner);
                panner.connect(masterGain);
                
                osc.start();
                lfo.start();
                
                oscs.push({ osc, gain, lfo });
            });
            
            synthRef.current = { ctx, masterGain, oscs };
        } catch(e) {
            console.error("Synth Init Failed:", e);
        }
    } else if (!musicEnabled && synthRef.current) {
        synthRef.current.oscs.forEach(o => {
            try { o.osc.stop(); o.lfo.stop(); } catch(e){}
        });
        synthRef.current.ctx.close();
        synthRef.current = null;
    }
    
    return () => {
        if (synthRef.current) {
             synthRef.current.oscs.forEach(o => {
                try { o.osc.stop(); o.lfo.stop(); } catch(e){}
            });
            synthRef.current.ctx.close();
        }
    };
}, [musicEnabled]);

useEffect(() => {
    if (synthRef.current) {
        const { ctx, oscs } = synthRef.current;
        const now = ctx.currentTime;
        const instability = Math.max(0, 1 - lucidity);
        const detuneAmount = instability * 200; 
        oscs.forEach((o, i) => {
            const flutter = Math.sin(now + i) * 10; 
            o.osc.detune.setTargetAtTime((detuneAmount * (i%2===0 ? 1 : -1)) + flutter, now, 0.1);
        });
    }
}, [lucidity, musicEnabled]);

const generateScene = useCallback(async (actionTextOrAudio, audioBase64 = null) => {
    const result = await runtime.tools.run('Generate_Scene_Quantum_V2', {
        worldGraph: gameState.worldGraph,
        lucidityLevel: lucidity, 
        userAction: typeof actionTextOrAudio === 'string' ? actionTextOrAudio : "Audio Input",
        userAudio: audioBase64, 
        activeBiases,
        targetLanguage
    });
    return result;
}, [gameState.worldGraph, lucidity, activeBiases, targetLanguage]);

const triggerNextScene = useCallback(async (actionTextOrAudio, isAuto = false, audioBase64 = null) => {
    if (isWaitingForAI) return;
    
    setIsRecording(false);
    if (recognitionRef.current) recognitionRef.current.stop();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();

    setIsWaitingForAI(true);
    setSuggestedActions([]); 
    
    let displayText = "";
    if (audioBase64) displayText = "[Audio Transmission] 🎤";
    else if (typeof actionTextOrAudio === 'string') displayText = actionTextOrAudio;
    
    setGameState(prev => ({
        ...prev,
        history: [...prev.history, { source: 'Player', text: displayText, type: 'proposal' }]
    }));

    try {
        const result = await generateScene(actionTextOrAudio, audioBase64);

        if (result.success) {
            setGameState(prev => ({
                ...prev,
                narrative: result.narrative,
                history: [...prev.history, { source: 'Game Master', text: result.narrative, type: result.gmRuling }],
                imageUrl: result.imageUrl,
                audioUrl: result.audioUrl,
                worldGraph: { ...prev.worldGraph, ...result.debugData.graphUpdates }
            }));
            setSuggestedActions(result.suggestedActions || []);
            setDebugInfo(result.debugData);
        }
    } catch (e) {
        console.error(e);
        setGameState(prev => ({
             ...prev,
             history: [...prev.history, { source: 'System', text: 'Connection to Reality Lost: ' + e.message, type: 'error' }]
        }));
    } finally {
        setIsWaitingForAI(false);
    }
}, [generateScene, isWaitingForAI]);

const generateNextSceneSilent = useCallback(async () => {
    if (nextSceneBuffer) return;
    console.log("[Donghua] Starting background generation...");
    try {
        const result = await generateScene("(Auto-Continue)");
        if (result.success) {
            console.log("[Donghua] Background generation complete. Buffered.");
            setNextSceneBuffer(result);
        }
    } catch (e) {
        console.error("[Donghua] Silent gen failed", e);
    }
}, [generateScene, nextSceneBuffer]);

if (currentAudioIdRef.current !== gameState.audioUrl) {
    currentAudioIdRef.current = gameState.audioUrl;
    preGenAttemptedRef.current = false;
}

useEffect(() => {
    if (isDonghuaMode && enablePrebuffering && isAudioPlaying && !nextSceneBuffer && !isWaitingForAI && !preGenAttemptedRef.current) {
        preGenAttemptedRef.current = true;
        generateNextSceneSilent();
    }
}, [isDonghuaMode, enablePrebuffering, isAudioPlaying, nextSceneBuffer, isWaitingForAI, generateNextSceneSilent]);

const triggerNextSceneRef = useRef(triggerNextScene);
useEffect(() => { triggerNextSceneRef.current = triggerNextScene; }, [triggerNextScene]);

useEffect(() => {
    if (isDonghuaMode && !isAudioPlaying && !isWaitingForAI && !isRecording) {
        if (nextSceneBuffer) {
            setGameState(prev => ({
                ...prev,
                narrative: nextSceneBuffer.narrative,
                history: [...prev.history, { source: 'Game Master (Auto)', text: nextSceneBuffer.narrative, type: nextSceneBuffer.gmRuling }],
                imageUrl: nextSceneBuffer.imageUrl,
                audioUrl: nextSceneBuffer.audioUrl,
                worldGraph: { ...prev.worldGraph, ...nextSceneBuffer.debugData.graphUpdates }
            }));
            setSuggestedActions(nextSceneBuffer.suggestedActions || []);
            setDebugInfo(nextSceneBuffer.debugData);
            setNextSceneBuffer(null);
            return;
        }
        const timer = setTimeout(() => {
            triggerNextSceneRef.current("(Auto-Continue)", true);
        }, 100);
        return () => clearTimeout(timer);
    }
}, [isDonghuaMode, isAudioPlaying, nextSceneBuffer, isWaitingForAI, isRecording]);

const toggleRecording = useCallback(async (e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    
    if (isRecording) {
        if (audioInputMode === 'transcription' && recognitionRef.current) recognitionRef.current.stop();
        else if (audioInputMode === 'raw' && mediaRecorderRef.current) mediaRecorderRef.current.stop();
        setIsRecording(false);
        return;
    }

    if (audioInputMode === 'transcription') {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { alert("Transcription not supported in this browser."); return; }
        try {
            const recognition = new SpeechRecognition();
            recognition.lang = targetLanguage === 'Russian' ? 'ru-RU' : 'en-US';
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;
            recognition.onstart = () => setIsRecording(true);
            recognition.onend = () => setIsRecording(false);
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                triggerNextScene(transcript, false);
            };
            recognitionRef.current = recognition;
            recognition.start();
        } catch (e) {
            console.error("Speech API Error:", e);
            alert("Microphone access failed.");
        }
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            audioChunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                try {
                    const base64 = await blobToBase64(audioBlob);
                    triggerNextScene(null, false, base64);
                } catch(e) { console.error(e); }
                stream.getTracks().forEach(t => t.stop());
            };
            mediaRecorderRef.current = mediaRecorder;
            mediaRecorder.start();
            setIsRecording(true);
        } catch (e) { alert("Mic Error: " + e.message); }
    }
}, [isRecording, audioInputMode, triggerNextScene, targetLanguage]);

const bgLayerBlur = useMemo(() => ({
    backgroundImage: gameState.imageUrl ? 'url(' + gameState.imageUrl + ')' : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    width: '100%', height: '100%', position: 'absolute', top: 0, left: 0,
    filter: 'blur(15px) brightness(0.3) contrast(' + (100 + distortionLevel * 30) + '%)',
    zIndex: 0
}), [gameState.imageUrl, distortionLevel]);

const bgLayerSharp = useMemo(() => ({
    backgroundImage: gameState.imageUrl ? 'url(' + gameState.imageUrl + ')' : 'none',
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'center',
    width: '100%', height: '100%', position: 'absolute', top: 0, left: 0,
    filter: 'contrast(' + (100 + distortionLevel * 30) + '%)',
    zIndex: 1
}), [gameState.imageUrl, distortionLevel]);

if (!processedData) return <div className="bg-black text-white p-4 flex items-center justify-center h-full">Initializing Neural Link...</div>;

return (
    <div className="flex flex-col h-full w-full bg-black font-mono text-sm text-slate-300 select-none">
        <div className="flex-none h-14 flex justify-between items-center p-2 bg-slate-900 border-b border-slate-700 z-20 overflow-hidden">
            <div className="flex items-center gap-4 h-full">
                <div className="flex flex-col justify-center">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Neural Stability</span>
                    <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                        <div className="h-full bg-cyan-500 transition-all duration-500 shadow-[0_0_10px_cyan]" style={{ width: (lucidity * 100) + '%' }}></div>
                    </div>
                </div>
                {nextSceneBuffer && isDonghuaMode && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-purple-900/30 border border-purple-500/30 rounded">
                        <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-pulse"></div>
                        <span className="text-[9px] text-purple-300">NEXT SCENE READY</span>
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                 <select 
                    value={targetLanguage} 
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    className="bg-slate-800 border border-slate-600 text-slate-300 text-[9px] font-bold px-1 py-1 rounded outline-none"
                 >
                    {LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                 </select>
                 <button 
                    type="button"
                    onClick={() => {
                        setMusicEnabled(!musicEnabled);
                        if (synthRef.current && !musicEnabled) synthRef.current.ctx.resume();
                    }}
                    className={'px-2 py-1 rounded text-[9px] font-bold border transition-colors flex items-center gap-1 ' + (musicEnabled ? 'bg-blue-900/50 border-blue-500 text-blue-300' : 'bg-slate-800 border-slate-600 text-slate-500')}
                 >
                    {musicEnabled ? 'MUSIC: ON' : 'MUSIC: OFF'}
                 </button>
                 <button 
                    type="button"
                    onClick={() => setEnablePrebuffering(!enablePrebuffering)}
                    className={'px-2 py-1 rounded text-[9px] font-bold border transition-colors flex items-center gap-1 ' + (enablePrebuffering ? 'bg-green-900/30 border-green-500 text-green-300' : 'bg-slate-800 border-slate-600 text-slate-500')}
                 >
                    {enablePrebuffering ? 'PRE-BUF: ON' : 'PRE-BUF: OFF'}
                 </button>
                 <button 
                    type="button"
                    onClick={() => setIsDonghuaMode(!isDonghuaMode)}
                    className={'px-2 py-1 rounded text-[9px] font-bold border transition-colors flex items-center gap-1 ' + (isDonghuaMode ? 'bg-purple-900/50 border-purple-500 text-purple-300' : 'bg-slate-800 border-slate-600 text-slate-500')}
                 >
                    {isDonghuaMode ? 'DONGHUA: ON' : 'DONGHUA: OFF'}
                 </button>
                 <button 
                    type="button"
                    onClick={() => setShowGmScreen(!showGmScreen)}
                    className={'px-2 py-1 rounded text-[9px] font-bold border transition-colors ' + (showGmScreen ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white')}
                >
                    GM DEBUG
                </button>
            </div>
        </div>

        <div className="flex-grow relative overflow-hidden bg-[#050505] flex items-center justify-center">
             <div style={bgLayerBlur} className="transition-all duration-1000" />
             <div style={bgLayerSharp} className="transition-all duration-1000" />
             
             <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-10 bg-[length:100%_2px,3px_100%]"></div>

             {isWaitingForAI && !nextSceneBuffer && (
                 <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20 backdrop-blur-sm">
                     <div className="flex flex-col items-center gap-2">
                         <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                         <span className="text-cyan-500 text-xs tracking-widest animate-pulse">REALITY COLLAPSING...</span>
                     </div>
                 </div>
             )}

             {showGmScreen && debugInfo && (
                <div className="absolute top-2 right-2 w-64 bg-black/90 border border-green-500/50 p-2 rounded shadow-2xl z-30 text-[9px] font-mono overflow-y-auto max-h-[90%] animate-fade-in">
                    <h3 className="font-bold text-xs border-b border-green-900 pb-1 mb-1 text-green-400">QUANTUM SUPERPOSITIONS</h3>
                    {(debugInfo.branches || []).map((c, i) => (
                        <div key={i} className="mb-2 p-1 border-l-2 border-green-800 pl-2">
                            <div className="flex justify-between font-bold text-green-600"><span>VAR {c.id}</span><span>{(c.prob * 100).toFixed(0)}%</span></div>
                            <p className="text-green-500/70 leading-tight">{c.desc}</p>
                        </div>
                    ))}
                    <div className="mt-2 text-xs text-gray-500">Suggested Duration: {debugInfo.suggestedDuration}s</div>
                </div>
            )}
            
             {!isWaitingForAI && gameState.narrative && (
                 <div className="absolute bottom-4 left-4 right-4 z-20">
                    <div className="bg-black/70 backdrop-blur-md border-l-4 border-cyan-500 p-4 rounded shadow-lg animate-fade-in-up max-w-3xl mx-auto">
                        <p className="text-sm md:text-base text-slate-100 font-serif leading-relaxed drop-shadow-md">
                            {gameState.narrative}
                        </p>
                    </div>
                 </div>
             )}
        </div>

        <div className="flex-none h-1/3 min-h-[180px] max-h-[300px] bg-[#0a0a0a] border-t border-slate-800 flex flex-col relative z-[9999]" style={{ pointerEvents: 'auto' }}>
             <div className="p-2 border-b border-slate-800 bg-[#0f0f0f] flex gap-2 overflow-x-auto relative z-50">
                 {suggestedActions.map((action, i) => (
                    <button 
                        type="button"
                        key={i}
                        onClick={() => triggerNextScene(action)}
                        disabled={isWaitingForAI}
                        className="flex-shrink-0 px-3 py-1.5 bg-slate-800 hover:bg-cyan-900/80 border border-slate-600 hover:border-cyan-500 text-slate-200 text-xs rounded transition-all disabled:opacity-50 whitespace-nowrap"
                        style={{ pointerEvents: 'auto' }}
                    >
                        {action}
                    </button>
                 ))}
             </div>

             <div className="flex-grow overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-slate-800 font-serif">
                {gameState.history.slice().reverse().map((h, i) => (
                    <div key={i} className={'text-xs ' + (h.source === 'Player' ? 'text-cyan-400/70 text-right' : 'text-slate-400/70')}>
                        <span className="font-bold opacity-50">[{h.source}]</span> {h.text}
                    </div>
                ))}
             </div>

             <div className="p-2 border-t border-slate-800 bg-black flex gap-2 relative z-[9999]">
                <button 
                    type="button"
                    onClick={toggleRecording} 
                    className={'p-2 rounded-full border transition-colors cursor-pointer relative z-[9999] ' + (isRecording ? 'bg-red-900 border-red-500 text-white animate-pulse' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white')}
                    title="Microphone Input (Toggle)"
                    style={{ pointerEvents: 'auto' }}
                >
                    {isRecording ? <div className="w-4 h-4 bg-white rounded-sm" /> : <div className="w-4 h-4 bg-red-500 rounded-full" />}
                </button>
                <input 
                    type="text" 
                    placeholder={isDonghuaMode ? (isAudioPlaying ? "Listening..." : "Auto-generating...") : "Propose an action..."}
                    className="flex-grow bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none font-mono relative z-50"
                    onKeyDown={(e) => { if (e.key === 'Enter' && e.currentTarget.value.trim()) { triggerNextScene(e.currentTarget.value.trim()); e.currentTarget.value = ''; }}}
                    disabled={isWaitingForAI}
                    style={{ pointerEvents: 'auto' }}
                />
                <button 
                    type="button"
                    onClick={(e) => { const input = e.currentTarget.previousSibling; if (input.value.trim()) { triggerNextScene(input.value.trim()); input.value = ''; }}}
                    className="px-4 bg-slate-800 hover:bg-cyan-700 text-white text-xs font-bold rounded border border-slate-700 hover:border-cyan-500 disabled:opacity-50 relative z-50"
                    style={{ pointerEvents: 'auto' }}
                >
                    Act
                </button>
             </div>
        </div>
    </div>
);
`;
