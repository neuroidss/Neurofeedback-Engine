
import type { ToolCreatorPayload } from '../../../types';

const SPATIAL_DEPTH_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;

    if (!R3F || !Drei || !THREE) return <div className="p-4 text-white">Loading 3D Engine...</div>;
    const { Canvas, useThree, useFrame } = R3F;
    const { OrbitControls, PerspectiveCamera, Environment, Text, Line, Billboard, shaderMaterial } = Drei;

    // --- CUSTOM SHADER: LINEAR DEPTH ---
    const LinearDepthMaterial = {
        uniforms: {
            cameraNear: { value: 0.1 },
            cameraFar: { value: 30.0 }
        },
        vertexShader: \`
            varying float vDepth;
            void main() {
                vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * viewPos;
                // Linearize depth for visualization
                vDepth = -viewPos.z; 
            }
        \`,
        fragmentShader: \`
            uniform float cameraNear;
            uniform float cameraFar;
            varying float vDepth;
            void main() {
                // Map depth: Close (Near) = 1.0 (White), Far = 0.0 (Black)
                float d = 1.0 - smoothstep(cameraNear, cameraFar, vDepth);
                gl_FragColor = vec4(vec3(d), 1.0);
            }
        \`
    };

    const DepthMat = new THREE.ShaderMaterial({
        uniforms: LinearDepthMaterial.uniforms,
        vertexShader: LinearDepthMaterial.vertexShader,
        fragmentShader: LinearDepthMaterial.fragmentShader
    });

    // --- MATH UTILS FOR 3D-TO-2D PROJECTION ---
    const projectPoint = (vec3, camera, width, height) => {
        const vec = vec3.clone();
        vec.project(camera);
        const x = (vec.x * 0.5 + 0.5) * width;
        const y = (-(vec.y * 0.5) + 0.5) * height;
        return { x, y, z: vec.z }; 
    };

    const getBoxCorners = (bbox) => {
        let cx, cy, cz, w, h, d, roll, pitch, yaw;
        if (bbox.length >= 9) {
             [cx, cy, cz, w, h, d, roll, pitch, yaw] = bbox;
        } else if (bbox.length === 6) {
             [cx, cy, cz, w, h, d] = bbox;
             roll = 0; pitch = 0; yaw = 0;
        } else { return []; }

        const hw = w / 2, hh = h / 2, hd = d / 2;
        const corners = [
            new THREE.Vector3(hw, hh, hd), new THREE.Vector3(hw, hh, -hd),
            new THREE.Vector3(hw, -hh, hd), new THREE.Vector3(hw, -hh, -hd),
            new THREE.Vector3(-hw, hh, hd), new THREE.Vector3(-hw, hh, -hd),
            new THREE.Vector3(-hw, -hh, hd), new THREE.Vector3(-hw, -hh, -hd)
        ];
        const euler = new THREE.Euler(pitch, yaw, roll, 'XYZ');
        const center = new THREE.Vector3(cx, cy, cz);
        return corners.map(p => p.applyEuler(euler).add(center));
    };

    const drawBox = (ctx, bbox, camera, width, height, color, label) => {
        const corners3D = getBoxCorners(bbox);
        if (corners3D.length !== 8) return;
        const corners2D = corners3D.map(p => projectPoint(p, camera, width, height));
        const edges = [
            [0,2], [2,6], [6,4], [4,0], // Front
            [1,3], [3,7], [7,5], [5,1], // Back
            [0,1], [2,3], [6,7], [4,5]  // Connectors
        ];
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        edges.forEach(([start, end]) => {
            const p1 = corners2D[start];
            const p2 = corners2D[end];
            if (p1.z < 1 && p2.z < 1) { 
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
            }
        });
        ctx.stroke();
        if (label && corners2D[0].z < 1) {
            ctx.fillStyle = color;
            ctx.font = '12px monospace';
            ctx.fillText(label, corners2D[0].x, corners2D[0].y - 5);
        }
    };

    // --- SCENE: THE METRIC FLOOR ---
    const MetricFloor = ({ viewMode }) => {
        const size = 10;
        const step = 1;
        const half = size / 2;
        
        // Lines generation
        const lines = useMemo(() => {
            const l = [];
            for (let i = -half; i <= half; i += step) {
                const isZero = i === 0;
                const colorX = isZero ? "white" : (viewMode === 'Depth' ? "#00ffff" : "#22d3ee");
                const colorZ = isZero ? "white" : (viewMode === 'Depth' ? "#00ffff" : "#e879f9");
                const alpha = isZero ? 0.8 : (viewMode === 'Depth' ? 1.0 : 0.3); // High opacity for depth view overlay
                const lineWidth = isZero ? 2 : 1;
                l.push(<Line key={'v'+i} points={[[i, 0, -half], [i, 0, half]]} color={colorX} transparent opacity={alpha} lineWidth={lineWidth} />);
                l.push(<Line key={'h'+i} points={[[-half, 0, i], [half, 0, i]]} color={colorZ} transparent opacity={alpha} lineWidth={lineWidth} />);
            }
            return l;
        }, [viewMode, half, step]);

        if (viewMode === 'Depth') {
            return (
                <group>
                    {/* The opaque depth floor */}
                    <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                        <planeGeometry args={[20, 20]} />
                        <primitive object={DepthMat} attach="material" />
                    </mesh>
                    {/* The Grid Overlay (Cyan) on top of the depth map */}
                    <group position={[0, 0.01, 0]}>
                        {lines}
                    </group>
                </group>
            );
        }

        return <group>{lines}</group>;
    };

    const SceneContent = ({ objects, viewMode, setGlRef }) => {
        const { gl, scene, camera } = useThree();
        useEffect(() => { if (setGlRef) setGlRef({ gl, scene, camera }); }, [gl, scene, camera]);

        return (
            <>
                {viewMode === 'RGB' && (
                    <>
                        <ambientLight intensity={0.5} />
                        <pointLight position={[5, 10, 5]} intensity={1} />
                        <Environment preset="city" />
                    </>
                )}
                <color attach="background" args={[viewMode === 'RGB' ? '#000000' : '#000000']} />
                <MetricFloor viewMode={viewMode} />
                {objects.map(obj => (
                    <mesh key={obj.id} position={obj.position} rotation={obj.rotation} castShadow receiveShadow>
                        {obj.shape === 'Cube' && <boxGeometry args={[obj.size[0], obj.size[1], obj.size[2]]} />}
                        {obj.shape === 'Cylinder' && <cylinderGeometry args={[obj.size[0]/2, obj.size[0]/2, obj.size[1], 32]} />}
                        {viewMode === 'RGB' ? (
                            <meshStandardMaterial color={obj.color} roughness={0.3} metalness={0.1} />
                        ) : (
                            <primitive object={DepthMat} attach="material" />
                        )}
                    </mesh>
                ))}
            </>
        );
    };

    // --- STATE ---
    const [objects, setObjects] = useState([]);
    const [status, setStatus] = useState("Ready");
    const [capturedImage, setCapturedImage] = useState(null);
    const [predictions, setPredictions] = useState([]);
    const [benchmarkMode, setBenchmarkMode] = useState("Atomic (Flat)"); // 'Atomic (Flat)', 'Atomic (Box)', 'Batch'
    const [viewMode, setViewMode] = useState("RGB");
    const [debugData, setDebugData] = useState(null);
    const [score, setScore] = useState(null);

    const captureCameraRef = useRef(null);
    const glRef = useRef(null);
    const canvasRef = useRef(null);

    const generateScenario = () => {
        const count = 3 + Math.floor(Math.random() * 3);
        const newObjects = [];
        const colors = ['Red', 'Blue', 'Green', 'Yellow', 'Purple', 'Orange'];
        const shapes = ['Cube', 'Cylinder']; 

        for (let i = 0; i < count; i++) {
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const x = Math.round((Math.random() - 0.5) * 8 * 10) / 10;
            const z = Math.round((Math.random() - 0.5) * 8 * 10) / 10;
            const w = 0.5 + Math.random() * 0.5;
            const h = 0.5 + Math.random() * 1.0;
            const d = 0.5 + Math.random() * 0.5;
            const yaw = (Math.random() * Math.PI * 2);
            const y = h / 2;

            newObjects.push({
                id: i, label: \`\${color} \${shape}\`, shape, color: color.toLowerCase(),
                position: [x, y, z], size: [w, h, d], rotation: [0, yaw, 0], 
                truthBbox: [x, y, z, w, h, d, 0, 0, yaw]
            });
        }
        setObjects(newObjects);
        setPredictions([]);
        setScore(null);
        setDebugData(null);
        setCapturedImage(null);
        setStatus("Ready");
    };

    useEffect(() => { generateScenario(); }, []);

    // --- OVERLAY DRAWING (Corrected: 4 Sides) ---
    useEffect(() => {
        if (!canvasRef.current || !capturedImage || !captureCameraRef.current) return;
        const ctx = canvasRef.current.getContext('2d');
        const img = new Image();
        img.onload = () => {
            canvasRef.current.width = img.width;
            canvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const W = canvasRef.current.width;
            const H = canvasRef.current.height;
            const cam = captureCameraRef.current;

            ctx.font = '900 14px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
            const range = 5; const labelOffset = 0.6;
            
            // Draw Axis Labels on 4 sides
            for (let i = -range; i <= range; i++) {
                const drawLabel = (vec, text, color) => {
                    const p = projectPoint(vec, cam, W, H);
                    if (p.z < 1 && p.x > -50 && p.x < W+50 && p.y > -50 && p.y < H+50) { 
                        ctx.strokeText(text, p.x, p.y); ctx.fillStyle = color; ctx.fillText(text, p.x, p.y);
                    }
                };
                
                // Z-Axis Labels (Left and Right edges of grid)
                drawLabel(new THREE.Vector3(range + labelOffset, 0, i), \`z=\${i}\`, '#e879f9');
                drawLabel(new THREE.Vector3(-range - labelOffset, 0, i), \`z=\${i}\`, '#e879f9');
                
                // X-Axis Labels (Top and Bottom edges of grid)
                drawLabel(new THREE.Vector3(i, 0, range + labelOffset), \`x=\${i}\`, '#22d3ee');
                drawLabel(new THREE.Vector3(i, 0, -range - labelOffset), \`x=\${i}\`, '#22d3ee');
            }
            
            objects.forEach(obj => { drawBox(ctx, obj.truthBbox, cam, W, H, '#4ade80', obj.label); });
            predictions.forEach(pred => { if (pred.bbox_3d) drawBox(ctx, pred.bbox_3d, cam, W, H, '#f87171', pred.label + ' (AI)'); });
        };
        img.src = capturedImage;
    }, [capturedImage, predictions, objects]);

    const calculateScore = (preds) => {
        let hits = 0; let totalDist = 0;
        preds.forEach(p => {
            if (!p.bbox_3d || p.bbox_3d.length < 3) return;
            const [px, py, pz] = p.bbox_3d;
            let bestDist = Infinity; let match = null;
            objects.forEach(t => {
                const [tx, ty, tz] = t.truthBbox;
                const dist = Math.sqrt(Math.pow(px-tx, 2) + Math.pow(py-ty, 2) + Math.pow(pz-tz, 2));
                if (dist < bestDist) { bestDist = dist; match = t; }
            });
            if (match && bestDist < 1.0) { hits++; totalDist += bestDist; }
        });
        const accuracy = objects.length > 0 ? hits / objects.length : 0;
        const avgError = hits > 0 ? totalDist / hits : 0;
        setScore({ accuracy, avgError, hits, total: objects.length });
    };

    const runBenchmark = async () => {
        if (!glRef.current) return;
        const { gl, scene, camera } = glRef.current;
        setStatus("Capturing...");
        gl.render(scene, camera);
        const dataUrl = gl.domElement.toDataURL('image/jpeg', 0.9);
        setCapturedImage(dataUrl);
        captureCameraRef.current = camera.clone();
        
        setStatus("Thinking...");
        
        let toolName = 'report_3d_object_flat'; // Default: Atomic Flat
        if (benchmarkMode === 'Atomic (Box)') toolName = 'report_3d_object';
        if (benchmarkMode === 'Batch') toolName = 'report_3d_scene';
        
        const tool = runtime.tools.list().find(t => t.name === toolName);
        if (!tool) { setStatus("Missing Tool: " + toolName); return; }

        let prompt = \`INPUT: \${viewMode === 'Depth' ? 'DEPTH MAP (White=Close/0.1m, Black=Far/30m). CYAN LINES = FLOOR GRID.' : 'RGB IMAGE'}.\n\`;
        prompt += \`DETECT OBJECTS. Use the Grid for scale/position.\n\`;
        
        if (benchmarkMode === 'Atomic (Flat)') {
            prompt += \`Action: Call 'report_3d_object_flat' MULTIPLE TIMES, once for each object.\n\`;
            prompt += \`Parameters: label, x, y, z, width, height, depth, roll, pitch, yaw.\n\`;
            prompt += \`Note: Do NOT use array formats. Use individual numbers.\`;
        } else if (benchmarkMode === 'Atomic (Box)') {
            prompt += \`Action: Call 'report_3d_object' MULTIPLE TIMES, once for each object.\n\`;
            prompt += \`Parameters: label, bbox_3d (Array of 9 numbers).\`;
        } else {
            prompt += \`Action: Call 'report_3d_scene' ONCE with a list of all objects.\`;
        }

        try {
            const result = await runtime.ai.processRequest(prompt, "Spatial Intelligence.", [tool], [{ type: 'image/jpeg', data: dataUrl.split(',')[1] }]);
            
            setDebugData({ 
                prompt, 
                rawText: result.text || "No textual response.", 
                toolCalls: result.toolCalls || []
            });
            
            let preds = [];
            if (result.toolCalls) {
                if (benchmarkMode === 'Atomic (Flat)') {
                    preds = result.toolCalls.filter(tc => tc.name === 'report_3d_object_flat').map(tc => tc.arguments.object || tc.arguments);
                } else if (benchmarkMode === 'Atomic (Box)') {
                    preds = result.toolCalls.filter(tc => tc.name === 'report_3d_object').map(tc => tc.arguments.object || tc.arguments);
                } else {
                    const call = result.toolCalls.find(tc => tc.name === 'report_3d_scene');
                    if (call) preds = call.arguments.objects || [];
                }
            }
            
            // Normalize Flat to Box format for scoring
            preds = preds.map(p => {
                let bbox = p.bbox_3d;
                if (!bbox && p.x !== undefined) {
                    bbox = [p.x, p.y, p.z, p.width, p.height, p.depth, p.roll || 0, p.pitch || 0, p.yaw || 0];
                }
                return { label: p.label || 'Unknown', bbox_3d: bbox || [0,0,0,1,1,1,0,0,0] };
            });

            setPredictions(preds);
            calculateScore(preds);
            setStatus("Complete");
        } catch (e) { 
            setStatus("Error: " + e.message);
            setDebugData({ error: e.message });
        }
    };

    return (
        <div className="flex flex-col h-full bg-slate-950 p-4 font-mono text-slate-200 overflow-hidden">
            <div className="flex justify-between items-center mb-4 bg-slate-900 p-3 rounded border border-slate-800">
                <div><h2 className="text-xl font-bold text-cyan-400">3D DEPTH BENCHMARK</h2></div>
                <div className="flex gap-4 items-center">
                    <div className="flex flex-col">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">View</label>
                        <select value={viewMode} onChange={(e) => setViewMode(e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1">
                            <option value="RGB">RGB</option>
                            <option value="Depth">Depth Map</option>
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Format</label>
                        <select value={benchmarkMode} onChange={(e) => setBenchmarkMode(e.target.value)} className="bg-slate-950 border border-slate-700 text-xs text-white rounded px-2 py-1">
                            <option value="Atomic (Flat)">Flat (Atomic)</option>
                            <option value="Atomic (Box)">Box (Atomic)</option>
                            <option value="Batch">Batch</option>
                        </select>
                    </div>
                    <button onClick={generateScenario} className="py-1 px-3 bg-slate-700 hover:bg-slate-600 rounded text-xs">New Scene</button>
                    <button onClick={runBenchmark} className="py-1 px-3 bg-cyan-700 hover:bg-cyan-600 rounded text-xs font-bold shadow-lg">RUN AI</button>
                </div>
            </div>
            
            <div className="relative flex-grow bg-black rounded border border-slate-800 overflow-hidden shadow-2xl flex">
                <div className="flex-grow relative">
                    <Canvas shadows gl={{ preserveDrawingBuffer: true }}>
                        <PerspectiveCamera makeDefault position={[0, 14, 14]} fov={45} near={0.1} far={35} />
                        <SceneContent objects={objects} viewMode={viewMode} setGlRef={(refs) => glRef.current = refs} />
                        <OrbitControls enablePan={false} maxPolarAngle={Math.PI / 2} target={[0,0,0]} />
                    </Canvas>
                    
                    {/* Depth Legend Overlay */}
                    {viewMode === 'Depth' && (
                        <div className="absolute top-4 right-4 h-48 w-12 bg-black/50 p-1 rounded border border-slate-600 flex flex-col items-center">
                            <div className="text-[8px] text-white mb-1">0.1m</div>
                            <div className="flex-grow w-4" style={{ background: 'linear-gradient(to bottom, #ffffff, #000000)' }}></div>
                            <div className="text-[8px] text-white mt-1">30m</div>
                        </div>
                    )}
                    
                    {/* Loading Overlay */}
                    {status === "Thinking..." && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                            <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                            <span className="text-cyan-400 font-bold text-xs animate-pulse">ANALYZING GEOMETRY...</span>
                        </div>
                    )}

                    {capturedImage && (
                        <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center bg-black/50">
                             <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-xl" />
                             <button onClick={() => setCapturedImage(null)} className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded pointer-events-auto">Close</button>
                        </div>
                    )}
                </div>
                
                {/* Debug Panel (Side) */}
                <div className="w-80 bg-slate-900 border-l border-slate-800 flex flex-col">
                    <div className="p-2 border-b border-slate-800 font-bold text-xs text-yellow-500">LLM INTERACTION LOG</div>
                    <div className="flex-grow overflow-y-auto p-2 text-[10px] space-y-3 custom-scrollbar">
                        {debugData ? (
                            <>
                                <div>
                                    <span className="text-slate-500 font-bold block">PROMPT</span>
                                    <div className="bg-black/30 p-1 rounded text-slate-300 break-words whitespace-pre-wrap">{debugData.prompt}</div>
                                </div>
                                <div>
                                    <span className="text-slate-500 font-bold block">RAW RESPONSE</span>
                                    <div className="bg-black/30 p-1 rounded text-slate-300 break-words whitespace-pre-wrap">{debugData.rawText}</div>
                                </div>
                                <div>
                                    <span className="text-slate-500 font-bold block">TOOL CALLS</span>
                                    <div className="bg-black/30 p-1 rounded text-cyan-300 break-words whitespace-pre-wrap font-mono">
                                        {JSON.stringify(debugData.toolCalls, null, 2)}
                                    </div>
                                </div>
                                {debugData.error && <div className="text-red-400 font-bold">ERROR: {debugData.error}</div>}
                            </>
                        ) : (
                            <div className="text-slate-600 italic text-center mt-10">Run Benchmark to see debug data.</div>
                        )}
                    </div>
                    {score && <div className="p-2 bg-slate-800 text-center text-green-400 font-bold border-t border-slate-700">ACCURACY: {(score.accuracy*100).toFixed(0)}%</div>}
                </div>
            </div>
        </div>
    );
`;

export const SPATIAL_DEPTH_PROTOCOL: ToolCreatorPayload = {
    name: 'Spatial 3D Depth Benchmark',
    description: 'Benchmarks 3D object grounding using specific Depth Shader visualizations. This helps verify if an AI Model can accurately interpret depth maps vs RGB images.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To benchmark spatial reasoning and depth perception capabilities of Vision Models.',
    parameters: [
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: SPATIAL_DEPTH_UI_IMPL
};
