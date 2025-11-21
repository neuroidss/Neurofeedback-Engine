
import type { ToolCreatorPayload } from '../../../types';

// --- NODE IMPLEMENTATION: AFFECTIVE COMPUTING (VAD) ---
const AFFECTIVE_NODE_IMPL = `
    const visionFrame = inputs['vision_source_1'];
    
    // Initialize persistent state for temporal integration (Smoothing)
    // VAD Range: 1.0 to 9.0 (SAM Scale)
    if (state.v === undefined) state.v = 5.0;
    if (state.a === undefined) state.a = 1.0;
    if (state.d === undefined) state.d = 5.0;

    // Smoothing Factor (Alpha): Lower = Smoother/Slower
    const alpha = 0.1;

    if (visionFrame && visionFrame.raw) {
        const shapes = visionFrame.raw;
        const getAU = (name) => shapes.find(s => s.categoryName === name)?.score || 0;

        // --- SCIENTIFIC MEASUREMENT: FACS to VAD Mapping ---
        // Ref: Mehrabian (1996) PAD Model & Ekman's FACS
        // Scale: 1.0 to 9.0 (SAM - Self Assessment Manikin standard)
        
        // Valence (Pleasure-Displeasure):
        // Positive: AU12 (Zygomaticus/Smile) + AU6 (Orbicularis/Cheek - Duchenne marker)
        // Negative: AU4 (Corrugator/Frown) + AU15 (Depressor Anguli/Sad) + AU9 (Levator Labii/Disgust)
        const au12 = (getAU('mouthSmileLeft') + getAU('mouthSmileRight')) / 2;
        const au6 = (getAU('cheekSquintLeft') + getAU('cheekSquintRight')) / 2;
        const au4 = (getAU('browDownLeft') + getAU('browDownRight')) / 2;
        const au15 = (getAU('mouthFrownLeft') + getAU('mouthFrownRight')) / 2;
        const au9 = (getAU('noseSneerLeft') + getAU('noseSneerRight')) / 2;
        
        // Formula: Base 5 + Positive - Negative
        // Multipliers tuned to map 0-1 AU range to +/- 4 deviation on SAM scale
        let rawValence = 5.0 + ((au12 * 0.7 + au6 * 0.3) * 4.0) - ((au4 * 0.4 + au15 * 0.3 + au9 * 0.3) * 4.0);

        // Arousal (Activation Energy):
        // High: AU5 (Upper Lid Raise/Surprise) + AU26/27 (Jaw Drop) + AU1+2 (Brow Raise)
        const au5 = (getAU('eyeWideLeft') + getAU('eyeWideRight')) / 2;
        const au26 = getAU('jawOpen');
        const au1 = (getAU('browInnerUp') + getAU('browOuterUpLeft') + getAU('browOuterUpRight')) / 3;
        
        let rawArousal = 2.0 + ((au5 + au26 + au1) * 2.5);
        // Add reactivity component from valence intensity
        rawArousal += Math.abs(rawValence - 5.0) * 0.3;

        // Dominance (Control vs Submission):
        // High: Head Pitch Up (Chin up) + AU4 (Anger/Determination)
        // Low: Head Pitch Down + AU1 (Inner Brow/Fear)
        
        let headPitch = 0;
        if (visionFrame.matrix) {
             // Extract pitch approx from matrix
             // MediaPipe matrix is column-major flat array
             headPitch = -visionFrame.matrix[5] * 2.0; // Approximation
        }
        
        let rawDominance = 5.0;
        rawDominance -= (headPitch * 4.0); // Chin up (neg pitch) -> Increases Dominance
        rawDominance += (au4 * 2.0); // Anger -> Dominance
        rawDominance -= (au1 * 3.0); // Fear -> Submission

        // --- TEMPORAL INTEGRATION (Low-Pass Filter) ---
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        
        state.v = (alpha * clamp(rawValence, 1, 9)) + ((1 - alpha) * state.v);
        state.a = (alpha * clamp(rawArousal, 1, 9)) + ((1 - alpha) * state.a);
        state.d = (alpha * clamp(rawDominance, 1, 9)) + ((1 - alpha) * state.d);
    }

    return { 
        output: { 
            v: state.v, 
            a: state.a, 
            d: state.d 
        },
        state 
    };
`;

