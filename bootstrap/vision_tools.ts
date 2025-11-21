

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

export const VISION_TOOLS = [CREATE_VISION_SOURCE];