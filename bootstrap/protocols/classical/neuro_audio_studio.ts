
// bootstrap/protocols/classical/neuro_audio_studio.ts
import type { ToolCreatorPayload } from '../../../types';

// --- NODE: HYBRID LOGIC ---
// Selects between Manual Target (slider) and EEG Target (Feedback).
// Now supports "Sonic Shield" (Mic -> Noise Volume)
const HYBRID_CONTROLLER_IMPL = `
    // Inputs
    const eeg = inputs['eeg_source_1']; // Optional EEG
    const vision = inputs['vision_source_1']; // Optional Camera
    const mic = inputs['audio_source_1']; // Optional Microphone
    
    const manual = config.manualTarget || 10; // Default Alpha
    const mode = config.mode || 'manual'; // 'manual', 'neuro', 'bio_harmony'
    
    // Shield Config
    const enableShield = config.enableShield || false;
    const baseNoise = config.baseNoise || 0; // User slider setting
    
    let targetBeat = manual;
    let targetScale = null; // Default null (let Synth config decide)
    let targetNoise = baseNoise;
    let feedbackStr = 'Manual: ' + manual + 'Hz';

    // State for smoothing to prevent jitter
    if (state.smoothMetric === undefined) state.smoothMetric = 0.5;
    if (state.smoothAmbient === undefined) state.smoothAmbient = 0;

    // 1. Beat Frequency Logic (Rhythm)
    if (mode === 'neuro') {
        // Adaptive Logic: EEG Focus -> Beat Frequency
        let rawMetric = 0.5;
        if (typeof eeg === 'number') rawMetric = eeg;
        
        // Smooth the metric (Exponential Moving Average)
        const smoothing = 0.05; // Very smooth transition
        state.smoothMetric = (rawMetric * smoothing) + (state.smoothMetric * (1 - smoothing));
        const metric = state.smoothMetric;
        
        if (metric < 0.3) {
            targetBeat = 18; // Alerting Beta
            feedbackStr = 'Neuro: Boosting (Beta)';
        } else if (metric > 0.7) {
            targetBeat = 14; // SMR Flow
            feedbackStr = 'Neuro: Flow (SMR)';
        } else {
            targetBeat = 10; // Relaxed Alpha
            feedbackStr = 'Neuro: Guiding (Alpha)';
        }
    } else {
        // In 'manual' OR 'bio_harmony', we respect the user's preset for the beat.
        // Bio-Harmony only overrides the SCALES, not the speed.
        targetBeat = manual;
        feedbackStr = 'Target: ' + manual + 'Hz';
    }

    // 2. Musical Scale Logic (Harmony)
    if (mode === 'bio_harmony' && vision) {
        const smile = vision.smile || 0;
        // Bio-Harmony overrides the scale sent to the synth
        if (smile > 0.6) {
            targetScale = 'lydian'; 
            feedbackStr += ' | Mood: Radiant';
        } else if (smile > 0.2) {
            targetScale = 'major';
            feedbackStr += ' | Mood: Positive';
        } else {
            targetScale = 'dorian';
            feedbackStr += ' | Mood: Deep';
        }
    }
    
    // 3. SONIC SHIELD (Adaptive Masking)
    let shieldLevel = 0;
    if (enableShield && mic) {
        const rawAmbient = mic.volume || 0;
        
        // Fast Attack, Slow Release for masking
        if (rawAmbient > state.smoothAmbient) {
            state.smoothAmbient = (rawAmbient * 0.2) + (state.smoothAmbient * 0.8); // Attack
        } else {
            state.smoothAmbient = (rawAmbient * 0.01) + (state.smoothAmbient * 0.99); // Release
        }
        
        // Calculate masking boost. 
        // If ambient > 0.05 (silence threshold), boost noise.
        // Cap boost at 0.8 max volume.
        const boost = Math.max(0, (state.smoothAmbient - 0.05) * 3.0);
        
        targetNoise = Math.min(0.8, baseNoise + boost);
        shieldLevel = boost;
        
        if (boost > 0.1) feedbackStr += ' | 🛡️ Shield Active';
    } else {
        // CRITICAL FIX: Explicitly reset smoothing state when shield is disabled
        // to ensure volume snaps back to slider value immediately.
        state.smoothAmbient = 0;
        targetNoise = baseNoise;
    }

    bus.publish({
        type: 'System',
        sourceId: 'studio_logic',
        payload: { 
            visualUpdate: { textOverlay: feedbackStr, intensity: (targetBeat / 30), beatHz: targetBeat },
            debug: { shieldLevel } 
        }
    });

    // Output dynamic noise volume to override the slider setting in the synth
    return { output: { beat: targetBeat, scale: targetScale, noise: targetNoise }, state };
`;