// --- NODE IMPLEMENTATION: GAZE TRACKING ---
// Calculates convergence point in 3D space using Vector math
const GAZE_NODE_IMPL = `
    const frame = inputs['vision_source_1'];
    const THREE = window.THREE;
    
    // Initialize state
    if (!state.x) state.x = 0;
    if (!state.y) state.y = 0;
    if (!state.z) state.z = 5;
    
    // Gaze smoothing factor (eyes jitter a lot)
    const alpha = 0.15; 

    if (frame && frame.raw && THREE) {
        const getAU = (name) => frame.raw.find(s => s.categoryName === name)?.score || 0;

        const lX = getAU('eyeLookInLeft') - getAU('eyeLookOutLeft');
        const lY = getAU('eyeLookUpLeft') - getAU('eyeLookDownLeft');
        const rX = getAU('eyeLookOutRight') - getAU('eyeLookInRight');
        const rY = getAU('eyeLookUpRight') - getAU('eyeLookDownRight');

        const leftDir = new THREE.Vector3(0, 0, 1);
        leftDir.applyEuler(new THREE.Euler(-lY, -lX, 0));
        
        const rightDir = new THREE.Vector3(0, 0, 1);
        rightDir.applyEuler(new THREE.Euler(-rY, rX, 0)); 
        
        const avgDir = new THREE.Vector3().addVectors(leftDir, rightDir).normalize();
        const squintFactor = Math.abs(lX + rX); 
        const dist = 8 - (squintFactor * 10); 
        const target = avgDir.multiplyScalar(Math.max(1, dist));
        
        // Smooth the coordinates
        state.x = (alpha * target.x) + ((1 - alpha) * state.x);
        state.y = (alpha * target.y) + ((1 - alpha) * state.y);
        state.z = (alpha * target.z) + ((1 - alpha) * state.z);
    }

    const result = { x: state.x, y: state.y, z: state.z };

    bus.publish({
        type: 'System',
        sourceId: 'gaze_processor',
        payload: { visualUpdate: { gaze: result } }
    });

    return { output: result, state };
`;

// --- NODE IMPLEMENTATION: BLINK DETECTOR ---
const BLINK_NODE_IMPL = `
    const frame = inputs['vision_source_1'];
    let blink = { l: 0, r: 0 };
    
    if (frame && frame.raw) {
        const getAU = (name) => frame.raw.find(s => s.categoryName === name)?.score || 0;
        blink = {
            l: getAU('eyeBlinkLeft'),
            r: getAU('eyeBlinkRight')
        };
    }
    
    bus.publish({
        type: 'System',
        sourceId: 'blink_processor',
        payload: { visualUpdate: { blink: blink } }
    });
    
    return { output: blink };
`;

// --- NODE IMPLEMENTATION: COLOR MAPPER ---
const COLOR_MAPPER_IMPL = `
    const vad = inputs['affective_processor'];
    if (!vad) return { output: '#888888' };

    // Input is SAM Scale (1-9). Normalize to 0-1.
    const v = (vad.v - 1) / 8; 
    
    // Clamp for safety
    const norm = Math.max(0, Math.min(1, v));
    
    // Continuous Hue Mapping (Scientific Spectrum)
    // 0.0 (Negative/Distress) -> 0 deg (Red)
    // 0.5 (Neutral) -> 60 deg (Yellow)
    // 1.0 (Positive/Flow) -> 120 deg (Green)
    const hue = norm * 120; 
    
    // Generate High-Precision Color String
    const color = \`hsl(\${hue.toFixed(2)}, 100%, 50%)\`;
    
    bus.publish({
        type: 'System',
        sourceId: 'mapper_color',
        payload: { visualUpdate: { globalColor: color } }
    });

    return { output: color };
`;

// --- NODE IMPLEMENTATION: INTENSITY MAPPER ---
const INTENSITY_MAPPER_IMPL = `
    const vad = inputs['affective_processor'];
    if (!vad) return { output: 0 };

    // Input is SAM Scale (1-9). Normalize to 0-1.
    const a = (vad.a - 1) / 8;
    
    // Map Arousal (0 to 1.0) to Intensity
    // Allow for slight overdrive to show high energy states
    let intensity = a * 2.0; 
    
    // Soft clamp
    intensity = Math.max(0, Math.min(1.5, intensity));

    bus.publish({
        type: 'System',
        sourceId: 'mapper_intensity',
        payload: { visualUpdate: { intensity: intensity } }
    });

    return { output: intensity };
`;

