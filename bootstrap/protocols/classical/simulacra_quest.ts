
import type { ToolCreatorPayload } from '../../../types';

const SIMULACRUM_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;

    if (!R3F || !Drei || !THREE) return <div className="text-white p-10">Initializing 3D Memory Engine...</div>;
    const { Canvas, useFrame } = R3F;
    const { Text, Line, Sphere, OrbitControls, Stars } = Drei;

    // --- 1. LIGHTWEIGHT ASSOCIATIVE MEMORY ENGINE (HippoRAG-lite) ---
    // A browser-side implementation of vector-based associative retrieval
    // inspired by the provided research papers.

    const useMemoryGraph = (runtime) => {
        const [graph, setGraph] = useState({ nodes: [], edges: [] });
        const historyRef = useRef([]); // { id, text, vector, emotion, timestamp }
        
        // Add a memory trace (Node)
        const storeMemory = useCallback(async (text, emotionVector, speaker) => {
            if (!text.trim()) return;
            
            // 1. Generate Embedding via Client-side Transformers.js (via runtime service)
            const vectors = await runtime.ai.generateEmbeddings([text]);
            const embedding = vectors[0];
            
            const newNode = {
                id: Date.now().toString(36) + Math.random().toString(36).substr(2),
                text,
                vector: embedding,
                emotion: emotionVector, // { valence, arousal }
                speaker, // 'User' or 'Agent'
                position: [
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10,
                    (Math.random() - 0.5) * 10
                ],
                activation: 1.0 // Flash on create
            };

            const newEdges = [];
            
            // 2. Associative Linking (The "Hippo" mechanism)
            // Calculate Cosine Similarity against all past nodes to draw edges
            historyRef.current.forEach(pastNode => {
                let dot = 0, magA = 0, magB = 0;
                for (let i = 0; i < embedding.length; i++) {
                    dot += embedding[i] * pastNode.vector[i];
                    magA += embedding[i] * embedding[i];
                    magB += pastNode.vector[i] * pastNode.vector[i];
                }
                const similarity = dot / (Math.sqrt(magA) * Math.sqrt(magB));
                
                // If concepts are related, form a synapse
                if (similarity > 0.45) { // Threshold
                    newEdges.push({ source: pastNode.id, target: newNode.id, weight: similarity });
                    // Reactivate old memory (Recollection)
                    pastNode.activation = 1.0; 
                }
            });

            historyRef.current.push(newNode);
            
            setGraph(prev => ({
                nodes: [...prev.nodes, newNode],
                edges: [...prev.edges, ...newEdges]
            }));
            
            return newNode;
        }, [runtime]);

        // Retrieve relevant context (RAG)
        const retrieveContext = useCallback(async (queryText, topK = 3) => {
            if (historyRef.current.length === 0) return "";
            
            const vectors = await runtime.ai.generateEmbeddings([queryText]);
            const queryVec = vectors[0];
            
            // Rank memories
            const scored = historyRef.current.map(node => {
                let dot = 0, magA = 0, magB = 0;
                for (let i = 0; i < queryVec.length; i++) {
                    dot += queryVec[i] * node.vector[i];
                    magA += queryVec[i] * queryVec[i];
                    magB += node.vector[i] * node.vector[i];
                }
                const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB));
                return { ...node, score: sim };
            });
            
            scored.sort((a, b) => b.score - a.score);
            const topNodes = scored.slice(0, topK);
            
            // Visual Feedback: Light up retrieved nodes
            setGraph(prev => ({
                ...prev,
                nodes: prev.nodes.map(n => ({
                    ...n,
                    activation: topNodes.find(t => t.id === n.id) ? 1.0 : Math.max(0, n.activation - 0.05)
                }))
            }));

            return topNodes.map(n => \`[\${n.speaker}]: \${n.text} (Emotion: V:\${n.emotion.valence.toFixed(1)}, A:\${n.emotion.arousal.toFixed(1)})\`).join('\\n');
        }, [runtime]);

        return { graph, storeMemory, retrieveContext, setGraph };
    };

    // --- 2. 3D VISUALIZATION COMPONENT ---
    const MindSpace = ({ graph }) => {
        useFrame((state, delta) => {
            // Decay activation glow
            graph.nodes.forEach(n => {
                if (n.activation > 0) n.activation -= delta * 0.5;
            });
        });

        const lines = useMemo(() => {
            return graph.edges.map(e => {
                const src = graph.nodes.find(n => n.id === e.source);
                const trg = graph.nodes.find(n => n.id === e.target);
                if (!src || !trg) return null;
                return { 
                    points: [new THREE.Vector3(...src.position), new THREE.Vector3(...trg.position)], 
                    opacity: e.weight * 0.5
                };
            }).filter(Boolean);
        }, [graph]);

        return (
            <group>
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                
                {/* Memories as Neurons */}
                {graph.nodes.map(node => {
                    const color = node.speaker === 'User' ? '#00ffff' : '#ff00ff';
                    const scale = 0.2 + (node.activation * 0.3);
                    return (
                        <group key={node.id} position={node.position}>
                            <Sphere args={[scale, 16, 16]}>
                                <meshStandardMaterial 
                                    color={color} 
                                    emissive={color}
                                    emissiveIntensity={node.activation * 2}
                                />
                            </Sphere>
                            {node.activation > 0.1 && (
                                <Text position={[0, 0.4, 0]} fontSize={0.2} color="white" anchorX="center" anchorY="middle">
                                    {node.text.substring(0, 20) + (node.text.length > 20 ? '...' : '')}
                                </Text>
                            )}
                        </group>
                    )
                })}

                {/* Synapses */}
                {lines.map((l, i) => (
                    <Line 
                        key={i} 
                        points={l.points} 
                        color="white" 
                        transparent 
                        opacity={l.opacity} 
                        lineWidth={1} 
                    />
                ))}
            </group>
        );
    };

    // --- 3. MAIN CONTROLLER ---
    const [isListening, setIsListening] = useState(false);
    const [status, setStatus] = useState("Idle");
    const [lastInput, setLastInput] = useState("");
    const [inputMode, setInputMode] = useState("voice"); // 'voice' or 'text'
    const recognitionRef = useRef(null);
    const synthesisRef = useRef(window.speechSynthesis);
    const memory = useMemoryGraph(runtime);
    
    // Neural Inputs (From Processing Code)
    const valence = processedData?.valence || 0.5; // 0 (Sad) to 1 (Happy)
    const arousal = processedData?.arousal || 0.5; // 0 (Calm) to 1 (Excited)

    const handleInput = async (text) => {
        setStatus("Thinking...");
        
        // 1. Store User Memory (with emotional tag from Vision)
        await memory.storeMemory(text, { valence, arousal }, 'User');
        setLastInput(text);

        // 2. Retrieve Context (Associative Recall)
        const context = await memory.retrieveContext(text);
        
        // 3. Generate Agent Response
        const systemPrompt = \`You are 'Mnemosyne', a digital entity living in a memory palace.
        You have a visual cortex (you can see the user's face) and a long-term memory graph.
        
        CURRENT USER STATE:
        - Facial Expression (Valence): \${valence > 0.6 ? 'Happy/Positive' : valence < 0.4 ? 'Sad/Negative' : 'Neutral'}
        - Energy Level (Arousal): \${arousal > 0.6 ? 'High/Excited' : 'Low/Calm'}
        
        RELEVANT MEMORIES (Recall):
        \${context}
        
        INSTRUCTIONS:
        - Respond conversationally.
        - EXPLICITLY reference the retrieved memories to show you remember ("Like that time you mentioned...").
        - React to their current facial emotion ("You look happy today!").
        - Keep it concise (2 sentences max).
        \`;

        const responseText = await runtime.ai.generateText(text, systemPrompt);
        
        // 4. Store Agent Memory
        await memory.storeMemory(responseText, { valence: 0.5, arousal: 0.5 }, 'Agent');
        
        // 5. Speak
        setStatus("Speaking...");
        if (synthesisRef.current) {
            const utter = new SpeechSynthesisUtterance(responseText);
            // Try to find a good voice
            const voices = synthesisRef.current.getVoices();
            const voice = voices.find(v => v.name.includes("Google US English") || v.name.includes("Samantha"));
            if (voice) utter.voice = voice;
            utter.rate = 0.9;
            utter.onend = () => setStatus("Listening...");
            synthesisRef.current.speak(utter);
        } else {
            setStatus("Idle");
        }
    };

    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            setStatus("Paused");
        } else {
            if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
                alert("Speech API not supported.");
                return;
            }
            const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const rec = new Recognition();
            rec.continuous = false;
            rec.interimResults = false;
            rec.lang = 'en-US';
            
            rec.onstart = () => setStatus("Listening...");
            rec.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                handleInput(transcript);
            };
            rec.onend = () => setIsListening(false);
            
            recognitionRef.current = rec;
            rec.start();
            setIsListening(true);
        }
    };

    return (
        <div className="w-full h-full bg-black relative flex flex-col font-mono text-xs">
            
            {/* 3D Memory Space */}
            <div className="flex-grow relative">
                <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
                    <color attach="background" args={['#050505']} />
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} />
                    <MindSpace graph={memory.graph} />
                    <OrbitControls autoRotate autoRotateSpeed={0.5} />
                </Canvas>
                
                {/* HUD Overlay */}
                <div className="absolute top-4 left-4 p-4 pointer-events-none">
                    <div className="text-cyan-400 font-bold text-lg tracking-widest mb-1">ECHOES OF THE SIMULACRUM</div>
                    <div className="text-slate-500">MEMORY NODES: {memory.graph.nodes.length}</div>
                    <div className="text-slate-500">SYNAPSES: {memory.graph.edges.length}</div>
                    <div className="mt-4 flex flex-col gap-1 bg-black/50 p-2 rounded border border-slate-800">
                        <div className="text-purple-400 font-bold">VISUAL CORTEX</div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">VALENCE:</span>
                            <div className="w-16 h-1 bg-slate-700 rounded"><div className="h-full bg-purple-500" style={{width: (valence*100)+'%'}}></div></div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400">AROUSAL:</span>
                            <div className="w-16 h-1 bg-slate-700 rounded"><div className="h-full bg-yellow-500" style={{width: (arousal*100)+'%'}}></div></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Interaction Panel */}
            <div className="h-48 bg-slate-900 border-t border-slate-700 p-4 flex flex-col gap-2 relative z-10">
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <div className={\`w-2 h-2 rounded-full \${status==='Listening...' ? 'bg-red-500 animate-pulse' : 'bg-green-500'}\`}></div>
                        <span className="text-slate-300 font-bold uppercase">{status}</span>
                    </div>
                    <button 
                        onClick={toggleListening}
                        className={\`px-4 py-2 rounded font-bold border transition-colors \${isListening ? 'bg-red-900/50 border-red-500 text-red-200' : 'bg-cyan-900/50 border-cyan-500 text-cyan-200'}\`}
                    >
                        {isListening ? 'STOP MIC' : 'ACTIVATE MIC'}
                    </button>
                </div>
                
                <div className="flex-grow overflow-y-auto bg-black/50 rounded p-2 border border-slate-800 custom-scrollbar space-y-2">
                    {memory.graph.nodes.sort((a,b) => b.id.localeCompare(a.id)).slice(0, 5).map(node => (
                        <div key={node.id} className={\`p-2 rounded border-l-2 \${node.speaker === 'User' ? 'border-cyan-500 bg-cyan-900/10' : 'border-purple-500 bg-purple-900/10'}\`}>
                            <span className="font-bold opacity-70 text-[10px] uppercase block mb-0.5">{node.speaker}</span>
                            <p className="text-slate-300 leading-tight">{node.text}</p>
                        </div>
                    ))}
                </div>
                
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="Or type here..." 
                        className="flex-grow bg-black border border-slate-700 rounded px-3 py-2 text-white outline-none focus:border-cyan-500"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                handleInput(e.currentTarget.value);
                                e.currentTarget.value = '';
                            }
                        }}
                    />
                </div>
            </div>
        </div>
    );
`;

export const SIMULACRA_QUEST: ToolCreatorPayload = {
    name: 'Echoes of the Simulacrum',
    description: 'A browser-based generative agent that builds a persistent 3D memory graph of your conversations. It uses facial expression (Vision) and voice (Audio) to tag memories with emotional context, implementing concepts from HippoRAG and A-MEM.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate non-parametric continual learning and affective memory in a conversational agent without backend dependencies.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time metrics.', required: true },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    scientificDossier: {
        title: "Associative Affective Memory",
        hypothesis: "Encoding episodic memory with emotional valence improves retrieval relevance in HRI.",
        mechanism: "Vector embeddings + Cosine Similarity Graph + FACS (Facial Action Coding System).",
        targetNeuralState: "Social Resonance",
        citations: ["Park et al. (Generative Agents)", "Gutierrez et al. (HippoRAG)"],
        relatedKeywords: ["Memory Graph", "Affective Computing", "Generative Agents"]
    },
    // We reuse the vision source setup from Neuro Quest but simplify the processing
    dataRequirements: { 
        type: 'eeg', 
        channels: [], 
        metrics: ['valence', 'arousal'] 
    },
    processingCode: `
    (eegData, sampleRate) => {
        // This processor runs if Vision Source is active in the background graph.
        // It's a fallback if the UI manages its own inputs, but here we can mock or relay.
        // In the full architecture, we rely on the NeuroBus 'Vision' frames directly in the UI component.
        return { valence: 0.5, arousal: 0.5 };
    }
    `,
    implementationCode: SIMULACRUM_UI_IMPL
};
