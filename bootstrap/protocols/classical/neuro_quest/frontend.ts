
export const NEURO_QUEST_UI_IMPL = `
    const { useState, useEffect, useRef } = React;
    const [status, setStatus] = useState("Idle");
    const [serverUrl, setServerUrl] = useState(""); 
    const [logs, setLogs] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    
    // Lore State
    const [lorePresets, setLorePresets] = useState({});
    const [selectedLoreKey, setSelectedLoreKey] = useState("Cyberpunk");
    const [customLore, setCustomLore] = useState("");
    const [useCustomLore, setUseCustomLore] = useState(false);
    
    // Entropy / Bio-Feedback Settings
    const [entropySource, setEntropySource] = useState('Manual');
    const [autopilotActive, setAutopilotActive] = useState(true);
    
    // --- IMAGINATION DECK STATE ---
    const [imaginationOpen, setImaginationOpen] = useState(false);
    const [liveState, setLiveState] = useState(null);

    const PROCESS_ID = 'neuro_quest_v1';
    const TARGET_VERSION = "V104"; // Current React Version
    
    // --- LIVE STATE POLLING (Quest Images) ---
    useEffect(() => {
        if (status === "RUNNING" && serverUrl) {
            const interval = setInterval(() => {
                fetch(serverUrl + '/session/state')
                    .then(r => r.json())
                    .then(data => {
                        setLiveState(data);
                    })
                    .catch(e => {
                        console.warn("[NQ] Session state poll failed", e);
                    });
            }, 2000);
            return () => clearInterval(interval);
        }
    }, [status, serverUrl]);

    // Debug Log when Imagination Toggles
    useEffect(() => {
        if (imaginationOpen) {
            console.log("[NQ] Imagination Deck OPENED. Live State:", liveState);
            runtime.logEvent("[NQ] 👁️ Imagination Deck Opened.");
        }
    }, [imaginationOpen]);

    // --- BIO BRIDGE: Stream React EEG State to Python ---
    useEffect(() => {
        if (!serverUrl || status !== "RUNNING") return;
        
        // --- REAL EEG MODE ---
        if (entropySource !== 'EEG') return;

        const unsub = runtime.neuroBus.subscribe(frame => {
            if (frame.type === 'EEG') {
                let focus = 0.5;
                const payload = frame.payload;
                if (payload) {
                    let totalVar = 0;
                    let count = 0;
                    Object.values(payload).forEach(arr => {
                        if (Array.isArray(arr) && arr.length > 10) {
                            const sample = arr.slice(-50);
                            const mean = sample.reduce((a,b)=>a+b,0)/sample.length;
                            const v = sample.reduce((a,b)=>a+(b-mean)**2,0)/sample.length;
                            totalVar += v;
                            count++;
                        }
                    });
                    
                    if (count > 0) {
                        const avgVar = totalVar / count;
                        focus = Math.max(0, Math.min(1, 1.0 - (avgVar / 200)));
                    }
                }
                
                // Throttle: Send every ~1s
                if (Math.random() > 0.9) { 
                    fetch(serverUrl + '/ingest/bio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ focus: focus })
                    }).catch(()=>{});
                }
            }
        });

        return () => { unsub(); };
    }, [serverUrl, status, entropySource]);

    const pollState = async () => {
        if (!runtime.isServerConnected()) return;
        try {
            const result = await runtime.tools.run('List Managed Processes', {});
            const proc = result.processes?.find(p => p.processId === PROCESS_ID);
            
            if (proc) {
                const url = 'http://localhost:' + proc.port;
                if (url !== serverUrl) {
                    setServerUrl(url);
                    
                    // --- VERSION CHECK ---
                    fetch(url + '/').then(r => r.json()).then(data => {
                        if (data.version !== TARGET_VERSION) {
                            console.warn("Version Mismatch. Redeploying...", data.version, TARGET_VERSION);
                            runtime.logEvent("[NQ] ⚠️ Old Version Detected (" + (data.version||'Unknown') + "). Redeploying...");
                            runtime.tools.run('Stop Process', { processId: PROCESS_ID }).then(() => {
                                setTimeout(deployAndLaunch, 1000);
                            });
                        } else {
                            fetch(url + '/presets/lore').then(r => r.json()).then(setLorePresets).catch(()=>{});
                            fetchSessions(url); 
                        }
                    }).catch(()=>{});
                }
                setStatus("RUNNING");
                
                const lines = proc.logs || [];
                setLogs(lines.slice(-10));
            } else {
                if (status.includes("RUNNING")) {
                    setStatus("STOPPED");
                    setServerUrl("");
                }
            }
        } catch(e) {}
    };
    
    const fetchSessions = async (explicitUrl = null) => {
        const targetUrl = explicitUrl || serverUrl;
        if (!targetUrl) return;
        
        setIsLoadingSessions(true);
        try {
            const res = await fetch(targetUrl + '/sessions');
            if (res.ok) {
                const data = await res.json();
                setSessions(data);
            }
        } catch(e) {}
        setIsLoadingSessions(false);
    };

    useEffect(() => {
        if (status === "RUNNING" && serverUrl) {
            fetchSessions();
            const i = setInterval(() => fetchSessions(), 3000);
            return () => clearInterval(i);
        }
    }, [status, serverUrl]);
    
    useEffect(() => {
        const i = setInterval(pollState, 1000);
        pollState();
        return () => clearInterval(i);
    }, []);
    
    const deployAndLaunch = async () => {
        if (!runtime.isServerConnected()) return;
        setStatus("Deploying...");
        const codeContent = %%PYTHON_CODE%%;
        
        await runtime.tools.run('Server File Writer', { 
            filePath: 'neuro_quest.py', 
            content: codeContent, 
            baseDir: 'scripts' 
        });
        
        setStatus("Launching Native Engine...");
        await runtime.tools.run('Start Python Process', { 
            processId: PROCESS_ID, scriptPath: 'neuro_quest.py', venv: 'venv_vision' 
        });
    };
    
    const handleNewGame = async () => {
        if (!serverUrl) return;
        
        const lore = useCustomLore ? customLore : lorePresets[selectedLoreKey];
        if (!lore) { alert("Lore is required"); return; }

        try {
            const res = await fetch(serverUrl + '/sessions/new', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ lore })
            });
            
            if (res.ok) {
                const data = await res.json();
                setActiveSessionId(data.id);
                fetchSessions();
                setTimeout(() => {
                    fetch(serverUrl + '/action/speak', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: "Welcome to Neuro Quest.", voice: "af_sarah" })
                    }).catch(()=>{});
                }, 2000);
            } 
        } catch(e) { console.error(e); }
    };
    
    const handleLoadGame = async (sid) => {
        if (!serverUrl) return;
        try {
            await fetch(serverUrl + '/sessions/' + sid + '/load', { method: 'POST' });
            setActiveSessionId(sid);
        } catch(e) { alert("Failed to load session"); }
    };
    
    const handleSaveAndExit = async () => {
        if (!serverUrl) return;
        setStatus("Saving...");
        try {
            await fetch(serverUrl + '/action/save_and_quit', { method: 'POST' });
            await new Promise(r => setTimeout(r, 1000));
            await runtime.tools.run('Stop Process', { processId: PROCESS_ID });
            setStatus("Stopped");
            setSessions([]);
            setActiveSessionId(null);
        } catch(e) { alert("Error saving: " + e.message); }
    };
    
    const handleToggleHud = async () => {
        if (!serverUrl) return;
        try { await fetch(serverUrl + '/action/toggle_hud', { method: 'POST' }); } catch(e) {}
    };

    const handleToggleAutopilot = async () => {
        if (!serverUrl) return;
        try {
            const res = await fetch(serverUrl + '/action/toggle_autopilot', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                setAutopilotActive(data.autopilot);
            }
        } catch(e) {}
    };

    return (
        <div className="relative w-full h-full bg-slate-900 text-white font-mono p-8 flex flex-col items-center justify-center gap-6">
            <div className="text-center">
                <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-cyan-400 mb-2">
                    NEURO QUEST NATIVE
                </h1>
                <p className="text-slate-400">Generative RPG // Elemental Combat Engine</p>
            </div>
            
            {/* IMAGINATION DECK (FLOATING WINDOW) */}
            {/* Using Fixed positioning to break out of overflow containers */}
            {imaginationOpen && (
                <div 
                    className="fixed top-20 right-20 w-80 bg-slate-900/95 border-2 border-purple-500 rounded-lg shadow-[0_0_50px_rgba(168,85,247,0.3)] p-4 flex flex-col max-h-[70vh] overflow-hidden animate-fade-in-scale"
                    style={{ zIndex: 9999 }}
                >
                    <div className="flex justify-between items-center mb-4 border-b border-purple-700 pb-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xl">👁️</span>
                            <h3 className="font-bold text-purple-300 text-sm">GM IMAGINATION</h3>
                        </div>
                        <button onClick={() => setImaginationOpen(false)} className="text-slate-400 hover:text-white font-bold">✕</button>
                    </div>
                    
                    {/* Debug Status */}
                    <div className="text-[9px] text-slate-500 mb-2 font-mono border-b border-slate-800 pb-1">
                        SESS: {liveState?.session_id || 'Connecting...'} | QUESTS: {liveState?.quests?.length || 0}
                    </div>

                    <div className="flex-grow overflow-y-auto custom-scrollbar space-y-4 pr-1">
                        {liveState?.quests?.map(q => (
                            <div key={q.id} className="bg-black/50 rounded border border-slate-700 overflow-hidden relative group">
                                {q.has_image ? (
                                    <div className="relative group cursor-pointer">
                                        <img 
                                            src={serverUrl + '/sessions/' + liveState.session_id + '/quests/' + q.id + '/image?t=' + Date.now()} 
                                            className="w-full h-40 object-cover"
                                            alt="Quest Visualization"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-60"></div>
                                    </div>
                                ) : (
                                    <div className="w-full h-24 flex flex-col items-center justify-center bg-slate-800 text-slate-600 text-xs italic gap-1">
                                        <span className="animate-pulse">🌀 Dreaming...</span>
                                    </div>
                                )}
                                <div className="p-3 relative">
                                    <div className="font-bold text-xs text-white mb-1 leading-tight">{q.text}</div>
                                    <div className="text-[10px] text-purple-400 italic line-clamp-2">"{q.visual}"</div>
                                </div>
                            </div>
                        ))}
                        {(!liveState?.quests || liveState.quests.length === 0) && (
                            <div className="text-center text-slate-500 text-xs py-10 border-2 border-dashed border-slate-800 rounded">
                                The Game Master is silent.<br/>No active projections.
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-black/50 p-6 rounded-lg border border-slate-700 w-full max-w-4xl flex flex-col gap-4 min-h-[500px]">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                    <div>
                        <div className="text-xs text-slate-500">ENGINE STATUS</div>
                        <div className={"text-lg font-bold " + (status.includes("RUNNING") ? "text-green-400" : "text-yellow-500")}>
                            {status}
                        </div>
                    </div>
                    {status.includes("RUNNING") && (
                        <div className="flex gap-2">
                            <button onClick={() => fetchSessions()} className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-600 rounded transition-colors">
                                REFRESH
                            </button>
                            <button onClick={handleSaveAndExit} className="px-4 py-1 text-xs bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 rounded transition-colors font-bold shadow-md">
                                SAVE & EXIT
                            </button>
                        </div>
                    )}
                </div>
                
                {!status.includes("RUNNING") ? (
                    <div className="flex-grow flex items-center justify-center">
                        <button 
                            onClick={deployAndLaunch}
                            disabled={!runtime.isServerConnected()}
                            className="px-8 py-4 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-lg font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all transform hover:scale-105"
                        >
                            LAUNCH GAME ENGINE
                        </button>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col gap-6">
                        {/* ACTIVE SESSION CARD */}
                        {activeSessionId ? (
                            <div className="bg-purple-900/20 border border-purple-500 rounded-lg p-6 text-center animate-fade-in">
                                <h2 className="text-xl font-bold text-purple-300 mb-2">SESSION ACTIVE</h2>
                                <div className="text-2xl font-mono text-white mb-4">{activeSessionId}</div>
                                
                                <div className="flex justify-center gap-4 items-center flex-wrap">
                                    <div className="inline-block px-3 py-1 bg-purple-800/50 rounded text-xs border border-purple-600 animate-pulse">
                                        LIVE TELEMETRY ON
                                    </div>
                                    
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => setEntropySource(entropySource === 'EEG' ? 'Manual' : 'EEG')}
                                            className={"px-2 py-0.5 rounded text-[10px] font-bold border transition-colors " + (entropySource === 'EEG' ? "bg-cyan-900/50 text-cyan-300 border-cyan-700" : "bg-slate-700 text-slate-300 border-slate-500")}
                                        >
                                            {entropySource === 'EEG' ? '🧠 LINKED' : '🎛️ MANUAL'}
                                        </button>
                                    </div>
                                    
                                    <button
                                        onClick={handleToggleHud}
                                        className="px-2 py-0.5 rounded text-[10px] font-bold border bg-slate-800 hover:bg-slate-700 text-yellow-300 border-yellow-700 transition-colors"
                                    >
                                        HUD
                                    </button>

                                    <button
                                        onClick={handleToggleAutopilot}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold border transition-colors " + (autopilotActive ? "bg-pink-900/50 text-pink-300 border-pink-700 animate-pulse" : "bg-slate-800 hover:bg-slate-700 text-slate-400 border-slate-600")}
                                    >
                                        {autopilotActive ? "🎥 MOVIE" : "🎥 MANUAL"}
                                    </button>
                                    
                                    {/* IMAGINATION TOGGLE */}
                                    <button
                                        onClick={() => {
                                            console.log("Toggle Clicked. Current:", imaginationOpen);
                                            runtime.logEvent("[UI] Toggle Imagination Deck: " + (!imaginationOpen));
                                            setImaginationOpen(!imaginationOpen);
                                        }}
                                        className={"px-2 py-0.5 rounded text-[10px] font-bold border transition-colors flex items-center gap-1 " + (imaginationOpen ? "bg-purple-600 text-white border-purple-400 shadow-[0_0_10px_purple]" : "bg-slate-800 text-purple-400 border-purple-900/50")}
                                    >
                                        👁️ IMAGINATION
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex-grow flex flex-col gap-4">
                                <div className="flex justify-between items-end">
                                    <div>
                                        <h2 className="text-xl font-bold text-white">SELECT SESSION</h2>
                                        <p className="text-xs text-slate-400">Choose a timeline to load or start fresh.</p>
                                    </div>
                                    <button onClick={() => fetchSessions()} className="text-xs text-cyan-400 hover:text-white underline flex items-center gap-1">
                                        Refresh List {isLoadingSessions && <span className="animate-spin">⟳</span>}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow overflow-y-auto custom-scrollbar p-1">
                                    <div className="flex flex-col p-4 bg-slate-800/50 border-2 border-dashed border-slate-600 hover:border-green-500 rounded-lg transition-all h-64">
                                        <div className="text-lg font-bold text-slate-300 mb-2">+ NEW GAME</div>
                                        <div className="flex-grow flex flex-col gap-2">
                                            <div className="flex items-center justify-between text-xs">
                                                <span className="text-slate-400">Lore Source</span>
                                                <button onClick={() => setUseCustomLore(!useCustomLore)} className="text-cyan-400 hover:underline">
                                                    {useCustomLore ? "Use Preset" : "Custom"}
                                                </button>
                                            </div>
                                            {useCustomLore ? (
                                                <textarea 
                                                    value={customLore}
                                                    onChange={e => setCustomLore(e.target.value)}
                                                    placeholder="Enter custom world lore..."
                                                    className="w-full h-24 bg-black/50 border border-slate-600 rounded p-2 text-xs text-white resize-none focus:border-green-500 outline-none"
                                                />
                                            ) : (
                                                <div className="space-y-1 overflow-y-auto h-24 pr-1 custom-scrollbar bg-black/20 rounded p-1">
                                                    {Object.keys(lorePresets).map(key => (
                                                        <button key={key} onClick={() => setSelectedLoreKey(key)} className={"w-full text-left px-2 py-1.5 rounded text-xs transition-colors " + (selectedLoreKey === key ? "bg-green-900/50 text-green-300 border border-green-700" : "hover:bg-slate-700 text-slate-400")}>
                                                            {key}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="text-[10px] text-slate-500 italic line-clamp-2 h-8">
                                                {useCustomLore ? "Custom World" : lorePresets[selectedLoreKey]}
                                            </div>
                                        </div>
                                        <button onClick={handleNewGame} className="mt-2 w-full py-2 bg-slate-700 hover:bg-green-700 text-white font-bold rounded transition-colors">START</button>
                                    </div>

                                    <div className="space-y-2 overflow-y-auto h-64 custom-scrollbar pr-1">
                                        {sessions.map(sess => (
                                            <div key={sess.id} className="bg-slate-800 border border-slate-700 p-3 rounded-lg flex flex-col justify-between hover:border-cyan-500 transition-colors relative group">
                                                <div>
                                                    <div className="flex justify-between items-start">
                                                        <div className="font-bold text-cyan-300 text-xs truncate w-2/3">{sess.id}</div>
                                                        <span className="text-[9px] text-slate-600">{new Date(sess.last_updated * 1000).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="text-[10px] text-purple-400 mt-1 font-bold">{sess.lore?.substring(0,30)}...</div>
                                                    <div className="text-[10px] text-slate-400 line-clamp-2 italic mt-1">"{sess.summary}"</div>
                                                </div>
                                                <div className="flex justify-end mt-2">
                                                    <button onClick={() => handleLoadGame(sess.id)} className="px-3 py-1 bg-cyan-900 hover:bg-cyan-700 text-cyan-200 text-[10px] font-bold rounded border border-cyan-800 transition-colors">RESUME</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="bg-black p-2 rounded text-[10px] text-slate-500 font-mono h-24 overflow-y-auto border border-slate-800 custom-scrollbar">
                    {logs.map((l, i) => <div key={i}>{l}</div>)}
                </div>
            </div>
            
            <div className="text-center text-xs text-slate-500 max-w-xl">
                <p className="mb-2">CONTROLS (Genshin Style):</p>
                <div className="grid grid-cols-3 gap-4 text-left inline-grid">
                    <span>D-PAD: Switch Element</span>
                    <span>BTN B: Attack</span>
                    <span>BTN X: Interact</span>
                    <span>RT: Skill</span>
                    <span>BTN Y: Burst</span>
                    <span>R-STICK: Camera</span>
                    <span className="text-purple-400 font-bold">LB: MANIFEST QUEST</span>
                    <span>LT: Lucidity Dampener</span>
                </div>
            </div>
        </div>
    );
`;
