
import type { ToolCreatorPayload } from '../../../types';

const VJEPA_PYTHON_MCP = `
import os
import torch
import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import numpy as np
import base64
from io import BytesIO
from PIL import Image, ImageOps
import torchvision.transforms as transforms
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler
import time
import json

# --- CONFIG ---
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"[RealityAgent] Device: {device}")

# --- MODELS ---
vjepa_model = None
vjepa_processor = None
lcm_pipe = None

def load_models():
    global vjepa_model, vjepa_processor, lcm_pipe
    
    # 1. V-JEPA (The Anchor - Tracks Reality Stability)
    try:
        print(f"[RealityAgent] Loading V-JEPA...", flush=True)
        # Using the smaller vit_huge or vit_large depending on hub availability, let's stick to user choice but robustly
        loaded_obj = torch.hub.load('facebookresearch/vjepa2', 'vjepa2_vit_large')
        if isinstance(loaded_obj, tuple): vjepa_model = loaded_obj[0]
        else: vjepa_model = loaded_obj
        vjepa_model.to(device).eval()
        vjepa_processor = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])
    except Exception as e:
        print(f"[RealityAgent] V-JEPA Error: {e}", flush=True)

    # 2. LCM (The Forge - Rewrites Reality)
    try:
        print(f"[RealityAgent] Loading LCM...", flush=True)
        model_id = "SimianLuo/LCM_Dreamshaper_v7"
        lcm_pipe = StableDiffusionImg2ImgPipeline.from_pretrained(model_id)
        lcm_pipe.scheduler = LCMScheduler.from_config(lcm_pipe.scheduler.config)
        lcm_pipe.to(device)
        lcm_pipe.safety_checker = None
    except Exception as e:
        print(f"[RealityAgent] LCM Error: {e}", flush=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    load_models()
    yield

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    return { "status": "ok", "vjepa": vjepa_model is not None, "lcm": lcm_pipe is not None, "device": device }

@app.post("/loop")
async def loop(request: Request):
    """
    Combined Perception-Action Loop for speed.
    1. Embeds current frame (V-JEPA) -> Returns Vector.
    2. Takes 'dream_prompt' and 'strength' to re-render the frame (LCM).
    """
    if not lcm_pipe: return {"error": "Models loading"}
    
    try:
        data = await request.json()
        image_b64 = data.get("image")
        prompt = data.get("prompt", "reality")
        strength = float(data.get("strength", 0.0)) # 0.0 = Real, 1.0 = Dream
        
        if not image_b64: return {"error": "No image"}
        if ',' in image_b64: image_b64 = image_b64.split(',')[1]
        
        # Decode
        raw_img = Image.open(BytesIO(base64.b64decode(image_b64))).convert("RGB")
        
        # A. PERCEPTION (V-JEPA)
        embedding = []
        if vjepa_model:
            # V-JEPA expects video clips: (Batch, Channel, Time, Height, Width)
            # We must repeat the single frame along the Time dimension to satisfy the 3D convolution kernels.
            # Kernel size is typically 2 along temporal axis for V-JEPA 2.
            t_input = vjepa_processor(raw_img).unsqueeze(0).unsqueeze(2).repeat(1, 1, 2, 1, 1).to(device)
            
            with torch.no_grad():
                enc_out = vjepa_model(t_input)
                # Output shape handling varies by model dict vs tuple return
                if isinstance(enc_out, dict): enc_out = enc_out.get('last_hidden_state')
                elif isinstance(enc_out, tuple): enc_out = enc_out[0]
                
                # Average pooling to get a single vector per clip
                embedding = enc_out.mean(dim=1).mean(dim=0).squeeze().cpu().numpy().tolist()

        # B. ACTION (LCM Re-Rendering)
        # If strength is low (< 0.1), we return the raw image to save GPU.
        # This corresponds to "High Motion" states where V-JEPA detects change.
        if strength < 0.1:
            return { "embedding": embedding, "dream": None }

        # Resize for speed (512x512 is LCM standard)
        input_tensor = raw_img.resize((512, 512))
        
        with torch.inference_mode():
            dream_img = lcm_pipe(
                prompt=prompt,
                image=input_tensor,
                strength=strength,
                num_inference_steps=4,
                guidance_scale=8.0,
                lcm_origin_steps=50
            ).images[0]
            
        buf = BytesIO()
        dream_img.save(buf, format="JPEG", quality=85)
        dream_b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
        
        return { "embedding": embedding, "dream": dream_b64 }

    except Exception as e:
        print(f"[RealityAgent] Loop Error: {e}", flush=True)
        return {"error": str(e)}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8008))
    uvicorn.run(app, host="0.0.0.0", port=port)
`;

