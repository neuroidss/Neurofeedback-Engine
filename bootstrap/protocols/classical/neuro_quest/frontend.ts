
export const NEURO_QUEST_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    const { apiConfig, selectedModel } = runtime.getState();

    const [status, setStatus] = useState("Idle");
    const [serverUrl, setServerUrl] = useState(""); 
    const [logs, setLogs] = useState([]);
    const [sessions, setSessions] = useState([]);
    const [activeSessionId, setActiveSessionId] = useState(null);
    const [isLoadingSessions, setIsLoadingSessions] = useState(false);
    
    // Deployment Lock to prevent race conditions
    const [isDeploying, setIsDeploying] = useState(false);
    
    const [lorePresets, setLorePresets] = useState({
        "RANCE_10_MODE": { title: "Operation: Rance 10 (Loop)", description: "Fantasy Strategy / Anime War" },
        "SCP_MODE": { title: "Echoes of Silence (SCP)", description: "Cosmic Horror / Logic vs Madness" }
    });
    const [selectedLoreKey, setSelectedLoreKey] = useState("RANCE_10_MODE");
    const [customLore, setCustomLore] = useState("");
    const [useCustomLore, setUseCustomLore] = useState(false);
    
    const [startMode, setStartMode] = useState("CINEMA"); 
    const [genomeInput, setGenomeInput] = useState(null);
    
    // Entropy / Bio-Feedback Settings
    const [entropySource, setEntropySource] = useState('Manual');
    const [autopilotActive, setAutopilotActive] = useState(true);
    const [controlBalance, setControlBalance] = useState(0.5); // 0 = Low Focus (Noise), 1 = High Focus (Precision)
    
    const [showStream, setShowStream] = useState(true);

    const [narrativeText, setNarrativeText] = useState("");
    const [narrativeHistory, setNarrativeHistory] = useState([]);
    const [narrativeVisible, setNarrativeVisible] = useState(false);
    const narrativeTimerRef = useRef(null);
    
    const [ttsEnabled, setTtsEnabled] = useState(true);
    const [availableVoices, setAvailableVoices] = useState([]);
    const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
    
    const [musicLinked, setMusicLinked] = useState(false);
    
    const [gameStats, setGameStats] = useState({ 
        resources: {}, 
        logs: [], 
        event: "Init", 
        territories: [], 
        inventory: [],
        phase: "STRATEGY", 
        social_interactions: [],
        game_over: false,
        perks: [],
        meta_perks_pool: [],
        active_battle: null
    });
    const [currentActorImage, setCurrentActorImage] = useState(null);
    const [selectedCardId, setSelectedCardId] = useState(null);

    const PROCESS_ID = 'neuro_quest_v1';
    const TARGET_VERSION = "V105_CINEMA"; 

    // --- SYNC LLM CONFIG TO BACKEND ---
    const lastSyncedConfigRef = useRef(null);

    const syncLlmConfig = async (explicitServerUrl = null) => {
        const target = explicitServerUrl || serverUrl;
        if (!target) return;
        
        let upstreamUrl = "";
        let upstreamKey = "";
        let upstreamModel = selectedModel?.id || "";

        // STRICT MODE: Only use user configuration. No defaults.
        if (selectedModel?.provider === 'OpenAI_API') {
            let baseUrl = apiConfig.openAIBaseUrl || "";
            if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
            if (baseUrl) upstreamUrl = baseUrl + "/chat/completions";
            upstreamKey = apiConfig.openAIAPIKey || "";
        } else if (selectedModel?.provider === 'Ollama') {
            let host = apiConfig.ollamaHost || "";
            if (host.endsWith('/')) host = host.slice(0, -1);
            
            // NOTE: We send the direct URL to the Python backend because it runs locally 
            // and can access 11434 without CORS.
            // The Frontend Service layer handles Proxy Fallback automatically if *it* needs to call Ollama directly.
            
            if (host) upstreamUrl = host + "/v1/chat/completions";
            upstreamKey = "ollama"; 
        } else if (selectedModel?.provider === 'DeepSeek') {
             let baseUrl = apiConfig.deepSeekBaseUrl || "";
             if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
             if (baseUrl) upstreamUrl = baseUrl + "/chat/completions";
             upstreamKey = apiConfig.deepSeekAPIKey || "";
        }

        const configPayload = {
            api_url: upstreamUrl,
            api_key: upstreamKey,
            model_id: upstreamModel
        };
        const configSignature = JSON.stringify(configPayload);

        // Allow forced re-sync if the server is asking for it
        console.log("[NQ] Syncing User LLM Config:", upstreamModel, upstreamUrl);

        try {
            await fetch(target + '/config/llm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: configSignature
            });
            lastSyncedConfigRef.current = configSignature;
        } catch(e) { console.error("LLM Sync Failed", e); }
    };

    // Trigger sync when relevant props change or server becomes available
    useEffect(() => {
        if (serverUrl && status === "RUNNING") {
            syncLlmConfig();
        }
    }, [serverUrl, status, selectedModel, apiConfig]);

    // REACTIVE LOG MONITOR: Re-Sync if backend reports UNCONFIGURED
    useEffect(() => {
        if (!logs || logs.length === 0) return;
        const lastLog = logs[logs.length - 1] || "";
        
        // If server says "Waiting for LLM (UNCONFIGURED", force a resync
        if (lastLog.includes("Waiting for LLM") && lastLog.includes("UNCONFIGURED")) {
            console.log("[NQ] 🚨 Server reported UNCONFIGURED. Forcing config sync...");
            syncLlmConfig();
        }
    }, [logs]);

    // --- SEMANTIC RADAR LOGIC ---
    // Extract semantic similarity from active battle stats for visualization
    const semanticSimHistory = gameStats.active_battle?.sim_history || [];
    const calculationLogs = gameStats.active_battle?.last_calc_log || [];
    
    const SemanticRadar = ({ simHistory, calcLogs, focus }) => {
        const width = 200;
        const height = 150;
        const terminalRef = useRef(null);
        
        useEffect(() => {
            if(terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }, [calcLogs]);
        
        // Render a moving dot representing the Semantic Clash
        const latestSim = simHistory.length > 0 ? simHistory[simHistory.length - 1] : 0;
        
        // Visual Jitter based on Focus (controlBalance)
        const jitterX = (Math.random() - 0.5) * 40 * (1.0 - focus);
        const jitterY = (Math.random() - 0.5) * 40 * (1.0 - focus);
        
        const targetX = width/2 - (latestSim * (width/2 - 20)); 
        const targetY = height/2;

        // Simplify path generation to avoid nested backticks inside the return block
        const pathPoints = simHistory.map((s, i) => {
            const x = width/2 - (s*(width/2-20));
            const y = height - (i*(height/Math.max(20, simHistory.length)));
            return x + " " + y;
        }).join(' L ');
        
        const pathD = "M " + pathPoints;

        return (
            <div className="relative bg-black/80 border border-green-500/50 rounded p-2 flex flex-col items-center shadow-lg backdrop-blur-sm w-[220px]">
                <div className="text-[10px] text-green-400 font-mono w-full flex justify-between mb-1 border-b border-green-900/50 pb-1">
                    <span className="font-bold">SEMANTIC RADAR</span>
                    <span>FOCUS: {(focus*100).toFixed(0)}%</span>
                </div>
                <svg width={width} height={height} className="border border-slate-800 bg-[#050505] rounded-sm mb-2">
                    {/* Zones Gradients */}
                    <defs>
                        <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#00ff00" stopOpacity="0.2" />
                            <stop offset="45%" stopColor="#000000" stopOpacity="0" />
                            <stop offset="55%" stopColor="#000000" stopOpacity="0" />
                            <stop offset="100%" stopColor="#ff0000" stopOpacity="0.2" />
                        </linearGradient>
                    </defs>
                    <rect x="0" y="0" width={width} height={height} fill="url(#grad1)" />
                    
                    {/* Grid */}
                    <line x1={width/2} y1={0} x2={width/2} y2={height} stroke="#333" strokeDasharray="4" />
                    <line x1={0} y1={height/2} x2={width} y2={height/2} stroke="#333" strokeDasharray="4" />
                    
                    {/* Labels */}
                    <text x={5} y={15} fill="#4ade80" fontSize="8" fontWeight="bold">ALIGNMENT</text>
                    <text x={5} y={25} fill="#4ade80" fontSize="7" opacity="0.7">RESONANCE</text>
                    
                    <text x={width-45} y={15} fill="#f87171" fontSize="8" fontWeight="bold">CONFLICT</text>
                    <text x={width-45} y={25} fill="#f87171" fontSize="7" opacity="0.7">ANTONYMY</text>
                    
                    {/* Trace History */}
                    {simHistory.length > 0 && <path d={pathD} stroke="rgba(0,255,255,0.3)" fill="none" strokeWidth="1" />}
                    
                    {/* The Vector Point */}
                    <circle 
                        cx={Math.max(10, Math.min(width-10, targetX + jitterX))} 
                        cy={Math.max(10, Math.min(height-10, targetY + jitterY))} 
                        r={4 + (focus*4)} 
                        fill={latestSim < -0.3 ? "#ef4444" : (latestSim > 0.3 ? "#22c55e" : "#94a3b8")} 
                        className="transition-all duration-300 ease-out"
                        stroke="white"
                        strokeWidth={focus > 0.8 ? 2 : 0}
                    />
                     <line x1={width/2} y1={height/2} x2={Math.max(10, Math.min(width-10, targetX + jitterX))} y2={Math.max(10, Math.min(height-10, targetY + jitterY))} stroke="white" strokeOpacity="0.2" />
                </svg>
                
                {/* CALCULATION TERMINAL */}
                <div ref={terminalRef} className="w-full h-24 bg-black border border-slate-700 p-1 overflow-y-auto font-mono text-[8px] leading-tight text-slate-300 shadow-inner custom-scrollbar">
                    {calcLogs.length > 0 ? calcLogs.map((line, i) => (
                        <div key={i} className={line.includes('❌') ? 'text-red-400 font-bold' : (line.includes('🛡️') ? 'text-green-400 font-bold' : (line.includes('Axis') ? 'text-yellow-500 mt-1' : ''))}>
                            {line}
                        </div>
                    )) : <span className="text-slate-600 italic">Waiting for vector data...</span>}
                </div>
            </div>
        );
    };

    useEffect(() => {
        const loadVoices = () => {
            const voices = window.speechSynthesis.getVoices();
            setAvailableVoices(voices);
            if (!selectedVoiceURI && voices.length > 0) {
                const preferred = voices.find(v => v.name.includes("Google UK English Male")) || 
                                  voices.find(v => v.name.includes("Daniel")) ||
                                  voices.find(v => v.lang.startsWith("en"));
                if (preferred) setSelectedVoiceURI(preferred.voiceURI);
                else setSelectedVoiceURI(voices[0].voiceURI);
            }
        };
        loadVoices();
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }, []);

    const speak = (text) => {
        if (!text || !window.speechSynthesis || !ttsEnabled) return;
        window.speechSynthesis.cancel();
        const cleanText = text.replace(/\[.*?\]/g, "");
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.pitch = 0.9;
        if (selectedVoiceURI) {
            const voice = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
            if (voice) utterance.voice = voice;
        }
        window.speechSynthesis.speak(utterance);
    };

    useEffect(() => {
        if (status === "RUNNING" && serverUrl) {
            const interval = setInterval(() => {
                fetch(serverUrl + '/session/state')
                    .then(r => r.json())
                    .then(data => {
                        if (data.latest_narrative) {
                            const { text, voice } = data.latest_narrative;
                            setNarrativeText(text);
                            setNarrativeVisible(true);
                            setNarrativeHistory(prev => [text, ...prev].slice(0, 10));
                            if (voice && ttsEnabled) speak(text);
                            if (narrativeTimerRef.current) clearTimeout(narrativeTimerRef.current);
                            narrativeTimerRef.current = setTimeout(() => setNarrativeVisible(false), 7000);
                        }
                        
                        if (data.game_stats) {
                            setGameStats(data.game_stats);
                        }
                        
                        if (data.current_actor_image) {
                            setCurrentActorImage(serverUrl + data.current_actor_image);
                        } else {
                            setCurrentActorImage(null);
                        }
                        
                        if (data.music_active !== undefined) setMusicLinked(data.music_active);
                        if (data.autopilot !== undefined) setAutopilotActive(data.autopilot);
                    })
                    .catch(e => {});
            }, 500); // Faster polling for radar
            return () => clearInterval(interval);
        }
    }, [status, serverUrl, ttsEnabled, selectedVoiceURI]);

    useEffect(() => {
        if (!serverUrl || status !== "RUNNING") return;
        const syncState = (focusVal) => {
             fetch(serverUrl + '/ingest/bio', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ focus: focusVal, balance: controlBalance })
            }).catch(()=>{});
        };
        if (entropySource === 'Manual') {
            const i = setInterval(() => syncState(controlBalance), 200);
            return () => clearInterval(i);
        }
        const unsub = runtime.neuroBus.subscribe(frame => {
            if (frame.type === 'EEG') {
                let focus = 0.5;
                syncState(focus);
            }
        });
        return () => { unsub(); };
    }, [serverUrl, status, entropySource, controlBalance]);

    const pollState = async () => {
        if (!runtime.isServerConnected()) return;
        try {
            const result = await runtime.tools.run('List Managed Processes', {});
            const proc = result.processes?.find(p => p.processId === PROCESS_ID);
            if (proc) {
                // FIXED: Use Kernel Proxy to avoid CORS/Mixed Content errors
                // This routes requests like http://localhost:3001/mcp/neuro_quest_v1/...
                const url = 'http://localhost:3001/mcp/' + PROCESS_ID;
                
                if (url !== serverUrl) {
                    setServerUrl(url);
                    syncLlmConfig(url); // Auto-sync config on new connection
                }
                
                // ROBUST HEALTH CHECK
                try {
                    const r = await fetch(url + '/');
                    if (!r.ok) throw new Error(r.statusText);
                    const data = await r.json();
                    
                    if (data.error) {
                        // Gateway Error = Backend still booting
                        setStatus("BOOTING (LOADING MODELS)...");
                    } else if (data.version) {
                        // Success
                        const remoteVersion = data.version;
                        if (remoteVersion !== TARGET_VERSION) {
                            console.warn("Server Version Mismatch:", remoteVersion, "vs Target:", TARGET_VERSION, "Full Data:", data);
                        } else {
                            if (status !== "RUNNING") {
                                setStatus("RUNNING");
                                fetch(url + '/presets/lore').then(r => r.json()).then(remote => {
                                    setLorePresets(prev => ({...prev, ...remote}));
                                }).catch(()=>{});
                                fetchSessions(url);
                            }
                        }
                    }
                } catch(e) {
                    if (status.includes("RUNNING")) {
                        setStatus("CONNECTION LOST");
                    } else if (status.includes("Deploying")) {
                        // Keep current status
                    } else {
                        setStatus("BOOTING...");
                    }
                }

                const lines = proc.logs || [];
                setLogs(lines.slice(-20));
            } else {
                if (status.includes("RUNNING") || status.includes("BOOTING")) {
                    setStatus("STOPPED");
                    setServerUrl("");
                }
            }
        } catch(e) { console.error(e); }
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
        const i = setInterval(pollState, 1000);
        pollState();
        return () => clearInterval(i);
    }, []);
    
    const deployAndLaunch = async () => {
        if (!runtime.isServerConnected() || isDeploying) return; // Prevent double-click spawn
        
        setIsDeploying(true);
        setStatus("Deploying...");
        
        try {
            const codeContent = %%PYTHON_CODE%%;
            await runtime.tools.run('Server File Writer', { filePath: 'neuro_quest.py', content: codeContent, baseDir: 'scripts' });
            
            // Safety: Try to stop existing instance first to avoid port conflicts
            try { await runtime.tools.run('Stop Process', { processId: PROCESS_ID }); } catch(e) {}
            await new Promise(r => setTimeout(r, 1000)); // Wait for port release

            setStatus("Launching Native Engine...");
            await runtime.tools.run('Start Python Process', { processId: PROCESS_ID, scriptPath: 'neuro_quest.py', venv: 'venv_vision' });
        } catch(e) {
            setStatus("Launch Failed: " + e.message);
        } finally {
            setIsDeploying(false);
        }
    };
    
    const handleNewGame = async () => {
        if (!serverUrl) return;
        const lorePayload = useCustomLore ? { text: customLore } : selectedLoreKey; 
        const isAutopilot = startMode === "CINEMA";
        setAutopilotActive(isAutopilot);

        try {
            const res = await fetch(serverUrl + '/sessions/new', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    lore: lorePayload, 
                    genome: genomeInput,
                    autopilot: isAutopilot
                })
            });
            if (res.ok) {
                const data = await res.json();
                setActiveSessionId(data.id);
                fetchSessions();
            } 
        } catch(e) {
            alert("Failed to create session: " + e.message);
        }
    };
    
    const handleLoadGame = async (sid) => {
        if (!serverUrl) return;
        try {
            await fetch(serverUrl + '/sessions/' + sid + '/load', { method: 'POST' });
            setActiveSessionId(sid);
        } catch(e) {}
    };
    
    const handleQuickPlay = async () => {
        if (!serverUrl) return;
        if (sessions.length > 0) {
            const latest = sessions[0];
            handleLoadGame(latest.id);
        } else {
            if (!selectedLoreKey) setSelectedLoreKey("RANCE_10_MODE");
            setStartMode("ACTIVE"); 
            handleNewGame();
        }
    };
    
    const handleSaveAndExit = async () => {
        if (!serverUrl) return;
        try {
            await fetch(serverUrl + '/action/save_and_quit', { method: 'POST' });
            setActiveSessionId(null);
            setGameStats({ resources: {}, logs: [], event: "Init", territories: [], inventory: [] });
            setTimeout(() => fetchSessions(), 500);
        } catch(e) { console.error(e); }
    };

    const handleShutdown = async () => {
        if (!serverUrl) return;
        if (!confirm("Are you sure you want to stop the Python Engine?")) return;
        try {
            await handleSaveAndExit();
            await new Promise(r => setTimeout(r, 500));
            await runtime.tools.run('Stop Process', { processId: PROCESS_ID });
            setStatus("Stopped");
            setServerUrl("");
            setSessions([]);
        } catch(e) { console.error(e); }
    };
    
    const handleToggleHud = async () => { if (!serverUrl) return; try { await fetch(serverUrl + '/action/toggle_hud', { method: 'POST' }); } catch(e) {} };
    const handleToggleAutopilot = async () => { if (!serverUrl) return; try { const res = await fetch(serverUrl + '/action/toggle_autopilot', { method: 'POST' }); if (res.ok) setAutopilotActive((await res.json()).autopilot); } catch(e) {} };
    const handleTriggerEvent = async () => { if (!serverUrl) return; try { await fetch(serverUrl + '/action/trigger_event', { method: 'POST' }); } catch(e) {} };
    
    const handleEndTurn = async () => { 
        if (!serverUrl) return; 
        try { 
            await fetch(serverUrl + '/action/end_turn', { method: 'POST' }); 
        } catch(e) {} 
    };

    const handleBattleStart = async (territoryId) => {
        if (!serverUrl) return;
        try {
            await fetch(serverUrl + '/action/battle', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ target_id: territoryId })
            });
        } catch(e) {}
    };

    const handleSocialAction = async (cardUid, actionId) => {
        if (!serverUrl) return;
        try {
            await fetch(serverUrl + '/action/social', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card_uid: cardUid, action_id: actionId })
            });
            setSelectedCardId(null);
        } catch(e) {}
    };

    const handleFarmAction = async () => { if (!serverUrl) return; try { await fetch(serverUrl + '/action/farm', { method: 'POST' }); } catch(e) {} };
    
    const handleBuyPerk = async (perkId) => {
        if (!serverUrl) return;
        try {
             await fetch(serverUrl + '/action/buy_perk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ perk_id: perkId })
            });
        } catch(e) {}
    };

    const handleRestartRun = async () => {
        if (!serverUrl) return;
        try { await fetch(serverUrl + '/action/restart_run', { method: 'POST' }); } catch(e) {}
    };

    const toggleLiveFeed = async () => { if (!serverUrl) return; setShowStream(!showStream); };

    return (
        <div className="relative w-full h-full bg-slate-900 text-white font-mono p-2 flex flex-col items-center justify-center gap-2 overflow-hidden">
            
            {narrativeVisible && (
                <div className="absolute bottom-48 left-0 w-full flex justify-center z-[100] pointer-events-none animate-fade-in-up px-4">
                    <div className="bg-black/90 text-white font-serif text-lg md:text-xl px-12 py-6 rounded-lg border-t-2 border-purple-500 shadow-[0_0_50px_rgba(168,85,247,0.5)] max-w-4xl text-center leading-relaxed backdrop-blur-md">
                        {narrativeText}
                    </div>
                </div>
            )}
            
            {gameStats.game_over && (
                <div className="absolute inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
                    <div className="bg-slate-900 border-2 border-red-500 rounded-lg shadow-2xl w-full max-w-2xl p-6 flex flex-col gap-4">
                        <h2 className="text-3xl font-bold text-red-500 text-center">GAME OVER</h2>
                        <div className="text-center text-slate-300">
                             The timeline has collapsed. But you retain the memories.
                        </div>
                        <div className="text-center py-4 bg-black/50 rounded">
                            <span className="text-xs text-slate-500">CLEAR POINTS (CP)</span>
                            <div className="text-4xl font-black text-yellow-400">{gameStats.resources?.CP || 0}</div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 max-h-[300px] overflow-y-auto custom-scrollbar p-2">
                             {(gameStats.meta_perks_pool || []).map(perk => {
                                 const owned = (gameStats.perks || []).includes(perk.id);
                                 const canAfford = (gameStats.resources?.CP || 0) >= perk.cost;
                                 return (
                                     <button 
                                        key={perk.id}
                                        disabled={owned || !canAfford}
                                        onClick={() => handleBuyPerk(perk.id)}
                                        className={"p-3 rounded border text-left transition-all " + (
                                            owned ? "bg-green-900/30 border-green-500 opacity-50" : 
                                            canAfford ? "bg-slate-800 border-yellow-500 hover:bg-slate-700" : 
                                            "bg-slate-900 border-slate-700 opacity-50"
                                        )}
                                     >
                                         <div className="flex justify-between items-start">
                                             <div className="font-bold text-sm text-white">{perk.name}</div>
                                             <div className="text-yellow-400 font-bold">{perk.cost} CP</div>
                                         </div>
                                         <div className="text-xs text-slate-400 mt-1">{perk.desc}</div>
                                         {owned && <div className="text-[10px] text-green-400 mt-1">ACQUIRED</div>}
                                     </button>
                                 );
                             })}
                        </div>
                        
                        <button onClick={handleRestartRun} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded shadow-lg text-xl">
                            RESTART TIMELINE
                        </button>
                    </div>
                </div>
            )}
            
            <div className="bg-black/50 p-6 rounded-lg border border-slate-700 w-full h-full flex flex-col gap-4 min-h-0 flex-grow overflow-hidden">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2 shrink-0">
                    <div>
                        <div className="text-xs text-slate-500 font-bold">ENGINE STATUS</div>
                        <div className={"text-lg font-bold " + (status.includes("RUNNING") ? "text-green-400" : "text-yellow-500")}>
                            {status}
                        </div>
                    </div>
                    {status.includes("RUNNING") && (
                        <div className="flex gap-2">
                            <button onClick={() => fetchSessions()} className="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-600 rounded transition-colors">REFRESH</button>
                            <button onClick={handleSaveAndExit} className="px-4 py-1 text-xs bg-cyan-900/50 hover:bg-cyan-800 text-cyan-200 border border-cyan-700 rounded transition-colors font-bold shadow-md">SAVE & MENU</button>
                            <button onClick={handleShutdown} className="px-3 py-1 text-xs bg-red-900/50 hover:bg-red-800 text-red-200 border border-red-700 rounded transition-colors font-bold" title="Shutdown Engine">OFF</button>
                        </div>
                    )}
                </div>
                
                {!status.includes("RUNNING") ? (
                    <div className="flex-grow flex items-center justify-center">
                        <button 
                            onClick={deployAndLaunch} 
                            disabled={!runtime.isServerConnected() || isDeploying} 
                            className={"px-8 py-4 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-lg font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all transform " + (isDeploying ? "animate-pulse" : "hover:scale-105")}
                        >
                            {isDeploying ? "DEPLOYING..." : "LAUNCH GAME ENGINE"}
                        </button>
                    </div>
                ) : (
                    <div className="flex-grow flex flex-col gap-6 min-h-0 overflow-hidden">
                        {activeSessionId ? (
                            <div className="bg-purple-900/10 border border-purple-500/30 rounded-lg p-6 text-center animate-fade-in relative overflow-hidden flex flex-col gap-4 h-full">
                                {autopilotActive && <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 animate-pulse"></div>}
                                
                                <div className="flex justify-between items-end border-b border-slate-700/50 pb-2 mb-2 shrink-0">
                                    <div className="text-left">
                                        <h2 className="text-xl font-bold text-purple-300">SESSION ACTIVE</h2>
                                        <div className="text-[10px] font-mono text-slate-500">{activeSessionId}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className={"text-xs text-white px-2 py-1 rounded inline-block border font-bold uppercase tracking-widest " + (gameStats.phase === 'STRATEGY' ? 'bg-blue-900/30 border-blue-500' : 'bg-red-900/30 border-red-500')}>
                                            {gameStats.phase || 'INITIALIZING'}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex flex-col md:flex-row gap-4 h-full min-h-0">
                                    {/* VIDEO STREAM & HUD */}
                                    <div className="flex-grow aspect-video bg-black rounded border border-slate-700 overflow-hidden relative shadow-2xl group shrink-0">
                                        {showStream ? (
                                            serverUrl ? (
                                                <img src={serverUrl + "/video_feed"} className="w-full h-full object-contain opacity-90 hover:opacity-100 transition-opacity" alt="Stream" />
                                            ) : ( <div className="flex items-center justify-center h-full text-slate-500">Connecting...</div> )
                                        ) : ( <div className="flex items-center justify-center h-full text-slate-600 bg-slate-900">Feed Disabled</div> )}
                                        
                                        {showStream && (
                                            <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between">
                                                <div className="flex justify-between items-start">
                                                    <div className="px-2 py-1 bg-black/60 rounded text-[10px] text-green-400 font-mono border border-green-900/50">LIVE NEURAL FEED</div>
                                                    <div className="bg-black/60 backdrop-blur px-3 py-1 rounded border-l-4 border-yellow-500 text-right shadow-lg">
                                                        <div className="text-[10px] text-yellow-500 font-bold uppercase">CURRENT STATUS</div>
                                                        <div className="text-sm font-bold text-white shadow-black drop-shadow-md">{gameStats.event || 'Scanning...'}</div>
                                                    </div>
                                                </div>
                                                
                                                {/* ACTIVE CHARACTER CARD VISUALIZER */}
                                                {currentActorImage && (
                                                    <div className="absolute top-16 right-4 w-24 h-32 bg-black/50 border-2 border-purple-500 rounded-lg overflow-hidden shadow-[0_0_15px_rgba(168,85,247,0.5)] transform rotate-2 animate-fade-in-scale">
                                                        <img src={currentActorImage} className="w-full h-full object-cover" alt="Active Unit" />
                                                        <div className="absolute bottom-0 w-full bg-purple-900/80 text-[8px] text-center font-bold text-white py-0.5">ACTIVE UNIT</div>
                                                    </div>
                                                )}
                                                
                                                {/* SEMANTIC RADAR VISUALIZER (NEW) */}
                                                {gameStats.phase === 'BATTLE' && (
                                                    <div className="absolute top-16 left-4 animate-fade-in">
                                                        <SemanticRadar simHistory={semanticSimHistory} calcLogs={calculationLogs} focus={controlBalance} />
                                                    </div>
                                                )}
                                                
                                                {!autopilotActive && gameStats.phase === 'BATTLE' && (
                                                    <div className="self-center pointer-events-auto transition-transform hover:scale-105">
                                                         <button 
                                                            onClick={handleTriggerEvent} 
                                                            className="bg-red-600/90 hover:bg-red-500 text-white font-black text-xl px-10 py-6 rounded-full border-4 border-red-800 shadow-[0_0_50px_rgba(220,38,38,0.6)] backdrop-blur-sm"
                                                         >
                                                            ENGAGE
                                                         </button>
                                                    </div>
                                                )}
                                                
                                                {!autopilotActive && gameStats.phase === 'STRATEGY' && (
                                                    <div className="self-center pointer-events-auto flex gap-4">
                                                         <button 
                                                            onClick={handleFarmAction} 
                                                            className="bg-green-600/90 hover:bg-green-500 text-white font-black text-lg px-8 py-4 rounded-full border-4 border-green-800 shadow-lg backdrop-blur-sm transition-transform hover:scale-105"
                                                         >
                                                            FARM
                                                         </button>
                                                         
                                                         <button 
                                                            onClick={handleEndTurn} 
                                                            className="bg-blue-600/90 hover:bg-blue-500 text-white font-black text-lg px-8 py-4 rounded-full border-4 border-blue-800 shadow-lg backdrop-blur-sm transition-transform hover:scale-105"
                                                         >
                                                            END TURN
                                                         </button>
                                                    </div>
                                                )}

                                                {gameStats.territories && (
                                                    <div className="flex justify-center pointer-events-auto">
                                                         {(() => {
                                                             const active = gameStats.territories.find(t => t.status === 'Contested') || gameStats.territories.find(t => t.status === 'Enemy');
                                                             if (!active) return null;
                                                             return (
                                                                 <div className="bg-black/80 backdrop-blur border border-red-900/50 p-3 rounded-lg flex items-center gap-4 shadow-lg mb-2">
                                                                     <div className="text-right">
                                                                         <div className="text-[10px] text-red-400 font-bold">TARGET: {active.id}</div>
                                                                         <div className="text-[9px] text-slate-400">{active.desc}</div>
                                                                     </div>
                                                                     <div className="w-40 h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-600 relative">
                                                                         <div className="absolute inset-0 bg-red-900/30"></div>
                                                                         <div className="h-full bg-red-600 transition-all duration-500 shadow-[0_0_10px_red]" style={{width: (active.difficulty * 100) + '%'}}></div>
                                                                     </div>
                                                                     <div className="text-xs font-mono font-bold text-red-500">{(active.difficulty * 100).toFixed(0)}%</div>
                                                                 </div>
                                                             )
                                                         })()}
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <div className="w-full md:w-80 bg-black/80 border border-slate-700 rounded flex flex-col overflow-hidden text-left shadow-xl backdrop-blur-sm shrink-0">
                                        <div className="text-[10px] font-bold text-slate-500 p-2 border-b border-slate-700 bg-slate-900/80 shrink-0">RESOURCES</div>
                                        <div className="grid grid-cols-3 gap-2 p-2 bg-slate-900/30 shrink-0">
                                            {gameStats.resources && Object.entries(gameStats.resources).map(([k,v]) => (
                                                <div key={k} className="bg-slate-800/60 p-2 rounded border border-slate-700">
                                                    <div className="text-[9px] text-slate-400 uppercase tracking-wider">{k}</div>
                                                    <div className="text-sm font-bold text-cyan-300">{v.icon} {v}</div>
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div className="text-[10px] font-bold text-slate-500 p-2 border-b border-slate-700 border-t bg-slate-900/80 shrink-0 flex justify-between">
                                            <span>ACTIVE UNIT DECK</span>
                                            <span className="text-slate-600">{gameStats.inventory?.length || 0} Units</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-black/40 min-h-[100px]">
                                            {(gameStats.inventory || []).map((card, idx) => {
                                                const isSelected = selectedCardId === card.uid;
                                                return (
                                                    <div key={idx} className="flex flex-col gap-1">
                                                        <div 
                                                            onClick={() => gameStats.phase === 'STRATEGY' ? setSelectedCardId(isSelected ? null : card.uid) : null}
                                                            className={"flex justify-between items-center p-2 rounded border transition-colors cursor-pointer " + (isSelected ? "bg-purple-900/40 border-purple-500" : "bg-slate-800/50 border-slate-700/50 hover:border-slate-500")}
                                                        >
                                                            <div className="flex items-center gap-2">
                                                                <span className={"text-[9px] font-bold px-1 rounded " + (
                                                                    card.rank === 'UR' ? 'bg-yellow-500 text-black' :
                                                                    card.rank === 'SSR' ? 'bg-purple-600 text-white' :
                                                                    'bg-slate-600 text-white'
                                                                )}>{card.rank}</span>
                                                                <div>
                                                                    <div className="text-xs font-bold text-slate-200">{card.character_id}</div>
                                                                    <div className="text-[9px] text-slate-400">Bond: {card.bond || 0}</div>
                                                                </div>
                                                            </div>
                                                            <div className="text-[9px] text-slate-500">{card.type}</div>
                                                        </div>
                                                        
                                                        {isSelected && gameStats.phase === 'STRATEGY' && (
                                                            <div className="grid grid-cols-2 gap-1 p-1 bg-purple-900/20 rounded mb-1 animate-fade-in">
                                                                {(gameStats.social_interactions || []).map(action => (
                                                                    <button 
                                                                        key={action.id}
                                                                        onClick={() => handleSocialAction(card.uid, action.id)}
                                                                        className="bg-slate-900 hover:bg-purple-900/50 border border-slate-700 hover:border-purple-500 text-[9px] text-slate-300 py-1.5 rounded flex flex-col items-center gap-0.5"
                                                                    >
                                                                        <span className="font-bold">{action.name}</span>
                                                                        <span className="text-[8px] text-slate-500">{action.cost_ap} AP</span>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                            {(!gameStats.inventory || gameStats.inventory.length === 0) && (
                                                <div className="text-center text-[10px] text-slate-600 italic p-2">No units deployed.</div>
                                            )}
                                        </div>

                                        <div className="text-[10px] font-bold text-slate-500 p-2 border-b border-slate-700 border-t bg-slate-900/80 shrink-0 flex justify-between">
                                            <span>STRATEGIC MAP</span>
                                            <span className="text-slate-600">Turn {gameStats.turn || '?'}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 bg-black/40 min-h-[100px]">
                                            {(gameStats.territories || []).map(t => (
                                                <div 
                                                    key={t.id} 
                                                    onClick={() => !autopilotActive && gameStats.phase === 'STRATEGY' && t.status !== 'Allied' ? handleBattleStart(t.id) : null}
                                                    className={"flex justify-between items-center p-2 rounded border transition-colors cursor-pointer " + (
                                                        t.status === 'Allied' ? "bg-blue-900/10 border-blue-900/30" :
                                                        t.status === 'Contested' ? "bg-red-900/20 border-red-500 animate-pulse hover:bg-red-900/40" :
                                                        "bg-slate-800/30 border-slate-800 opacity-70 hover:opacity-100 hover:border-red-500/50"
                                                    )}
                                                    title={t.status !== 'Allied' && !autopilotActive ? "Click to Attack" : ""}
                                                >
                                                    <div>
                                                        <div className={"text-xs font-bold " + (t.status === 'Allied' ? "text-blue-400" : t.status === 'Contested' ? "text-red-300" : "text-slate-400")}>
                                                            {t.id}
                                                        </div>
                                                        <div className="text-[9px] text-slate-500 uppercase">{t.status}</div>
                                                    </div>
                                                    {t.status !== 'Allied' && (
                                                        <div className="flex flex-col items-end gap-1">
                                                            <div className="text-[10px] font-mono text-slate-400 bg-black/50 px-1.5 py-0.5 rounded border border-slate-700">
                                                                DEF: {(t.difficulty * 100).toFixed(0)}
                                                            </div>
                                                            {!autopilotActive && gameStats.phase === 'STRATEGY' && <span className="text-[8px] text-red-500 font-bold tracking-wider">ATTACK</span>}
                                                        </div>
                                                    )}
                                                    {t.status === 'Allied' && <span className="text-sm">🏳️</span>}
                                                </div>
                                            ))}
                                        </div>
                                        
                                        <div className="text-[10px] font-bold text-slate-500 p-2 border-b border-slate-700 border-t bg-slate-900/80 shrink-0">SYSTEM LOGS</div>
                                        <div className="h-24 overflow-y-auto custom-scrollbar p-2 space-y-1 text-[10px] text-slate-400 font-mono bg-black/60 shrink-0">
                                            {(gameStats.logs || []).slice().reverse().map((log, i) => (
                                                <div key={i} className="border-b border-slate-800/50 pb-0.5 opacity-80 break-words">{log}</div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex justify-center gap-4 items-center flex-wrap pt-2 border-t border-slate-700/30 shrink-0">
                                    <div className="flex items-center gap-2 bg-slate-800 p-2 rounded border border-slate-700">
                                        <div className="text-[10px] text-slate-400 font-bold">COGNITIVE FOCUS</div>
                                        <input 
                                            type="range" min="0" max="1" step="0.01" 
                                            value={controlBalance} 
                                            onChange={(e) => setControlBalance(parseFloat(e.target.value))}
                                            className="w-32 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                        />
                                        <div className="text-[10px] text-cyan-400 font-mono w-8">{(controlBalance * 100).toFixed(0)}%</div>
                                    </div>
                                    
                                    <button onClick={toggleLiveFeed} className={"px-4 py-2 rounded text-xs font-bold border transition-colors shadow-sm " + (showStream ? "bg-red-900/30 text-red-300 border-red-800 hover:bg-red-900/50" : "bg-slate-700 text-slate-300")}>{showStream ? '📺 FEED: ON' : '📺 FEED: OFF'}</button>
                                    <button onClick={handleToggleAutopilot} className={"px-4 py-2 rounded text-xs font-bold border shadow-sm " + (autopilotActive ? "bg-pink-900/30 text-pink-300 border-pink-500 animate-pulse hover:bg-pink-900/50" : "bg-slate-800 text-slate-400 hover:bg-slate-700")}>{autopilotActive ? "🤖 AUTOPILOT: ON" : "🤖 AUTOPILOT: OFF"}</button>
                                    <button onClick={handleTriggerEvent} className="px-4 py-2 rounded text-xs font-bold border bg-yellow-900/30 text-yellow-300 border-yellow-600 hover:bg-yellow-900/50 shadow-[0_0_10px_rgba(234,179,8,0.2)]">⚡ FORCE TURN</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-4 flex-grow h-full overflow-hidden">
                                <button 
                                    onClick={handleQuickPlay}
                                    className="w-full py-6 bg-gradient-to-r from-cyan-900/80 to-blue-900/80 border border-cyan-500 rounded-lg shadow-[0_0_20px_rgba(6,182,212,0.2)] hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all flex flex-col items-center justify-center group shrink-0"
                                >
                                    <span className="text-2xl font-black text-white tracking-widest group-hover:scale-105 transition-transform">
                                        {sessions.length > 0 ? "CONTINUE OPERATION" : "QUICK PLAY (ACTIVE)"}
                                    </span>
                                    <span className="text-xs text-cyan-300 mt-1 uppercase tracking-wide">
                                        {sessions.length > 0 ? "Resume latest session" : "Launch Default Protocol in Active Mode"}
                                    </span>
                                </button>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-grow min-h-0">
                                    <div className="flex flex-col p-4 bg-slate-800/50 border-2 border-dashed border-slate-600 hover:border-green-500 rounded-lg min-h-[250px]">
                                        <div className="text-lg font-bold text-slate-300 mb-2">+ NEW GAME</div>
                                        
                                        <div className="flex bg-black/40 p-1 rounded mb-3 border border-slate-700 shrink-0">
                                            <button 
                                                onClick={() => setStartMode("CINEMA")} 
                                                className={"flex-1 py-2 text-xs font-bold rounded transition-colors " + (startMode === "CINEMA" ? "bg-purple-700 text-white shadow-md" : "text-slate-500 hover:text-slate-300")}
                                            >
                                                🎬 CINEMA
                                            </button>
                                            <button 
                                                onClick={() => setStartMode("ACTIVE")} 
                                                className={"flex-1 py-2 text-xs font-bold rounded transition-colors " + (startMode === "ACTIVE" ? "bg-cyan-700 text-white shadow-md" : "text-slate-500 hover:text-slate-300")}
                                            >
                                                🎮 ACTIVE
                                            </button>
                                        </div>
                                        
                                        <div className="space-y-1 overflow-y-auto custom-scrollbar bg-black/20 rounded p-1 mb-2 flex-grow min-h-0">
                                            {Object.keys(lorePresets).map(key => (
                                                <button key={key} onClick={() => setSelectedLoreKey(key)} className={"w-full text-left px-2 py-1.5 rounded text-xs " + (selectedLoreKey === key ? "bg-green-900/50 text-green-300" : "hover:bg-slate-700 text-slate-400")}>
                                                    <div className="font-bold">{key}</div>
                                                    <div className="text-[9px] opacity-70">{lorePresets[key].title || key}</div>
                                                </button>
                                            ))}
                                        </div>
                                        <button onClick={handleNewGame} className="mt-auto w-full py-2 bg-slate-700 hover:bg-green-700 text-white font-bold rounded shrink-0">
                                            START ({startMode})
                                        </button>
                                    </div>
                                    
                                    <div className="space-y-2 overflow-y-auto custom-scrollbar pr-1 bg-black/20 p-2 rounded border border-slate-800">
                                        {sessions.map(sess => (
                                            <div key={sess.id} className="bg-slate-800 border border-slate-700 p-3 rounded-lg flex flex-col justify-between hover:border-cyan-500">
                                                <div><div className="font-bold text-cyan-300 text-xs truncate">{sess.id}</div></div>
                                                <button onClick={() => handleLoadGame(sess.id)} className="mt-2 px-3 py-1 bg-cyan-900 hover:bg-cyan-700 text-cyan-200 text-[10px] font-bold rounded self-end">RESUME</button>
                                            </div>
                                        ))}
                                        {sessions.length === 0 && <div className="text-center text-slate-500 text-xs mt-10">No saved sessions.</div>}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
`;
