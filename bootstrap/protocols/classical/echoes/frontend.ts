
import { LORE_LIBRARY_CODE } from './lore';
import { AMEM_KERNEL } from './memory';
import { SENSOR_HOOKS } from './sensors';
import { GEOMANCER_BRAIN } from './agent';
import { INNER_WORLD_RENDERER } from './visuals';

export const ECHOES_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;
    if (!R3F || !Drei || !THREE) return <div>Init...</div>;
    const { Canvas, useFrame } = R3F;
    const { OrbitControls, Line, Stars } = Drei;

    ${LORE_LIBRARY_CODE}
    ${AMEM_KERNEL}
    ${SENSOR_HOOKS}
    ${GEOMANCER_BRAIN}
    ${INNER_WORLD_RENDERER}

    // --- REALITY ANCHOR DETECTOR (SLAM Lite) ---
    // Detects high-contrast features and calculates optical flow for stability.
    const useFeatureDetector = (canvasRef, isActive) => {
        const [features, setFeatures] = useState([]); // Array of {x, y} percentage
        const [stabilityScore, setStabilityScore] = useState(0); // 0.0 (Moving) to 1.0 (Static)
        const lastFeaturesRef = useRef([]);

        useEffect(() => {
            if (!isActive || !canvasRef.current) return;
            
            const detect = () => {
                const cvs = canvasRef.current;
                const ctx = cvs.getContext('2d');
                if (!ctx) return;
                
                const w = cvs.width;
                const h = cvs.height;
                if (w === 0 || h === 0) return;
                
                try {
                    const imgData = ctx.getImageData(0, 0, w, h);
                    const gray = new Uint8Array(w * h);
                    
                    // 1. Grayscale
                    for (let i = 0; i < w * h; i++) {
                        gray[i] = (imgData.data[i*4] + imgData.data[i*4+1] + imgData.data[i*4+2]) / 3;
                    }
                    
                    // 2. FAST Corner Detection
                    const corners = [];
                    const threshold = 40;
                    const stride = 5; 
                    
                    for (let y = 10; y < h - 10; y += stride) {
                        for (let x = 10; x < w - 10; x += stride) {
                            const idx = y * w + x;
                            const center = gray[idx];
                            const top = gray[idx - w * 3];
                            const bot = gray[idx + w * 3];
                            const left = gray[idx - 3];
                            const right = gray[idx + 3];
                            
                            if ((top > center+threshold && bot > center+threshold) || (top < center-threshold && bot < center-threshold)) {
                                corners.push({ x: (x/w)*100, y: (y/h)*100, rx: x, ry: y });
                            }
                        }
                    }
                    
                    // Limit to top stable points
                    const newFeatures = corners.slice(0, 30);
                    setFeatures(newFeatures);
                    
                    // 3. Simple Optical Flow / Stability Calc
                    // Compare average position of corners to last frame
                    // (This is naive but sufficient for determining "Static" vs "Moving")
                    if (lastFeaturesRef.current.length > 0 && newFeatures.length > 0) {
                        const oldAvgX = lastFeaturesRef.current.reduce((s,c) => s+c.x, 0) / lastFeaturesRef.current.length;
                        const newAvgX = newFeatures.reduce((s,c) => s+c.x, 0) / newFeatures.length;
                        const diff = Math.abs(oldAvgX - newAvgX);
                        
                        // If diff is low, we are stable.
                        const frameStability = Math.max(0, 1.0 - (diff * 20)); // Amplified sensitivity
                        setStabilityScore(prev => (prev * 0.8) + (frameStability * 0.2)); // Smooth
                    }
                    
                    lastFeaturesRef.current = newFeatures;

                } catch(e) {}
            };
            
            const interval = setInterval(detect, 200); 
            return () => clearInterval(interval);
        }, [isActive, canvasRef]);
        
        return { features, stabilityScore };
    };

    // --- AR OVERLAY COMPONENT (2D + Depth + Anchors) ---
    const AROverlay = ({ detections, anchors, theme }) => {
        return (
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* 1. Reality Anchors */}
                {anchors.map((p, i) => (
                    <div key={'anchor'+i} 
                         className="absolute w-1 h-1 bg-yellow-400 opacity-40 rounded-full"
                         style={{ top: p.y + '%', left: p.x + '%' }}>
                    </div>
                ))}

                {/* 2. Semantic Objects */}
                {detections && detections.map(d => {
                    // --- TYPE 1: OBJECTS ---
                    if (d.type === 'object') {
                        const top = d.box[0] / 10;
                        const left = d.box[1] / 10;
                        const height = (d.box[2] - d.box[0]) / 10;
                        const width = (d.box[3] - d.box[1]) / 10;
                        
                        const isClutter = d.status === 'Clutter' || d.status === 'Mess';
                        const color = isClutter ? '#ef4444' : theme.primary;
                        
                        // CONFIDENCE VISUALIZATION
                        const isConfirmed = d.confidence > 0.75;
                        const opacity = isConfirmed ? 1.0 : 0.4;
                        const borderStyle = isConfirmed ? 'solid' : 'dashed';
                        const animate = isConfirmed ? '' : 'animate-pulse';
                        
                        return (
                            <div key={d.id} 
                                 className={\`absolute border-2 flex flex-col transition-all duration-300 \${animate}\`}
                                 style={{ 
                                     top: top + '%', 
                                     left: left + '%', 
                                     width: width + '%', 
                                     height: height + '%',
                                     borderColor: color,
                                     borderStyle: borderStyle,
                                     opacity: opacity
                                 }}>
                                <div className="absolute -top-5 left-0 text-[9px] font-bold px-1 text-white bg-black/60 backdrop-blur-sm whitespace-nowrap">
                                    {d.label} {isConfirmed ? '' : '?'}
                                </div>
                            </div>
                        );
                    }
                    return null;
                })}
            </div>
        );
    };

    // --- MAIN APP ---
    const [isActive, setIsActive] = useState(false);
    const [viewMode, setViewMode] = useState('AR'); 
    const [currentLoreId, setCurrentLoreId] = useState('FENG_SHUI');
    const [loading, setLoading] = useState(true);

    // Load AI Models
    useEffect(() => {
        const load = async () => {
            try {
                await runtime.ai.getFeatureExtractor('Xenova/clip-vit-base-patch32');
                setLoading(false);
            } catch(e) { console.error("Model load failed", e); }
        };
        load();
    }, []);

    const activeLore = LORE_LIBRARY[currentLoreId];
    const heading = useCompass(isActive);
    const memory = useAgenticMemory(runtime, heading, activeLore, !loading);
    
    // Attach Reality Anchor System (First, to get stability)
    // We pass a ref placeholder, Vision hook will fill it
    const canvasRef = useRef(null);
    const { features, stabilityScore } = useFeatureDetector(canvasRef, isActive);
    
    const vision = useSemanticVision(runtime, memory, isActive, heading, activeLore, !loading, stabilityScore);
    
    // Connect refs manually since hooks initialized separately
    useEffect(() => {
        if (vision.canvasRef.current) canvasRef.current = vision.canvasRef.current;
    }, [vision.canvasRef.current]);

    const audio = useAudioInput(runtime, isActive);
    // Pass the separated World Model (Confirmed vs Hypothesis) to the Agent
    const agent = useUniversalAgent(runtime, memory, audio, activeLore, vision.worldModel);
    
    const currentMission = useMemo(() => {
        if (!agent.robotDirective) return null;
        if (agent.robotDirective === "MAINTAIN_HARMONY") return { text: "AREA HARMONIZED", color: "text-green-400", border: "border-green-500" };
        const match = agent.robotDirective.match(/RELOCATE \[(.*?)\] ->/);
        const item = match ? match[1] : "OBJECT";
        return { text: \`REMOVE: \${item.toUpperCase()}\`, sub: "Clear energy blockage", color: "text-red-400", border: "border-red-500 bg-red-950/80" };
    }, [agent.robotDirective]);

    if (loading) return <div className="h-full flex items-center justify-center text-green-500 font-mono">BOOTING OPTICAL NERVE...</div>;

    return (
        <div className={"w-full h-full bg-black relative text-xs overflow-hidden flex flex-col " + activeLore.theme.font}>
            
            {/* 1. REALITY LAYER */}
            <div className="absolute inset-0 z-0">
                 <video ref={vision.videoRef} className="w-full h-full object-cover opacity-80" playsInline muted autoPlay />
            </div>
            <canvas ref={vision.canvasRef} className="hidden" />

            {/* 2. AUGMENTED LAYER */}
            {viewMode === 'AR' && (
                <div className="absolute inset-0 z-10">
                    <AROverlay detections={vision.detections} anchors={features} theme={activeLore.theme} />
                </div>
            )}

            {/* 3. INNER LAYER */}
            <div className={"absolute inset-0 z-20 pointer-events-none transition-opacity duration-500 " + (viewMode === 'GRAPH' ? 'opacity-100' : 'opacity-0')}>
                <Canvas camera={{ position: [0, 0, 12], fov: 50 }} gl={{ alpha: true }}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} color={activeLore.theme.primary} />
                    <InnerWorld graph={memory.graph} hudMode={false} activeLore={activeLore} />
                    <OrbitControls autoRotate enableZoom={false} />
                </Canvas>
            </div>

            {/* 4. HUD INTERFACE */}
            <div className="absolute inset-0 z-30 flex flex-col justify-between p-4 pointer-events-none">
                {/* Header */}
                <div className="flex justify-between items-start pointer-events-auto">
                    <div>
                        <h1 className="text-xl font-bold drop-shadow-md" style={{color: activeLore.theme.primary}}>
                            {activeLore.name}
                        </h1>
                        <div className="flex gap-2 mt-2">
                             <button onClick={() => setViewMode('AR')} className={\`px-3 py-1 rounded border font-bold \${viewMode==='AR' ? 'bg-white text-black' : 'bg-black/50 text-white'}\`}>AR VIEW</button>
                             <button onClick={() => setViewMode('GRAPH')} className={\`px-3 py-1 rounded border font-bold \${viewMode==='GRAPH' ? 'bg-white text-black' : 'bg-black/50 text-white'}\`}>MIND MAP</button>
                        </div>
                    </div>
                    
                    <div className="text-right">
                        <div className="flex flex-col gap-1 items-end">
                            {stabilityScore > 0.8 && (
                                <div className="text-[10px] bg-green-500 text-black font-bold px-2 py-0.5 rounded flex items-center gap-1 animate-pulse">
                                    <span>LOCKED</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                                </div>
                            )}
                            <div className="text-[10px] text-slate-400 font-bold bg-black/50 px-1 rounded">STATUS</div>
                            <div className="text-white font-bold">{vision.visionStatus}</div>
                        </div>
                    </div>
                </div>

                {/* CURRENT MISSION CARD */}
                {isActive && currentMission && (
                    <div className="self-center mt-10 pointer-events-auto animate-fade-in-scale">
                        <div className={\`border-2 rounded-lg p-4 shadow-[0_0_30px_rgba(0,0,0,0.8)] backdrop-blur-md flex items-center gap-4 \${currentMission.border || 'border-slate-500 bg-black/80'}\`}>
                            <div className={\`text-3xl font-black \${currentMission.color}\`}>!</div>
                            <div>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol</div>
                                <div className={\`text-xl font-black \${currentMission.color} tracking-tight\`}>{currentMission.text}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Agent Thoughts */}
                <div className="self-center text-center max-w-md mt-auto mb-4">
                     {agent.dialogue && (
                         <div className="bg-black/80 border-l-4 p-4 rounded mb-2 animate-fade-in-up shadow-lg" style={{borderColor: activeLore.theme.secondary}}>
                             <div className="text-[10px] font-bold opacity-70 mb-1">GEOMANCER LOG</div>
                             <div className="text-lg font-bold text-white leading-tight">"{agent.dialogue}"</div>
                         </div>
                     )}
                     <div className="text-[10px] text-white/50 bg-black/60 px-3 py-1 rounded backdrop-blur-sm border border-slate-700/50 inline-block">
                         🧠 {agent.thought}
                     </div>
                </div>

                {/* Controls */}
                <div className="self-center pointer-events-auto pb-4">
                    <button 
                        onClick={() => setIsActive(!isActive)}
                        className={"w-16 h-16 rounded-full border-4 flex items-center justify-center transition-all shadow-[0_0_20px_rgba(0,0,0,0.5)] " + (isActive ? "bg-red-600 border-red-800 scale-90" : "bg-white/10 hover:bg-white/20 backdrop-blur-md")}
                        style={{borderColor: isActive ? '' : activeLore.theme.primary}}
                    >
                        <span className="font-black text-xs">{isActive ? "STOP" : "SCAN"}</span>
                    </button>
                </div>
            </div>
        </div>
    );
`;
