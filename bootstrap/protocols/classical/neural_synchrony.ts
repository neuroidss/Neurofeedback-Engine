
// bootstrap/protocols/classical/neural_synchrony.ts
import type { ToolCreatorPayload } from '../../../types';
import { 
    AGGREGATOR_SOURCE_IMPL, 
    MATRIX_PROCESSOR_IMPL, 
    COLOR_MAPPER_IMPL, 
    INTENSITY_MAPPER_IMPL 
} from '../../common_node_impls';

const GRAPH_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    
    // --- 1. Graph Lifecycle ---
    useEffect(() => {
        if (!runtime.streamEngine) return;
        runtime.logEvent('[Graph V2] Deploying GPU-Accelerated Neural Synchrony Graph...');
        
        const deploy = async () => {
            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph({ id: 'neural_sync_v2', nodes: {}, edges: [] });
            
            // 1. Aggregator (Custom)
            await runtime.tools.run('Create_Custom_Node', {
                nodeId: 'eeg_aggregator',
                jsLogic: ${JSON.stringify(AGGREGATOR_SOURCE_IMPL)},
                inputs: [],
                config: {}
            });
            
            // 2. Matrix Processor (Custom GPU Logic)
            await runtime.tools.run('Create_Custom_Node', {
                nodeId: 'matrix_processor',
                jsLogic: ${JSON.stringify(MATRIX_PROCESSOR_IMPL)},
                inputs: ['eeg_aggregator'],
                config: {}
            });
            
            // 3. Mappers (Custom)
            await runtime.tools.run('Create_Custom_Node', {
                nodeId: 'map_color',
                jsLogic: ${JSON.stringify(COLOR_MAPPER_IMPL)},
                inputs: ['matrix_processor']
            });
            await runtime.tools.run('Create_Custom_Node', {
                nodeId: 'map_intensity',
                jsLogic: ${JSON.stringify(INTENSITY_MAPPER_IMPL)},
                inputs: ['matrix_processor']
            });
            
            // Connections (Implicit in inputs, but explicit connect ensures graph update)
            runtime.streamEngine.connectNodes('eeg_aggregator', 'matrix_processor');
            runtime.streamEngine.connectNodes('matrix_processor', 'map_color');
            runtime.streamEngine.connectNodes('matrix_processor', 'map_intensity');
            
            runtime.streamEngine.start();
        };
        
        deploy();
        
        return () => { runtime.streamEngine.stop(); };
    }, []);

    // --- 2. Data Polling ---
    const [graphState, setGraphState] = useState(null);
    useEffect(() => {
        const interval = setInterval(() => {
            if (runtime.streamEngine && runtime.streamEngine.getDebugState) {
                // Find the matrix processor node output
                const debug = runtime.streamEngine.getDebugState();
                const matrixNode = debug.nodes.find(n => n.id === 'matrix_processor');
                if (matrixNode && matrixNode.value) {
                    setGraphState(matrixNode.value);
                }
            }
        }, 50);
        return () => clearInterval(interval);
    }, []);

    // --- 3. R3F Visuals ---
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;
    if (!R3F || !Drei || !THREE) return <div>Loading 3D...</div>;
    const { Canvas, useFrame } = R3F;
    const { Sphere, Text, OrbitControls, Stars } = Drei;

    // --- Force-Directed Graph Visualization ---
    const Constellation = useMemo(() => ({ matrixData }) => {
        const { matrix, globalSync } = matrixData || { matrix: {}, globalSync: 0 };
        
        // State refs for physics
        const nodesRef = useRef({}); // Map<ID, {pos: Vector3, vel: Vector3, mesh: Object3D}>
        const linesRef = useRef();   // Reference to LineSegments
        const groupRef = useRef();   // Container for rotation
        
        // Identify Unique Nodes
        const nodesList = useMemo(() => {
            const set = new Set();
            Object.keys(matrix).forEach(k => {
                let parts = k.split('__');
                if (parts.length < 2) parts = k.split('::');
                if (parts.length < 2) parts = k.split('-');
                if(parts[0]) set.add(parts[0]);
                if(parts[1]) set.add(parts[1]);
            });
            return Array.from(set).sort();
        }, [JSON.stringify(Object.keys(matrix))]);

        // Initialize/Cleanup Nodes in Physics World
        useEffect(() => {
            // Add new nodes
            nodesList.forEach(id => {
                if (!nodesRef.current[id]) {
                    // Spawn in random sphere position
                    const vec = new THREE.Vector3(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize().multiplyScalar(3);
                    nodesRef.current[id] = {
                        pos: vec,
                        vel: new THREE.Vector3(0,0,0),
                        id: id
                    };
                }
            });
            // Remove old nodes
            Object.keys(nodesRef.current).forEach(id => {
                if (!nodesList.includes(id)) delete nodesRef.current[id];
            });
        }, [nodesList]);

        // --- PHYSICS LOOP (60fps) ---
        useFrame((state, delta) => {
            const activeNodes = Object.values(nodesRef.current);
            const nodeCount = activeNodes.length;
            if (nodeCount === 0) return;

            // --- 1. Auto Rotation ---
            if (groupRef.current) {
                groupRef.current.rotation.y += delta * (0.05 + globalSync * 0.2);
            }

            // --- 2. Apply Forces ---
            const REPULSION = 0.5;
            const ATTRACTION = 1.0; // Base spring strength
            const CENTER_GRAVITY = 0.05;
            const DAMPING = 0.9;
            const DT = Math.min(delta, 0.1); // Clamp delta time

            // A. Repulsion (N^2) - Coulombs Law
            for (let i = 0; i < nodeCount; i++) {
                const n1 = activeNodes[i];
                for (let j = i + 1; j < nodeCount; j++) {
                    const n2 = activeNodes[j];
                    const dir = new THREE.Vector3().subVectors(n1.pos, n2.pos);
                    let dist = dir.length();
                    if (dist < 0.01) dist = 0.01; // Avoid singularity
                    
                    const force = dir.normalize().multiplyScalar(REPULSION / (dist * dist));
                    n1.vel.add(force.multiplyScalar(DT));
                    n2.vel.sub(force.multiplyScalar(DT));
                }
            }

            // B. Attraction (Edges) - Hooke's Law
            // Iterate over matrix keys (edges)
            Object.entries(matrix).forEach(([key, coherence]) => {
                if (coherence < 0.1) return; // Ignore weak links
                
                let parts = key.split('__');
                if (parts.length < 2) parts = key.split('::');
                if (parts.length < 2) parts = key.split('-');
                
                const n1 = nodesRef.current[parts[0]];
                const n2 = nodesRef.current[parts[1]];
                
                if (n1 && n2) {
                    const dir = new THREE.Vector3().subVectors(n2.pos, n1.pos);
                    const dist = dir.length();
                    
                    // Target distance decreases as coherence increases
                    const targetDist = 4.0 - (coherence * 3.5);
                    
                    const displacement = dist - targetDist;
                    const force = dir.normalize().multiplyScalar(displacement * ATTRACTION * coherence);
                    
                    n1.vel.add(force.multiplyScalar(DT));
                    n2.vel.sub(force.multiplyScalar(DT));
                }
            });

            // C. Centering Gravity (Keep graph in view)
            activeNodes.forEach(n => {
                const force = n.pos.clone().negate().multiplyScalar(CENTER_GRAVITY);
                n.vel.add(force.multiplyScalar(DT));
            });

            // D. Integration & Damping
            activeNodes.forEach(n => {
                n.vel.multiplyScalar(DAMPING);
                n.pos.add(n.vel.clone().multiplyScalar(DT));
                
                // Update visual mesh position
                if (n.mesh) n.mesh.position.copy(n.pos);
            });

            // --- 3. Update Lines Geometry ---
            if (linesRef.current) {
                const points = [];
                const colors = [];
                
                // Re-iterate matrix to draw lines
                Object.entries(matrix).forEach(([key, coherence]) => {
                    if (coherence < 0.25) return; // Culling threshold for drawing
                    
                    let parts = key.split('__');
                    if (parts.length < 2) parts = key.split('::');
                    if (parts.length < 2) parts = key.split('-');
                    
                    const n1 = nodesRef.current[parts[0]];
                    const n2 = nodesRef.current[parts[1]];
                    
                    if (n1 && n2) {
                        points.push(n1.pos.x, n1.pos.y, n1.pos.z);
                        points.push(n2.pos.x, n2.pos.y, n2.pos.z);
                        
                        // Color based on coherence strength
                        const hue = 220 - (coherence * 180); // Blue -> Gold
                        const col = new THREE.Color().setHSL(hue / 360, 1.0, 0.5);
                        colors.push(col.r, col.g, col.b);
                        colors.push(col.r, col.g, col.b);
                    }
                });
                
                const geo = linesRef.current.geometry;
                geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
                geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
                geo.attributes.position.needsUpdate = true;
                geo.attributes.color.needsUpdate = true;
                
                // Update bounding sphere for frustum culling
                geo.computeBoundingSphere();
            }
        });

        const getLabel = (nodeId) => {
             const parts = nodeId.split(':');
             return parts.length > 1 ? parts[1] : nodeId;
        };

        return (
            <group ref={groupRef}>
                {/* Nodes */}
                {nodesList.map(nodeId => (
                    <group key={nodeId} ref={el => { if(el && nodesRef.current[nodeId]) nodesRef.current[nodeId].mesh = el; }}>
                        <Sphere args={[0.2, 16, 16]}>
                            <meshStandardMaterial 
                                color={globalSync > 0.6 ? "#fbbf24" : "#22d3ee"} 
                                emissive={globalSync > 0.6 ? "#fbbf24" : "#22d3ee"}
                                emissiveIntensity={0.5 + globalSync}
                            />
                        </Sphere>
                        <Text 
                            position={[0, 0.35, 0]} 
                            fontSize={0.2} 
                            color="white" 
                            anchorX="center" 
                            anchorY="middle"
                            outlineWidth={0.02}
                            outlineColor="#000000"
                        >
                            {getLabel(nodeId)}
                        </Text>
                    </group>
                ))}
                
                {/* Efficient Line Segments */}
                <lineSegments ref={linesRef}>
                    <bufferGeometry />
                    <lineBasicMaterial vertexColors={true} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
                </lineSegments>
            </group>
        );
    }, []); // Stable definition

    return (
        <div className="w-full h-full bg-black relative">
            {/* Stats Overlay */}
            <div className="absolute top-4 left-4 z-10 bg-black/50 p-2 rounded border border-white/20 text-[10px] text-white font-mono pointer-events-none">
                <div className="text-green-400 font-bold mb-1">FORCE-DIRECTED GRAPH</div>
                <div>NODES: {graphState?.matrix ? (new Set(Object.keys(graphState.matrix).flatMap(k=>k.split('__'))).size) : 0}</div>
                <div>SYNC: {((graphState?.globalSync || 0) * 100).toFixed(1)}%</div>
                <div style={{color: '#888', marginTop: 2}}>Engine: {graphState?.engine || 'Init'}</div>
            </div>

            <Canvas camera={{ position: [0, 0, 12], fov: 50 }}>
                <color attach="background" args={['#050505']} />
                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1} />
                <Stars radius={60} count={2000} factor={4} saturation={0} fade />
                
                <Constellation matrixData={graphState} />
                
                <OrbitControls autoRotate autoRotateSpeed={0.2} enablePan={false} />
            </Canvas>
        </div>
    );
`;

export const NEURAL_SYNCHRONY_PROTOCOL: ToolCreatorPayload = {
    name: "Neural Synchrony (Graph)",
    description: "Measures overall neural synchrony (ciPLV) across all available channels. Uses the Stream Engine and GPU acceleration for O(N²) matrix calculation.",
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: "To provide a robust, single protocol for training network coherence.",
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    scientificDossier: {
        title: "Dynamic Multi-Source Coherence Mapping",
        hypothesis: "Global network synchrony across arbitrary electrode montages reflects integrated information processing.",
        mechanism: "Real-time ciPLV (Corrected Imaginary Phase Locking Value) via GPU acceleration.",
        targetNeuralState: "High Global Synchrony (Integration).",
        citations: ["Fries, P. (2005). A mechanism for cognitive dynamics: neuronal communication through neuronal coherence."],
        relatedKeywords: ["Graph Theory", "Coherence", "Hyper-scanning", "Dynamic Topology", "GPU Acceleration"]
    },
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: GRAPH_UI_IMPL
};