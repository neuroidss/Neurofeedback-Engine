
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
            visualUpdate: { textOverlay: feedbackStr, intensity: (targetBeat / 30) },
            debug: { shieldLevel } 
        }
    });

    // Output dynamic noise volume to override the slider setting in the synth
    return { output: { beat: targetBeat, scale: targetScale, noise: targetNoise }, state };
`;

const STUDIO_UI_IMPL = `
    const { useState, useEffect, useRef } = React;
    
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
                musicalScale: 'pentatonic_minor'
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
    
    // Presets
    const PRESETS = {
        focus: { beat: 14, carrier: 200, defaultVibe: 'pentatonic_minor' },
        relax: { beat: 10, carrier: 130, defaultVibe: 'dorian' },
        sleep: { beat: 4, carrier: 80, defaultVibe: 'raga' }
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

    // Update Graph Config
    useEffect(() => {
        if (!runtime.streamEngine) return;
        
        const beat = PRESETS[preset].beat;
        
        // Update Controller
        runtime.streamEngine.updateNodeConfig('controller', {
            manualTarget: beat,
            mode: mode,
            enableShield: shield,
            baseNoise: noise // Pass slider value to controller
        });
        
        // Update Audio Engine
        // Note: Controller output overrides 'noiseVolume' if dynamic updates occur, 
        // but we set defaults here for init.
        runtime.streamEngine.updateNodeConfig('audio_out', {
            carrierHz: PRESETS[preset].carrier,
            synthType: texture,
            enableDrums: drums > 0.05,
            drumVolume: drums,
            musicalScale: vibe
        });
        
    }, [mode, preset, noise, drums, texture, vibe, shield]);

    // --- 3. Visualization State ---
    const [statusText, setStatusText] = useState('Ready');
    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System') {
                if (f.payload?.visualUpdate?.textOverlay) {
                    setStatusText(f.payload.visualUpdate.textOverlay);
                }
                if (f.payload?.debug?.shieldLevel !== undefined) {
                    setShieldLevel(f.payload.debug.shieldLevel);
                }
            }
        });
        return unsub;
    }, []);

    // --- 4. 3D Render ---
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    if (!R3F || !Drei) return <div>Loading 3D...</div>;
    const { Canvas, useFrame } = R3F;
    const { Sphere, MeshDistortMaterial, Float, Stars } = Drei;

    const Emitter = ({ preset, texture }) => {
        const ref = useRef();
        useFrame((state) => {
            if(ref.current) {
                const t = state.clock.getElapsedTime();
                const speed = preset === 'focus' ? 2 : preset === 'relax' ? 1 : 0.2;
                const amp = texture === 'drone' ? 0.4 : 0.1;
                ref.current.distort = 0.3 + Math.sin(t * speed) * amp;
            }
        });
        const color = preset === 'focus' ? '#fbbf24' : preset === 'relax' ? '#22d3ee' : '#818cf8';
        return (
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                <Sphere args={[1.8, 64, 64]} ref={ref}>
                    <MeshDistortMaterial color={color} speed={2} distort={0.4} radius={1} />
                </Sphere>
            </Float>
        );
    };

    return (
        <div className="w-full h-full bg-slate-950 relative font-sans text-slate-200 flex flex-col">
            {/* Header Controls */}
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
                </div>
            </div>

            {/* Main Vis */}
            <div className="flex-grow relative">
                <Canvas>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} />
                    <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                    <Emitter preset={preset} texture={texture} />
                </Canvas>
            </div>

            {/* Bottom Controls */}
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
        </div>
    );
`;

export const NEURO_AUDIO_STUDIO_PROTOCOL: ToolCreatorPayload = {
    name: 'Neuro-Audio Studio (Zero-Hardware)',
    description: 'A professional-grade auditory entrainment suite. Features high-quality Musical Drones (Isochronic Tones) with Generative Harmony, Binaural Beats, and a Lo-Fi Groovebox. Works instantly without any hardware (Open-Loop), but can optionally connect to an EEG device to enable "Closed-Loop" adaptive training, or use the Camera for "Bio-Harmony" based on emotion.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide immediate value (Focus/Relaxation) via musical entrainment to all users, regardless of hardware ownership.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] }, 
    scientificDossier: {
        title: "Auditory Beat Stimulation (ABS) for Cognitive Enhancement",
        hypothesis: "Rhythmic auditory stimulation can entrain neural oscillations to specific frequencies (ASSR).",
        mechanism: "ASSR via Binaural and Isochronic tones.",
        targetNeuralState: "Variable (Beta for Focus, Alpha for Relax).",
        citations: [
            "Chaieb, L., et al. (2015). Auditory beat stimulation and its effects on cognition and mood states.",
            "Lane, J. D., et al. (1998). Binaural auditory beats affect vigilance performance and mood.",
            "Reuter, K., et al. (2012). Auditory masking and attention."
        ],
        relatedKeywords: ["Binaural Beats", "Isochronic Tones", "ASSR", "Generative Music", "Auditory Masking"]
    },
    processingCode: `(d, r) => ({})`,
    implementationCode: STUDIO_UI_IMPL
};
