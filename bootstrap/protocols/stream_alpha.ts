
import type { ToolCreatorPayload } from '../../types';

const REACT_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    
    // Access global 3D libraries injected by index.tsx
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    
    if (!R3F || !Drei) return <div style={{color:'white', padding:'20px'}}>Loading 3D Libraries... (Check index.tsx injection)</div>;

    const { Canvas, useFrame } = R3F;
    const { Sparkles, OrbitControls, Float } = Drei;

    // --- 2. Deploy Graph on Mount ---
    const [graphNodes, setGraphNodes] = useState([]);

    useEffect(() => {
        if (!runtime.streamEngine) return;
        
        const deploy = async () => {
            runtime.logEvent('[Protocol] Deploying Stream Graph: Alpha Levitator');
            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph({ id: 'alpha_levitator_graph', nodes: {}, edges: [] });

            // 1. Source (Standard)
            await runtime.tools.run('Create_EEG_Source', { 
                nodeId: 'source_eeg', 
                channel: 'Cz',
                config: { simulationRange: [0, 0.5], simulationFrequencyHz: 0.3 }
            });

            // 2. Filter (Standard Smooth)
            await runtime.tools.run('Create_Standard_Node', {
                nodeId: 'filter_smooth',
                nodeType: 'Signal_Smooth',
                inputs: ['source_eeg'],
                config: { alpha: 0.05 }
            });

            // 3. Bind Intensity (Standard)
            await runtime.tools.run('Bind_To_Visuals', {
                nodeId: 'bind_intensity',
                inputNodeId: 'filter_smooth',
                parameter: 'intensity'
            });

            // 4. Bind Color (Custom Logic for HSL map)
            await runtime.tools.run('Create_Custom_Node', {
                nodeId: 'bind_color',
                inputs: ['filter_smooth'],
                jsLogic: "const val = inputs['filter_smooth'] || 0; const hue = 200 + (val * 40); const color = 'hsl(' + hue + ', 100%, 50%)'; bus.publish({ type: 'System', sourceId: 'binder_color', payload: { visualUpdate: { globalColor: color } } }); return { output: color };"
            });

            runtime.streamEngine.start();
        };
        deploy();
        
        // Poll for node states for the overlay
        const interval = setInterval(() => {
             if(runtime.streamEngine && runtime.streamEngine.getDebugState) {
                 setGraphNodes(runtime.streamEngine.getDebugState().nodes);
             }
        }, 200);
        
        return () => {
            clearInterval(interval);
            if (runtime.streamEngine) {
                runtime.logEvent('[Protocol] Stopping Stream Engine.');
                runtime.streamEngine.stop();
            }
        };
    }, []);

    // --- 3. Visualizer Component ---
    const Visuals = ({ visualState }) => {
        const meshRef = useRef();
        
        useFrame((state, delta) => {
            const speed = 0.5 + (visualState.intensity || 0);
            if (meshRef.current) {
                meshRef.current.rotation.x += delta * speed * 0.5;
                meshRef.current.rotation.y += delta * speed;
            }
        });
    
        const color = visualState.globalColor || '#00ffff';
        const intensity = visualState.intensity || 0.5;
    
        return (
            <>
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1 + intensity * 2} color={color} />
                <Sparkles count={100} scale={10} size={5} speed={0.4} opacity={0.5} color={color} />
                <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                    <group ref={meshRef}>
                            <mesh scale={1 + intensity * 1.5}>
                            <icosahedronGeometry args={[2, 1]} />
                            <meshStandardMaterial 
                                color={color} 
                                wireframe={true} 
                                emissive={color}
                                emissiveIntensity={intensity * 2}
                            />
                        </mesh>
                    </group>
                </Float>
                <OrbitControls enablePan={false} enableZoom={false} autoRotate autoRotateSpeed={1} />
            </>
        );
    };

    const [visualState, setVisualState] = useState({
        globalColor: '#00ffff',
        intensity: 0.2
    });
    
    useEffect(() => {
        if (!runtime.neuroBus) return;
        const unsub = runtime.neuroBus.subscribe((frame) => {
            if (frame.type === 'System' && frame.payload?.visualUpdate) {
                setVisualState(prev => ({ ...prev, ...frame.payload.visualUpdate }));
            }
        });
        return () => unsub();
    }, []);

    return (
        <div style={{width: '100%', height: '100%', position: 'relative', background: 'black'}}>
                {/* Node Graph Visualization Overlay */}
                <div style={{position:'absolute', inset:0, pointerEvents:'none', padding:'40px', paddingTop: '80px', zIndex:5}}>
                    <div style={{display:'flex', flexWrap:'wrap', gap:'10px', justifyContent: 'center'}}>
                        {graphNodes.map(n => (
                            <div key={n.id} style={{background:'rgba(0,0,0,0.7)', border:'1px solid #444', padding:'6px', borderRadius:'4px', backdropFilter: 'blur(2px)', minWidth: '80px'}}>
                                <div style={{color:'#888', fontSize:'8px', textTransform:'uppercase', display: 'flex', justifyContent: 'space-between'}}>
                                    <span>{n.type}</span>
                                    <span style={{color: Date.now() - n.lastUpdate < 100 ? '#0f0' : '#555'}}>●</span>
                                </div>
                                <div style={{color:'white', fontSize:'10px', fontWeight:'bold', marginBottom:'2px'}}>{n.id}</div>
                                <div style={{color:'cyan', fontSize:'10px', fontFamily:'monospace'}}>
                                    {typeof n.value === 'number' ? n.value.toFixed(2) : (n.value ? 'DATA' : '...')}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                
                <Canvas camera={{ position: [0, 0, 10] }} gl={{ antialias: false, powerPreference: "high-performance" }}>
                <color attach="background" args={['black']} />
                <Visuals visualState={visualState} />
            </Canvas>
        </div>
    );
`;

export const STREAM_ALPHA_LEVITATOR: ToolCreatorPayload = {
    name: 'Stream: Alpha Levitator',
    description: '[GENESIS DEMO] A graph-based protocol. Instead of React code, this defines a topology. It connects a Simulated EEG Source -> Smooth Filter -> Visual Intensity.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate the Stream Engine capabilities.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Data from the engine.', required: false },
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: false }
    ],
    dataRequirements: { type: 'eeg', channels: ['Cz'], metrics: [] },
    processingCode: `
(eegData, sampleRate) => {
    return {};
}
    `,
    implementationCode: REACT_UI_IMPL
};
