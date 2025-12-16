
import type { ToolCreatorPayload } from '../types';

// We define the inner implementation code as a separate string to avoid nested backtick confusion/syntax errors.
const VISION_NODE_IMPL = `
    if (!state.lastRun) state.lastRun = 0;
    if (!state.frameCount) state.frameCount = 0;
    if (!state.lastFpsTime) state.lastFpsTime = Date.now();
    if (state.fps === undefined) state.fps = 0;

    if (state.permissionDenied || state.initFailed) {
        const time = Date.now() / 1000;
        const simSmile = (Math.sin(time) + 1) / 2;
        const payload = { smile: simSmile, eyeOpen: 1.0, raw: [], matrix: null, isSimulated: true, status: 'simulating', message: 'Camera Error / Simulating', fps: 60 };
        bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload, confidence: 1 });
        return { output: payload };
    }

    if (!state.vision && !state.isInitializing) {
        state.isInitializing = true;
        state.loadingMessage = 'Initializing Core...';
        
        bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload: { status: 'loading', message: state.loadingMessage, fps: 0 }, confidence: 0 });

        (async () => {
            let progressTimer = null;
            try {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                    throw new Error("Camera API not supported");
                }

                const { FaceLandmarker, FilesetResolver } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/+esm");
                
                const originalConsoleError = console.error;
                console.error = (...args) => {
                    if (args[0] && typeof args[0] === 'string' && args[0].includes('TensorFlow Lite')) return;
                    originalConsoleError.apply(console, args);
                };

                try {
                    state.loadingMessage = 'Loading Wasm...';
                    bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload: { status: 'loading', message: state.loadingMessage, fps: 0 }, confidence: 0 });
                    
                    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm");
                    
                    let dlProgress = 0;
                    progressTimer = setInterval(() => {
                        dlProgress += Math.floor(Math.random() * 15);
                        if (dlProgress > 99) dlProgress = 99;
                        state.loadingMessage = "Downloading Model (" + dlProgress + "%)...";
                        bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload: { status: 'loading', message: state.loadingMessage, fps: 0 }, confidence: 0 });
                    }, 200);
                    
                    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                        baseOptions: {
                            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                            delegate: "GPU"
                        },
                        outputFaceBlendshapes: true,
                        outputFacialTransformationMatrixes: true, // ENABLE MATRIX OUTPUT
                        runningMode: "VIDEO",
                        numFaces: 1
                    });
                    clearInterval(progressTimer);
                    progressTimer = null;
                    
                    state.loadingMessage = 'Starting Stream...';
                    bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload: { status: 'loading', message: state.loadingMessage, fps: 0 }, confidence: 0 });
                    
                    const video = document.createElement("video");
                    video.autoplay = true;
                    video.playsInline = true;
                    video.muted = true;
                    
                    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                    video.srcObject = stream;
                    window.localCameraStream = stream;
                    
                    await new Promise((resolve) => {
                        video.onloadedmetadata = () => {
                            video.play().then(resolve).catch(e => {
                                console.error("Play failed", e);
                                resolve();
                            });
                        };
                    });
                    
                    state.vision = { faceLandmarker, video, lastVideoTime: -1 };
                    state.lastFrameTime = Date.now();
                    state.isInitializing = false;
                    
                    const activeMsg = { status: 'active', message: 'Camera Active', smile: 0, eyeOpen: 1, isSimulated: false, fps: 0 };
                    bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload: activeMsg, confidence: 1 });
                    
                } finally {
                    console.error = originalConsoleError;
                    if (progressTimer) clearInterval(progressTimer);
                }
            } catch (e) {
                console.error("[Vision] Init Failed:", e);
                if (progressTimer) clearInterval(progressTimer);
                state.initFailed = true;
                state.isInitializing = false;
                state.permissionDenied = true;
                
                bus.publish({ 
                    timestamp: Date.now(), 
                    sourceId: 'vision_source_1', 
                    type: 'Vision', 
                    payload: { status: 'error', message: 'Init Failed: ' + e.message, isSimulated: true, fps: 0 }, 
                    confidence: 0 
                });
            }
        })();
        
        return { output: { status: 'loading', message: state.loadingMessage, fps: 0 } };
    }
    
    if (state.isInitializing) {
        if (Math.random() > 0.8) { 
             bus.publish({ timestamp: Date.now(), sourceId: 'vision_source_1', type: 'Vision', payload: { status: 'loading', message: state.loadingMessage, fps: 0 }, confidence: 0 });
        }
        return { output: { status: 'loading', message: state.loadingMessage, fps: 0 } };
    }

    const { faceLandmarker, video } = state.vision;
    const now = Date.now();

    state.frameCount++;
    if (now - state.lastFpsTime >= 1000) {
        state.fps = Math.round((state.frameCount * 1000) / (now - state.lastFpsTime));
        state.frameCount = 0;
        state.lastFpsTime = now;
    }

    if (video.currentTime !== state.vision.lastVideoTime) {
        state.lastFrameTime = now;
        
        try {
            const startTime = performance.now();
            const detections = faceLandmarker.detectForVideo(video, startTime);
            
            if (detections.faceBlendshapes && detections.faceBlendshapes.length > 0) {
                 const shapes = detections.faceBlendshapes[0].categories;
                 // Extract Matrix if available
                 const matrix = detections.facialTransformationMatrixes && detections.facialTransformationMatrixes.length > 0 
                    ? detections.facialTransformationMatrixes[0].data 
                    : null;

                 state.lastDetectionTime = now;
                 
                 const smile = shapes.find(s => s.categoryName === 'mouthSmileLeft')?.score || 0;
                 const blink = shapes.find(s => s.categoryName === 'eyeBlinkLeft')?.score || 0;
                 const eyeOpen = 1.0 - blink;

                 if (!state.firstDetectionLogged) {
                     console.log('[Vision] Detection Active. Smile:', smile.toFixed(2));
                     state.firstDetectionLogged = true;
                 }

                 const payload = { smile, eyeOpen, raw: shapes, matrix, isSimulated: false, status: 'active', message: 'Tracking', fps: state.fps };
                 
                 bus.publish({
                     timestamp: now,
                     sourceId: 'vision_source_1',
                     type: 'Vision',
                     payload: payload,
                     confidence: 1
                 });
                 
                 state.vision.lastVideoTime = video.currentTime;
                 return { output: payload };
            } else {
                if (now - (state.lastDetectionTime || now) > 1000) {
                    const payload = { smile: 0, eyeOpen: 1, isSimulated: false, status: 'searching', message: 'Looking for face...', fps: state.fps };
                    bus.publish({ timestamp: now, sourceId: 'vision_source_1', type: 'Vision', payload, confidence: 0.5 });
                    state.vision.lastVideoTime = video.currentTime;
                    return { output: payload };
                }
            }
        } catch(e) {
             console.error("[Vision] Loop Error:", e);
        }
        state.vision.lastVideoTime = video.currentTime;
    } else {
        if (now - state.lastFrameTime > 2000) {
            const payload = { smile: 0, eyeOpen: 1, isSimulated: false, status: 'warning', message: 'Camera stream stuck (No frames)', fps: 0 };
             bus.publish({ timestamp: now, sourceId: 'vision_source_1', type: 'Vision', payload, confidence: 0 });
             return { output: payload };
        }
    }
    
    return { output: null };
`;