const VJEPA_UI_IMPL = `
    const { useState, useEffect, useRef, useCallback } = React;
    
    // --- STATE ---
    const [status, setStatus] = useState("Connecting...");
    const [serverUrl, setServerUrl] = useState(null);
    const [agentState, setAgentState] = useState("SYNCING"); // SYNCING, DREAMING, STABILIZING
    const [realityDescription, setRealityDescription] = useState("A standard room"); // VLM Context
    const [fantasyLayer, setFantasyLayer] = useState("cyberpunk neon city, high tech, futuristic"); // User Intent
    
    // Neural Metrics
    const [stability, setStability] = useState(1.0); // 1.0 = Still, 0.0 = Moving Fast
    const prevEmbedding = useRef(null);
    
    // Video Loop
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [currentDreamView, setCurrentDreamView] = useState(null); // The generated image
    const isLooping = useRef(false);
    const serverUrlRef = useRef(null); // Ref to avoid stale closures in loop
    
    // --- 1. BOOTSTRAP ---
    useEffect(() => {
        const boot = async () => {
            if (!runtime.isServerConnected()) { setStatus("Local Kernel Required"); return; }
            
            setStatus("Deploying Reality Engine...");
            await runtime.tools.run('Server File Writer', {
                filePath: 'reality_agent.py', content: ${JSON.stringify(VJEPA_PYTHON_MCP as string)}, baseDir: 'scripts'
            });
            
            const res = await runtime.tools.run('Start Python Process', {
                processId: 'reality_agent', scriptPath: 'reality_agent.py', venv: 'venv_vision'
            });
            
            if (res.port) {
                const url = 'http://localhost:' + res.port;
                setServerUrl(url);
                serverUrlRef.current = url;
                checkHealth(url);
            }
        };
        boot();
        return () => { isLooping.current = false; stopCamera(); };
    }, []);

    const checkHealth = async (url) => {
        const loop = async () => {
            try {
                const h = await fetch(url + '/health');
                const d = await h.json();
                if (d.status === 'ok' && d.vjepa && d.lcm) {
                    setStatus("Reality Engine Online (" + d.device + ")");
                    startCamera();
                    return;
                }
                setStatus("Loading Neural Models (Please wait)...");
            } catch(e) {}
            setTimeout(loop, 1000);
        };
        loop();
    };

    // --- 2. CAMERA & LOOP ---
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 512, height: 512 } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                isLooping.current = true;
                requestAnimationFrame(realityLoop);
                setStatus("Camera Active. Engine Loop Started.");
            }
        } catch(e) { setStatus("Camera Error: " + e.message); }
    };
    
    const stopCamera = () => {
        if (videoRef.current?.srcObject) videoRef.current.srcObject.getTracks().forEach(t => t.stop());
    };

    const cosineDistance = (a, b) => {
        if (!a || !b) return 0;
        let dot = 0, magA = 0, magB = 0;
        for (let i = 0; i < a.length; i++) {
            dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i];
        }
        return 1.0 - (dot / (Math.sqrt(magA) * Math.sqrt(magB) + 0.00001));
    };

    // --- OPTIMIZED RENDER LOOP ---
    const realityLoop = async () => {
        if (!isLooping.current || !videoRef.current || !canvasRef.current) return;
        
        // Wait if server not ready
        if (!serverUrlRef.current) {
             setTimeout(() => requestAnimationFrame(realityLoop), 500);
             return;
        }
        
        // Wait for video frame availability
        if (videoRef.current.readyState < 2) {
             setTimeout(() => requestAnimationFrame(realityLoop), 100);
             return;
        }
        
        const t0 = performance.now();
        
        // 1. Capture Reality
        const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(videoRef.current, 0, 0, 512, 512);
        
        // toDataURL is heavy, so we throttle via frame timing below
        const rawB64 = canvasRef.current.toDataURL('image/jpeg', 0.5);
        const cleanB64 = rawB64.split(',')[1];
        
        // 2. Calculate "Dream Strength" based on Stability
        const targetStrength = Math.max(0, (stability - 0.2) * 0.7); 
        
        // 3. Construct Prompt (Mixed Reality)
        const fullPrompt = \`\${fantasyLayer}, \${realityDescription}, highly detailed, 8k, seamless integration\`;

        try {
            const res = await fetch(serverUrlRef.current + '/loop', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    image: cleanB64,
                    prompt: fullPrompt,
                    strength: targetStrength
                })
            });
            
            if (!res.ok) throw new Error("Server Status " + res.status);
            
            const data = await res.json();
            
            if (data.embedding) {
                // Update V-JEPA Stability
                if (prevEmbedding.current) {
                    const delta = cosineDistance(prevEmbedding.current, data.embedding);
                    // Stability decays on movement, recovers slowly
                    const instantStability = Math.max(0, 1.0 - (delta * 10)); 
                    setStability(prev => (prev * 0.8) + (instantStability * 0.2));
                }
                prevEmbedding.current = data.embedding;
            }
            
            if (data.dream) {
                setAgentState("DREAMING");
                setCurrentDreamView("data:image/jpeg;base64," + data.dream);
            } else {
                setAgentState("STABILIZING");
                // When stabilizing, we don't update dream view, effectively freezing it or user sees side-by-side
            }
            
        } catch(e) {
            console.warn("Reality Loop Error:", e);
            setStatus("Loop Error (Retrying...)");
            await new Promise(r => setTimeout(r, 2000));
        }
        
        // 4. Frame Limiter
        const elapsed = performance.now() - t0;
        const delay = Math.max(0, 66 - elapsed); 
        
        if (isLooping.current) setTimeout(() => requestAnimationFrame(realityLoop), delay);
    };
    
    // --- 3. AGENT INTELLECT (Periodic VLM Scan) ---
    useEffect(() => {
        const scan = async () => {
            if (!isLooping.current || !videoRef.current) return;
            const tempCvs = document.createElement('canvas');
            tempCvs.width = 512; tempCvs.height = 512;
            tempCvs.getContext('2d').drawImage(videoRef.current, 0, 0);
            const b64 = tempCvs.toDataURL('image/jpeg', 0.5).split(',')[1];
            
            try {
                const desc = await runtime.ai.generateText(
                    "Describe the physical layout and main objects in this image in 5 words. E.g. 'Man sitting at wooden desk'.",
                    "You are a Scene Describer.",
                    [{ type: 'image/jpeg', data: b64 }]
                );
                setRealityDescription(desc.replace(/\\.$/, ''));
            } catch(e) {}
        };
        const interval = setInterval(scan, 5000); 
        return () => clearInterval(interval);
    }, [serverUrl]);

    return (
        <div className="flex flex-col h-full bg-black text-slate-200 font-mono relative overflow-hidden">
            
            {/* SPLIT VIEWPORT */}
            <div className="flex-grow flex border-b border-slate-800 bg-[#050505]">
                {/* LEFT: REALITY */}
                <div className="w-1/2 h-full relative border-r border-slate-800 overflow-hidden flex items-center justify-center">
                    <video ref={videoRef} className="w-full h-full object-cover opacity-80" playsInline muted />
                    <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs font-bold border-l-2 border-green-500">
                        RAW INPUT
                    </div>
                    {/* Capture Canvas (Hidden) */}
                    <canvas ref={canvasRef} width={512} height={512} className="hidden" />
                </div>

                {/* RIGHT: DREAM */}
                <div className="w-1/2 h-full relative overflow-hidden flex items-center justify-center bg-black">
                    {currentDreamView ? (
                        <img src={currentDreamView} className="w-full h-full object-cover animate-fade-in" />
                    ) : (
                        <div className="text-center p-4">
                            <div className="text-purple-500 font-bold text-lg mb-2">NEURAL LATENT SPACE</div>
                            <div className="text-slate-600 text-xs animate-pulse">Waiting for stability lock...</div>
                        </div>
                    )}
                    <div className="absolute top-2 left-2 bg-black/60 text-purple-300 px-2 py-1 rounded text-xs font-bold border-l-2 border-purple-500">
                        GENERATED REALITY
                    </div>
                </div>
            </div>

            {/* HUD OVERLAY */}
            <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
                
                {/* Top Bar */}
                <div className="flex justify-between items-start">
                    <div className="bg-black/60 backdrop-blur p-2 rounded border-l-4 border-cyan-500">
                        <h2 className="text-xl font-bold text-white italic">REALITY AGENT V2</h2>
                        <div className="text-[10px] text-cyan-400 font-bold tracking-widest">{status}</div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1">
                        <div className="text-[10px] font-bold bg-black/50 px-2 rounded text-slate-400">NEURAL STABILITY (V-JEPA)</div>
                        <div className="w-48 h-2 bg-slate-800 rounded overflow-hidden border border-slate-600">
                            <div 
                                className={\`h-full transition-all duration-300 \${stability > 0.8 ? 'bg-green-500' : 'bg-red-500'}\`} 
                                style={{ width: (stability * 100) + '%' }}
                            ></div>
                        </div>
                        <div className="text-[9px] text-slate-500">{stability > 0.8 ? "LOCKED: DREAMING" : "MOTION: STABILIZING"}</div>
                    </div>
                </div>

                {/* Bottom Control Deck */}
                <div className="bg-black/80 backdrop-blur border-t border-slate-700 p-4 pointer-events-auto flex flex-col gap-2">
                    <div className="flex gap-2 text-xs">
                        <span className="text-slate-500">REALITY CONTEXT:</span>
                        <span className="text-white">{realityDescription}</span>
                    </div>
                    <div className="flex gap-2 text-xs items-center">
                        <span className="text-purple-400 font-bold">FANTASY LAYER:</span>
                        <input 
                            type="text" 
                            value={fantasyLayer} 
                            onChange={(e) => setFantasyLayer(e.target.value)}
                            className="flex-grow bg-slate-900 border border-slate-600 rounded px-2 py-1 text-purple-200 outline-none focus:border-purple-500"
                        />
                    </div>
                    <div className="text-[9px] text-slate-500 text-center mt-1">
                        Try: "underwater city", "matrix code raining", "van gogh painting", "cyberpunk alley"
                    </div>
                </div>
            </div>
        </div>
    );
`;

export const VJEPA_2_PROTOCOL: ToolCreatorPayload = {
    name: 'Reality Re-Rendering Agent',
    description: 'True Mixed Reality. The agent captures the camera feed and uses V-JEPA stability metrics to drive a real-time LCM img2img loop. It rewrites reality pixel-by-pixel based on your prompt, blending the physical structure with generative dreams.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate seamless, embedded generative reality where the AI output replaces the raw feed based on neural stability.',
    parameters: [
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: VJEPA_UI_IMPL
};
