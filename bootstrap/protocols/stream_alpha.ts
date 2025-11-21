
import type { ToolCreatorPayload } from '../../types';

// --- EXTRACTED NODE IMPLEMENTATIONS (Level 2) ---
// These use normal backticks and require NO escaping.

const SOURCE_EEG_IMPL = `
    // Inputs from the NeuroBus frame buffer
    const buffer = inputs._frameBuffer?.['protocol_runner'];
    
    // Retrieve state or initialize defaults
    let signalVal = state.lastValue ?? 0;
    let hasRealData = state.hasRealData || false;
    let sourceName = state.lastSourceName || 'Searching...';
    
    const targetChName = config.channel || 'Cz';

    if (buffer && buffer.length > 0) {
        // Iterate backwards to find the most recent frame with valid data for this channel
        for (let i = buffer.length - 1; i >= 0; i--) {
            const payload = buffer[i].payload;
            if (!payload) continue;

            const keys = Object.keys(payload);
            // Fuzzy match: e.g. "simulator:Cz" matches "Cz" or "FreeEEG8:Cz"
            let targetKey = keys.find(k => {
                if (k === targetChName) return true;
                if (k.endsWith(':' + targetChName)) return true;
                // Case insensitive fallback
                const parts = k.split(':');
                const ch = parts.length > 1 ? parts[1] : parts[0];
                return ch.toLowerCase() === targetChName.toLowerCase();
            });
            
            if (targetKey && payload[targetKey] && payload[targetKey].length > 0) {
                const rawDataArr = payload[targetKey];
                const rawVal = rawDataArr[rawDataArr.length - 1];
                
                // Simple normalization for visualization (assuming uV range ~100)
                // Taking abs value for "activity" proxy
                signalVal = Math.min(1, Math.abs(rawVal) / 50);
                
                // Update state
                hasRealData = true;
                sourceName = targetKey;
                
                state.lastValue = signalVal;
                state.hasRealData = true;
                state.lastSourceName = sourceName;
                break; // Found most recent data, stop searching
            }
        }
    }

    // Only use internal simulation if we have NEVER received real data
    if (!hasRealData) {
        const time = Date.now() / 1000;
        const offset = targetChName.charCodeAt(0) || 0;
        const alpha = (Math.sin((time * 2) + offset) + 1) / 2; 
        signalVal = alpha * 0.5; // Lower amplitude to indicate 'waiting' state
        sourceName = 'Waiting for ' + targetChName + '...';
    }
    
    // Broadcast debug info
    bus.publish({
        timestamp: Date.now(),
        sourceId: 'debug_info',
        type: 'System',
        payload: { debug: { source: sourceName, val: signalVal, isReal: hasRealData } }
    });

    return { output: signalVal, state };
`;

const FILTER_SMOOTH_IMPL = `
    const input = Object.values(inputs)[0] ?? 0;
    const alpha = config.alpha || 0.05;
    const prev = state.val || input;
    const next = prev * (1 - alpha) + input * alpha;
    return { output: next, state: { val: next } };
`;

const BIND_INTENSITY_IMPL = `
    const val = Object.values(inputs)[0];
    if (val !== undefined) {
        bus.publish({
            type: 'System',
            sourceId: 'binder_intensity',
            payload: { visualUpdate: { intensity: val } }
        });
    }
    return { output: val };
`;

const BIND_COLOR_IMPL = `
    const val = Object.values(inputs)[0] || 0;
    // Map value: Low (Relaxed) -> Blue, High (Excited) -> Green/Gold
    const hue = 200 + (val * 40); 
    const color = 'hsl(' + hue + ', 100%, 50%)';
    
    bus.publish({
        type: 'System',
        sourceId: 'binder_color',
        payload: { visualUpdate: { globalColor: color } }
    });
    return { output: color };
`;

const REACT_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    
    // Access global 3D libraries injected by index.tsx
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    
    if (!R3F || !Drei) return <div style={{color:'white', padding:'20px'}}>Loading 3D Libraries... (Check index.tsx injection)</div>;

    const { Canvas, useFrame } = R3F;
    const { Sparkles, OrbitControls, Float } = Drei;

    // --- 1. Define the Graph Topology (Injection) ---
    const graph = {
        id: 'alpha_levitator_graph',
        nodes: [
            { 
                id: 'source_eeg', 
                type: 'Source', 
                implementation: ${JSON.stringify(SOURCE_EEG_IMPL)},
                config: { channel: 'Cz' },
                state: {},
                inputs: []
            },
            {
                id: 'filter_smooth',
                type: 'Transform',
                implementation: ${JSON.stringify(FILTER_SMOOTH_IMPL)},
                config: { alpha: 0.05 },
                state: {},
                inputs: ['source_eeg']
            },
            {
                id: 'bind_intensity',
                type: 'Sink',
                implementation: ${JSON.stringify(BIND_INTENSITY_IMPL)},
                config: {},
                state: {},
                inputs: ['filter_smooth']
            },
            {
                id: 'bind_color',
                type: 'Sink',
                implementation: ${JSON.stringify(BIND_COLOR_IMPL)},
                config: {},
                state: {},
                inputs: ['filter_smooth']
            }
        ]
    };

    // --- 2. Deploy Graph on Mount ---
    const [graphNodes, setGraphNodes] = useState([]);

    useEffect(() => {
        if (runtime.streamEngine) {
            runtime.logEvent('[Protocol] Deploying Stream Graph: Alpha Levitator');
            runtime.streamEngine.loadGraph(graph);
            runtime.streamEngine.start();
        } else {
            console.error("StreamEngine unavailable in runtime.");
        }
        
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
    
    const [debugInfo, setDebugInfo] = useState({ source: 'Init', val: 0, isReal: false });

    useEffect(() => {
        if (!runtime.neuroBus) return;
        const unsub = runtime.neuroBus.subscribe((frame) => {
            if (frame.type === 'System' && frame.payload?.visualUpdate) {
                setVisualState(prev => ({ ...prev, ...frame.payload.visualUpdate }));
            }
            if (frame.type === 'System' && frame.payload?.debug) {
                setDebugInfo(frame.payload.debug);
            }
        });
        return () => unsub();
    }, []);

    return (
        <div style={{width: '100%', height: '100%', position: 'relative', background: 'black'}}>
                {/* Debug Overlay */}
                <div style={{position: 'absolute', top: 10, left: 10, zIndex: 100, background: 'rgba(0,0,0,0.6)', padding: '8px', fontSize: '10px', fontFamily: 'monospace', color: '#0f0', borderRadius: '4px', border: '1px solid #00ff0033'}}>
                    <div style={{fontWeight: 'bold', marginBottom: '4px'}}>STREAM ENGINE ACTIVE</div>
                    <div style={{color: '#aaa'}}>Nodes: {graphNodes.length} | Mode: {debugInfo.isReal ? 'REAL' : 'WAITING'}</div>
                    <div style={{color: '#aaa'}}>Source: {debugInfo.source}</div>
                    <div style={{color: 'white'}}>Signal: {debugInfo.val.toFixed(3)}</div>
                </div>
                
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
    // Updated to request channels explicitly so runner enables them
    dataRequirements: { type: 'eeg', channels: ['Cz'], metrics: [] },
    // Stub to satisfy ProtocolRunner requirements
    processingCode: `
(eegData, sampleRate) => {
    return {};
}
    `,
    implementationCode: REACT_UI_IMPL
};