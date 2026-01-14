
import type { ToolCreatorPayload } from '../../../../types';
import { RECURSIVE_HISTORY_ANALYZER } from './rlm';
import { GENESIS_VISUALS } from './visuals';
import { GENESIS_LOGIC } from './logic';

export const getGenesisUiCode = () => `
    const { useState, useEffect, useRef, useCallback, useMemo } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;

    if (!R3F || !Drei || !THREE) return <div className="text-white p-10">Initializing Genesis Core...</div>;
    const { Canvas, useFrame } = R3F;
    const { Stars, Sparkles, Float, Grid } = Drei;

    // --- VISUAL COMPONENTS ---
    ${GENESIS_VISUALS}

    // --- MAIN COMPONENT ---
    const [view, setView] = useState("MENU"); // MENU, GAME
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    
    // New Session Form
    const [selectedLoreKey, setSelectedLoreKey] = useState("VOID");
    const [customLore, setCustomLore] = useState("");
    const [manuscript, setManuscript] = useState(null); // Raw text
    const [fateGraph, setFateGraph] = useState([]); // Parsed Plot Points
    const [isParsingFate, setIsParsingFate] = useState(false);
    
    // Ingestion State
    const [parsingLog, setParsingLog] = useState([]);
    const [graphData, setGraphData] = useState({ nodes: [] });

    // Game State
    const [phase, setPhase] = useState("IDLE"); // IDLE, NARRATING, MODELING, CHOOSING, PROCESSING
    const [inputText, setInputText] = useState("");
    const [isEchoMode, setIsEchoMode] = useState(false); // 100% Sync Mode
    
    // Core Data
    const [userModel, setUserModel] = useState("Analyzing psych profile...");
    const [currentChoices, setCurrentChoices] = useState([]); // [{id, text}]
    const [defaultAction, setDefaultAction] = useState(null);
    const [countdown, setCountdown] = useState(0);
    const MAX_COUNTDOWN = 15;
    
    // Logs
    const [chatHistory, setChatHistory] = useState([]); 
    const [gmLog, setGmLog] = useState([]); 
    const [showDebug, setShowDebug] = useState(false);
    
    // Audio
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);
    
    const chatEndRef = useRef(null);
    const logEndRef = useRef(null);
    const runtimeRef = useRef(runtime);
    
    // Load Sessions on Mount
    useEffect(() => {
        const load = () => {
            try {
                const raw = localStorage.getItem('genesis_sessions_v2');
                if (raw) setSessions(JSON.parse(raw));
            } catch(e) {}
        };
        load();
        
        // Auto-Bootstrap RLM
        const checkTools = async () => {
            const tools = runtime.tools.list();
            if (!tools.find(t => t.name === 'Recursive_History_Analyzer')) {
                await runtime.tools.run('Tool Creator', ${JSON.stringify(RECURSIVE_HISTORY_ANALYZER)});
            }
        };
        checkTools();
    }, []);

    // Auto-Scroll Chat
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);
    useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [gmLog]);

    // Timer Logic
    useEffect(() => {
        let timer = null;
        if (phase === "CHOOSING" && countdown > 0) {
            timer = setInterval(() => {
                setCountdown(c => c - 1);
            }, 1000);
        } else if (phase === "CHOOSING" && countdown === 0) {
            handleActionCommit(defaultAction || "Hesitate", true);
        }
        return () => clearInterval(timer);
    }, [phase, countdown, defaultAction]);

    const saveSession = (session) => {
        if (!session) return;
        const updatedSessions = sessions.filter(s => s.id !== session.id);
        updatedSessions.unshift(session); // Move to top
        setSessions(updatedSessions);
        localStorage.setItem('genesis_sessions_v2', JSON.stringify(updatedSessions));
    };

    const addGmLog = (type, msg) => {
        setGmLog(prev => [...prev, { time: new Date().toLocaleTimeString(), type, msg }]);
        if (activeSession) {
            activeSession.gmLog.push({ time: Date.now(), type, msg });
        }
    };

    const addChat = (sender, text) => {
        const entry = { sender, text, timestamp: Date.now() };
        setChatHistory(prev => [...prev, entry]);
        if (activeSession) {
            activeSession.chatHistory.push(entry);
            saveSession(activeSession);
        }
    };
    
    // --- CORE LOGIC INJECTION ---
    ${GENESIS_LOGIC}

    const handleActionCommit = (action, isDefault) => turnCycle(activeSession, action, isDefault, isEchoMode);
    
    const handleExportSession = () => {
        if (!activeSession) return;
        const dataStr = JSON.stringify(activeSession, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "genesis_session_" + activeSession.id + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleManualSubmit = () => {
        if (!inputText.trim()) return;
        handleActionCommit(inputText, false);
        setInputText("");
    };
    const toggleListening = () => { setIsListening(!isListening); };

    // --- RENDER ---
    return (
        <div className="w-full h-full bg-black text-slate-200 font-mono flex flex-col relative overflow-hidden">
            
            {/* 3D BG */}
            <div className="absolute inset-0 z-0 opacity-40">
                <Canvas camera={{ position: [0, 0, 5] }}>
                    <color attach="background" args={['#020617']} />
                    <TheVoid mode={phase} intensity={phase === 'CHOOSING' ? (MAX_COUNTDOWN - countdown)/MAX_COUNTDOWN : 0.2} isRecursive={phase === 'PROCESSING'} />
                </Canvas>
            </div>

            {/* HEADER */}
            <div className="flex justify-between items-center p-3 bg-slate-900/80 border-b border-slate-700 z-10 backdrop-blur-md">
                <div className="flex items-center gap-2">
                    <div className={\`w-3 h-3 rounded-full \${phase==='CHOOSING' ? 'bg-green-500 animate-pulse' : 'bg-purple-500'}\`}></div>
                    <span className="font-bold tracking-widest text-slate-300">GENESIS DRIVER</span>
                </div>
                {view === "GAME" && (
                    <div className="flex gap-2">
                        <button 
                            onClick={() => setIsEchoMode(!isEchoMode)}
                            className={\`text-xs px-2 py-1 border rounded font-bold transition-all flex items-center gap-1 \${isEchoMode ? 'border-cyan-400 text-cyan-400 bg-cyan-900/20 shadow-[0_0_10px_rgba(34,211,238,0.3)]' : 'border-slate-600 text-slate-500'}\`}
                            title="Echo Mode: Forces 100% synchronization by simulating the perfect user input for the plot."
                        >
                            {isEchoMode ? '⚡ ECHO SYNC: ON' : '○ ECHO SYNC: OFF'}
                        </button>
                        <button 
                            onClick={handleExportSession}
                            className="text-xs px-2 py-1 border border-cyan-600 text-cyan-500 rounded hover:bg-cyan-900/20 font-bold"
                        >
                            EXPORT JSON
                        </button>
                        <button onClick={() => setShowDebug(!showDebug)} className="text-xs px-2 py-1 border border-yellow-600 text-yellow-500 rounded hover:bg-yellow-900/20">
                            {showDebug ? "HIDE THOUGHTS" : "SHOW THOUGHTS"}
                        </button>
                        <button onClick={() => setView("MENU")} className="text-xs px-2 py-1 border border-slate-600 rounded hover:bg-slate-800">
                            EXIT
                        </button>
                    </div>
                )}
            </div>

            {/* VIEW: MENU */}
            {view === "MENU" && (
                <div className="flex-grow z-10 flex flex-col items-center justify-center p-8 gap-8 overflow-y-auto">
                    <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-700 p-6 rounded-xl shadow-2xl backdrop-blur-md">
                        <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">INITIATE NEW TIMELINE</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs text-slate-500 font-bold uppercase tracking-wider">Source Material</label>
                                    <select 
                                        value={selectedLoreKey} 
                                        onChange={(e) => setSelectedLoreKey(e.target.value)}
                                        className="w-full bg-black border border-slate-700 rounded p-3 text-sm outline-none focus:border-green-500 transition-colors"
                                    >
                                        {Object.keys(LORE_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
                                        <option value="CUSTOM">CUSTOM...</option>
                                        <option value="MANUSCRIPT">UPLOAD MANUSCRIPT / GRAPH JSON</option>
                                    </select>
                                </div>

                                {selectedLoreKey === 'MANUSCRIPT' && (
                                    <div className="relative">
                                        <div className={\`w-full h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all \${isParsingFate ? 'border-purple-500 bg-purple-900/10' : 'border-slate-600 hover:border-green-500 hover:bg-slate-800/50'}\`}>
                                            <input type="file" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" accept=".txt,.md,.json" disabled={isParsingFate} />
                                            <div className="text-slate-400 text-sm font-bold flex flex-col items-center gap-2">
                                                {isParsingFate ? (
                                                    <div className="flex items-center gap-2 text-purple-400">
                                                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                                        <span>INGESTING REALITY...</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <span className="text-2xl">📄</span>
                                                        <span>{manuscript ? "REPLACE SOURCE" : "DROP NOVEL (.txt) OR GRAPH (.json)"}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        
                                        {/* PARSING LOG CONSOLE */}
                                        <div className="mt-2 bg-black rounded p-2 text-[10px] font-mono text-green-400 h-24 overflow-y-auto border border-slate-800 shadow-inner custom-scrollbar">
                                            {parsingLog.length > 0 ? parsingLog.map((l,i) => <div key={i}>{l}</div>) : <span className="text-slate-600 italic">Waiting for input...</span>}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col h-full">
                                <label className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">World Bible (Lore)</label>
                                <textarea 
                                    value={selectedLoreKey === 'MANUSCRIPT' ? customLore : (selectedLoreKey === 'CUSTOM' ? customLore : LORE_PRESETS[selectedLoreKey])}
                                    onChange={(e) => {
                                        setCustomLore(e.target.value);
                                        if (selectedLoreKey !== 'MANUSCRIPT') setSelectedLoreKey('CUSTOM');
                                    }}
                                    placeholder="Define the metaphysical rules of your world..."
                                    className="flex-grow w-full bg-black border border-slate-700 rounded p-3 text-xs font-mono outline-none focus:border-green-500 resize-none leading-relaxed text-slate-300"
                                />
                            </div>
                        </div>
                        
                        <div className="mb-6 bg-slate-800/50 p-3 rounded border border-slate-700 flex items-center justify-between">
                            <div>
                                <div className="text-sm font-bold text-white">Echo Mode (Simulation)</div>
                                <div className="text-xs text-slate-500">Auto-generates the 'Perfect' User Input for the plot.</div>
                            </div>
                            <input 
                                type="checkbox" 
                                checked={isEchoMode}
                                onChange={(e) => setIsEchoMode(e.target.checked)}
                                className="w-5 h-5 accent-cyan-500 cursor-pointer"
                            />
                        </div>
                        
                        {/* FATE GRAPH VISUALIZER */}
                        {graphData.nodes.length > 0 && (
                            <div className="mb-6 animate-fade-in relative group">
                                <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 flex justify-between items-center">
                                    <span>Detected Fate Graph</span>
                                    <div className="flex gap-4">
                                        <span className="text-purple-400">{graphData.nodes.length} Transactions</span>
                                        <button 
                                            onClick={handleExportFateGraph}
                                            className="text-[10px] text-cyan-400 hover:text-white border border-cyan-900 hover:bg-cyan-900/50 px-2 rounded transition-colors"
                                        >
                                            SAVE FATE GRAPH
                                        </button>
                                    </div>
                                </div>
                                <FateGraphVis data={graphData} activeIndex={-1} />
                            </div>
                        )}

                        <button 
                            onClick={handleCreateSession}
                            disabled={isParsingFate}
                            className="w-full py-4 bg-gradient-to-r from-green-800 to-green-600 hover:from-green-700 hover:to-green-500 text-white font-bold tracking-widest rounded shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isParsingFate ? "PLEASE WAIT..." : "INITIATE GENESIS"}
                        </button>
                    </div>
                    
                    {/* Session List */}
                    <div className="w-full max-w-3xl space-y-2">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Parallel Timelines</h3>
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => handleLoadSession(s)} className="bg-slate-900/60 border border-slate-700 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-green-500 hover:bg-slate-800 transition-colors group">
                                <div>
                                    <div className="font-bold text-sm text-slate-200">{new Date(s.timestamp).toLocaleString()}</div>
                                    <div className="text-xs text-slate-500 truncate w-64">{s.lore.substring(0, 50)}...</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-xs text-green-400 font-mono">TURN {s.turnCount}</div>
                                        <div className="text-[10px] text-slate-600">ID: {s.id.slice(-6)}</div>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); saveSession(null); }} className="text-slate-600 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VIEW: GAME (Same as before) */}
            {view === "GAME" && activeSession && (
                <div className="flex-grow z-10 flex overflow-hidden">
                    <div className="flex-grow flex flex-col min-w-0 relative">
                        {/* Overlay: Fate Graph + ToM */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-3/4 max-w-xl flex flex-col gap-2 items-center pointer-events-none">
                            <div className="bg-black/80 backdrop-blur-md border border-purple-500/50 p-2 rounded-lg text-center shadow-lg transform transition-all w-full pointer-events-auto">
                                <div className="text-[9px] text-purple-400 font-bold uppercase tracking-widest mb-1">THEORY OF MIND</div>
                                <div className="text-xs text-purple-100 italic">"{userModel}"</div>
                            </div>
                            
                            {/* LIVE FATE GRAPH */}
                            {activeSession.fateGraph && activeSession.fateGraph.length > 0 && (
                                <div className="bg-black/80 backdrop-blur-md border border-cyan-500/50 p-2 rounded-lg text-center shadow-lg w-full pointer-events-auto overflow-hidden">
                                    <div className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest mb-1 flex justify-between">
                                        <span>FATE GRAPH</span>
                                        <span>{activeSession.currentFateIndex + 1} / {activeSession.fateGraph.length}</span>
                                    </div>
                                    {/* Mini Graph for Context */}
                                    <div className="h-16 mb-2 opacity-80">
                                        <FateGraphVis data={{nodes: activeSession.fateGraph}} activeIndex={activeSession.currentFateIndex} />
                                    </div>
                                    <div className="text-xs text-cyan-100 font-bold">
                                        TARGET: {activeSession.fateGraph[activeSession.currentFateIndex]?.title || "Unknown"}
                                    </div>
                                    <div className="text-[10px] text-slate-400 truncate">
                                        {activeSession.fateGraph[activeSession.currentFateIndex]?.key_event}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar pt-52 pb-40">
                            {/* RESTORED: Render FULL chat history without slicing */}
                            {chatHistory.map((msg, i) => (
                                <div key={i} className={\`max-w-[85%] p-4 rounded-lg text-sm leading-relaxed shadow-md \${msg.sender === 'GM' ? 'bg-slate-800/90 text-slate-200 self-start border-l-4 border-purple-500' : (msg.sender === 'SYSTEM' ? 'bg-red-900/20 border border-red-500/50 text-red-200 text-center mx-auto w-full' : (msg.sender === 'INTERPRETER' ? 'bg-blue-900/30 text-blue-200 text-xs italic self-end ml-auto border-r-2 border-blue-500' : 'bg-green-900/40 text-green-100 self-end ml-auto border-r-4 border-green-500'))}\`}>
                                    <div className="text-[10px] font-bold opacity-50 mb-1 uppercase tracking-wider">{msg.sender}</div>
                                    <div className="whitespace-pre-wrap font-serif text-base">{msg.text}</div>
                                </div>
                            ))}
                            {phase === 'PROCESSING' && (
                                <div className="self-start text-xs text-purple-400 animate-pulse p-2">
                                    Computing Reality...
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black via-slate-900/95 to-transparent p-4 pb-6 pt-10 flex flex-col gap-4">
                            {phase === 'CHOOSING' && (
                                <div className="w-full max-w-3xl mx-auto">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 px-1">
                                        <span>DECISION WINDOW</span>
                                        <span className="text-red-400">DEFAULT: {defaultAction}</span>
                                    </div>
                                    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-red-500 transition-all duration-1000 ease-linear shadow-[0_0_10px_red]" 
                                            style={{width: \`\${(countdown / MAX_COUNTDOWN) * 100}%\`}}
                                        ></div>
                                    </div>
                                </div>
                            )}

                            {phase === 'CHOOSING' && (
                                <div className="flex flex-wrap justify-center gap-3 w-full max-w-4xl mx-auto">
                                    {currentChoices.map((choice) => (
                                        <button 
                                            key={choice.id}
                                            onClick={() => handleActionCommit(choice.text, false)}
                                            className="flex-1 min-w-[200px] bg-slate-800/80 hover:bg-cyan-900/80 border border-slate-600 hover:border-cyan-400 text-slate-200 p-4 rounded-lg text-sm text-left transition-all hover:-translate-y-1 shadow-lg group"
                                        >
                                            <span className="font-bold text-cyan-500 mr-2 group-hover:text-white">{choice.id}.</span>
                                            {choice.text}
                                        </button>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-2 w-full max-w-3xl mx-auto">
                                <button 
                                    onClick={toggleListening}
                                    className={\`p-3 rounded-full border transition-all \${isListening ? 'bg-red-600 border-red-400 animate-pulse' : 'bg-slate-800 border-slate-600 hover:bg-slate-700'}\`}
                                >
                                    🎤
                                </button>
                                <input 
                                    type="text" 
                                    value={inputText}
                                    onChange={(e) => setInputText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
                                    placeholder={phase === 'CHOOSING' ? "Or type your own action (Interrupt)..." : "Waiting..."}
                                    className="flex-grow bg-slate-900/50 border border-slate-600 rounded-lg px-4 py-3 text-white outline-none focus:border-cyan-500 backdrop-blur-sm disabled:opacity-50"
                                    disabled={phase === 'PROCESSING'}
                                    autoFocus
                                />
                                <button 
                                    onClick={handleManualSubmit}
                                    disabled={phase === 'PROCESSING' || !inputText.trim()}
                                    className="px-6 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 text-white font-bold rounded-lg transition-colors shadow-lg"
                                >
                                    ACT
                                </button>
                            </div>
                        </div>
                    </div>

                    {showDebug && (
                        <div className="w-80 bg-black/90 border-l border-slate-700 flex flex-col shrink-0 transition-all z-20">
                            <div className="p-2 border-b border-slate-800 text-xs font-bold text-yellow-500">GM THOUGHT STREAM</div>
                            <div className="flex-grow overflow-y-auto p-2 space-y-2 font-mono text-[10px] custom-scrollbar">
                                {gmLog.map((log, i) => (
                                    <div key={i} className="border-b border-slate-800 pb-2 mb-2">
                                        <div className="flex justify-between opacity-50 mb-1">
                                            <span>{log.type}</span>
                                            <span>{log.time}</span>
                                        </div>
                                        <div className={\`break-words \${log.type === 'ERROR' ? 'text-red-400' : 'text-slate-300'}\`}>
                                            {log.msg}
                                        </div>
                                    </div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                            <div className="p-2 border-t border-slate-800 text-[10px] text-slate-500">
                                STATE: {activeSession.worldState.substring(0, 50)}...
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
`;
