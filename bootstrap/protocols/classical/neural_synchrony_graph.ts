














import type { ToolCreatorPayload } from '../../../types';

// --- NODE IMPLEMENTATION: DYNAMIC EEG AGGREGATOR ---
// Collects ALL available EEG channels from the frame buffer into a single object.
// Features "Channel Decay" to prevent nodes from flickering/jerking when packets drop.
// UPDATED: Buffers raw data arrays (256 samples) instead of scalars to preserve phase information for DSP.
const AGGREGATOR_SOURCE_IMPL = `
    // Inputs from the NeuroBus frame buffer
    const buffer = inputs._frameBuffer?.['protocol_runner'];
    
    // Persistent State
    if (!state.channelBuffers) state.channelBuffers = {}; // Map<ChannelName, number[]>
    if (!state.lastSeen) state.lastSeen = {}; // Map<ChannelName, Timestamp>
    
    const now = Date.now();
    const DECAY_MS = 3000; // Keep channel alive for 3s after signal loss
    const BUFFER_SIZE = 256; // Match the window size used in Classical DSP

    if (buffer && buffer.length > 0) {
        // Iterate through frames to build a comprehensive snapshot
        for (let i = 0; i < buffer.length; i++) {
            const payload = buffer[i].payload;
            if (!payload) continue;
            
            const keys = Object.keys(payload);
            const hasPrefixes = keys.some(k => k.includes(':'));

            keys.forEach(key => {
                // Filter logic: If prefixed keys exist, only use them. Ignore simple aliases.
                if (hasPrefixes && !key.includes(':')) return;

                const data = payload[key];
                
                // FIX: Handle both array data (standard) and scalar data (legacy/sim)
                // We MUST accumulate ALL samples to preserve the waveform for FFT/Hilbert analysis.
                if (data !== undefined) {
                    // Init buffer if new
                    if (!state.channelBuffers[key]) state.channelBuffers[key] = new Array(BUFFER_SIZE).fill(0);
                    
                    if (Array.isArray(data)) {
                        for(const sample of data) {
                            state.channelBuffers[key].push(sample); 
                        }
                    } else if (typeof data === 'number') {
                        state.channelBuffers[key].push(data);
                    }
                    
                    // Maintain sliding window size
                    if (state.channelBuffers[key].length > BUFFER_SIZE) {
                        // Efficiently slice the end
                        state.channelBuffers[key] = state.channelBuffers[key].slice(-BUFFER_SIZE);
                    }
                    
                    state.lastSeen[key] = now;
                }
            });
        }
    }
    
    // Prune stale channels (Stabilizes the Graph Topology)
    Object.keys(state.channelBuffers).forEach(key => {
        // Only prune if we have a recorded lastSeen time AND it's older than DECAY_MS
        if (state.lastSeen[key] && (now - state.lastSeen[key] > DECAY_MS)) {
            delete state.channelBuffers[key];
            delete state.lastSeen[key];
        }
    });
    
    // Return the full raw buffers. The consumer (Matrix Processor) handles the DSP.
    return { output: state.channelBuffers, state };
`;

