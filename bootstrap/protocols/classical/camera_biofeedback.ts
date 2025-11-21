
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

const CAMERA_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;
    
    if (!R3F || !Drei || !THREE) return <div className="text-white p-4">Loading 3D Engine...</div>;

    const { Canvas, useFrame } = R3F;
    const { Float, OrbitControls, Grid, Line, Text, Sphere } = Drei;

    // --- State ---
    const [visionData, setVisionData] = useState(null);
    const [status, setStatus] = useState('Idle');
    
    // Processing Pipeline State
    const [metrics, setMetrics] = useState({ 
        rawShapes: [],
        headRotation: { x: 0, y: 0, z: 0 },
        gaze: { 
            left: { x: 0, y: 0 }, 
            right: { x: 0, y: 0 },
            convergence: { x: 0, y: 0, z: 5 }, // Default focus distance
            distance: 0
        },
        vad: { v: 5, a: 1, d: 5 }, // SAM Scale 1-9
        blink: { l: 0, r: 0 },
        smile: 0
    });
    
    const videoRef = useRef(null);
    const lastUpdateRef = useRef(Date.now());
    const initRef = useRef(false);

    // --- Bus Subscription ---
    useEffect(() => {
        if (!runtime || !runtime.neuroBus) return;
        
        const handleFrame = (frame) => {
            if (frame.type === 'Vision') {
                setVisionData(frame.payload);
                lastUpdateRef.current = Date.now();
                setStatus('Receiving Data');
            }
        };
        const unsub = runtime.neuroBus.subscribe(handleFrame);
        
        if (!initRef.current) {
            initRef.current = true;
            console.log("[CameraProtocol] Initializing Vision Source...");
            runtime.tools.run('Create_Vision_Source', {})
                .then(() => setStatus('Camera Initialized'))
                .catch(e => {
                    console.error(e);
                    setStatus('Camera Error: ' + e.message);
                });
        }

        return () => unsub();
    }, []); 

    // --- SCIENTIFIC SIGNAL PROCESSOR LOOP (60fps) ---
    useEffect(() => {
        let animationFrame;
        
        // Helper: Ray-Ray Intersection for Gaze Convergence
        const calculateConvergence = (p1, v1, p2, v2) => {
            // p1, p2: Origin points (Vector3)
            // v1, v2: Direction vectors (Vector3, normalized)
            // Find closest point between two skew lines
            
            const p1p2 = new THREE.Vector3().subVectors(p2, p1);
            const d1343 = p1p2.dot(v2);
            const d4321 = p1p2.dot(v1);
            const d1321 = p1p2.dot(v1);
            const d4343 = v2.dot(v2);
            const d2121 = v1.dot(v1);
            
            const denom = d2121 * d4343 - d4321 * d4321;
            if (Math.abs(denom) < 0.0001) return new THREE.Vector3(0, 0, 5); // Parallel lines
            
            const numer = d1343 * d4321 - d1321 * d4343;
            const mua = numer / denom;
            const mub = (d1343 + d4321 * mua) / d4343;
            
            const pa = new THREE.Vector3().copy(p1).add(v1.clone().multiplyScalar(mua));
            const pb = new THREE.Vector3().copy(p2).add(v2.clone().multiplyScalar(mub));
            
            return new THREE.Vector3().addVectors(pa, pb).multiplyScalar(0.5); // Midpoint
        };

        const loop = () => {
            const now = Date.now();
            const isStale = (now - lastUpdateRef.current) > 1000;
            
            const currentShapes = (isStale || !visionData) ? [] : (visionData.raw || []);
            const matrixData = (isStale || !visionData) ? null : visionData.matrix;

            // Helper: Robust shape access (0.0 to 1.0)
            const getAU = (name) => currentShapes.find(s => s.categoryName === name)?.score || 0;

            // 1. Head Pose Extraction
            let rotation = { x: 0, y: 0, z: 0 };
            if (matrixData) {
                try {
                    const mat = new THREE.Matrix4().fromArray(matrixData);
                    const rot = new THREE.Euler().setFromRotationMatrix(mat);
                    rotation = { x: rot.x, y: rot.y, z: rot.z }; 
                } catch(e) {}
            }

            // 2. Gaze Tracking Calculation (Eye Lasers & Convergence)
            const lLookIn = getAU('eyeLookInLeft');
            const lLookOut = getAU('eyeLookOutLeft');
            const lLookUp = getAU('eyeLookUpLeft');
            const lLookDown = getAU('eyeLookDownLeft');
            
            const rLookIn = getAU('eyeLookInRight');
            const rLookOut = getAU('eyeLookOutRight');
            const rLookUp = getAU('eyeLookUpRight');
            const rLookDown = getAU('eyeLookDownRight');

            const gazeLeftX = lLookIn - lLookOut; 
            const gazeLeftY = lLookUp - lLookDown; 
            const gazeRightX = rLookOut - rLookIn; 
            const gazeRightY = rLookUp - rLookDown;
            
            const leftOrigin = new THREE.Vector3(-0.35, 0.2, 0.6);
            const rightOrigin = new THREE.Vector3(0.35, 0.2, 0.6);
            
            const leftDir = new THREE.Vector3(0, 0, 1);
            leftDir.applyEuler(new THREE.Euler(-gazeLeftY, -gazeLeftX, 0));
            
            const rightDir = new THREE.Vector3(0, 0, 1);
            rightDir.applyEuler(new THREE.Euler(-gazeRightY, gazeRightX, 0)); 
            
            const convergencePoint = calculateConvergence(leftOrigin, leftDir, rightOrigin, rightDir);
            if (convergencePoint.z < 1) convergencePoint.z = 1;
            
            const distance = convergencePoint.length();

            // 3. SCIENTIFIC VAD CALCULATION based on FACS
            // Ref: Mehrabian (1996) PAD Model & Ekman's FACS
            // Scale: 1.0 to 9.0 (SAM - Self Assessment Manikin standard)

            // --- Valence (Pleasure vs Displeasure) ---
            // Positive: AU12 (Zygomaticus/Smile) + AU6 (Orbicularis/Cheek - Duchenne marker)
            // Negative: AU4 (Corrugator/Frown) + AU15 (Depressor Anguli/Sad) + AU9 (Levator Labii/Disgust)
            const au12 = (getAU('mouthSmileLeft') + getAU('mouthSmileRight')) / 2;
            const au6 = (getAU('cheekSquintLeft') + getAU('cheekSquintRight')) / 2;
            const au4 = (getAU('browDownLeft') + getAU('browDownRight')) / 2;
            const au15 = (getAU('mouthFrownLeft') + getAU('mouthFrownRight')) / 2;
            const au9 = (getAU('noseSneerLeft') + getAU('noseSneerRight')) / 2;
            
            // Formula: Base 5 + Positive - Negative
            let rawValence = 5.0 + ((au12 * 0.7 + au6 * 0.3) * 4.0) - ((au4 * 0.4 + au15 * 0.3 + au9 * 0.3) * 4.0);
            
            // --- Arousal (Activation Energy) ---
            // High: AU5 (Upper Lid Raise/Surprise) + AU26/27 (Jaw Drop) + AU1+2 (Brow Raise)
            // Low: AU43 (Eyes Closed/Sleepy) implies low arousal
            const au5 = (getAU('eyeWideLeft') + getAU('eyeWideRight')) / 2;
            const au26 = getAU('jawOpen');
            const au1 = (getAU('browInnerUp') + getAU('browOuterUpLeft') + getAU('browOuterUpRight')) / 3;
            
            let rawArousal = 2.0 + ((au5 + au26 + au1) * 2.5);
            // Add reactivity component from valence intensity
            rawArousal += Math.abs(rawValence - 5.0) * 0.3;

            // --- Dominance (Control vs Submission) ---
            // High: Head Pitch Up (Chin up) + Direct Gaze (implied by low x/y deviation) + AU4 (Anger/Determination)
            // Low: Head Pitch Down + AU1 (Inner Brow/Fear) + AU15 (Sadness)
            const headPitch = rotation.x; // Positive = Down, Negative = Up (in ThreeJS usually)
            // Note: Check rotation sign from matrix. Usually pitch down is positive X in camera space.
            
            let rawDominance = 5.0;
            rawDominance -= (headPitch * 4.0); // Chin up (neg pitch) -> Increases Dominance
            rawDominance += (au4 * 2.0); // Anger -> Dominance
            rawDominance -= (au1 * 3.0); // Fear -> Submission
            
            // 4. Update State (Smoothing)
            setMetrics(prev => {
                const smooth = (curr, prevVal, alpha=0.1) => prevVal + (curr - prevVal) * alpha;
                const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

                return {
                    rawShapes: currentShapes,
                    headRotation: {
                        x: smooth(rotation.x, prev.headRotation.x),
                        y: smooth(rotation.y, prev.headRotation.y),
                        z: smooth(rotation.z, prev.headRotation.z)
                    },
                    gaze: {
                        left: { x: smooth(gazeLeftX, prev.gaze.left.x, 0.2), y: smooth(gazeLeftY, prev.gaze.left.y, 0.2) },
                        right: { x: smooth(gazeRightX, prev.gaze.right.x, 0.2), y: smooth(gazeRightY, prev.gaze.right.y, 0.2) },
                        convergence: {
                            x: smooth(convergencePoint.x, prev.gaze.convergence.x, 0.1),
                            y: smooth(convergencePoint.y, prev.gaze.convergence.y, 0.1),
                            z: smooth(convergencePoint.z, prev.gaze.convergence.z, 0.1)
                        },
                        distance: smooth(distance, prev.gaze.distance, 0.1)
                    },
                    vad: {
                        v: smooth(clamp(rawValence, 1, 9), prev.vad.v, 0.05),
                        a: smooth(clamp(rawArousal, 1, 9), prev.vad.a, 0.05),
                        d: smooth(clamp(rawDominance, 1, 9), prev.vad.d, 0.05)
                    },
                    blink: {
                        l: getAU('eyeBlinkLeft'),
                        r: getAU('eyeBlinkRight')
                    },
                    smile: smooth(au12, prev.smile, 0.2)
                };
            });
            
            if (isStale && status === 'Receiving Data') setStatus('Signal Lost (Stale)');
            animationFrame = requestAnimationFrame(loop);
        };
        
        loop();
        return () => cancelAnimationFrame(animationFrame);
    }, [visionData, status]);

    // --- Video Binding ---
    useEffect(() => {
        if (window.localCameraStream && videoRef.current && videoRef.current.srcObject !== window.localCameraStream) {
                videoRef.current.srcObject = window.localCameraStream;
        }
    }, [visionData]);

    // --- 3D Components ---
    
    const Laser = ({ color, length = 20 }) => (
        <mesh position={[0, 0, length/2]} rotation={[Math.PI/2, 0, 0]}>
            <cylinderGeometry args={[0.02, 0.02, length, 8]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} blending={THREE.AdditiveBlending} />
        </mesh>
    );

    const Eye = ({ side, blink, gaze, laserColor }) => {
        const ref = useRef();
        const rotX = gaze.y * 0.5; 
        const rotY = gaze.x * 0.5 * (side === 'left' ? -1 : 1); 

        useFrame(() => {
            if (ref.current) {
                ref.current.rotation.x = -rotX; 
                ref.current.rotation.y = side === 'left' ? -rotY : rotY;
            }
        });

        return (
            <group ref={ref}>
                <mesh>
                    <sphereGeometry args={[0.12, 32, 32]} />
                    <meshStandardMaterial color="white" />
                </mesh>
                <mesh position={[0, 0, 0.1]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, 0.05, 32]} />
                    <meshStandardMaterial color={laserColor} emissive={laserColor} emissiveIntensity={0.5} />
                </mesh>
                <mesh position={[0, 0.12 * (1-blink) - 0.12, 0.11]}>
                     <boxGeometry args={[0.25, 0.25, 0.05]} />
                     <meshStandardMaterial color="#334155" transparent opacity={blink > 0.1 ? 1 : 0} />
                </mesh>
                <Laser color={laserColor} />
            </group>
        );
    };

    const CyberHead = ({ metrics }) => {
        const groupRef = useRef();
        const mouthRef = useRef();
        
        // VAD Mappings
        const valenceColor = useMemo(() => {
            // Map 1-9 to Red-Green gradient
            const v = (metrics.vad.v - 1) / 8; // 0 to 1
            return new THREE.Color().setHSL(v * 0.33, 1, 0.5); // Red(0) to Green(0.33)
        }, [metrics.vad.v]);
        
        const arousalGlow = (metrics.vad.a - 1) / 8; // 0 to 1
        const dominanceScale = 1 + ((metrics.vad.d - 5) / 20); // Slight scale shift

        useFrame((state) => {
            if (groupRef.current) {
                groupRef.current.rotation.x = -metrics.headRotation.x; 
                groupRef.current.rotation.y = -metrics.headRotation.y; 
                groupRef.current.rotation.z = -metrics.headRotation.z; 
                
                // Arousal Shake
                if (arousalGlow > 0.7) {
                    groupRef.current.position.x = (Math.random() - 0.5) * 0.02;
                    groupRef.current.position.y = (Math.random() - 0.5) * 0.02;
                } else {
                    groupRef.current.position.set(0,0,0);
                }
            }
            // Smile Deformation
            if (mouthRef.current) {
                const smileScale = 1 + metrics.smile * 0.5;
                mouthRef.current.scale.set(smileScale, 1 + metrics.smile, 1);
                mouthRef.current.position.y = -0.5 + (metrics.smile * 0.1);
            }
        });
        
        return (
            <group ref={groupRef} scale={dominanceScale}>
                {/* Skull */}
                <mesh>
                    <boxGeometry args={[1.5, 2.0, 1.2]} />
                    <meshStandardMaterial 
                        color={valenceColor} 
                        wireframe 
                        emissive={valenceColor} 
                        emissiveIntensity={arousalGlow * 0.8} 
                        transparent opacity={0.4} 
                    />
                </mesh>
                {/* Black Core */}
                <mesh position={[0, 0, -0.2]}>
                    <boxGeometry args={[1.4, 1.9, 1.0]} />
                    <meshStandardMaterial color="black" />
                </mesh>

                {/* Eyes */}
                <group position={[-0.35, 0.2, 0.6]}>
                    <Eye side="left" blink={metrics.blink.l} gaze={metrics.gaze.left} laserColor="#ef4444" />
                </group>
                <group position={[0.35, 0.2, 0.6]}>
                    <Eye side="right" blink={metrics.blink.r} gaze={metrics.gaze.right} laserColor="#3b82f6" />
                </group>
                
                {/* Nose */}
                <mesh position={[0, 0, 0.6]} rotation={[Math.PI/2, 0, 0]}>
                    <cylinderGeometry args={[0.02, 0.1, 0.8, 4]} />
                    <meshStandardMaterial color="gray" wireframe />
                </mesh>
                
                {/* Mouth */}
                <group position={[0, -0.5, 0.6]} ref={mouthRef}>
                    <mesh rotation={[0, 0, Math.PI/2]}>
                        <cylinderGeometry args={[0.05, 0.05, 0.6, 8]} />
                        <meshStandardMaterial color={valenceColor} emissive={valenceColor} emissiveIntensity={0.5} />
                    </mesh>
                </group>
                
                {/* Focus Point (Relative Visualization) */}
                <mesh position={[metrics.gaze.convergence.x, metrics.gaze.convergence.y, metrics.gaze.convergence.z]}>
                    <sphereGeometry args={[0.1, 16, 16]} />
                    <meshBasicMaterial color="white" transparent opacity={0.8} />
                </mesh>
            </group>
        );
    };

    // --- SAM Manikin Visualizer ---
    const SAMScale = ({ label, value, colorFrom, colorTo }) => (
        <div className="mb-3">
            <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-mono">
                <span>{label}</span>
                <span className="text-white font-bold">{value.toFixed(1)}</span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden relative border border-slate-700">
                <div className="absolute inset-0 flex justify-between px-1">
                    {[...Array(9)].map((_, i) => <div key={i} className="w-px h-full bg-slate-900/50"></div>)}
                </div>
                <div 
                    className="h-full transition-all duration-300 ease-out"
                    style={{ 
                        width: \`\${((value - 1) / 8) * 100}%\`, 
                        background: \`linear-gradient(to right, \${colorFrom}, \${colorTo})\`
                    }}
                />
                <div 
                    className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_5px_white] transition-all duration-300"
                    style={{ left: \`\${((value - 1) / 8) * 100}%\` }}
                />
            </div>
            <div className="flex justify-between text-[8px] text-slate-600 mt-0.5 uppercase">
                <span>Low</span>
                <span>Neutral</span>
                <span>High</span>
            </div>
        </div>
    );

    return (
        <div className="w-full h-full flex flex-col lg:flex-row bg-slate-950 text-slate-200 font-sans overflow-hidden relative">
            
            {/* HEADER */}
            <div className="absolute top-0 left-0 right-0 h-12 z-20 flex items-center justify-between px-4 bg-gradient-to-b from-black/90 to-transparent pointer-events-none">
                <div className="flex items-center gap-2">
                    <div className={\`w-3 h-3 rounded-full \${status.includes('Receiving') ? 'bg-green-500 animate-pulse' : 'bg-red-500'}\`}></div>
                    <span className="font-bold text-sm tracking-wide text-slate-300 drop-shadow-md">BIO-METRICS LAB</span>
                </div>
                <div className="text-xs font-mono text-slate-400">{status}</div>
            </div>

            {/* LEFT: 3D SCENE */}
            <div className="flex-grow relative bg-black flex items-center justify-center">
                <div className="absolute inset-0 z-0">
                    <Canvas camera={{ position: [0, 2, 8], fov: 45 }}>
                        <color attach="background" args={['#050505']} />
                        <fog attach="fog" args={['#050505', 10, 30]} />
                        
                        <ambientLight intensity={0.4} />
                        <pointLight position={[10, 10, 10]} intensity={1.5} />
                        <pointLight position={[-10, -5, 5]} intensity={0.5} color="blue" />
                        
                        <Grid infiniteGrid fadeDistance={25} sectionColor="#333" cellColor="#111" position={[0, -2, 0]} />
                        
                        <CyberHead metrics={metrics} />
                        
                        <OrbitControls makeDefault minPolarAngle={0} maxPolarAngle={Math.PI/1.8} />
                    </Canvas>
                </div>
                
                {/* PIP Camera Feed */}
                <div className="absolute bottom-4 left-4 w-40 h-32 opacity-60 border border-slate-700 rounded-lg overflow-hidden z-10 hover:opacity-100 transition-opacity bg-black shadow-lg">
                        <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                        <div className="absolute bottom-1 right-2 text-[9px] text-white/50 font-mono">RAW INPUT</div>
                </div>
                
                {/* Focus Distance Readout */}
                <div className="absolute top-20 left-4 pointer-events-none font-mono text-xs text-cyan-500">
                    FOCUS DISTANCE: {metrics.gaze.distance.toFixed(2)}m
                </div>
            </div>

            {/* RIGHT: DATA DEBUGGER */}
            <div className="w-full lg:w-80 bg-[#0b0f17] border-l border-slate-800 flex flex-col z-20 shadow-2xl h-full overflow-hidden relative">
                <div className="p-4 border-b border-slate-800 bg-slate-900/50">
                    <h3 className="text-xs font-bold text-cyan-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 bg-cyan-500 rounded-sm"></span>
                        Affective Computing
                    </h3>
                    
                    {/* VAD MODEL */}
                    <div className="mb-2 bg-black/30 p-3 rounded-lg border border-slate-800">
                        <h4 className="text-[9px] font-bold text-slate-500 mb-3 uppercase border-b border-slate-800 pb-1">SAM Scale (1-9)</h4>
                        <SAMScale label="VALENCE (Mood)" value={metrics.vad.v} colorFrom="#ef4444" colorTo="#22c55e" />
                        <SAMScale label="AROUSAL (Energy)" value={metrics.vad.a} colorFrom="#3b82f6" colorTo="#f97316" />
                        <SAMScale label="DOMINANCE (Control)" value={metrics.vad.d} colorFrom="#a855f7" colorTo="#eab308" />
                    </div>
                </div>

                <div className="p-4 border-b border-slate-800 bg-slate-900/30">
                    <h3 className="text-xs font-bold text-purple-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-purple-500 rounded-sm"></span>
                        Gaze Vector
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-black/40 p-2 rounded border border-slate-800 text-center">
                            <div className="text-[8px] text-slate-500 mb-1">LEFT EYE (Red)</div>
                            <div className="text-[10px] font-mono text-red-400">
                                X: {metrics.gaze.left.x.toFixed(2)}<br/>
                                Y: {metrics.gaze.left.y.toFixed(2)}
                            </div>
                        </div>
                        <div className="bg-black/40 p-2 rounded border border-slate-800 text-center">
                            <div className="text-[8px] text-slate-500 mb-1">RIGHT EYE (Blue)</div>
                            <div className="text-[10px] font-mono text-blue-400">
                                X: {metrics.gaze.right.x.toFixed(2)}<br/>
                                Y: {metrics.gaze.right.y.toFixed(2)}
                            </div>
                        </div>
                    </div>
                    <div className="mt-2 text-center text-[9px] text-slate-500 font-mono border-t border-slate-800 pt-2">
                        Convergence Point: [{metrics.gaze.convergence.x.toFixed(1)}, {metrics.gaze.convergence.y.toFixed(1)}, {metrics.gaze.convergence.z.toFixed(1)}]
                    </div>
                </div>
                
                {/* Raw Data Feed */}
                <div className="flex-grow overflow-hidden flex flex-col bg-[#080b12]">
                    <div className="px-4 py-2 bg-slate-900/80 border-b border-slate-800 text-[9px] font-bold text-slate-500 uppercase flex justify-between">
                        <span>Active Action Units (FACS)</span>
                        <span>{metrics.rawShapes.filter(s => s.score > 0.01).length} Active</span>
                    </div>
                    <div className="flex-grow overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
                        {metrics.rawShapes
                            .filter(s => s.score > 0.01)
                            .sort((a, b) => b.score - a.score)
                            .map((shape, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] p-1.5 hover:bg-white/5 rounded border border-transparent hover:border-slate-800 transition-colors group">
                                <span className="text-slate-400 truncate w-3/4 group-hover:text-slate-200 transition-colors" title={shape.categoryName}>
                                    {shape.categoryName}
                                </span>
                                <span className="font-mono text-cyan-500 bg-cyan-900/20 px-1.5 rounded">
                                    {shape.score.toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
`;

export const CAMERA_BIOFEEDBACK_PROTOCOL: ToolCreatorPayload = {
    name: 'Camera Biofeedback Test',
    description: 'Advanced diagnostic tool transforming raw computer vision into a 3D Cyber-Head. Features scientific VAD (Valence-Arousal-Dominance) estimation based on FACS Action Units, and real-time Gaze Tracking visualization (Eye Lasers) for Mixed Reality alignment.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To debug eye-tracking, demonstrate scientific emotion recognition, and visualize gaze vectors.',
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
    implementationCode: CAMERA_UI_IMPL
};
    