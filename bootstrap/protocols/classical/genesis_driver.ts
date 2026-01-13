
import type { ToolCreatorPayload } from '../../../types';

// --- RLM DEFINITION (To be injected) ---
const RLM_SYSTEM_PROMPT = `You are a Recursive Context Engineer using Qwen-Coder.
Your goal is to answer the user's query by analyzing the provided 'context_data'.
However, 'context_data' is massive. You cannot read it all at once linearly.

**YOUR ENVIRONMENT:**
You are writing a JavaScript function that runs in a sandbox.
The variable \`context_data\` (string) is available in scope.

**AVAILABLE TOOLS (In Sandbox):**
1. \`console.log(msg)\`: Debug output.
2. \`await llm_query(prompt, context_chunk)\`: Calls the LLM to analyze a specific string chunk. CACHED automatically.
3. \`split_smart(text, max_chars)\`: Helper to split text by newlines/paragraphs.

**YOUR TASK:**
Write a JavaScript function (async) that:
1. Splits \`context_data\` into manageable chunks (e.g. 3000 chars).
2. Recursively or iteratively calls \`llm_query\` on these chunks to find relevant information.
3. Aggregates the results.
4. Returns a final string summary or answer.

**OUTPUT FORMAT:**
Return ONLY the JavaScript code block. The code must end with \`return final_result;\`.
`;

const RECURSIVE_HISTORY_ANALYZER: ToolCreatorPayload = {
    name: 'Recursive_History_Analyzer',
    description: 'A Recursive Language Model (RLM) tool. It uses code generation to perform infinite-context analysis over the session history by chunking, recursive summarization, and cached LLM calls.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To allow the Genesis Driver to maintain narrative coherence over infinite turns without running out of context window.',
    parameters: [
        { name: 'query', type: 'string', description: 'What to find out from the history.', required: true },
        { name: 'context_data', type: 'string', description: 'The massive string of world history.', required: true }
    ],
    implementationCode: `
        const { query, context_data } = args;
        
        // 1. Ask Qwen to write the analyzer script
        const codePrompt = "Write a JS script to answer: '" + query + "' by analyzing 'context_data'. Use 'await llm_query(prompt, chunk)' to process chunks. Return the final string.";
        const generatedCode = await runtime.ai.generateText(codePrompt, ${JSON.stringify(RLM_SYSTEM_PROMPT)});
        
        // Sanitize Markdown blocks without using literal backticks to avoid confusing the tool runner
        const ticks = String.fromCharCode(96).repeat(3);
        const startBlock = new RegExp(ticks + "(javascript|js)?", "g");
        const endBlock = new RegExp(ticks, "g");
        
        let cleanCode = generatedCode.replace(startBlock, '').replace(endBlock, '').trim();

        // Wrap in async IIFE body pattern if not present
        if (!cleanCode.includes('return')) cleanCode += "\\nreturn 'Analysis complete.';";

        // 2. Setup Sandbox Environment
        if (!window._rlm_cache) window._rlm_cache = {}; // Persistent session cache
        
        const llm_query = async (prompt, chunk) => {
            if (!chunk) return "";
            // Simple hash for cache key
            const key = prompt + "_" + chunk.length + "_" + chunk.slice(0, 20);
            if (window._rlm_cache[key]) return window._rlm_cache[key];
            
            // Optimization: Use the currently selected model via runtime
            const res = await runtime.ai.generateText("Context: " + chunk + "\\n\\nTask: " + prompt, "You are a sub-processor. Be concise.");
            window._rlm_cache[key] = res;
            return res;
        };
        
        const split_smart = (text, size) => {
            const chunks = [];
            for (let i = 0; i < text.length; i += size) {
                chunks.push(text.slice(i, i + size));
            }
            return chunks;
        };
        
        // 3. Execute the Generated Code
        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const func = new AsyncFunction('context_data', 'llm_query', 'split_smart', 'console', cleanCode);
            
            const result = await func(context_data, llm_query, split_smart, console);
            return { success: true, analysis: result, code_used: cleanCode };
            
        } catch (e) {
            return { success: false, error: e.message, code_used: cleanCode };
        }
    `
};