const CREATE_VISION_SOURCE: ToolCreatorPayload = {
    name: 'Create_Vision_Source',
    description: 'Creates a graph node that captures video from the webcam, runs MediaPipe Face Landmarker (with Blendshapes and Transformation Matrix), and publishes frames to the NeuroBus.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable the system to "see" the user and react to facial expressions, head pose, and presence.',
    parameters: [],
    implementationCode: `
        const nodeDefinition = {
            id: 'vision_source_1',
            type: 'Source',
            inputs: [],
            config: {},
            state: { lastRun: 0, permissionDenied: false, initAttempts: 0, lastDetectionTime: 0, firstDetectionLogged: false, isInitializing: false, vision: null, loadingMessage: 'Initializing...', lastFrameTime: 0, fps: 0 },
            implementation: ${JSON.stringify(VISION_NODE_IMPL)}
        };
        
        if (runtime.streamEngine) {
            if (runtime.streamEngine.hasNode('vision_source_1')) {
                 return { success: true, message: "Vision Source already active." };
            }
            runtime.streamEngine.addNode(nodeDefinition);
            runtime.streamEngine.start(); 
            return { success: true, message: "Vision Source active." };
        }
        return { success: true, node: nodeDefinition };
    `
};

const REPORT_BENCHMARK_OBJECTS: ToolCreatorPayload = {
    name: 'report_benchmark_objects',
    description: 'Reports ALL detected visual elements in a single list. Use this for models that can handle complex JSON arrays.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To allow the LLM to output structured vision data for accuracy calculation.',
    parameters: [
        {
            name: 'detections',
            type: 'array',
            description: 'List of detected items. Each item must have: "label" (string) and "box_2d" (array of 4 numbers [ymin, xmin, ymax, xmax] on a 0-1000 scale).',
            required: true
        }
    ],
    implementationCode: `
        return { success: true, detections: args.detections };
    `
};

