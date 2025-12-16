
export const SENSOR_HOOKS = `
// --- 0. WORLD MODEL ENGINE (Object Permanence) ---
class ObjectTracker {
    constructor() {
        this.entities = []; // { id, label, box, depth, confidence, lastSeen, status }
        this.nextId = 1;
    }

    // IoU (Intersection over Union) for 2D boxes [ymin, xmin, ymax, xmax]
    calculateIoU(boxA, boxB) {
        const yA = Math.max(boxA[0], boxB[0]);
        const xA = Math.max(boxA[1], boxB[1]);
        const yB = Math.min(boxA[2], boxB[2]);
        const xB = Math.min(boxA[3], boxB[3]);

        const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
        const boxAArea = (boxA[2] - boxA[0]) * (boxA[3] - boxA[1]);
        const boxBArea = (boxB[2] - boxB[0]) * (boxB[3] - boxB[1]);

        return interArea / (boxAArea + boxBArea - interArea + 0.0001);
    }

    update(rawDetections, isStatic) {
        // 1. Decay all existing entities
        this.entities.forEach(e => {
            e.matchedThisFrame = false;
            // Static camera? Decay slower (trust memory). Moving? Decay faster (trust eyes).
            e.confidence -= isStatic ? 0.02 : 0.05; 
        });

        // 2. Match new detections to existing entities
        rawDetections.forEach(det => {
            let bestMatch = null;
            let bestIoU = 0;

            // Find best overlap
            this.entities.forEach(ent => {
                const iou = this.calculateIoU(det.box, ent.box);
                // We also check label consistency loosely (or trust spatial overlap more)
                if (iou > 0.3 && iou > bestIoU) {
                    bestIoU = iou;
                    bestMatch = ent;
                }
            });

            if (bestMatch) {
                // UPDATE EXISTING
                bestMatch.matchedThisFrame = true;
                bestMatch.confidence = Math.min(1.0, bestMatch.confidence + 0.2); // Boost confidence
                bestMatch.lastSeen = Date.now();
                
                // Linear Interpolation (Smoothing) for box
                const alpha = 0.3;
                bestMatch.box = [
                    bestMatch.box[0] * (1-alpha) + det.box[0] * alpha,
                    bestMatch.box[1] * (1-alpha) + det.box[1] * alpha,
                    bestMatch.box[2] * (1-alpha) + det.box[2] * alpha,
                    bestMatch.box[3] * (1-alpha) + det.box[3] * alpha
                ];
                
                // Update label if the new one is different but confident (simple override for now)
                // In a real system, we'd use a voting mechanism.
                bestMatch.label = det.label; 
                bestMatch.status = det.status;
                bestMatch.depth = det.depth;

            } else {
                // CREATE NEW (Hypothesis)
                // If camera is static, we are stricter about adding new things to avoid "pop-in"
                // unless we are really sure (future: check det score if available)
                this.entities.push({
                    id: 'ent_' + (this.nextId++),
                    label: det.label,
                    box: det.box,
                    depth: det.depth,
                    status: det.status,
                    confidence: 0.4, // Start as Hypothesis
                    lastSeen: Date.now(),
                    matchedThisFrame: true,
                    type: det.type // object or affordance
                });
            }
        });

        // 3. Prune dead entities
        this.entities = this.entities.filter(e => e.confidence > 0.0);

        return this.entities;
    }
    
    getConfirmed() { return this.entities.filter(e => e.confidence > 0.75); }
    getHypotheses() { return this.entities.filter(e => e.confidence > 0.3 && e.confidence <= 0.75); }
}

const useSemanticVision = (runtime, memory, active, heading, activeLore, modelsReady, stabilityScore) => {
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const isLooping = useRef(false);
    const trackerRef = useRef(new ObjectTracker());
    
    const [visionStatus, setVisionStatus] = useState("Offline");
    const [lastAiResponse, setLastAiResponse] = useState(""); 
    
    // Split state for UI visualization
    const [detections, setDetections] = useState([]); // All tracks for AR overlay
    const [worldModel, setWorldModel] = useState({ confirmed: [], hypotheses: [] }); // For Agent
    
    const [debugImageUrl, setDebugImageUrl] = useState(null);
    const imageEmbedderRef = useRef(null);

    useEffect(() => {
        const initEmbedder = async () => {
            if (imageEmbedderRef.current) return;
            if (!modelsReady) return; 

            try {
                const extractor = await runtime.ai.getFeatureExtractor('Xenova/clip-vit-base-patch32');
                imageEmbedderRef.current = extractor;
                console.log("[Sensors] CLIP Loaded Successfully.");
            } catch (e) {
                 console.error("[Sensors] CLIP Init Failed:", e);
                 setVisionStatus("AI Vision Init Failed");
            }
        };
        initEmbedder();
    }, [modelsReady]);

    useEffect(() => {
        isLooping.current = active;
        if (active) startCamera();
        else stopCamera();
        if (active) loop();
        return () => { isLooping.current = false; stopCamera(); };
    }, [active]);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.play();
                setVisionStatus("Active");
            }
        } catch(e) { 
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play();
                    setVisionStatus("Active");
                }
            } catch (err2) { setVisionStatus("Camera Error"); }
        }
    };

    const stopCamera = () => {
        if (videoRef.current && videoRef.current.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(t => t.stop());
            setVisionStatus("Offline");
        }
    };

    const loop = async () => {
        if (!isLooping.current) return;
        
        const processingStart = Date.now();
        
        if (videoRef.current && videoRef.current.readyState >= 2 && canvasRef.current && !memory.isIngesting) {
            try {
                const ctx = canvasRef.current.getContext('2d');
                const WIDTH = 512;
                const HEIGHT = 384;
                canvasRef.current.width = WIDTH;
                canvasRef.current.height = HEIGHT;
                
                // 1. Draw Clean Video
                ctx.drawImage(videoRef.current, 0, 0, WIDTH, HEIGHT);
                const cleanDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.6);
                const cleanB64 = cleanDataUrl.split(',')[1];
                
                // 2. Draw Grounding Grid (Benchmark Style - High Precision)
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 12px monospace'; 

                for(let i=0; i<=1000; i+=50) {
                    const isMajor = i % 100 === 0;
                    const normalized = i / 1000;
                    
                    // Vertical (X) - CYAN
                    const x = normalized * WIDTH;
                    ctx.beginPath();
                    ctx.strokeStyle = isMajor ? 'rgba(0, 255, 255, 0.6)' : 'rgba(0, 255, 255, 0.15)';
                    ctx.lineWidth = isMajor ? 2 : 1;
                    ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT);
                    ctx.stroke();
                    
                    // Horizontal (Y) - MAGENTA
                    const y = normalized * HEIGHT;
                    ctx.beginPath();
                    ctx.strokeStyle = isMajor ? 'rgba(255, 0, 255, 0.6)' : 'rgba(255, 0, 255, 0.15)';
                    ctx.lineWidth = isMajor ? 2 : 1;
                    ctx.moveTo(0, y); ctx.lineTo(WIDTH, y);
                    ctx.stroke();
                }
                
                const gridDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.6);
                const gridB64 = gridDataUrl.split(',')[1];
                
                setDebugImageUrl(gridDataUrl);
                setVisionStatus("Analysing...");
                
                const directionContext = activeLore.spatialLabels(heading);
                
                // --- FRAMEWORK TOOL RETRIEVAL ---
                const detectTool = runtime.tools.list().find(t => t.name === 'detect_spatial_features');
                
                if (!detectTool) {
                    runtime.logEvent("[Sensors] ⚠️ Error: 'detect_spatial_features' tool not found in framework.");
                    setVisionStatus("Missing Tool");
                    return;
                }
                
                // --- STABILITY CHECK ---
                // If stability score is high (>0.8), we assume camera is static.
                // We tell the LLM to focus on *refining* what it sees rather than finding new things.
                const isStatic = stabilityScore > 0.8;
                const stabilityContext = isStatic ? 
                    "CAMERA STATUS: STATIC (Tripod/Resting). Do not hallucinate new objects. Verify existing." : 
                    "CAMERA STATUS: MOVING. Scan for new features.";

                const prompt = \`Context: \${directionContext}. \${stabilityContext}
                Image 1: Clean View. 
                Image 2: Grid View (0-1000). Cyan Lines = X Axis. Magenta Lines = Y Axis.
                
                Task: Analyze the environment.
                1. Identify key objects (furniture, hazards, clutter). Determine their 2D box [ymin, xmin, ymax, xmax] using the grid lines. Estimate depth (0=close, 100=far).
                2. Identify free floor space for navigation.
                
                Call the 'detect_spatial_features' tool with your findings. Do NOT use any other tool.\`;
                
                // runtime.logEvent("[Sensors] 👁️ Scanning...");

                const response = await runtime.ai.processRequest(
                    prompt, 
                    activeLore.visionPrompt, 
                    [detectTool], 
                    [ 
                        { type: 'image/jpeg', data: cleanB64 }, 
                        { type: 'image/jpeg', data: gridB64 }
                    ]
                );
                
                let rawFrameDetections = [];
                let toolCallFound = false;
                
                const processDetectionPayload = (objects, free_spaces) => {
                    const safeUnpack = (val) => {
                        if (typeof val === 'string') {
                            try { return JSON.parse(val); } catch(e) { return []; }
                        }
                        return Array.isArray(val) ? val : [];
                    };

                    const cleanObjects = safeUnpack(objects);
                    const cleanSpaces = safeUnpack(free_spaces);
                    
                    // runtime.logEvent(\`[Sensors] ✅ Raw Data: \${cleanObjects.length} Objects\`);
                    
                    cleanObjects.forEach(obj => {
                        let box = obj.box_2d || [0,0,0,0];
                        if (!Array.isArray(box)) box = [0,0,0,0];
                        
                        const finalLabel = obj.label || obj.name || obj.type || 'Unknown';

                        rawFrameDetections.push({
                            label: finalLabel,
                            status: obj.status || 'Balanced',
                            box: box,
                            depth: (obj.depth_estimate || 50) * 10,
                            type: 'object'
                        });
                    });
                    
                    cleanSpaces.forEach(pt => {
                        let coords = Array.isArray(pt) ? pt : (pt.point_2d || [500, 500]);
                        rawFrameDetections.push({
                            label: 'Free Space',
                            status: 'Open',
                            box: [coords[1]-20, coords[0]-20, coords[1]+20, coords[0]+20], // Point to Box
                            depth: 0,
                            type: 'affordance'
                        });
                    });
                };

                // --- FRAMEWORK RESPONSE HANDLING ---
                if (response.toolCalls && response.toolCalls.length > 0) {
                    const calls = Array.isArray(response.toolCalls) ? response.toolCalls : [response.toolCalls];
                    
                    for (const call of calls) {
                        if (call.name === 'detect_spatial_features') {
                            setLastAiResponse("Tool Called: " + call.name);
                            toolCallFound = true;
                            // Framework services (OpenAI/Gemini/Ollama) handle JSON parsing and arguments extraction
                            processDetectionPayload(call.arguments.objects, call.arguments.free_spaces);
                        }
                    }
                } else if (response.text) {
                     setLastAiResponse("Raw Text (Failed Call): " + response.text.substring(0, 50) + "...");
                }
                
                // --- UPDATE WORLD MODEL ---
                const trackedEntities = trackerRef.current.update(rawFrameDetections, isStatic);
                const confirmed = trackerRef.current.getConfirmed();
                const hypotheses = trackerRef.current.getHypotheses();
                
                // Only confirmed objects are added to Memory
                confirmed.forEach(ent => {
                    // Only ingest if it's new to the memory or status changed
                    // (Simple deduplication logic handled in Memory layer usually, but we can gate it here)
                    if (ent.confidence > 0.9 && ent.type === 'object' && Math.random() > 0.8) {
                         if (ent.status && activeLore.statusLabels && ent.status !== activeLore.statusLabels.neutral) {
                            memory.ingest({
                                content: \`Confirmed: \${ent.label} at depth \${(ent.depth/10).toFixed(0)}\`,
                                chi: ent.status,
                                tags: [directionContext.split(' ')[0], '3d_object', ent.label],
                                type: 'observation'
                            });
                        }
                    }
                });

                setDetections(trackedEntities); // Show ALL to UI (with visual distinction)
                setWorldModel({ confirmed, hypotheses }); // Separate for Agent logic
                
                setVisionStatus(\`Tracking \${confirmed.length} objects (\${hypotheses.length} pending)\`);

            } catch(e) {
                runtime.logEvent("[Sensors] ❌ Error: " + e.message);
                setVisionStatus("Vision Error");
            }
        }
        
        const elapsed = Date.now() - processingStart;
        if (isLooping.current) setTimeout(loop, Math.max(500, 2000 - elapsed));
    };

    return { videoRef, canvasRef, visionStatus, detections, worldModel, debugImageUrl, lastAiResponse };
};

const useAudioInput = (runtime, active) => {
    const [isListening, setIsListening] = useState(false);
    const [lastInput, setLastInput] = useState("");

    useEffect(() => {
        if (!active) { setIsListening(false); return; }
        const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Recognition) return;
        const rec = new Recognition();
        rec.continuous = true;
        rec.interimResults = false;
        rec.lang = 'en-US';
        rec.onresult = (event) => {
            const last = event.results.length - 1;
            const text = event.results[last][0].transcript;
            setLastInput(text);
        };
        try { rec.start(); setIsListening(true); } catch(e) {}
        return () => { if (rec) rec.stop(); };
    }, [active]);
    return { isListening, lastInput, clearInput: () => setLastInput("") };
};

const useCompass = (active) => {
    const [heading, setHeading] = useState(null);
    useEffect(() => {
        if (!active) return;
        const handleOrientation = (e) => {
            if (e.webkitCompassHeading) { setHeading(e.webkitCompassHeading); } 
            else if (e.alpha !== null) { setHeading(360 - e.alpha); }
        };
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
             DeviceOrientationEvent.requestPermission()
                .then(response => { if (response == 'granted') window.addEventListener('deviceorientation', handleOrientation); })
                .catch(console.error);
        } else {
             window.addEventListener('deviceorientation', handleOrientation);
        }
        return () => window.removeEventListener('deviceorientation', handleOrientation);
    }, [active]);
    return heading;
};
`;