// --- NODE IMPLEMENTATION: MATRIX CORRELATION PROCESSOR ---
// Refactored to use 3D GPU Kernels to avoid "Array(2)" errors.
// UPDATED: Implements ciPLV with Temporal Smoothing to prevent visual twitching.
const MATRIX_PROCESSOR_IMPL = `
    // Input is now { ChannelName: Array(256) }
    const channelBuffers = inputs['eeg_aggregator'];
    if (!channelBuffers || Object.keys(channelBuffers).length < 2) {
        return { output: { matrix: {}, globalSync: 0, engine: 'Waiting for Signal' } };
    }
    
    const channels = Object.keys(channelBuffers).sort();
    const numChannels = channels.length;
    const WINDOW_SIZE = 256; 
    
    // Ensure all buffers are full size (pad if necessary, though Aggregator handles this)
    // We map the buffers to a flat array-of-arrays structure for the GPU
    const rawMatrix = channels.map(ch => {
        const buf = channelBuffers[ch] || []; // Safety check
        if (buf.length === WINDOW_SIZE) return buf;
        // Padding for new channels
        const padded = new Array(WINDOW_SIZE).fill(0);
        // Fill from end
        for(let i=0; i<buf.length; i++) padded[WINDOW_SIZE - buf.length + i] = buf[i];
        return padded;
    });

    let matrix = {};
    let totalSync = 0;
    let pairCount = 0;
    let engine = 'CPU';
    let debugMsg = '';
    
    // --- SMOOTHING STATE ---
    if (!state.smoothMatrix) state.smoothMatrix = {};
    const alpha = 0.15; // Smoothing factor (0.15 = smooth, 1.0 = raw)

    // --- GPU ACCELERATION (ciPLV) ---
    // Only attempt if we haven't crashed before and have enough data
    // GPU.js is injected globally in index.html
    if (window.gpuInstance || (window.GPU && !state.gpuFailed)) {
        if (!state.gpu) {
             try {
                 if (window.gpuInstance) {
                     state.gpu = window.gpuInstance;
                 } else {
                     const GPU = window.GPU.GPU || window.GPU;
                     state.gpu = new GPU();
                 }
             } catch(e) { 
                 state.gpuFailed = true;
                 debugMsg = 'GPU Init Failed: ' + e.message;
             }
        }
        
        if (state.gpu && !state.gpuFailed) {
            try {
                // Recompile kernels if dimensions change (e.g. new device connected)
                if (state.dim_ch !== numChannels || state.dim_len !== WINDOW_SIZE) {
                    
                    // Cleanup old kernels to free VRAM
                    if (state.kernels) {
                        try { 
                            if(state.kernels.analytic) state.kernels.analytic.destroy(); 
                            if(state.kernels.corr) state.kernels.corr.destroy(); 
                        } catch(e){}
                    }
                    
                    state.kernels = {};
                    
                    // Kernel 1: Analytic Signal (Hilbert Approx)
                    // Output: 3D Texture [2, WINDOW_SIZE, numChannels]
                    // x=0(Real)/1(Imag), y=Time, z=Channel
                    state.kernels.analytic = state.gpu.createKernel(function(data) {
                        const comp = this.thread.x; // 0 = Real, 1 = Imag
                        const t = this.thread.y;
                        const ch = this.thread.z;
                        
                        const val = data[ch][t];
                        
                        // Hilbert approx via 90-degree phase shift (5 samples @ 250Hz is approx 90 deg for 10Hz alpha)
                        // This is a simplification for real-time speed.
                        const delay = 5; 
                        const imag = (t >= delay) ? data[ch][t-delay] : 0;
                        
                        // Normalize to unit circle (Phase only)
                        const mag = Math.sqrt(val*val + imag*imag) + 0.00001;
                        
                        if (comp == 0) return val / mag;
                        else return imag / mag;
                    })
                    .setOutput([2, WINDOW_SIZE, numChannels])
                    .setPipeline(true); // Keep output in VRAM for next kernel

                    // Kernel 2: Corrected Imaginary Phase Locking Value (ciPLV)
                    // Input: 3D Texture from Kernel 1. Output: 2D Matrix [numChannels, numChannels]
                    state.kernels.corr = state.gpu.createKernel(function(analytic) {
                        const chA = this.thread.y;
                        const chB = this.thread.x;
                        
                        let sumRe = 0;
                        let sumIm = 0;
                        
                        // Loop through time
                        for(let k=0; k<this.constants.len; k++) {
                            // Explicitly access 3D texture. [0]=Real, [1]=Imag
                            const aRe = analytic[chA][k][0];
                            const aIm = analytic[chA][k][1];
                            const bRe = analytic[chB][k][0];
                            const bIm = analytic[chB][k][1];
                            
                            // Complex Dot Product: A * conj(B)
                            // (aRe + i*aIm) * (bRe - i*bIm)
                            // Re = aRe*bRe + aIm*bIm
                            // Im = aIm*bRe - aRe*bIm
                            
                            sumRe += (aRe * bRe + aIm * bIm);
                            sumIm += (aIm * bRe - aRe * bIm);
                        }
                        
                        const meanRe = sumRe / this.constants.len;
                        const meanIm = sumIm / this.constants.len;
                        
                        // ciPLV Formula: |Imag(PLV)| / sqrt(1 - Real(PLV)^2)
                        const numer = Math.abs(meanIm);
                        const denomSq = 1 - (meanRe * meanRe);
                        
                        let result = 0;
                        if (denomSq > 0.000001) {
                            result = numer / Math.sqrt(denomSq);
                        }
                        
                        // Clamp output
                        if (result > 1) result = 1;
                        
                        return result;
                    })
                    .setOutput([numChannels, numChannels])
                    .setConstants({ len: WINDOW_SIZE });
                    
                    state.dim_ch = numChannels;
                    state.dim_len = WINDOW_SIZE;
                }
                
                // Execute Pipeline
                const analyticTex = state.kernels.analytic(rawMatrix);
                const plvMatrix = state.kernels.corr(analyticTex);
                
                // Read back from GPU
                const res = plvMatrix; 
                
                for(let i=0; i<numChannels; i++) {
                    for(let j=i+1; j<numChannels; j++) {
                        const key = channels[i] + '__' + channels[j];
                        const rawVal = res[i][j];
                        
                        // Apply Smoothing
                        const prevVal = state.smoothMatrix[key] || 0;
                        const smoothVal = prevVal * (1 - alpha) + rawVal * alpha;
                        state.smoothMatrix[key] = smoothVal;
                        matrix[key] = smoothVal;
                        
                        totalSync += smoothVal;
                        pairCount++;
                    }
                }
                engine = 'GPU (WebGL ciPLV)';
            } catch(e) {
                console.error("GPU Error", e);
                state.gpuFailed = true; // Fallback permanently
                debugMsg = 'GPU Crashed: ' + e.message;
            }
        }
    }

    // --- CPU FALLBACK (ciPLV) ---
    // Used if GPU not available or crashed
    if (pairCount === 0) {
        engine = 'CPU (Fallback ciPLV)';
        if (debugMsg) engine += ' | ' + debugMsg;
        
        // Pre-calc Analytic (Simulated Hilbert)
        const analyticCPU = channels.map(ch => {
            const d = rawMatrix[channels.indexOf(ch)];
            const arr = [];
            for(let t=0; t<WINDOW_SIZE; t++) {
                const r = d[t];
                const i = (t>=5) ? d[t-5] : 0;
                const mag = Math.sqrt(r*r + i*i) + 0.00001;
                arr.push({ r: r/mag, i: i/mag });
            }
            return arr;
        });

        for (let i = 0; i < numChannels; i++) {
            for (let j = i + 1; j < numChannels; j++) {
                const a = analyticCPU[i];
                const b = analyticCPU[j];
                
                let sumRe = 0;
                let sumIm = 0;
                for(let k=0; k<WINDOW_SIZE; k++) {
                    sumRe += (a[k].r * b[k].r + a[k].i * b[k].i);
                    sumIm += (a[k].i * b[k].r - a[k].r * b[k].i);
                }
                const meanRe = sumRe / WINDOW_SIZE;
                const meanIm = sumIm / WINDOW_SIZE;
                
                const denomSq = 1 - (meanRe * meanRe);
                const rawVal = (denomSq > 1e-6) ? (Math.abs(meanIm) / Math.sqrt(denomSq)) : 0;
                
                const key = channels[i] + '__' + channels[j];
                const prevVal = state.smoothMatrix[key] || 0;
                const smoothVal = prevVal * (1 - alpha) + rawVal * alpha;
                state.smoothMatrix[key] = smoothVal;
                matrix[key] = smoothVal;

                totalSync += smoothVal;
                pairCount++;
            }
        }
    }
    
    const globalSync = pairCount > 0 ? totalSync / pairCount : 0;
    
    return { output: { matrix, globalSync, engine }, state };
`;