const REPORT_SINGLE_OBJECT: ToolCreatorPayload = {
    name: 'report_single_object',
    description: 'Reports ONE detected object. You MUST call this tool multiple times, once for each object you see.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To allow weaker LLMs to report detections atom-by-atom without constructing complex arrays.',
    parameters: [
        { name: 'label', type: 'string', description: 'The name of the object (e.g. "Red Circle").', required: true },
        { name: 'ymin', type: 'number', description: 'Top Y coordinate (0-1000).', required: true },
        { name: 'xmin', type: 'number', description: 'Left X coordinate (0-1000).', required: true },
        { name: 'ymax', type: 'number', description: 'Bottom Y coordinate (0-1000).', required: true },
        { name: 'xmax', type: 'number', description: 'Right X coordinate (0-1000).', required: true }
    ],
    implementationCode: `
        return { success: true, object: { label: args.label, box_2d: [args.ymin, args.xmin, args.ymax, args.xmax] } };
    `
};

// --- NEW 3D TOOLS ---
const REPORT_3D_OBJECT: ToolCreatorPayload = {
    name: 'report_3d_object',
    description: 'Reports ONE detected object with its 3D bounding box. Use this when array format is preferred.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'For 3D spatial benchmarking.',
    parameters: [
        { name: 'label', type: 'string', description: 'Object label/name.', required: true },
        { 
            name: 'bbox_3d', 
            type: 'array', 
            description: '9-value array: [x, y, z, width, height, depth, roll, pitch, yaw].', 
            required: true 
        }
    ],
    implementationCode: `
        return { success: true, object: { label: args.label, bbox_3d: args.bbox_3d } };
    `
};

// NEW: Flattened version for small LLMs
const REPORT_3D_OBJECT_FLAT: ToolCreatorPayload = {
    name: 'report_3d_object_flat',
    description: 'Reports ONE detected object using individual numeric parameters instead of an array. Use this for models that struggle with JSON arrays.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'For 3D spatial benchmarking with robust parsing.',
    parameters: [
        { name: 'label', type: 'string', description: 'Object label.', required: true },
        { name: 'x', type: 'number', description: 'X position.', required: true },
        { name: 'y', type: 'number', description: 'Y position.', required: true },
        { name: 'z', type: 'number', description: 'Z position.', required: true },
        { name: 'width', type: 'number', description: 'Width.', required: true },
        { name: 'height', type: 'number', description: 'Height.', required: true },
        { name: 'depth', type: 'number', description: 'Depth.', required: true },
        { name: 'roll', type: 'number', description: 'Roll (rotation X).', required: true },
        { name: 'pitch', type: 'number', description: 'Pitch (rotation Y).', required: true },
        { name: 'yaw', type: 'number', description: 'Yaw (rotation Z).', required: true }
    ],
    implementationCode: `
        const { label, x, y, z, width, height, depth, roll, pitch, yaw } = args;
        return { success: true, object: { label, bbox_3d: [x, y, z, width, height, depth, roll, pitch, yaw] } };
    `
};

const REPORT_3D_SCENE: ToolCreatorPayload = {
    name: 'report_3d_scene',
    description: 'Reports ALL detected 3D objects in a single list. Use this in Batch Mode.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'For 3D spatial benchmarking.',
    parameters: [
        { 
            name: 'objects', 
            type: 'array', 
            description: 'List of objects. Each item must have: "label" and "bbox_3d" (9-value array: [x, y, z, w, h, d, roll, pitch, yaw]).',
            required: true 
        }
    ],
    implementationCode: `
        return { success: true, objects: args.objects };
    `
};

export const VISION_TOOLS = [
    CREATE_VISION_SOURCE, 
    REPORT_BENCHMARK_OBJECTS, 
    REPORT_SINGLE_OBJECT,
    REPORT_3D_OBJECT,
    REPORT_3D_OBJECT_FLAT,
    REPORT_3D_SCENE
];
