
// bootstrap/protocols/classical/camera_biofeedback.ts
import type { ToolCreatorPayload } from '../../../types';
import { 
    AFFECTIVE_NODE_IMPL, 
    GAZE_NODE_IMPL, 
    BLINK_NODE_IMPL, 
    COLOR_MAPPER_IMPL, 
    INTENSITY_MAPPER_IMPL 
} from '../../common_node_impls';

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

export const CAMERA_BIOFEEDBACK_PROTOCOL: ToolCreatorPayload = {
    name: 'Camera Biofeedback V2 (Graph)',
    description: 'Graph-based VAD estimation using Camera input.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'Validation.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Data from the runtime.', required: false },
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d, r) => ({})`,
    implementationCode: GRAPH_UI_IMPL
};
