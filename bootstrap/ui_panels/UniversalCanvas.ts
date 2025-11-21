
export const UNIVERSAL_CANVAS_CODE = `
// We assume these are now injected globally by index.tsx
const R3F = window.ReactThreeFiber || { Canvas: ({children}) => <div className="p-4 text-red-500">R3F Not Loaded</div>, useFrame: () => {} };
const Drei = window.ReactThreeDrei || { Sparkles: () => null, OrbitControls: () => null, Float: ({children}) => <>{children}</> };
const { Canvas, useFrame } = R3F;
const { Sparkles, OrbitControls, Float, MeshDistortMaterial } = Drei;

// Note: 'useMemo', 'useRef', 'useState', 'useEffect' are available in scope from MAIN_PANEL_CODE.

// --- NEURAL HUD COMPONENT (SVG VISUALIZERS) ---
const NeuralHUD = ({ visionData, audioData }) => {
    // 1. Abstract Face (Vision)
    const FaceDisplay = () => {
        if (!visionData) return null;
        // Robustly handle potentially missing values
        const smile = typeof visionData.smile === 'number' ? visionData.smile : 0;
        const eyeOpen = typeof visionData.eyeOpen === 'number' ? visionData.eyeOpen : 1;
        const isSimulated = !!visionData.isSimulated;
        
        // Dynamic SVG Paths
        // Smile: 0 to 1. 0 = Frown/Neutral, 1 = Big Smile.
        // Mouth is a quadratic bezier. Control point Y moves.
        const mouthY = 70 + (smile * 20); 
        const mouthControlY = 70 + (smile * 40); 
        const mouthPath = \`M 30 \${mouthY} Q 50 \${mouthControlY} 70 \${mouthY}\`;
        
        // Eyes: Openness scales vertical radius
        const eyeH = 8 * (eyeOpen + 0.1); // Ensure strictly positive
        
        return (
            <div className="absolute top-4 right-4 w-32 h-32 bg-black/80 backdrop-blur border border-purple-500/50 rounded-lg p-2 shadow-[0_0_20px_rgba(168,85,247,0.4)] transition-all hover:scale-105 hover:border-purple-400 flex flex-col">
                <div className="absolute top-1 left-2 text-[9px] text-purple-400 font-mono tracking-wider flex justify-between w-[90%]">
                    <span>{isSimulated ? 'SIM_CAM' : 'VISION'}</span>
                    <span className="text-white">{isSimulated ? '⚠' : '●'}</span>
                </div>
                <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-lg flex-grow">
                    {/* Head Outline (Cyberpunk brackets) */}
                    <path d="M 20 10 L 10 20 L 10 80 L 20 90" fill="none" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.5" />
                    <path d="M 80 10 L 90 20 L 90 80 L 80 90" fill="none" stroke="#a855f7" strokeWidth="1" strokeOpacity="0.5" />
                    
                    {/* Eyes */}
                    <ellipse cx="35" cy="40" rx="10" ry={eyeH} fill="none" stroke="cyan" strokeWidth="2" className="transition-all duration-100" />
                    <circle cx="35" cy="40" r="2" fill="white" opacity={eyeOpen > 0.2 ? 1 : 0} />
                    
                    <ellipse cx="65" cy="40" rx="10" ry={eyeH} fill="none" stroke="cyan" strokeWidth="2" className="transition-all duration-100" />
                    <circle cx="65" cy="40" r="2" fill="white" opacity={eyeOpen > 0.2 ? 1 : 0} />
                    
                    {/* Mouth */}
                    <path d={mouthPath} fill="none" stroke={smile > 0.5 ? "#4ade80" : "cyan"} strokeWidth="2" strokeLinecap="round" className="transition-all duration-200" />
                </svg>
                <div className="text-[9px] font-mono text-center text-purple-200 mt-[-5px]">
                    SMILE: {(smile * 100).toFixed(0)}%
                </div>
            </div>
        );
    };

    // 2. Audio Waveform
    const AudioDisplay = () => {
        if (!audioData) return null;
        // Robust check
        const amplitude = typeof audioData.amplitude === 'number' ? audioData.amplitude : 0;
        
        // Create a little reactive bar graph
        const bars = 5;
        return (
            <div className="absolute top-40 right-4 w-24 h-16 bg-black/50 backdrop-blur border border-yellow-500/30 rounded-lg p-2 flex flex-col justify-between">
                 <div className="text-[9px] text-yellow-400 font-mono tracking-wider mb-1">AUDIO_IN</div>
                 <div className="flex justify-between items-end h-full gap-1">
                    {[...Array(bars)].map((_, i) => {
                        // Perlin-ish noise simulation for visualization based on single amplitude
                        const noise = Math.sin(Date.now() * 0.01 + i); 
                        const h = Math.max(10, Math.min(100, (amplitude * 100) + (noise * 20)));
                        return (
                            <div 
                                key={i} 
                                style={{ height: \`\${h}%\` }} 
                                className="w-full bg-yellow-500/80 rounded-sm transition-all duration-75"
                            />
                        );
                    })}
                 </div>
            </div>
        );
    };

    return (
        <>
            <FaceDisplay />
            <AudioDisplay />
        </>
    );
};

const Visuals = useMemo(() => ({ visualState }) => {
    const meshRef = useRef();
    
    // FIX: Robustly extract numeric intensity to prevent NaN issues in UI
    let intensity = 0.5;
    if (typeof visualState.intensity === 'number' && !isNaN(visualState.intensity)) {
        intensity = visualState.intensity;
    } else if (visualState.intensity && typeof visualState.intensity === 'string') {
        const parsed = parseFloat(visualState.intensity);
        if (!isNaN(parsed)) intensity = parsed;
    }
    
    // Auto-rotate based on intensity
    useFrame((state, delta) => {
        const speed = 0.2 + intensity;
        if (meshRef.current) {
            meshRef.current.rotation.x += delta * speed;
            meshRef.current.rotation.y += delta * (speed * 0.5);
        }
    });

    // Dynamic Color from State
    const color = visualState.globalColor || '#ffffff';

    return (
        <>
            <ambientLight intensity={0.5} />
            <pointLight position={[10, 10, 10]} intensity={1 + intensity * 2} color={color} />
            
            {/* Background Particles (The Void) */}
            <Sparkles 
                count={100 + intensity * 200} 
                scale={12} 
                size={2 + intensity * 5} 
                speed={0.4 + intensity} 
                opacity={0.5} 
                color={color} 
            />

            {/* Main Reactive Geometry */}
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                <group ref={meshRef}>
                     {visualState.geometryMode === 'Particles' && (
                        <points>
                            <sphereGeometry args={[3 + intensity, 64, 64]} />
                            <pointsMaterial size={0.05 + intensity * 0.05} color={color} transparent opacity={0.8} />
                        </points>
                    )}

                    {visualState.geometryMode === 'FlowField' && (
                         <mesh scale={1 + intensity * 0.5}>
                            <torusKnotGeometry args={[2, 0.6, 150, 20]} />
                            <meshStandardMaterial 
                                color={color} 
                                wireframe={true} 
                                emissive={color}
                                emissiveIntensity={intensity * 2}
                            />
                        </mesh>
                    )}
                    
                    {(visualState.geometryMode !== 'Particles' && visualState.geometryMode !== 'FlowField' && visualState.geometryMode !== 'Void') && (
                        <mesh scale={1 + intensity * 0.5}>
                            <icosahedronGeometry args={[2.5, 1]} />
                            <meshStandardMaterial 
                                color={color} 
                                wireframe={true} 
                                emissive={color}
                                emissiveIntensity={intensity * 3}
                            />
                        </mesh>
                    )}
                </group>
            </Float>

            <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={0.5} />
        </>
    );
}, []); // Stable definition

const UniversalCanvas = useMemo(() => ({ runtime }) => {
    const [visualState, setVisualState] = useState({
        globalColor: '#00ffff',
        intensity: 0.2,
        geometryMode: 'Particles'
    });
    
    const [inputState, setInputState] = useState({ vision: null, audio: null });
    const [graphState, setGraphState] = useState({ nodes: [], edges: [] });
    const [showGraph, setShowGraph] = useState(true);

    // Subscribe to NeuroBus for visual updates AND Input streams
    useEffect(() => {
        if (!runtime || !runtime.neuroBus) return;

        const unsub = runtime.neuroBus.subscribe((frame) => {
            // 1. System Visual Updates (From Logic Graph)
            if (frame.type === 'System' && frame.payload?.visualUpdate) {
                setVisualState(prev => ({ ...prev, ...frame.payload.visualUpdate }));
            }
            
            // 2. Input Stream Monitoring (For HUD)
            if (frame.type === 'Vision') {
                setInputState(prev => ({ ...prev, vision: frame.payload }));
            }
            if (frame.type === 'Audio') {
                setInputState(prev => ({ ...prev, audio: frame.payload }));
            }
        });
        
        return () => unsub();
    }, [runtime]);

    // Poll Stream Engine for Full Graph State (Nodes & Connections)
    useEffect(() => {
        const interval = setInterval(() => {
            const engine = window.streamEngine; 
            if (engine && typeof engine.getDebugState === 'function') {
                setGraphState(engine.getDebugState());
            }
        }, 100); // Fast poll for UI feedback
        return () => clearInterval(interval);
    }, []);

    // FIX: Robust check for numeric display in UI
    const displayIntensity = (() => {
        const val = parseFloat(visualState.intensity);
        return isNaN(val) ? 0 : val;
    })();

    return (
        <div className="w-full h-full bg-black relative transition-colors duration-1000" style={{ backgroundColor: visualState.geometryMode === 'Void' ? '#000' : 'black' }}>
             
             {/* Neural HUD Overlay (Face & Audio) */}
             <NeuralHUD visionData={inputState.vision} audioData={inputState.audio} />
             
             <div className="absolute top-4 left-4 z-50 pointer-events-auto">
                 <button 
                    onClick={() => setShowGraph(!showGraph)}
                    className={'px-2 py-1 rounded text-[9px] font-bold border transition-colors ' + (showGraph ? 'bg-green-900/30 border-green-500 text-green-400' : 'bg-slate-800 border-slate-600 text-slate-400 hover:text-white')}
                >
                    GRAPH: {showGraph ? 'ON' : 'OFF'}
                </button>
             </div>

             {/* Graph Topology Overlay (Nodes & Values) */}
             {showGraph && (
                 <div className="absolute inset-0 z-40 pointer-events-none p-4 overflow-hidden">
                    <div className="flex flex-wrap gap-4 h-full content-start pt-10">
                        {graphState.nodes.map((node, i) => {
                            // Determine activity (pulsing)
                            const now = Date.now();
                            const isActive = (now - (node.lastUpdate || 0)) < 150;

                            // Format value
                            let valStr = '...';
                            if (node.value !== undefined && node.value !== null) {
                               if (typeof node.value === 'number') valStr = node.value.toFixed(2);
                               else if (typeof node.value === 'object') {
                                    try {
                                       valStr = JSON.stringify(node.value).substring(0, 25) + (JSON.stringify(node.value).length > 25 ? '...' : '');
                                    } catch(e) { valStr = '{OBJ}'; }
                               }
                               else valStr = String(node.value).substring(0, 15);
                            }
                            
                            const isSource = node.type === 'Source';
                            const isSink = node.type === 'Sink';
                            const borderColor = isActive ? '#ffffff' : (isSource ? '#22c55e' : isSink ? '#3b82f6' : '#a855f7');
                            const boxShadow = isActive ? \`0 0 15px \${borderColor}\` : 'none';
                            
                            return (
                                <div key={node.id} className="bg-black/80 backdrop-blur-md border rounded-lg p-2 min-w-[140px] shadow-lg transition-all duration-100" style={{ borderColor, boxShadow }}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold text-slate-300 uppercase">{node.type}</span>
                                        <div className={'w-2 h-2 rounded-full ' + (isSource ? 'bg-green-500' : isSink ? 'bg-blue-500' : 'bg-purple-500')} />
                                    </div>
                                    <div className="text-xs font-mono text-white mb-1 truncate w-full" title={node.id}>{node.id}</div>
                                    <div className="text-[9px] font-mono text-cyan-300 bg-slate-900/50 px-1 rounded border border-cyan-900/50 break-all">
                                       {valStr}
                                    </div>
                                    {/* Animated Pulse Line for activity */}
                                    {isActive && (
                                        <div className="w-full h-0.5 bg-white mt-1 overflow-hidden shadow-[0_0_5px_white]"></div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    {/* Connection Lines (Visual Approximation) */}
                     <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
                         <defs>
                            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
                            </pattern>
                         </defs>
                         <rect width="100%" height="100%" fill="url(#grid)" />
                    </svg>
                 </div>
             )}

             {/* R3F Canvas */}
             {window.ReactThreeFiber ? (
                <Canvas camera={{ position: [0, 0, 10] }} gl={{ antialias: true, alpha: false }}>
                    <color attach="background" args={['black']} />
                    <Visuals visualState={visualState} />
                </Canvas> 
             ) : (
                 <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                    <div className="text-center">
                        <h2 className="text-xl font-bold mb-2">3D Engine Not Detected</h2>
                        <p className="text-xs">Ensure index.tsx injects global 'ReactThreeFiber'.</p>
                    </div>
                 </div>
             )}

             <div className="absolute bottom-4 left-4 text-[10px] text-white/50 font-mono pointer-events-none bg-black/20 p-1 rounded backdrop-blur-sm z-50 border-l-2 border-cyan-500 pl-2">
                 VIBE: {visualState.geometryMode} | INT: {(displayIntensity * 100).toFixed(0)}% | NODES: {graphState.nodes.length}
             </div>
             
        </div>
    );
}, []); // Stable definition
`;