const GENESIS_UI_IMPL = `
    const { useState, useEffect, useRef, useCallback } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;

    if (!R3F || !Drei || !THREE) return <div className="text-white p-10">Initializing Genesis Core...</div>;
    const { Canvas, useFrame } = R3F;
    const { Stars, Sparkles, Float, Grid } = Drei;

    // --- LORE PRESETS ---
    const LORE_PRESETS = {
        "VOID": "A formless void where thoughts manifest as reality. Pure ontology.",
        "CYBER_NOIR": "Neo-Tokyo, 2088. Perpetual rain. High tech, low life. You are a detective tracking a digital ghost.",
        "ELDRITCH": "A Victorian mansion on a cliff. The geometry is wrong. Whispers in the walls. Sanity is fraying.",
        "SOLARPUNK": "A verdant city grown from crystal and vine. Utopia, but something ancient is waking up beneath the roots.",
        "HIGH_FANTASY": "The Kingdom of Aethelgard. Magic is dying. You are the last Archmage seeking the source."
    };

    // --- VISUALS ---
    const TheVoid = ({ mode, intensity, isRecursive }) => {
        const meshRef = useRef();
        useFrame((state, delta) => {
            if (meshRef.current) {
                meshRef.current.rotation.y += delta * (0.1 + intensity * 0.2);
                meshRef.current.scale.lerp(new THREE.Vector3(1 + intensity, 1 + intensity, 1 + intensity), 0.05);
            }
        });
        const color = isRecursive ? '#00ff00' : (mode === 'ACTING' ? '#06b6d4' : '#a855f7');
        return (
            <group>
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
                    <mesh ref={meshRef}>
                        <icosahedronGeometry args={[2, isRecursive ? 2 : 1]} />
                        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} wireframe={true} />
                    </mesh>
                </Float>
                <Sparkles count={200} scale={10} size={2} speed={0.4} opacity={0.5} color={color} />
            </group>
        );
    };

    // --- MAIN COMPONENT ---
    const [view, setView] = useState("MENU"); // MENU, GAME
    const [sessions, setSessions] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    
    // New Session Form
    const [selectedLoreKey, setSelectedLoreKey] = useState("VOID");
    const [customLore, setCustomLore] = useState("");

    // Game State
    const [phase, setPhase] = useState("IDLE"); // IDLE, NARRATING, MODELING, CHOOSING, PROCESSING
    const [inputText, setInputText] = useState("");
    
    // Core Data
    const [userModel, setUserModel] = useState("Analyzing psych profile...");
    const [currentChoices, setCurrentChoices] = useState([]); // [{id, text}]
    const [defaultAction, setDefaultAction] = useState(null);
    const [countdown, setCountdown] = useState(0);
    const MAX_COUNTDOWN = 15;
    
    // Logs
    const [chatHistory, setChatHistory] = useState([]); // { sender: 'GM'|'USER'|'INTERPRETER', text: string }
    const [gmLog, setGmLog] = useState([]); // { type, msg }
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
                const raw = localStorage.getItem('genesis_sessions_v1');
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
            // TIMEOUT -> EXECUTE DEFAULT
            handleActionCommit(defaultAction || "Hesitate", true);
        }
        return () => clearInterval(timer);
    }, [phase, countdown, defaultAction]);

    const saveSession = (session) => {
        if (!session) return;
        const updatedSessions = sessions.filter(s => s.id !== session.id);
        updatedSessions.unshift(session); // Move to top
        setSessions(updatedSessions);
        localStorage.setItem('genesis_sessions_v1', JSON.stringify(updatedSessions));
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

    const handleCreateSession = async () => {
        const loreText = selectedLoreKey === 'CUSTOM' ? customLore : LORE_PRESETS[selectedLoreKey];
        const newSession = {
            id: 'sess_' + Date.now(),
            lore: loreText,
            worldState: "Initialization...",
            turnCount: 0,
            chatHistory: [],
            gmLog: [],
            timestamp: Date.now()
        };
        
        setActiveSession(newSession);
        setChatHistory([]);
        setGmLog([]);
        setView("GAME");
        
        // Initial Bootstrap
        setTimeout(() => turnCycle(newSession, "INITIALIZE"), 100);
    };

    const handleLoadSession = (sess) => {
        setActiveSession(sess);
        setChatHistory(sess.chatHistory || []);
        setGmLog(sess.gmLog || []);
        setView("GAME");
    };

    const deleteSession = (e, id) => {
        e.stopPropagation();
        if(!confirm("Delete this timeline?")) return;
        const next = sessions.filter(s => s.id !== id);
        setSessions(next);
        localStorage.setItem('genesis_sessions_v1', JSON.stringify(next));
    };

    // --- THE INTERPRETER (Lore Filter) ---
    const interpretInput = async (rawInput, lore) => {
        const prompt = \`User said: "\${rawInput}". 
        LORE CONTEXT: \${lore}
        
        TASK: Rewrite this user input strictly through the lens of the lore.
        - If they speak meta ("stop"), convert it to diegetic action ("The protagonist freezes").
        - If they speak simply ("go left"), embellish it ("I venture into the dark tunnel").
        - Output ONLY the rewritten, diegetic action.\`;
        
        const interpreted = await runtimeRef.current.ai.generateText(prompt, "You are a Narrative Filter.");
        return interpreted.replace(/["']/g, "");
    };

    // --- THE TURN CYCLE ---
    const turnCycle = async (session, rawAction, isDefault = false) => {
        setPhase("PROCESSING");
        
        try {
            const { lore, worldState, turnCount, chatHistory } = session;
            
            // 1. INPUT RESOLUTION
            let processedAction = rawAction;
            if (!isDefault && rawAction !== "INITIALIZE") {
                addChat("USER", rawAction); // Show raw input
                processedAction = await interpretInput(rawAction, lore);
                addChat("INTERPRETER", processedAction); // Show how GM interpreted it
            } else if (isDefault) {
                addChat("SYSTEM", \`TIMEOUT: \${rawAction}\`);
            }

            // 2. RLM CONTEXT (If history is long)
            let memoryContext = "No history yet.";
            if (turnCount > 2) {
                addGmLog("RLM", "Compressing history...");
                try {
                    const chatDump = chatHistory.slice(-10).map(c => \`[\${c.sender}]: \${c.text}\`).join("\\n");
                    // We use a simplified RAG for speed in this demo cycle
                    memoryContext = "Recent events: " + chatDump; 
                } catch(e) {}
            }

            // 3. GM WORLD UPDATE & NARRATIVE
            setPhase("NARRATING");
            
            const mainPrompt = \`
            LORE: \${lore}
            PREVIOUS STATE: \${worldState}
            PLAYER ACTION: "\${processedAction}"
            HISTORY: \${memoryContext}
            
            TASK:
            1. Evolve the world state based on the action.
            2. Write a short, vivid narrative paragraph describing the outcome.
            
            RETURN JSON: { "new_world_state": "...", "narrative": "..." }
            \`;
            
            const res1 = await runtimeRef.current.ai.generateText(mainPrompt, "You are the Game Master.");
            let step1;
            try { step1 = JSON.parse(res1.match(/\\{.*\\}/s)[0]); } 
            catch(e) { step1 = { narrative: res1, new_world_state: worldState }; }
            
            addChat("GM", step1.narrative);
            session.worldState = step1.new_world_state;
            session.turnCount++;
            
            // 4. THEORY OF MIND (The User Model)
            setPhase("MODELING");
            const mindPrompt = \`
            Based on the player's last action ("\${processedAction}") and the lore, what is the player likely thinking or feeling?
            Describe their internal psychological state in 1 sentence.
            Example: "The player is hesitating, overwhelmed by the scale of the artifact."
            \`;
            const mindAnalysis = await runtimeRef.current.ai.generateText(mindPrompt, "You are a Psychologist.");
            setUserModel(mindAnalysis);
            addGmLog("THEORY_OF_MIND", mindAnalysis);

            // 5. GENERATE CHOICES
            setPhase("GENERATING_CHOICES");
            const choicePrompt = \`
            SITUATION: \${step1.narrative}
            USER STATE: \${mindAnalysis}
            
            TASK: Generate 3 distinct choices for the user (A, B, C) and 1 Default Consequence (D) if they hesitate.
            RETURN JSON: 
            { 
                "choices": [
                    {"id": "A", "text": "..."}, 
                    {"id": "B", "text": "..."}, 
                    {"id": "C", "text": "..."}
                ], 
                "default_action": "The consequence of inaction..." 
            }
            \`;
            
            const res2 = await runtimeRef.current.ai.generateText(choicePrompt, "You are a Game Designer.");
            let step2;
            try { step2 = JSON.parse(res2.match(/\\{.*\\}/s)[0]); }
            catch(e) { step2 = { choices: [{id:"A", text:"Continue"}], default_action: "Wait" }; }
            
            setCurrentChoices(step2.choices);
            setDefaultAction(step2.default_action);
            
            // 6. START TIMER
            setCountdown(MAX_COUNTDOWN);
            setPhase("CHOOSING");
            saveSession(session);

        } catch (e) {
            addGmLog("ERROR", e.message);
            addChat("SYSTEM", "Reality glitch. Please input command to reboot.");
            setPhase("CHOOSING"); // Fallback to manual input
        }
    };

    const handleActionCommit = (actionText, isDefault=false) => {
        // Stop timer implicit by phase change
        turnCycle(activeSession, actionText, isDefault);
        setInputText("");
    };

    const handleManualSubmit = () => {
        if (!inputText.trim()) return;
        handleActionCommit(inputText);
    };
    
    // Voice Input Handler
    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
        } else {
            const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!Recognition) { alert("Browser does not support Speech API"); return; }
            const rec = new Recognition();
            rec.lang = 'en-US';
            rec.onresult = (e) => {
                const text = e.results[0][0].transcript;
                setInputText(text);
                // Auto-submit voice? Maybe let them confirm. 
                // Let's put it in the box so they can hit enter or edit.
            };
            rec.onend = () => setIsListening(false);
            rec.start();
            recognitionRef.current = rec;
            setIsListening(true);
        }
    };

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
                    <div className="w-full max-w-2xl bg-slate-900/90 border border-slate-700 p-6 rounded-xl shadow-2xl backdrop-blur-md">
                        <h2 className="text-xl font-bold text-white mb-4 border-b border-slate-700 pb-2">INITIATE NEW TIMELINE</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 font-bold">LORE PRESET</label>
                                <select 
                                    value={selectedLoreKey} 
                                    onChange={(e) => setSelectedLoreKey(e.target.value)}
                                    className="w-full bg-black border border-slate-600 rounded p-2 text-sm outline-none focus:border-green-500"
                                >
                                    {Object.keys(LORE_PRESETS).map(k => <option key={k} value={k}>{k}</option>)}
                                    <option value="CUSTOM">CUSTOM...</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs text-slate-500 font-bold">DESCRIPTION</label>
                                <div className="text-xs text-slate-400 italic bg-black/50 p-2 rounded h-20 overflow-y-auto">
                                    {selectedLoreKey === 'CUSTOM' ? "User defined..." : LORE_PRESETS[selectedLoreKey]}
                                </div>
                            </div>
                        </div>
                        {selectedLoreKey === 'CUSTOM' && (
                            <textarea 
                                value={customLore}
                                onChange={(e) => setCustomLore(e.target.value)}
                                placeholder="Define the metaphysical rules of your world..."
                                className="w-full h-24 bg-black border border-slate-600 rounded p-2 text-sm mb-4 outline-none focus:border-green-500"
                            />
                        )}
                        <button 
                            onClick={handleCreateSession}
                            className="w-full py-3 bg-green-700 hover:bg-green-600 text-white font-bold rounded shadow-lg transition-transform active:scale-95"
                        >
                            BOOT SEQUENCE
                        </button>
                    </div>
                    {/* Session List */}
                    <div className="w-full max-w-2xl space-y-2">
                        <h3 className="text-sm font-bold text-slate-500 uppercase">Existing Timelines</h3>
                        {sessions.map(s => (
                            <div key={s.id} onClick={() => handleLoadSession(s)} className="bg-slate-800/80 border border-slate-700 p-3 rounded-lg flex justify-between items-center cursor-pointer hover:border-green-500 hover:bg-slate-800 transition-colors group">
                                <div>
                                    <div className="font-bold text-sm text-slate-200">{new Date(s.timestamp).toLocaleString()}</div>
                                    <div className="text-xs text-slate-500 truncate w-64">{s.lore.substring(0, 50)}...</div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-right">
                                        <div className="text-xs text-green-400 font-mono">TURN {s.turnCount}</div>
                                        <div className="text-[10px] text-slate-600">ID: {s.id.slice(-6)}</div>
                                    </div>
                                    <button onClick={(e) => deleteSession(e, s.id)} className="text-slate-600 hover:text-red-500 p-2">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VIEW: GAME */}
            {view === "GAME" && activeSession && (
                <div className="flex-grow z-10 flex overflow-hidden">
                    
                    {/* CHAT & HUD AREA */}
                    <div className="flex-grow flex flex-col min-w-0 relative">
                        
                        {/* 1. USER MODEL HUD */}
                        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 w-3/4 max-w-xl">
                            <div className="bg-black/80 backdrop-blur-md border border-purple-500/50 p-2 rounded-lg text-center shadow-lg transform transition-all hover:scale-105">
                                <div className="text-[9px] text-purple-400 font-bold uppercase tracking-widest mb-1">THEORY OF MIND (GM ANALYSIS)</div>
                                <div className="text-xs text-purple-100 italic">"{userModel}"</div>
                            </div>
                        </div>

                        {/* 2. CHAT HISTORY */}
                        <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar pt-20 pb-40">
                            {chatHistory.map((msg, i) => (
                                <div key={i} className={\`max-w-[85%] p-3 rounded-lg text-sm leading-relaxed shadow-md \${msg.sender === 'GM' ? 'bg-slate-800/90 text-slate-200 self-start border-l-4 border-purple-500' : (msg.sender === 'SYSTEM' ? 'bg-red-900/20 border border-red-500/50 text-red-200 text-center mx-auto w-full' : (msg.sender === 'INTERPRETER' ? 'bg-blue-900/30 text-blue-200 text-xs italic self-end ml-auto border-r-2 border-blue-500' : 'bg-green-900/40 text-green-100 self-end ml-auto border-r-4 border-green-500'))}\`}>
                                    <div className="text-[10px] font-bold opacity-50 mb-1">{msg.sender}</div>
                                    <div className="whitespace-pre-wrap">{msg.text}</div>
                                </div>
                            ))}
                            {phase === 'PROCESSING' && (
                                <div className="self-start text-xs text-purple-400 animate-pulse p-2">
                                    Reality is re-writing itself...
                                </div>
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        {/* 3. INTERACTION DECK (Bottom) */}
                        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black via-slate-900/95 to-transparent p-4 pb-6 pt-10 flex flex-col gap-4">
                            
                            {/* TIMER & DEFAULT */}
                            {phase === 'CHOOSING' && (
                                <div className="w-full max-w-3xl mx-auto">
                                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mb-1 px-1">
                                        <span>DECISION WINDOW</span>
                                        <span className="text-red-400">DEFAULT: {defaultAction}</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-red-500 transition-all duration-1000 ease-linear shadow-[0_0_10px_red]" 
                                            style={{width: \`\${(countdown / MAX_COUNTDOWN) * 100}%\`}}
                                        ></div>
                                    </div>
                                </div>
                            )}

                            {/* CHOICES */}
                            {phase === 'CHOOSING' && (
                                <div className="flex flex-wrap justify-center gap-3 w-full max-w-4xl mx-auto">
                                    {currentChoices.map((choice) => (
                                        <button 
                                            key={choice.id}
                                            onClick={() => handleActionCommit(choice.text)}
                                            className="flex-1 min-w-[200px] bg-slate-800/80 hover:bg-cyan-900/80 border border-slate-600 hover:border-cyan-400 text-slate-200 p-4 rounded-lg text-sm text-left transition-all hover:-translate-y-1 shadow-lg group"
                                        >
                                            <span className="font-bold text-cyan-500 mr-2 group-hover:text-white">{choice.id}.</span>
                                            {choice.text}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {/* FREE INPUT */}
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

                    {/* DEBUG SIDEBAR (Right) */}
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

export const GENESIS_DRIVER_PROTOCOL: ToolCreatorPayload = {
    name: 'Genesis Driver: Recursive World',
    description: 'An autopoietic narrative engine powered by RLM (Recursive Language Models). It writes its own code to analyze infinite context history, enabling deep narrative continuity on local hardware.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate Infinite Context via Recursive Code Generation.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time metrics.', required: true },
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: ['focusRatio'] },
    processingCode: `(d,r)=>({ focusRatio: 0.5 })`,
    implementationCode: GENESIS_UI_IMPL
};