const STUDIO_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    
    // --- 1. Graph Management ---
    useEffect(() => {
        if (!runtime.streamEngine) return;
        
        // Initial Deploy
        const deploy = async () => {
            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph({ id: 'audio_studio_graph', nodes: {}, edges: [] });
            
            // 1. Optional EEG Source
            await runtime.tools.run('Create_EEG_Source', { 
                nodeId: 'eeg_source_1', 
                channel: 'Fz', 
                config: { simulationRange: [0.2, 0.8], simulationFrequencyHz: 0.1 }
            });
            
            // 2. Optional Vision Source
            await runtime.tools.run('Create_Vision_Source', {});
            
            // 3. Logic Controller (Mic will be added dynamically if shield enabled)
            await runtime.tools.run('Create_Filter_Node', {
                nodeId: 'controller',
                inputNodeIds: ['eeg_source_1', 'vision_source_1'],
                jsLogic: ${JSON.stringify(HYBRID_CONTROLLER_IMPL)}
            });
            
            // 4. Audio Engine
            await runtime.tools.run('Create_Audio_Synthesizer', {
                nodeId: 'audio_out',
                inputNodeId: 'controller',
                carrierHz: 200,
                noiseVolume: 0.2,
                drumVolume: 0.5,
                synthType: 'drone',
                enableDrums: true,
                musicalScale: 'pentatonic_minor',
                bpm: 120 // Default focus bpm
            });
            
            runtime.streamEngine.start();
        };
        deploy();
        
        return () => { 
            runtime.streamEngine.stop();
            if (window._neuroAudioContext) {
                try { 
                    window._neuroAudioContext.close(); 
                    window._neuroAudioContext = null;
                } catch(e) {}
            }
        };
    }, []);

    // --- 2. UI Control State ---
    const [mode, setMode] = useState('manual'); // manual, neuro, bio_harmony
    const [preset, setPreset] = useState('focus'); 
    const [noise, setNoise] = useState(0.2);
    const [drums, setDrums] = useState(0.5);
    const [texture, setTexture] = useState('drone'); 
    const [vibe, setVibe] = useState('pentatonic_minor'); 
    const [shield, setShield] = useState(false);
    const [shieldLevel, setShieldLevel] = useState(0);
    
    const [vizMode, setVizMode] = useState('pulse'); // 'flash' | 'pulse' | 'spiral'
    const [strobeActive, setStrobeActive] = useState(false); 
    const [strobeConfirm, setStrobeConfirm] = useState(false);
    
    // --- Visual Tuner State (Persistent) ---
    const [showVisTuner, setShowVisTuner] = useState(false);
    const [visConfig, setVisConfig] = useState(() => {
        try {
            const saved = localStorage.getItem('neuro-audio-vis-settings-v2');
            if (saved) return JSON.parse(saved);
        } catch(e) {}
        // Default profiles for distinct modes
        return { 
            pulse: { scale: 1.5, depth: 0.5, thickness: 0.02, speed: 1.0 },
            spiral: { scale: 3.0, depth: 5.0, thickness: 0.02, speed: 1.0 },
            flash: { scale: 1, depth: 0, thickness: 0, speed: 1 }
        };
    });

    // Persist visual settings
    useEffect(() => {
        localStorage.setItem('neuro-audio-vis-settings-v2', JSON.stringify(visConfig));
    }, [visConfig]);
    
    // Helper to update current mode's config
    const updateVisConfig = (key, val) => {
        setVisConfig(prev => ({
            ...prev,
            [vizMode]: { ...prev[vizMode], [key]: val }
        }));
    };
    
    const activeVisConfig = visConfig[vizMode] || visConfig.pulse;

    const containerRef = useRef(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    
    // Presets
    const PRESETS = {
        focus: { beat: 14, carrier: 200, defaultVibe: 'pentatonic_minor', bpm: 120 },
        relax: { beat: 10, carrier: 130, defaultVibe: 'dorian', bpm: 60 },
        sleep: { beat: 4, carrier: 80, defaultVibe: 'raga', bpm: 40 }
    };

    const applyPreset = (p) => {
        setPreset(p);
        setVibe(PRESETS[p].defaultVibe);
    };

    // Toggle Mic Shield
    const toggleShield = async () => {
        const newState = !shield;
        setShield(newState);
        
        if (newState) {
            // Inject Mic Source if needed
            if (!runtime.streamEngine.hasNode('audio_source_1')) {
                await runtime.tools.run('Create_Audio_Source', {});
                // Wire to controller
                runtime.streamEngine.connectNodes('audio_source_1', 'controller');
            }
        }
    };
    
    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch(e => console.error(e));
        } else {
            document.exitFullscreen();
        }
    };
    
    useEffect(() => {
        const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', handleFsChange);
        return () => document.removeEventListener('fullscreenchange', handleFsChange);
    }, []);

    // Update Graph Config
    useEffect(() => {
        if (!runtime.streamEngine) return;
        
        const p = PRESETS[preset];
        
        // Update Controller
        runtime.streamEngine.updateNodeConfig('controller', {
            manualTarget: p.beat,
            mode: mode,
            enableShield: shield,
            baseNoise: noise // Pass slider value to controller
        });
        
        // Update Audio Engine
        runtime.streamEngine.updateNodeConfig('audio_out', {
            carrierHz: p.carrier,
            synthType: texture,
            enableDrums: drums > 0.05,
            drumVolume: drums,
            musicalScale: vibe,
            bpm: p.bpm
        });
        
    }, [mode, preset, noise, drums, texture, vibe, shield]);

    // --- 3. Visualization State ---
    const [statusText, setStatusText] = useState('Ready');
    const [realtimeBeat, setRealtimeBeat] = useState(10);

    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System') {
                if (f.payload?.visualUpdate?.textOverlay) {
                    setStatusText(f.payload.visualUpdate.textOverlay);
                }
                if (f.payload?.visualUpdate?.beatHz) {
                    setRealtimeBeat(f.payload.visualUpdate.beatHz);
                }
                if (f.payload?.debug?.shieldLevel !== undefined) {
                    setShieldLevel(f.payload.debug.shieldLevel);
                }
            }
        });
        return unsub;
    }, []);

    // --- 4. 3D Render & Flash Engine ---
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;
    
    if (!R3F || !Drei || !THREE) return <div>Loading 3D...</div>;
    const { Canvas, useFrame } = R3F;
    const { Sphere, MeshDistortMaterial, Float, Stars, Torus, Octahedron } = Drei;

    // Scale-to-Color Mapping for Harmony
    const SCALE_COLORS = {
        pentatonic_minor: '#fbbf24', // Amber (Focus)
        lydian: '#f472b6', // Pink (Creative)
        dorian: '#22d3ee', // Cyan (Relax)
        raga: '#818cf8', // Indigo (Deep)
        major: '#4ade80' // Green (Happy)
    };

    // HIGH PERFORMANCE GPU INSTANCING
    const InstancedTunnel = ({ beatHz, active, mode, scale, config }) => {
        const meshRef = useRef();
        const count = 60;
        const dummy = useMemo(() => new THREE.Object3D(), []);
        
        // Base color derived from scale
        const baseColor = useMemo(() => new THREE.Color(SCALE_COLORS[scale] || '#ffffff'), [scale]);

        useFrame(({ clock }) => {
            if (!meshRef.current) return;
            
            // If not active or in flash mode (handled by overlay), hide tunnel
            if (!active || mode === 'flash') {
                meshRef.current.visible = false;
                return;
            }
            meshRef.current.visible = true;

            const t = clock.getElapsedTime() * config.speed;
            const isSpiral = mode === 'spiral';

            for (let i = 0; i < count; i++) {
                const tOffset = i * 0.1;
                const pulse = Math.sin((t * beatHz * Math.PI * 2) - tOffset); // Phase shift
                
                // Position
                // Spiral Mode: Spread rings deeply along Z to create a tunnel based on depth config
                const z = isSpiral ? -i * config.depth : 0; 
                dummy.position.set(0, 0, z);

                // Rotation
                const rotSpeed = isSpiral ? 0.5 : 0.1;
                const twist = isSpiral ? i * 0.2 : 0;
                dummy.rotation.set(
                    Math.sin(t * 0.5 + i * 0.1) * 0.2, // Gentle wobble X
                    Math.cos(t * 0.3 + i * 0.1) * 0.2, // Gentle wobble Y
                    (t * rotSpeed) + twist // Z Rotation
                );

                // Scale
                // Base scale modulated by config
                // Pulse Mode: Starts at config.scale, grows outwards
                const baseScale = isSpiral ? (config.scale + i * 0.5) : (config.scale + i * 0.2);
                const scaleFactor = baseScale + (pulse * 0.5);
                dummy.scale.setScalar(scaleFactor);

                dummy.updateMatrix();
                meshRef.current.setMatrixAt(i, dummy.matrix);
                
                // Color brightness modulation based on pulse
                const brightness = 0.5 + (pulse * 0.5);
                meshRef.current.setColorAt(i, baseColor.clone().multiplyScalar(brightness));
            }
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        });

        return (
            <instancedMesh ref={meshRef} args={[null, null, count]}>
                <torusGeometry args={[1, config.thickness, 16, 50]} />
                <meshStandardMaterial 
                    toneMapped={false}
                    transparent
                    opacity={0.8}
                />
            </instancedMesh>
        );
    };
    
    // --- Flash Overlay Engine ---
    const flashOverlayRef = useRef(null);
    
    useEffect(() => {
        let frameId;
        const startTime = Date.now();
        
        const loop = () => {
            if (strobeActive && vizMode === 'flash' && flashOverlayRef.current) {
                const t = (Date.now() - startTime) / 1000;
                // Square wave strobe logic
                const phase = Math.sin(t * realtimeBeat * Math.PI * 2);
                // Bright flash (white/color) when phase > 0
                const opacity = phase > 0 ? 0.8 : 0; 
                
                flashOverlayRef.current.style.opacity = opacity;
                flashOverlayRef.current.style.backgroundColor = SCALE_COLORS[vibe] || 'white';
            } else if (flashOverlayRef.current) {
                // Ensure it's hidden when inactive
                flashOverlayRef.current.style.opacity = 0;
            }
            frameId = requestAnimationFrame(loop);
        };
        loop();
        return () => cancelAnimationFrame(frameId);
    }, [strobeActive, vizMode, realtimeBeat, vibe]);


    return (
        <div ref={containerRef} className="w-full h-full bg-slate-950 relative font-sans text-slate-200 flex flex-col">
            {/* Fullscreen Flash Overlay */}
            <div ref={flashOverlayRef} className="absolute inset-0 z-[9999] pointer-events-none transition-none mix-blend-screen" style={{backgroundColor: 'white', opacity: 0}}></div>

            {/* Visual Tuner Overlay */}
            {showVisTuner && (
                <div className="absolute top-16 right-4 z-50 bg-black/80 backdrop-blur-md border border-slate-600 p-3 rounded-lg w-48 shadow-xl animate-fade-in">
                    <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-1">
                        <span className="text-[10px] font-bold text-white uppercase">Tuner: {vizMode}</span>
                        <button onClick={() => setShowVisTuner(false)} className="text-slate-400 hover:text-white">✕</button>
                    </div>
                    <div className="space-y-2">
                        <div>
                            <div className="flex justify-between text-[9px] text-slate-400"><span>Scale</span><span>{activeVisConfig.scale.toFixed(1)}</span></div>
                            <input type="range" min="0.1" max="5" step="0.1" value={activeVisConfig.scale} onChange={e => updateVisConfig('scale', parseFloat(e.target.value))} className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-[9px] text-slate-400"><span>Depth</span><span>{activeVisConfig.depth.toFixed(1)}</span></div>
                            <input type="range" min="0.1" max="10" step="0.1" value={activeVisConfig.depth} onChange={e => updateVisConfig('depth', parseFloat(e.target.value))} className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-[9px] text-slate-400"><span>Thickness</span><span>{activeVisConfig.thickness.toFixed(2)}</span></div>
                            <input type="range" min="0.01" max="0.5" step="0.01" value={activeVisConfig.thickness} onChange={e => updateVisConfig('thickness', parseFloat(e.target.value))} className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
                        </div>
                        <div>
                            <div className="flex justify-between text-[9px] text-slate-400"><span>Speed</span><span>{activeVisConfig.speed.toFixed(1)}x</span></div>
                            <input type="range" min="0.1" max="3" step="0.1" value={activeVisConfig.speed} onChange={e => updateVisConfig('speed', parseFloat(e.target.value))} className="w-full h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-cyan-500"/>
                        </div>
                        <button 
                            onClick={() => setVisConfig(prev => ({...prev, [vizMode]: { scale: vizMode === 'spiral' ? 3.0 : 1.5, depth: vizMode === 'spiral' ? 5.0 : 0.5, thickness: 0.02, speed: 1.0 }}))} 
                            className="w-full mt-2 text-[9px] bg-slate-700 hover:bg-slate-600 text-white py-1 rounded"
                        >
                            Reset {vizMode} Defaults
                        </button>
                    </div>
                </div>
            )}

            {/* Header Controls - Hidden in Fullscreen */}
            {!isFullscreen && (
                <div className="absolute top-0 left-0 right-0 p-4 z-10 bg-gradient-to-b from-black/80 to-transparent flex justify-between items-start">
                    <div>
                        <h1 className="text-xl font-bold text-white tracking-widest">NEURO-AUDIO STUDIO</h1>
                        <div className="text-[10px] text-slate-400 font-mono uppercase mt-1">
                            Status: <span className="text-cyan-400">{statusText}</span>
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 items-end">
                        <div className="flex bg-slate-800 rounded p-1 border border-slate-700">
                            <button onClick={() => setMode('manual')} className={\`px-3 py-1 text-[10px] font-bold rounded \${mode === 'manual' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}>MANUAL</button>
                            <button onClick={() => setMode('neuro')} className={\`px-3 py-1 text-[10px] font-bold rounded flex items-center gap-1 \${mode === 'neuro' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}>
                                <span>NEURO-LINK</span>
                                {mode === 'neuro' && <span className="animate-pulse">●</span>}
                            </button>
                            <button onClick={() => setMode('bio_harmony')} className={\`px-3 py-1 text-[10px] font-bold rounded flex items-center gap-1 \${mode === 'bio_harmony' ? 'bg-green-600 text-white' : 'text-slate-400 hover:text-slate-200'}\`}>
                                <span>BIO-HARMONY</span>
                                {mode === 'bio_harmony' && <span className="animate-pulse">●</span>}
                            </button>
                        </div>
                        <div className="flex gap-2 items-center">
                            <button 
                                onClick={toggleShield}
                                className={\`px-3 py-1 text-[10px] font-bold rounded border transition-colors flex items-center gap-2 \${shield ? 'bg-yellow-900/80 border-yellow-500 text-yellow-200' : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-white'}\`}
                            >
                                <span>MIC SHIELD</span>
                                {shield && (
                                    <div className="w-10 h-1.5 bg-black rounded-full overflow-hidden">
                                        <div className="h-full bg-yellow-500 transition-all duration-100" style={{width: (shieldLevel * 100) + '%'}}></div>
                                    </div>
                                )}
                            </button>
                            
                            {/* SAFETY BUTTON IMPLEMENTATION FOR VISUALS */}
                            <div className="flex bg-slate-800 rounded border border-slate-700 overflow-hidden">
                                 {strobeActive && (
                                    <select 
                                        value={vizMode} 
                                        onChange={e => setVizMode(e.target.value)}
                                        className="bg-slate-900 text-[10px] text-slate-300 outline-none px-1 border-r border-slate-700"
                                    >
                                        <option value="pulse">Pulse</option>
                                        <option value="spiral">Spiral</option>
                                        <option value="flash">Flash</option>
                                    </select>
                                 )}
                                 <button 
                                    onClick={() => setShowVisTuner(!showVisTuner)}
                                    className={\`px-2 border-r border-slate-700 hover:bg-slate-700 transition-colors \${showVisTuner ? 'bg-slate-700 text-white' : 'text-slate-400'}\`}
                                    title="Tune Visuals"
                                 >
                                     <span className="text-[10px]">⚙</span>
                                 </button>
                                 <button 
                                    onClick={() => {
                                        if (strobeActive) {
                                            setStrobeActive(false);
                                            setStrobeConfirm(false);
                                        } else {
                                            if (strobeConfirm) {
                                                setStrobeActive(true);
                                                setStrobeConfirm(false);
                                            } else {
                                                setStrobeConfirm(true);
                                                setTimeout(() => setStrobeConfirm(false), 3000);
                                            }
                                        }
                                    }}
                                    className={\`px-3 py-1 text-[10px] font-bold transition-colors flex items-center gap-2 \${strobeActive ? 'bg-white text-black animate-pulse' : (strobeConfirm ? 'bg-red-600 text-white animate-bounce' : 'text-slate-400 hover:text-white')}\`}
                                >
                                    <span>{strobeConfirm ? 'CONFIRM VISUALS?' : (strobeActive ? 'HYPNOTIC ON' : 'START VISUALS')}</span>
                                </button>
                            </div>
                            <button onClick={toggleFullscreen} className="bg-slate-800 p-1.5 rounded border border-slate-700 text-slate-400 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            {/* Floating Exit Button (Fullscreen Only) */}
            {isFullscreen && (
                <button 
                    onClick={toggleFullscreen} 
                    className="absolute top-4 right-4 z-50 opacity-0 hover:opacity-100 transition-opacity bg-black/50 text-white p-2 rounded border border-white/20 text-xs font-bold tracking-wider"
                >
                    EXIT FULLSCREEN
                </button>
            )}

            {/* Main Vis */}
            <div className="flex-grow relative bg-black">
                <Canvas>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} />
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                    
                    <InstancedTunnel beatHz={realtimeBeat} active={strobeActive} mode={vizMode} scale={vibe} config={activeVisConfig} />
                    
                </Canvas>
            </div>

            {/* Bottom Controls - Hidden in Fullscreen */}
            {!isFullscreen && (
                <div className="absolute bottom-0 left-0 right-0 p-6 z-10 bg-gradient-to-t from-black to-transparent pb-8">
                    <div className="max-w-lg mx-auto space-y-4">
                        
                        {/* Texture Select */}
                        <div className="flex justify-center gap-4 text-[10px] text-slate-400 uppercase font-bold mb-2">
                            <button onClick={() => setTexture('binaural')} className={\`hover:text-white transition-colors \${texture==='binaural'?'text-cyan-400 underline':''}\`}>Pure (Sine)</button>
                            <button onClick={() => setTexture('drone')} className={\`hover:text-white transition-colors \${texture==='drone'?'text-cyan-400 underline':''}\`}>Atmosphere (Drone)</button>
                        </div>

                        {/* Preset Buttons */}
                        <div className="grid grid-cols-3 gap-3">
                            <button onClick={() => applyPreset('focus')} className={\`py-3 rounded-lg border border-slate-700 font-bold text-xs transition-all \${preset === 'focus' ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-900/80 hover:bg-slate-800'}\`}>
                                FOCUS (14Hz)
                            </button>
                            <button onClick={() => applyPreset('relax')} className={\`py-3 rounded-lg border border-slate-700 font-bold text-xs transition-all \${preset === 'relax' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400' : 'bg-slate-900/80 hover:bg-slate-800'}\`}>
                                RELAX (10Hz)
                            </button>
                            <button onClick={() => applyPreset('sleep')} className={\`py-3 rounded-lg border border-slate-700 font-bold text-xs transition-all \${preset === 'sleep' ? 'bg-indigo-500/20 border-indigo-500 text-indigo-400' : 'bg-slate-900/80 hover:bg-slate-800'}\`}>
                                SLEEP (4Hz)
                            </button>
                        </div>
                        
                        {/* Musical Scale Selector */}
                        {texture === 'drone' && (
                            <div className="flex justify-center gap-2 mt-2">
                                {['pentatonic_minor', 'lydian', 'dorian', 'raga', 'major'].map(s => (
                                    <button 
                                        key={s}
                                        onClick={() => setVibe(s)}
                                        className={\`px-2 py-1 rounded text-[9px] uppercase border \${vibe === s && mode !== 'bio_harmony' ? 'bg-white text-black border-white' : 'bg-black/50 text-gray-400 border-gray-700 hover:border-gray-500'}\`}
                                        disabled={mode === 'bio_harmony'}
                                        title={mode === 'bio_harmony' ? 'Controlled by Vision' : 'Select Scale'}
                                    >
                                        {s.replace('_', ' ')}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Mixer */}
                        <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800 grid grid-cols-2 gap-4 mt-2">
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-[9px] font-mono text-slate-400">
                                    <span>BROWN NOISE</span>
                                    <span>{(noise * 100).toFixed(0)}%</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.01" value={noise} onChange={e => setNoise(parseFloat(e.target.value))} className="h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-white"/>
                            </div>
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between text-[9px] font-mono text-slate-400">
                                    <span>LO-FI GROOVE</span>
                                    <span>{(drums * 100).toFixed(0)}%</span>
                                </div>
                                <input type="range" min="0" max="1" step="0.01" value={drums} onChange={e => setDrums(parseFloat(e.target.value))} className="h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-400"/>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
`;

export const NEURO_AUDIO_STUDIO_PROTOCOL: ToolCreatorPayload = {
    name: 'Neuro-Audio Studio (Zero-Hardware)',
    description: 'A professional-grade auditory entrainment suite. Features high-quality Musical Drones (Isochronic Tones) with Generative Harmony, Binaural Beats, and a Lo-Fi Groovebox. Includes "Audio-Visual Entrainment" (AVE) Strobe and Adaptive Sonic Shield. Works instantly without any hardware (Open-Loop), but can optionally connect to an EEG device to enable "Closed-Loop" adaptive training, or use the Camera for "Bio-Harmony" based on emotion.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide immediate value (Focus/Relaxation) via musical entrainment to all users, regardless of hardware ownership.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] }, 
    scientificDossier: {
        title: "Audio-Visual Entrainment (AVE) for Cognitive Enhancement",
        hypothesis: "Combined rhythmic auditory and visual stimulation is more effective at entraining neural oscillations (ASSR + SSVEP) than either modality alone.",
        mechanism: "Synergy of Auditory Steady-State Response (ASSR) and Steady-State Visually Evoked Potential (SSVEP).",
        targetNeuralState: "Variable (Beta for Focus, Alpha for Relax).",
        citations: [
            "Chaieb, L., et al. (2015). Auditory beat stimulation and its effects on cognition and mood states.",
            "Collura, T. F. (2014). Steady-state visual evoked potential (SSVEP) based brain-computer interface.",
            "Siever, D. (2003). Audio-Visual Entrainment: History, Theory, and Clinical Applications."
        ],
        relatedKeywords: ["Binaural Beats", "Isochronic Tones", "ASSR", "SSVEP", "AVE", "Stroboscope", "Ganzfeld"]
    },
    processingCode: `(d, r) => ({})`,
    implementationCode: STUDIO_UI_IMPL
};
