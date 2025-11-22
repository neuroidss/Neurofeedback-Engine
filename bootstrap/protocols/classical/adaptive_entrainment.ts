
// bootstrap/protocols/classical/adaptive_entrainment.ts
import type { ToolCreatorPayload } from '../../../types';

// --- NODE: FOCUS CALCULATOR ---
// Calculates a simple "Focus" metric (Beta / Theta)
const FOCUS_CALC_IMPL = `
    const eeg = inputs['eeg_source_1'];
    
    // Simple simulation if no real data
    let beta = 0.5;
    let theta = 0.5;
    let val = 0.5;

    // If real data exists, we would do FFT here.
    // For this demo node, we simulate based on the raw amplitude.
    // High amplitude fluctuations -> Simulated "Theta" (drowsy)
    // Fast, low amplitude -> Simulated "Beta" (focus)
    
    if (typeof eeg === 'number') {
        // Mock logic: treating the raw normalized input as an "arousal" proxy
        val = eeg; 
    } else {
        // Simulation loop
        const t = Date.now() / 2000;
        val = (Math.sin(t) + 1) / 2; 
    }

    // Map 0-1 input to a Beat Frequency Target
    // If val (Focus) is LOW (< 0.3), we want to boost it -> Target 15Hz (Beta)
    // If val (Focus) is HIGH (> 0.7), we maintain it -> Target 12Hz (SMR)
    // If val is MIDDLE, we guide -> Target 10Hz (Alpha)
    
    let targetBeat = 10; // Default Alpha
    let stateLabel = 'Flow';
    
    if (val < 0.3) {
        targetBeat = 18; // Beta (Alertness)
        stateLabel = 'Boosting Alertness';
    } else if (val > 0.7) {
        targetBeat = 7.83; // Schumann (Grounding)
        stateLabel = 'Grounding High Energy';
    } else {
        targetBeat = 12; // SMR (Calm Focus)
        stateLabel = 'Maintaining SMR';
    }

    bus.publish({
        type: 'System',
        sourceId: 'entrainment_logic',
        payload: { visualUpdate: { textOverlay: stateLabel + ' (' + targetBeat + 'Hz)' } }
    });

    return { output: targetBeat };
`;

