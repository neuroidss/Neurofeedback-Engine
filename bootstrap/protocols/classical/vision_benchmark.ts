
import type { ToolCreatorPayload } from '../../../types';

const BENCHMARK_UI_IMPL = `
    const { useState, useEffect, useRef, useCallback } = React;

    const [status, setStatus] = useState("Idle");
    const [groundTruth, setGroundTruth] = useState([]);
    const [predictions, setPredictions] = useState([]);
    const [score, setScore] = useState(null);
    const [modelName, setModelName] = useState("");
    
    // --- SETTINGS ---
    const [benchmarkMode, setBenchmarkMode] = useState("Atomic"); // 'Atomic' (Multi-call) or 'Batch' (Array)
    const [gridMode, setGridMode] = useState("No Grid"); // 'No Grid', 'Grid Only', 'Both'
    
    // --- DEBUG STATE ---
    const [debugData, setDebugData] = useState(null);
    
    const canvasRef = useRef(null);
    const overlayRef = useRef(null);

    // --- UTILS: IoU & Distance ---
    const calculateIoU = (boxA, boxB) => {
        // [ymin, xmin, ymax, xmax]
        const yA = Math.max(boxA[0], boxB[0]);
        const xA = Math.max(boxA[1], boxB[1]);
        const yB = Math.min(boxA[2], boxB[2]);
        const xB = Math.min(boxA[3], boxB[3]);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
        const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);

        return interArea / (boxAArea + boxBArea - interArea + 0.0001);
    };

    // --- RENDERING HELPERS ---
    
    const drawGrid = (ctx, W, H) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 24px monospace'; 
        
        for(let i=0; i<=1000; i+=50) {
            const isMajor = i % 100 === 0;
            const pos = i;
            
            // Vertical (X) - CYAN
            ctx.beginPath();
            ctx.strokeStyle = isMajor ? 'rgba(0, 255, 255, 0.8)' : 'rgba(0, 255, 255, 0.2)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.moveTo(pos, 0); ctx.lineTo(pos, H);
            ctx.stroke();
            
            // Horizontal (Y) - MAGENTA
            ctx.beginPath();
            ctx.strokeStyle = isMajor ? 'rgba(255, 0, 255, 0.8)' : 'rgba(255, 0, 255, 0.2)';
            ctx.lineWidth = isMajor ? 2 : 1;
            ctx.moveTo(0, pos); ctx.lineTo(W, pos);
            ctx.stroke();
            
            // Labels (Only on Major)
            if (isMajor && i > 0 && i < 1000) {
                ctx.fillStyle = 'cyan';
                ctx.fillText(i, pos, 30);
                ctx.fillStyle = 'magenta';
                ctx.fillText(i, 40, pos);
            }
        }
    };

    const drawScene = (ctx, items, W, H) => {
        // 1. Clear & Dark Background
        ctx.fillStyle = '#050508';
        ctx.fillRect(0,0,W,H);

        // 2. Draw Shapes
        items.forEach(item => {
            const [ymin, xmin, ymax, xmax] = item.box;
            const width = xmax - xmin;
            const height = ymax - ymin;
            
            // Re-derive style from label (simplified)
            let colorHex = '#fff';
            if (item.label.includes('Red')) colorHex = '#ef4444';
            else if (item.label.includes('Blue')) colorHex = '#3b82f6';
            else if (item.label.includes('Green')) colorHex = '#22c55e';
            else if (item.label.includes('Yellow')) colorHex = '#eab308';
            
            ctx.fillStyle = colorHex;
            
            if (item.label.includes('Circle')) {
                const r = width/2;
                ctx.beginPath(); ctx.arc(xmin+r, ymin+r, r, 0, Math.PI*2); ctx.fill(); 
            } else if (item.label.includes('Square')) {
                ctx.fillRect(xmin, ymin, width, height);
            } else if (item.label.includes('Triangle')) {
                ctx.beginPath();
                ctx.moveTo(xmin + width/2, ymin);
                ctx.lineTo(xmin + width, ymin + height);
                ctx.lineTo(xmin, ymin + height);
                ctx.closePath();
                ctx.fill(); 
            }
        });
    };

    const refreshCanvas = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || groundTruth.length === 0) return;
        const ctx = canvas.getContext('2d');
        const W = 1000, H = 1000;
        
        // Always draw scene
        drawScene(ctx, groundTruth, W, H);
        
        // Conditionally draw grid on the SCREEN canvas
        // If 'Both', we show the grid so user sees the "full" info.
        if (gridMode !== 'No Grid') {
            drawGrid(ctx, W, H);
        }
    }, [groundTruth, gridMode]);

    useEffect(() => {
        refreshCanvas();
    }, [refreshCanvas]);

    const generateTest = () => {
        // Generate abstract data first (Decoupled from render)
        const items = [];
        const shapes = ['Circle', 'Square', 'Triangle'];
        const colors = ['Red', 'Blue', 'Green', 'Yellow'];
        const count = 2 + Math.floor(Math.random() * 3);
        
        for(let i=0; i<count; i++) {
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const colorName = colors[Math.floor(Math.random() * colors.length)];
            
            // Snap size to 50-unit increments
            const sizeUnits = 100 + (Math.floor(Math.random() * 4) * 50); 
            
            const maxPos = 1000 - sizeUnits - 50;
            const xUnits = 50 + (Math.floor(Math.random() * (maxPos / 50)) * 50);
            const yUnits = 50 + (Math.floor(Math.random() * (maxPos / 50)) * 50);
            
            // Box is exact integers [ymin, xmin, ymax, xmax]
            const box = [yUnits, xUnits, yUnits + sizeUnits, xUnits + sizeUnits];
            items.push({ label: \`\${colorName} \${shape}\`, box, id: i });
        }

        const canvas = canvasRef.current;
        if (canvas) { canvas.width = 1000; canvas.height = 1000; }

        setGroundTruth(items);
        setPredictions([]);
        setScore(null);
        setDebugData(null);
        setStatus("Ready");
        
        // Force refresh of overlay logic
        setTimeout(() => {
             const cvs = overlayRef.current;
             if (cvs) {
                 const ctx = cvs.getContext('2d');
                 ctx.clearRect(0,0,cvs.width, cvs.height);
             }
        }, 50);
    };

    const drawOverlay = (truth, preds) => {
        const cvs = overlayRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        const W = 1000, H = 1000;
        cvs.width = W; cvs.height = H;
        ctx.clearRect(0,0,W,H);
        
        // Draw Truth (Green Dashed)
        truth.forEach(item => {
            const [ymin, xmin, ymax, xmax] = item.box;
            const x = xmin;
            const y = ymin;
            const w = xmax-xmin;
            const h = ymax-ymin;
            
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 3;
            ctx.setLineDash([10, 10]);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#4ade80';
            ctx.font = '20px monospace';
            ctx.fillText(item.label, x, y - 10);
        });
        
        // Draw Preds (Red Solid)
        preds.forEach(item => {
            const [ymin, xmin, ymax, xmax] = item.box_2d;
            const x = xmin;
            const y = ymin;
            const w = xmax-xmin;
            const h = ymax-ymin;
            
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 4;
            ctx.setLineDash([]);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#f87171';
            ctx.font = '20px monospace';
            ctx.fillText(item.label + (item.iou ? \` (\${(item.iou*100).toFixed(0)}%)\` : ''), x, y + h + 25);
            
            // Connector
            if (item.matchedTruth) {
                const [ty1, tx1, ty2, tx2] = item.matchedTruth.box;
                const tx = (tx1+tx2)/2;
                const ty = (ty1+ty2)/2;
                const px = x + w/2;
                const py = y + h/2;
                
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(tx, ty);
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        });
    };

    const runBenchmark = async () => {
        if (groundTruth.length === 0) return;
        setStatus("Capturing...");
        setDebugData(null);
        
        const currentModel = runtime.getState().selectedModel;
        setModelName(currentModel.name);
        
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const W = 1000, H = 1000;
        
        const imagePayloads = [];
        
        // --- 1. CAPTURE IMAGES BASED ON MODE ---
        if (gridMode === 'No Grid') {
            drawScene(ctx, groundTruth, W, H);
            const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            imagePayloads.push({ type: 'image/jpeg', data: b64 });
        } 
        else if (gridMode === 'Grid Only') {
            drawScene(ctx, groundTruth, W, H);
            drawGrid(ctx, W, H);
            const b64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            imagePayloads.push({ type: 'image/jpeg', data: b64 });
        } 
        else if (gridMode === 'Both') {
            // Pass 1: Clean
            drawScene(ctx, groundTruth, W, H);
            const b64Clean = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            imagePayloads.push({ type: 'image/jpeg', data: b64Clean });
            
            // Pass 2: Grid
            drawGrid(ctx, W, H); // Add grid to existing scene
            const b64Grid = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
            imagePayloads.push({ type: 'image/jpeg', data: b64Grid });
        }
        
        // Restore Screen View
        refreshCanvas();
        
        setStatus("Thinking...");

        let promptText = "";
        let toolName = "";
        let systemPrompt = "You are a precise object detection system. Use the provided tools.";
        
        // Prompt Engineering based on Grid Input
        let gridContext = "";
        if (gridMode === 'Both') {
            gridContext = "INPUT: You are provided with TWO images. Image 1 is the clean scene. Image 2 has a 1000x1000 coordinate grid overlay. Use Image 2 to determine precise coordinates.";
        } else if (gridMode === 'Grid Only') {
            gridContext = "INPUT: You are provided with an image containing a 1000x1000 coordinate grid overlay. Use the grid lines to determine precise coordinates.";
        } else {
            gridContext = "INPUT: You are provided with a clean image. Coordinate space is 1000x1000.";
        }

        if (benchmarkMode === 'Atomic') {
            toolName = 'report_single_object';
            promptText = \`
            \${gridContext}
            Task: Find geometric shapes (Circle, Square, Triangle).
            Action: You MUST call the tool "report_single_object" MULTIPLE TIMES. Call it once for EACH object you see.
            Do NOT group objects. One tool call per object.
            Parameters: label, ymin, xmin, ymax, xmax.
            \`;
        } else {
            toolName = 'report_benchmark_objects';
            promptText = \`
            \${gridContext}
            Task: Find geometric shapes (Circle, Square, Triangle).
            Action: Call the tool "report_benchmark_objects" ONCE with a list of all objects.
            Important: For each object, use the key "box_2d" for the bounding box [ymin, xmin, ymax, xmax].
            \`;
        }

        const tool = runtime.tools.list().find(t => t.name === toolName);
        if (!tool) {
            setStatus("Error: Tool '" + toolName + "' not found.");
            return;
        }

        try {
            const result = await runtime.ai.processRequest(
                promptText, 
                systemPrompt, 
                [tool], 
                imagePayloads
            );
            
            setDebugData({
                model: currentModel.name,
                mode: benchmarkMode,
                grid: gridMode,
                systemPrompt: systemPrompt,
                userPrompt: promptText,
                rawResponse: result.text || "[No Text Output]",
                toolCalls: result.toolCalls || "None"
            });
            
            let detected = [];
            
            // 1. Process Tool Calls based on Strategy
            if (result.toolCalls && result.toolCalls.length > 0) {
                if (benchmarkMode === 'Atomic') {
                    detected = result.toolCalls
                        .filter(tc => tc.name === 'report_single_object')
                        .map(tc => {
                            const args = tc.arguments;
                            return {
                                label: args.label,
                                box_2d: [args.ymin, args.xmin, args.ymax, args.xmax]
                            };
                        });
                } else {
                    const relevantCall = result.toolCalls.find(tc => tc.name === 'report_benchmark_objects');
                    if (relevantCall) detected = relevantCall.arguments.detections || [];
                }
            } 
            
            // 2. Fallback: JSON Parsing
            if (detected.length === 0 && result.text) {
                try {
                    const match = result.text.match(/\{[\s\S]*\}/) || result.text.match(/\[\s*\{[\s\S]*\}\s*\]/);
                    if (match) {
                        const json = JSON.parse(match[0]);
                        if (Array.isArray(json)) detected = json; 
                        else if (json.detections) detected = json.detections;
                        else if (json.object) detected = [json.object];
                    }
                } catch(e) {}
            }
            
            let totalIoU = 0;
            let hits = 0;
            
            const processedPreds = detected.map(pred => {
                let bestIoU = 0;
                let match = null;
                
                if (!pred.box_2d || pred.box_2d.length !== 4) return { ...pred, iou: 0, matchedTruth: null };

                groundTruth.forEach(truth => {
                    const iou = calculateIoU(pred.box_2d, truth.box);
                    if (iou > bestIoU) {
                        bestIoU = iou;
                        match = truth;
                    }
                });
                
                if (bestIoU > 0.1) hits++;
                totalIoU += bestIoU;
                
                return { ...pred, iou: bestIoU, matchedTruth: match };
            });
            
            setPredictions(processedPreds);
            
            const avgIoU = detected.length > 0 ? (totalIoU / Math.max(groundTruth.length, detected.length)) : 0;
            setScore({ avgIoU, hits, total: groundTruth.length });
            setStatus("Complete");
            
            drawOverlay(groundTruth, processedPreds);
            
        } catch (e) {
            console.error("Benchmark Error:", e);
            setStatus("Error: " + e.message);
            setDebugData(prev => ({ ...prev, error: e.message }));
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-slate-900 p-4 gap-4 overflow-hidden">
            <div className="flex justify-between items-center bg-slate-800 p-4 rounded border border-slate-700">
                <div>
                    <h2 className="text-xl font-bold text-cyan-400">VISION MODEL BENCHMARK</h2>
                    <div className="text-xs text-slate-400">Test spatial accuracy of Multimodal LLMs</div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Grid Mode</label>
                        <select 
                            value={gridMode} 
                            onChange={(e) => setGridMode(e.target.value)}
                            className="bg-slate-900 border border-slate-600 text-xs text-white rounded px-2 py-1 outline-none focus:border-cyan-500"
                        >
                            <option value="No Grid">No Grid</option>
                            <option value="Grid Only">Grid Only</option>
                            <option value="Both">Both (2 Images)</option>
                        </select>
                    </div>
                    <div className="flex flex-col">
                        <label className="text-[10px] text-slate-500 font-bold uppercase">Strategy</label>
                        <select 
                            value={benchmarkMode} 
                            onChange={(e) => setBenchmarkMode(e.target.value)}
                            className="bg-slate-900 border border-slate-600 text-xs text-white rounded px-2 py-1 outline-none focus:border-cyan-500"
                        >
                            <option value="Atomic">Atomic (Multi-Call)</option>
                            <option value="Batch">Batch (Array)</option>
                        </select>
                    </div>
                    <div className="text-right border-l border-slate-600 pl-4">
                        <div className="text-xs font-bold text-purple-400">{modelName || "Select Model in Settings"}</div>
                        <div className={"text-sm font-bold " + (status === 'Complete' ? 'text-green-400' : 'text-yellow-500')}>{status}</div>
                    </div>
                </div>
            </div>
            
            <div className="flex-grow flex gap-4 min-h-0">
                {/* Canvas Container */}
                <div className="relative aspect-square h-full bg-black border border-slate-600 rounded shadow-2xl overflow-hidden shrink-0">
                    <canvas ref={canvasRef} className="w-full h-full object-contain" />
                    <canvas ref={overlayRef} className="absolute inset-0 w-full h-full object-contain pointer-events-none" />
                </div>
                
                {/* Controls & Results Column */}
                <div className="w-[450px] flex flex-col gap-4 min-w-[300px]">
                    <div className="bg-slate-800 p-4 rounded border border-slate-700 flex flex-col gap-2 shrink-0">
                        <button onClick={generateTest} className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded">
                            GENERATE TEST
                        </button>
                        <button onClick={runBenchmark} disabled={groundTruth.length === 0} className="w-full py-3 bg-cyan-700 hover:bg-cyan-600 text-white font-bold rounded disabled:opacity-50">
                            RUN BENCHMARK ({benchmarkMode})
                        </button>
                    </div>
                    
                    {/* DEBUG LOG PANEL */}
                    {debugData && (
                        <div className="bg-black/50 border border-slate-700 rounded p-2 flex flex-col flex-grow min-h-[200px] overflow-hidden">
                            <h3 className="text-xs font-bold text-yellow-400 border-b border-yellow-900/30 pb-1 mb-2 flex justify-between">
                                <span>LLM INTERACTION DEBUG</span>
                                <span className="text-slate-500 font-normal opacity-50">{debugData.mode} | {debugData.grid}</span>
                            </h3>
                            <div className="flex-grow overflow-y-auto custom-scrollbar space-y-3 p-1">
                                <div>
                                    <span className="text-[10px] text-slate-500 font-bold block">USER PROMPT</span>
                                    <div className="text-[9px] text-slate-400 font-mono bg-slate-900 p-1 rounded whitespace-pre-wrap select-text">
                                        {debugData.userPrompt}
                                    </div>
                                </div>
                                <div>
                                    <span className="text-[10px] text-slate-500 font-bold block">PARSED TOOL CALLS</span>
                                    <div className="text-[9px] text-cyan-300 font-mono bg-slate-900 p-1 rounded whitespace-pre-wrap border border-cyan-900/30 select-text">
                                        {typeof debugData.toolCalls === 'string' ? debugData.toolCalls : JSON.stringify(debugData.toolCalls, null, 2)}
                                    </div>
                                </div>
                                {debugData.error && (
                                    <div className="text-[10px] text-red-400 bg-red-900/20 p-1 rounded border border-red-900/50 select-text">
                                        ERROR: {debugData.error}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {score && (
                        <div className="bg-slate-800 p-4 rounded border border-slate-700 shrink-0">
                            <h3 className="text-sm font-bold text-slate-300 border-b border-slate-600 pb-2 mb-2">RESULTS</h3>
                            <div className="mb-4">
                                <div className="text-xs text-slate-500">AVG IoU</div>
                                <div className="text-3xl font-black text-white">{(score.avgIoU * 100).toFixed(1)}%</div>
                                <div className="w-full h-2 bg-slate-700 rounded mt-1 overflow-hidden">
                                    <div className={"h-full transition-all " + (score.avgIoU > 0.8 ? "bg-green-500" : score.avgIoU > 0.5 ? "bg-yellow-500" : "bg-red-500")} style={{width: (score.avgIoU*100)+'%'}}></div>
                                </div>
                            </div>
                            <div className="flex justify-between text-xs text-slate-400 font-bold">
                                <span>HITS: {score.hits}/{score.total}</span>
                                <span className="text-red-400">HALLUC: {Math.max(0, predictions.length - score.hits)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
`;

export const VISION_BENCHMARK_PROTOCOL: ToolCreatorPayload = {
    name: 'Vision Model Benchmark',
    description: 'A scientific utility to benchmark the spatial reasoning and object detection capabilities of Multimodal LLMs. Generates ground-truth geometry and scores model predictions via IoU.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To validate whether an LLM (e.g. Qwen-VL, Gemini, GPT-4o) provides accurate coordinate data for use in spatial agents.',
    parameters: [
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: BENCHMARK_UI_IMPL
};
