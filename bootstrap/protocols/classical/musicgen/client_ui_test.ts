
export const SIMPLE_MUSICGEN_CLIENT_IMPL = `
    const { useState, useRef, useEffect } = React;

    const [status, setStatus] = useState("Idle");
    const [serverPort, setServerPort] = useState(null);
    const [isLocalActive, setIsLocalActive] = useState(false);
    
    // --- 4 Sliders State ---
    const [valStrategy, setValStrategy] = useState(0.5);
    const [valSafety, setValSafety] = useState(0.5);
    const [valBuffer, setValBuffer] = useState(0.5);
    const [valContext, setValContext] = useState(0.5);
    
    const [prompt, setPrompt] = useState("psytrance, 135bpm, deep bass");
    
    const startServer = async () => {
        setStatus("Starting...");
        try {
            await runtime.tools.run('Deploy Adaptive MusicGen Server', {});
            const res = await runtime.tools.run('Start Python Process', {
                processId: 'adaptive_musicgen_mcp',
                scriptPath: 'simple_musicgen.py',
                venv: 'venv_audio'
            });
            
            if (res.success && res.port) {
                setServerPort(res.port);
                setStatus("Server started on port " + res.port + ". Waiting for boot...");
                const url = "http://localhost:" + res.port;
                let attempts = 0;
                while(attempts < 30) {
                    try {
                        const h = await fetch(url + "/health");
                        if (h.ok || h.status === 503) {
                            setStatus("Configuring Model (Small)...");
                            await fetch(url + "/configure", {
                                method: "POST",
                                headers: {"Content-Type": "application/json"},
                                body: JSON.stringify({ size: "small" })
                            });
                            setStatus("Ready.");
                            return;
                        }
                    } catch(e) {}
                    await new Promise(r => setTimeout(r, 1000));
                    attempts++;
                }
                setStatus("Server timed out.");
            } else {
                setStatus("Start failed: " + res.error);
            }
        } catch (e) {
            setStatus("Error: " + e.message);
        }
    };

    const toggleLocalPlayback = async () => {
        if (!serverPort) return;
        
        if (isLocalActive) {
            await fetch("http://localhost:" + serverPort + "/stop_local", { method: "POST" });
            setIsLocalActive(false);
            setStatus("Local Playback Stopped.");
        } else {
            setStatus("Starting Local Playback (Server)...");
            const res = await fetch("http://localhost:" + serverPort + "/start_local", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ 
                    prompt: prompt,
                    strategy: valStrategy,
                    safety: valSafety,
                    buffer: valBuffer,
                    context: valContext
                })
            });
            if (res.ok) {
                setIsLocalActive(true);
                setStatus("Playing locally on Server...");
            } else {
                setStatus("Failed to start local: " + res.status);
            }
        }
    };

    // --- REAL-TIME PARAMETER SYNC ---
    useEffect(() => {
        if (isLocalActive && serverPort) {
            // Debounce updates slightly to avoid flooding but stay responsive
            const timer = setTimeout(() => {
                fetch("http://localhost:" + serverPort + '/update_params', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        strategy: valStrategy,
                        safety: valSafety,
                        buffer: valBuffer,
                        context: valContext
                    })
                }).catch(e => {});
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [valStrategy, valSafety, valBuffer, valContext, isLocalActive, serverPort]);

    return (
        <div className="p-4 text-white bg-black h-full flex flex-col gap-4 overflow-y-auto">
            <div>
                <h2 className="text-xl font-bold">MusicGen Test (Legacy)</h2>
                <p className="text-xs text-gray-400">Zero Gap Architecture (4-Param Control)</p>
            </div>
            
            <div className="font-mono text-sm text-yellow-400 border border-yellow-900/50 bg-yellow-900/20 p-2 rounded">STATUS: {status}</div>
            
            {!serverPort && (
                <button onClick={startServer} className="bg-green-700 px-4 py-3 rounded font-bold hover:bg-green-600">BOOT SERVER</button>
            )}
            
            {serverPort && (
                <div className="flex flex-col gap-4 mt-2 bg-gray-900 p-4 rounded border border-gray-700">
                    <div>
                        <label className="text-xs text-slate-400 font-bold mb-1 block">PROMPT</label>
                        <input type="text" value={prompt} onChange={e=>setPrompt(e.target.value)} className="w-full bg-black border border-slate-600 rounded p-2 text-xs" />
                    </div>

                    <div className="space-y-4 pt-2 border-t border-slate-700">
                        {/* Strategy Slider */}
                        <div>
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-white font-bold">1. STRATEGY (Block Size)</span>
                                <span className="text-cyan-400">{valStrategy.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.05" value={valStrategy} onChange={e => setValStrategy(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500" />
                            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                                <span>Neuro (0.4s)</span>
                                <span>Quality (8s)</span>
                            </div>
                        </div>

                        {/* Safety Slider */}
                        <div>
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-white font-bold">2. SAFETY (Speed Margin)</span>
                                <span className="text-yellow-400">{valSafety.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.05" value={valSafety} onChange={e => setValSafety(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500" />
                            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                                <span>Risky (1.0x)</span>
                                <span>Safe (0.7x)</span>
                            </div>
                        </div>

                        {/* Buffer Slider */}
                        <div>
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-white font-bold">3. BUFFER (Start Delay)</span>
                                <span className="text-green-400">{valBuffer.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.05" value={valBuffer} onChange={e => setValBuffer(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-500" />
                            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                                <span>Instant</span>
                                <span>Stable</span>
                            </div>
                        </div>

                        {/* Context Slider */}
                        <div>
                            <div className="flex justify-between text-[10px] mb-1">
                                <span className="text-white font-bold">4. CONTEXT (Attention)</span>
                                <span className="text-purple-400">{valContext.toFixed(2)}</span>
                            </div>
                            <input type="range" min="0" max="1" step="0.05" value={valContext} onChange={e => setValContext(parseFloat(e.target.value))} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500" />
                            <div className="flex justify-between text-[9px] text-slate-500 mt-1">
                                <span>Chaos (0.1s)</span>
                                <span>Flow (10s)</span>
                            </div>
                        </div>
                    </div>
                    
                    <button onClick={toggleLocalPlayback} disabled={!serverPort} className={\`w-full py-3 rounded font-bold \${isLocalActive ? 'bg-red-600 animate-pulse' : 'bg-green-600'}\`}>
                        {isLocalActive ? 'STOP LOCAL PLAYBACK' : 'START LOCAL PLAYBACK'}
                    </button>
                </div>
            )}
        </div>
    );
`;