const UI_IMPL = `
    const { useState, useEffect, useRef } = React;
    
    // 1. Init Graph
    useEffect(() => {
        if (!runtime.streamEngine) return;
        
        const deploy = async () => {
            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph({ id: 'entrainment_graph', nodes: {}, edges: [] });
            
            // Source: EEG
            await runtime.tools.run('Create_EEG_Source', { 
                nodeId: 'eeg_source_1', 
                channel: 'Fz', 
                config: { simulationRange: [0.1, 0.9], simulationFrequencyHz: 0.2 }
            });
            
            // Transform: Calculate Target Beat
            await runtime.tools.run('Create_Filter_Node', {
                nodeId: 'calc_beat',
                inputNodeIds: ['eeg_source_1'],
                jsLogic: ${JSON.stringify(FOCUS_CALC_IMPL)}
            });
            
            // Sink: Audio Synthesizer
            await runtime.tools.run('Create_Audio_Synthesizer', {
                nodeId: 'audio_out',
                inputNodeId: 'calc_beat',
                carrierHz: 200
            });
            
            // Sink: Visuals
            await runtime.tools.run('Bind_To_Visuals', {
                nodeId: 'viz_int',
                inputNodeId: 'eeg_source_1',
                parameter: 'intensity'
            });
            
            runtime.streamEngine.start();
        };
        deploy();
        return () => runtime.streamEngine.stop();
    }, []);

    // 2. UI State
    const [audioState, setAudioState] = useState({ carrier: 200, beat: 10, active: false });
    const [label, setLabel] = useState('Initializing...');
    
    useEffect(() => {
        const interval = setInterval(() => {
            if (runtime.streamEngine) {
                const debug = runtime.streamEngine.getDebugState();
                const audioNode = debug.nodes.find(n => n.id === 'audio_out');
                if (audioNode && audioNode.value) {
                    setAudioState(audioNode.value);
                }
            }
        }, 100);
        
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System' && f.payload?.visualUpdate?.textOverlay) {
                setLabel(f.payload.visualUpdate.textOverlay);
            }
        });
        
        return () => { clearInterval(interval); unsub(); };
    }, []);

    // 3. Visuals
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    if (!R3F || !Drei) return <div>Loading 3D...</div>;
    const { Canvas, useFrame } = R3F;
    const { Sphere, MeshDistortMaterial } = Drei;

    const PulsingBrain = ({ beat }) => {
        const ref = useRef();
        useFrame((state) => {
            if (ref.current) {
                // Pulse at the beat frequency
                const t = state.clock.getElapsedTime();
                const pulse = Math.sin(t * beat * Math.PI * 2); // Actual Hz speed
                const scale = 1 + pulse * 0.05;
                ref.current.scale.set(scale, scale, scale);
                ref.current.distort = 0.3 + pulse * 0.1;
            }
        });
        return (
            <Sphere args={[1.5, 64, 64]} ref={ref}>
                <MeshDistortMaterial color="#a855f7" speed={2} distort={0.4} radius={1} />
            </Sphere>
        );
    };

    return (
        <div className="w-full h-full bg-black relative flex flex-col items-center justify-center">
            <div className="absolute top-4 left-0 right-0 text-center z-10">
                <h2 className="text-xl font-bold text-purple-400 mb-1">ADAPTIVE ENTRAINMENT</h2>
                <p className="text-xs text-gray-400">CLOSED-LOOP BINAURAL BEATS</p>
            </div>
            
            <div className="absolute bottom-8 left-0 right-0 text-center z-10">
                <div className="text-2xl font-mono text-white font-bold mb-2">{label}</div>
                <div className="text-xs text-purple-300 font-mono">
                    L: {audioState.carrier}Hz | R: {(audioState.carrier + audioState.beat).toFixed(2)}Hz | Beat: {audioState.beat.toFixed(2)}Hz
                </div>
                
                {!audioState.active && (
                    <div className="mt-4 animate-bounce text-yellow-400 text-xs">
                        Audio Engine Paused. Click anywhere or interact to resume.
                    </div>
                )}
            </div>

            <Canvas>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <PulsingBrain beat={audioState.beat} />
            </Canvas>
        </div>
    );
`;

export const ADAPTIVE_ENTRAINMENT_PROTOCOL: ToolCreatorPayload = {
    name: 'Adaptive Focus Entrainment',
    description: 'A "Closed-Loop" version of Brain.fm. Uses real-time EEG (or simulation) to measure your focus level. If you get distracted, it increases the Binaural Beat frequency to Beta (Alertness). If you are too stressed, it lowers it to Alpha (Calm).',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate auditory neurofeedback that adapts to the user state, unlike static YouTube videos or playlists.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Runtime data.', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: ['Fz'], metrics: ['focus'] },
    scientificDossier: {
        title: "Closed-Loop Auditory Beat Stimulation (CL-ABS)",
        hypothesis: "Dynamically adjusting binaural beat frequency based on real-time EEG feedback is more effective than static entrainment for maintaining optimal attention states.",
        mechanism: "Auditory Steady-State Response (ASSR) via carrier frequency modulation.",
        targetNeuralState: "SMR (12-15Hz) for relaxed focus.",
        citations: ["Lane, J. D., et al. (1998). Binaural auditory beats affect vigilance performance and mood.", "Chaieb, L., et al. (2015). Auditory beat stimulation and its effects on cognition and mood states."],
        relatedKeywords: ["Binaural Beats", "Entrainment", "ASSR", "Closed-loop"]
    },
    processingCode: `(d, r) => ({})`, // Logic is in the graph
    implementationCode: UI_IMPL
};