const GRAPH_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    
    // --- 1. Define the Topology ---
    const nodesToAdd = [
        // PROCESSING TIER
        {
            id: 'affective_processor',
            type: 'Transform',
            implementation: ${JSON.stringify(AFFECTIVE_NODE_IMPL)},
            config: {}, state: {}, inputs: ['vision_source_1']
        },
        {
            id: 'gaze_processor',
            type: 'Transform',
            implementation: ${JSON.stringify(GAZE_NODE_IMPL)},
            config: {}, state: {}, inputs: ['vision_source_1']
        },
        {
            id: 'blink_processor',
            type: 'Transform',
            implementation: ${JSON.stringify(BLINK_NODE_IMPL)},
            config: {}, state: {}, inputs: ['vision_source_1']
        },
        
        // MAPPING TIER
        {
            id: 'map_color',
            type: 'Sink',
            implementation: ${JSON.stringify(COLOR_MAPPER_IMPL)},
            config: {}, state: {}, inputs: ['affective_processor']
        },
        {
            id: 'map_intensity',
            type: 'Sink',
            implementation: ${JSON.stringify(INTENSITY_MAPPER_IMPL)},
            config: {}, state: {}, inputs: ['affective_processor']
        }
    ];

    // --- 2. Engine Lifecycle ---
    const [nodes, setNodes] = useState([]);
    
    useEffect(() => {
        if (!runtime.streamEngine) return;

        runtime.logEvent('[Graph V2] Hydrating Advanced Vision Graph...');
        
        runtime.tools.run('Create_Vision_Source', {}).then(() => {
             nodesToAdd.forEach(node => runtime.streamEngine.addNode(node));
             runtime.streamEngine.connectNodes('vision_source_1', 'affective_processor');
             runtime.streamEngine.connectNodes('vision_source_1', 'gaze_processor');
             runtime.streamEngine.connectNodes('vision_source_1', 'blink_processor');
             
             runtime.streamEngine.connectNodes('affective_processor', 'map_color');
             runtime.streamEngine.connectNodes('affective_processor', 'map_intensity');
             
             runtime.streamEngine.start();
        });

        const interval = setInterval(() => {
             if(runtime.streamEngine && runtime.streamEngine.getDebugState) {
                 setNodes(runtime.streamEngine.getDebugState().nodes);
             }
        }, 100);
        
        return () => {
            clearInterval(interval);
        };
    }, []);

    // --- 3. R3F Visuals ---
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    if (!R3F || !Drei) return <div>Loading 3D...</div>;
    const { Canvas, useFrame } = R3F;
    const { TorusKnot, Environment, Float, ContactShadows, Sphere } = Drei;

    // A sub-component that uses the graph data to animate
    const CyberFace = () => {
        const meshRef = useRef();
        const leftEyeRef = useRef();
        const rightEyeRef = useRef();
        const targetRef = useRef();
        
        const [visualState, setVisualState] = useState({ 
            globalColor: '#888', 
            intensity: 0,
            gaze: {x:0,y:0,z:5},
            blink: {l:0, r:0}
        });

        useEffect(() => {
            const unsub = runtime.neuroBus.subscribe(f => {
                if (f.type === 'System' && f.payload?.visualUpdate) {
                    setVisualState(prev => ({...prev, ...f.payload.visualUpdate}));
                }
            });
            return unsub;
        }, []);

        useFrame((state, delta) => {
            // Smooth Lerp for visual stability (Final render smoothing)
            if(meshRef.current) {
                meshRef.current.rotation.x += delta * (0.1 + visualState.intensity);
                meshRef.current.rotation.y += delta * (0.2 + visualState.intensity);
                const scale = 1 + visualState.intensity * 0.3;
                meshRef.current.scale.lerp({ x: scale, y: scale, z: scale }, 0.1);
            }
            
            if (targetRef.current) {
                targetRef.current.position.lerp(visualState.gaze, 0.2);
            }
            
            if (leftEyeRef.current && targetRef.current) {
                leftEyeRef.current.lookAt(targetRef.current.position);
                // Blink scaling (flatten on Y)
                const openL = Math.max(0.1, 1 - (visualState.blink?.l || 0));
                leftEyeRef.current.scale.set(1, openL, 1);
            }
            
            if (rightEyeRef.current && targetRef.current) {
                rightEyeRef.current.lookAt(targetRef.current.position);
                const openR = Math.max(0.1, 1 - (visualState.blink?.r || 0));
                rightEyeRef.current.scale.set(1, openR, 1);
            }
        });

        return (
            <group>
                <Float rotationIntensity={0.2} floatIntensity={0.5}>
                    {/* The Brain / Core */}
                    <TorusKnot args={[0.8, 0.25, 128, 32]} ref={meshRef}>
                        <meshStandardMaterial 
                            color={visualState.globalColor} 
                            roughness={0.2} 
                            metalness={0.8}
                            emissive={visualState.globalColor}
                            emissiveIntensity={visualState.intensity * 1.5}
                        />
                    </TorusKnot>
                    
                    {/* Cyber Eyes */}
                    <group position={[-0.5, 0.5, 0.8]}>
                        <group ref={leftEyeRef}>
                            <Sphere args={[0.15, 32, 32]}>
                                <meshStandardMaterial color="white" />
                            </Sphere>
                            <Sphere args={[0.05, 32, 32]} position={[0,0,0.12]}>
                                <meshStandardMaterial color="black" />
                            </Sphere>
                        </group>
                    </group>
                    
                    <group position={[0.5, 0.5, 0.8]}>
                        <group ref={rightEyeRef}>
                            <Sphere args={[0.15, 32, 32]}>
                                <meshStandardMaterial color="white" />
                            </Sphere>
                            <Sphere args={[0.05, 32, 32]} position={[0,0,0.12]}>
                                <meshStandardMaterial color="black" />
                            </Sphere>
                        </group>
                    </group>
                </Float>
                
                {/* Gaze Target Visualization */}
                <group ref={targetRef}>
                    <Sphere args={[0.05, 16, 16]}>
                        <meshBasicMaterial color="red" transparent opacity={0.5} />
                    </Sphere>
                </group>
            </group>
        );
    };

    return (
        <div className="w-full h-full relative bg-gray-900">
            {/* Enhanced Graph Overlay */}
            <div className="absolute top-4 left-4 z-10 bg-black/70 p-3 rounded-lg text-[10px] font-mono text-green-400 border border-green-500/30 shadow-lg backdrop-blur-sm max-h-[90%] overflow-y-auto custom-scrollbar max-w-[300px]">
                <div className="font-bold mb-2 text-xs border-b border-green-800 pb-1">ACTIVE GRAPH TOPOLOGY (V2)</div>
                <div className="space-y-2">
                    {nodes.map(n => (
                        <div key={n.id} className="flex flex-col border-l-2 border-green-800 pl-2">
                            <div className="flex justify-between text-gray-300 mb-0.5">
                                <span className="font-bold">{n.id}</span>
                                <span className="text-[9px] text-gray-500 uppercase">{n.type}</span>
                            </div>
                            <div className="text-cyan-300 break-all bg-black/40 p-1 rounded text-[9px]">
                                {typeof n.value === 'object' && n.value !== null 
                                    ? JSON.stringify(n.value, (k,v) => typeof v === 'number' ? parseFloat(v.toFixed(2)) : v).substring(0, 100) 
                                    : String(n.value)
                                }
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                <color attach="background" args={['#0a0a0a']} />
                <Environment preset="city" />
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} />
                <CyberFace />
                <ContactShadows position={[0, -2, 0]} opacity={0.5} scale={10} blur={2} far={4.5} />
            </Canvas>
        </div>
    );
`;

export const CAMERA_BIOFEEDBACK_GRAPH_PROTOCOL: ToolCreatorPayload = {
    name: 'Camera Biofeedback V2 (Graph)',
    description: 'Graph-based version of the Camera Biofeedback tool. Uses the Stream Engine to process Gaze, Blinking, and Emotion (VAD) via discrete graph nodes. Demonstrates a "microservices" approach to biofeedback where each biological signal is processed by a specialized node.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To validate complex graph topologies with multiple concurrent data streams (Gaze, Blink, Affect).',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Data from the runtime.', required: false },
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: true }
    ],
    scientificDossier: {
        title: "Real-time Affective Computing via Facial Action Coding System (FACS)",
        hypothesis: "Emotional states (Valence, Arousal, Dominance) can be inferred from specific combinations of facial muscle movements (Action Units) derived from computer vision.",
        mechanism: "Mapping Action Units to the PAD (Pleasure-Arousal-Dominance) emotional state model.",
        targetNeuralState: "Self-awareness of emotional expression.",
        citations: [
            "Mehrabian, A. (1996). Pleasure-arousal-dominance: A general framework for describing and measuring individual differences in temperament. Current Psychology.",
            "Ekman, P., & Friesen, W. V. (1978). Facial Action Coding System: A Technique for the Measurement of Facial Movement.",
            "Russell, J. A. (1980). A circumplex model of affect. Journal of personality and social psychology."
        ],
        relatedKeywords: ["Affective Computing", "FACS", "VAD Model", "Computer Vision", "Emotion AI"]
    },
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d, r) => ({})`,
    implementationCode: GRAPH_UI_IMPL
};
