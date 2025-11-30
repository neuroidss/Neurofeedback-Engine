
export const MUSICGEN_NEURO_CLIENT_IMPL = `
    const { useState, useEffect, useRef } = React;

    const [status, setStatus] = useState("Idle");
    const [serverPort, setServerPort] = useState(null);
    const [isSessionActive, setIsSessionActive] = useState(false);
    
    // --- CONFIGURATION ---
    // Changed default to FALSE (Manual Mode) as requested
    const [useNeuroLink, setUseNeuroLink] = useState(false); 
    const [playOnServer, setPlayOnServer] = useState(true); // Forced true for legacy stability
    const [prompt, setPrompt] = useState("psytrance, 140bpm, heavy bass");
    
    // --- 4 SLIDERS (Restored) ---
    const [valStrategy, setValStrategy] = useState(0.5); // Block Size
    const [valSafety, setValSafety] = useState(0.5);   // Speed Margin
    const [valBuffer, setValBuffer] = useState(0.5);   // Start Delay
    const [valContext, setValContext] = useState(0.5); // Attention Window

    // --- TELEMETRY ---
    const [syncMetric, setSyncMetric] = useState(0);

    // 1. BOOT PROCESS (Robust Health Check)
    const startServer = async () => {
        setStatus("Booting Python...");
        try {
            await runtime.tools.run('Deploy Neuro MusicGen Server', {});
            const res = await runtime.tools.run('Start Python Process', {
                processId: 'neuro_musicgen_mcp',
                scriptPath: 'neuro_musicgen.py',
                venv: 'venv_audio'
            });
            
            if (res.port) {
                setServerPort(res.port);
                setStatus("Server started on port " + res.port + ". Waiting for boot...");
                
                const url = 'http://localhost:' + res.port;
                let attempts = 0;
                let ready = false;
                
                // Robust Polling Loop (Same as Simple Test)
                while(attempts < 30) {
                    try {
                        const h = await fetch(url + "/health");
                        if (h.ok || h.status === 503) {
                            ready = true;
                            break;
                        }
                    } catch(e) {}
                    await new Promise(r => setTimeout(r, 1000));
                    attempts++;
                }

                if (ready) {
                    setStatus("Configuring Model...");
                    try {
                        await fetch(url + '/configure', { 
                            method: 'POST', 
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({ size: 'small' }) 
                        });
                        setStatus("Ready.");
                    } catch (configError) {
                        setStatus("Config Failed: " + configError.message);
                    }
                } else {
                    setStatus("Server Timed Out (Health Check Failed).");
                }
            } else {
                setStatus("Boot Failed: " + res.error);
            }
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    // 2. TOGGLE SESSION
    const toggleSession = async () => {
        if (!serverPort) return;

        if (!isSessionActive) {
            setStatus("Starting Generator...");
            
            try {
                // A. If Neuro-Link, deploy Graph to calculate matrix
                if (useNeuroLink) {
                    runtime.logEvent('[UI] Deploying Neuro Graph (Background)...');
                    if (runtime.streamEngine) {
                        runtime.streamEngine.stop();
                        runtime.streamEngine.loadGraph({ id: 'neuro_music_graph', nodes: {}, edges: [] });
                        
                        await runtime.tools.run('Create_Custom_Node', { nodeId: 'eeg_aggregator', jsLogic: %%AGGREGATOR_LOGIC%%, inputs: [], config: {} });
                        await runtime.tools.run('Create_Custom_Node', { nodeId: 'matrix_processor', jsLogic: %%MATRIX_LOGIC%%, inputs: ['eeg_aggregator'], config: {} });
                        
                        // Connect sink to feed data to python
                        await runtime.tools.run('Create_MusicGen_Node', {
                            nodeId: 'music_sink',
                            inputs: ['matrix_processor'],
                            serverUrl: 'http://localhost:' + serverPort,
                            config: { playInBrowser: false } // We use local playback logic
                        });
                        
                        runtime.streamEngine.connectNodes('eeg_aggregator', 'matrix_processor');
                        runtime.streamEngine.connectNodes('matrix_processor', 'music_sink');
                        runtime.streamEngine.start();
                    }
                }

                // B. START ENGINE (Legacy/Robust Mode)
                const response = await fetch('http://localhost:' + serverPort + '/start_local', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ 
                        prompt,
                        strategy: valStrategy,
                        safety: valSafety,
                        buffer: valBuffer,
                        context: valContext
                    })
                });

                if (response.ok) {
                    setIsSessionActive(true);
                    setStatus(useNeuroLink ? "Generating (Neuro-Linked)" : "Generating (Manual)");
                } else {
                    setStatus("Start Failed: " + response.status);
                }
            } catch(e) {
                setStatus("Start Error: " + e.message);
            }

        } else {
            // STOP
            setStatus("Stopping...");
            if (runtime.streamEngine) runtime.streamEngine.stop();
            try {
                await fetch('http://localhost:' + serverPort + '/stop_local', { method: 'POST' });
                setIsSessionActive(false);
                setStatus("Stopped.");
            } catch(e) {
                setStatus("Stop Error: " + e.message);
                setIsSessionActive(false);
            }
        }
    };

    // 3. SYNC SLIDERS (Real-time)
    useEffect(() => {
        if (isSessionActive && serverPort) {
            const timer = setTimeout(() => {
                fetch('http://localhost:' + serverPort + '/update_params', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        strategy: valStrategy,
                        safety: valSafety,
                        buffer: valBuffer,
                        context: valContext
                    })
                }).catch(()=>{});
            }, 200);
            return () => clearTimeout(timer);
        }
    }, [valStrategy, valSafety, valBuffer, valContext, isSessionActive, serverPort]);

    // 4. METRICS
    useEffect(() => {
        if (!isSessionActive || !useNeuroLink) return;
        const i = setInterval(() => {
            const node = runtime.streamEngine?.getDebugState().nodes.find(x => x.id === 'matrix_processor');
            if (node?.value) {
                setSyncMetric(node.value.globalSync || 0);
            }
        }, 200);
        return () => clearInterval(i);
    }, [isSessionActive, useNeuroLink]);

    return (
        <div className="p-4 bg-slate-900 h-full text-white flex flex-col gap-4 font-mono overflow-y-auto border-l-4 border-purple-600">
            <div>
                <h2 className="text-xl font-bold text-purple-400">Neuro MusicGen V2</h2>
                <div className="text-[10px] text-slate-400">Robust Adaptive Engine + Attention Bias</div>
            </div>
            
            <div className="bg-black/40 p-3 rounded border border-slate-700 text-xs">
                <div className="flex justify-between mb-1">
                    <span>STATUS: <span className={isSessionActive ? "text-green-400" : "text-yellow-500"}>{status}</span></span>
                </div>
                {useNeuroLink && (
                    <div className="flex items-center gap-2">
                        <span>COHERENCE:</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded overflow-hidden">
                            <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: (syncMetric * 100) + '%' }}></div>
                        </div>
                        <span className="text-cyan-400 w-8 text-right">{(syncMetric * 100).toFixed(0)}%</span>
                    </div>
                )}
            </div>

            {!serverPort ? (
                <button onClick={startServer} className="w-full py-4 bg-purple-700 hover:bg-purple-600 rounded font-bold shadow-lg">
                    BOOT NEURO SERVER
                </button>
            ) : (
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Prompt</label>
                        <input type="text" value={prompt} onChange={e=>setPrompt(e.target.value)} className="w-full bg-black border border-slate-600 p-2 rounded text-sm outline-none focus:border-purple-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div 
                            onClick={() => !isSessionActive && setUseNeuroLink(!useNeuroLink)}
                            className={"p-2 rounded border cursor-pointer text-center " + (useNeuroLink ? "bg-purple-900/40 border-purple-500" : "bg-slate-800 border-slate-600")}
                        >
                            <div className="text-[10px] text-slate-400 font-bold">CONTROL</div>
                            <div className={useNeuroLink ? "text-purple-300 font-bold" : "text-slate-400"}>
                                {useNeuroLink ? "🧠 NEURO-LINK" : "🎛️ MANUAL ONLY"}
                            </div>
                        </div>
                        <div 
                            className="p-2 rounded border border-slate-600 bg-slate-800 text-center opacity-70 cursor-not-allowed"
                            title="Server playback is enforced for stability in this version."
                        >
                            <div className="text-[10px] text-slate-400 font-bold">OUTPUT</div>
                            <div className="text-slate-300 font-bold">🔈 SERVER (PC)</div>
                        </div>
                    </div>

                    <div className="space-y-3 pt-2 border-t border-slate-800">
                        {[
                            { l: "STRATEGY (Block)", v: valStrategy, s: setValStrategy, c: "cyan" },
                            { l: "SAFETY (Speed)", v: valSafety, s: setValSafety, c: "yellow" },
                            { l: "BUFFER (Latency)", v: valBuffer, s: setValBuffer, c: "green" },
                            { l: "CONTEXT (Memory)", v: valContext, s: setValContext, c: "purple" }
                        ].map((item, i) => (
                            <div key={i}>
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-slate-400 font-bold">{item.l}</span>
                                    <span style={{ color: item.c }}>{item.v.toFixed(2)}</span>
                                </div>
                                <input 
                                    type="range" min="0" max="1" step="0.01" 
                                    value={item.v} 
                                    onChange={e => item.s(parseFloat(e.target.value))}
                                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                        ))}
                    </div>

                    <button 
                        onClick={toggleSession}
                        className={"w-full py-4 rounded font-bold text-lg shadow-lg transition-all transform hover:scale-[1.02] " + (isSessionActive ? "bg-red-600 hover:bg-red-500" : "bg-green-600 hover:bg-green-500")}
                    >
                        {isSessionActive ? "STOP SESSION" : "START GENERATION"}
                    </button>
                </div>
            )}
        </div>
    );
`;