// --- NODE IMPLEMENTATION: MAPPERS ---
const COLOR_MAPPER_IMPL = `
    const data = inputs['matrix_processor'];
    if (!data) return { output: '#444' };
    const val = data.globalSync || 0;
    
    const hue = 220 - (val * 180); // 220(Blue) -> 40(Gold)
    const color = \`hsl(\${hue}, 100%, 50%)\`;
    
    bus.publish({ 
        type: 'System', 
        sourceId: 'mapper_color', 
        timestamp: Date.now(),
        payload: { visualUpdate: { globalColor: color } } 
    });
    return { output: color };
`;

const INTENSITY_MAPPER_IMPL = `
    const data = inputs['matrix_processor'];
    if (!data) return { output: 0 };
    const val = data.globalSync || 0;
    
    const intensity = val * val * 1.5;
    
    bus.publish({ 
        type: 'System', 
        sourceId: 'mapper_intensity', 
        timestamp: Date.now(),
        payload: { visualUpdate: { intensity: intensity } } 
    });
    return { output: intensity };
`;

const GRAPH_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    
    // --- 1. Graph Lifecycle ---
    useEffect(() => {
        if (!runtime.streamEngine) return;
        runtime.logEvent('[Graph V2] Deploying GPU-Accelerated Neural Synchrony Graph...');
        
        // Clear previous
        runtime.streamEngine.stop();
        runtime.streamEngine.loadGraph({ id: 'neural_sync_v2', nodes: {}, edges: [] });
        
        // Add Nodes
        runtime.streamEngine.addNode({
            id: 'eeg_aggregator',
            type: 'Source',
            implementation: ${JSON.stringify(AGGREGATOR_SOURCE_IMPL)},
            config: {}, state: {}, inputs: []
        });
        
        runtime.streamEngine.addNode({
            id: 'matrix_processor',
            type: 'Transform',
            implementation: ${JSON.stringify(MATRIX_PROCESSOR_IMPL)},
            config: {}, state: {}, inputs: ['eeg_aggregator']
        });
        
        runtime.streamEngine.addNode({
            id: 'map_color', type: 'Sink', implementation: ${JSON.stringify(COLOR_MAPPER_IMPL)},
            config: {}, state: {}, inputs: ['matrix_processor']
        });
        
        runtime.streamEngine.addNode({
            id: 'map_intensity', type: 'Sink', implementation: ${JSON.stringify(INTENSITY_MAPPER_IMPL)},
            config: {}, state: {}, inputs: ['matrix_processor']
        });
        
        // Connect
        runtime.streamEngine.connectNodes('eeg_aggregator', 'matrix_processor');
        runtime.streamEngine.connectNodes('matrix_processor', 'map_color');
        runtime.streamEngine.connectNodes('matrix_processor', 'map_intensity');
        
        runtime.streamEngine.start();
        
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

            // Reset forces/velocity accumulation if needed, or just add to velocity
            // Here we modify velocity directly (Verlet-ish)

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
                    // Coherence 1.0 -> Target Dist 0.5
                    // Coherence 0.0 -> Target Dist 4.0
                    const targetDist = 4.0 - (coherence * 3.5);
                    
                    // Force = k * (current - target)
                    // We treat 'coherence' as the spring stiffness 'k' too? 
                    // Or just let the target distance do the work. 
                    // Let's make force proportional to displacement from target.
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

export const NEURAL_SYNCHRONY_GRAPH_PROTOCOL: ToolCreatorPayload = {
    name: 'Neural Synchrony V2 (Graph)',
    description: 'A fully dynamic, graph-based Neural Synchrony tool. It now uses embedded WebGL (GPU.js) to calculate ciPLV (Corrected Imaginary Phase Locking Value) on the fly within the graph node, enabling real-time O(N²) analysis of 32+ channels without CPU blocking.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate high-performance, GPU-accelerated graph processing within the Stream Engine.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Data from the runtime.', required: false },
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: true }
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
    processingCode: `(d, r) => ({})`,
    implementationCode: GRAPH_UI_IMPL
};