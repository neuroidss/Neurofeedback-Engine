
import type { ToolCreatorPayload } from '../../../types';

// ==================================================================================
// 1. NEURO WORLD V99 HYBRID (NATIVE + WEB STREAM)
// ==================================================================================
const NEURO_WORLD_PYTHON_CODE = `
import os
import sys
import time
import threading
import socket
import queue
import io
import base64
import random
import requests
import cv2
import numpy as np
import pygame
import gc
from PIL import Image, ImageOps
import torch
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler, AutoencoderTiny
from fastapi import FastAPI, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# --- CONFIG ---
MODEL_ID = "SimianLuo/LCM_Dreamshaper_v7" 
TAESD_ID = "madebyollin/taesd"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
GEN_W, GEN_H = 512, 384
LCM_STEPS = 3 
LLM_API_URL = "http://127.0.0.1:8080/v1/chat/completions"

# --- PERFORMANCE TUNING ---
HEADLESS = False  # Set True if you ONLY want the browser view
GC_FREQ = 100     # Garbage collection frequency

# --- STREAM MANAGER (Thread-Safe Buffer) ---
class StreamManager:
    def __init__(self):
        self.active = False
        self.lock = threading.Lock()
        self.latest_jpeg = None
        
    def update(self, cv2_img):
        if not self.active: return
        # Encoding is fast (~2-4ms for 512x384), doing it here is okay
        # provided we don't block on network I/O
        ret, buffer = cv2.imencode('.jpg', cv2_img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        if ret:
            with self.lock:
                self.latest_jpeg = buffer.tobytes()

    def get_frame(self):
        with self.lock:
            return self.latest_jpeg

stream_manager = StreamManager()

# --- DIRECT KERNEL I/O (The FPS Fix for Logging) ---
class DirectLogger(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.queue = queue.Queue() 
        self.start()
    
    def log(self, msg):
        self.queue.put(msg)
    
    def run(self):
        while True:
            msg = self.queue.get() 
            try:
                os.write(1, (msg + "\\n").encode())
            except: pass
            self.queue.task_done()

logger = DirectLogger()

# --- WEB SERVER (Threaded) ---
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/")
def read_root():
    return {"status": "Neuro World V99 Online"}

@app.get("/video_feed")
def video_feed():
    stream_manager.active = True
    def gen():
        # Hex-escaped CRLF to prevent string literal parsing issues in TS/Python bridge
        header = b'--frame\\x0d\\x0aContent-Type: image/jpeg\\x0d\\x0a\\x0d\\x0a'
        footer = b'\\x0d\\x0a'
        while True:
            frame = stream_manager.get_frame()
            if frame:
                yield (header + frame + footer)
            else:
                pass 
            time.sleep(0.05) # Limit stream to ~20 FPS max to save bandwidth
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.post("/action/toggle_stream")
def toggle_stream():
    stream_manager.active = not stream_manager.active
    return {"stream_active": stream_manager.active}

def run_server():
    # STRICT POLICY: Dynamic Port Injection by Kernel.
    # Script crashes if PORT is missing to prevent hardcoded defaults.
    port = int(os.environ["PORT"])
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")

# ==================================================================================
# 🧠 GAME MASTER
# ==================================================================================
class GameMaster:
    def __init__(self):
        self.focus_obj = "Cyberpunk City"
        self.lock = threading.Lock()

    def update(self, text):
        with self.lock:
            clean = text.strip().replace(".", "").split("\\n")[0]
            if len(clean) > 3:
                self.focus_obj = clean

    def get_prompt(self):
        with self.lock:
            return f"{self.focus_obj}, masterpiece, 8k, raw photo, sharp focus, intricate details"

# ==================================================================================
# 👁️ VISION CORTEX
# ==================================================================================
class VisionCortex(threading.Thread):
    def __init__(self, gm_instance, controller_ref, status_dict):
        super().__init__()
        self.daemon = True
        self.gm = gm_instance
        self.ctrl = controller_ref
        self.status = status_dict
        self.frame_buffer = [] 
        self.lock = threading.Lock()

    def see(self, pil_image):
        with self.lock:
            small = pil_image.resize((256, 192), Image.NEAREST)
            self.frame_buffer.append(small)
            if len(self.frame_buffer) > 3:
                self.frame_buffer.pop(0)

    def _encode_image(self, img):
        buffered = io.BytesIO()
        img.save(buffered, format="JPEG", quality=60)
        return base64.b64encode(buffered.getvalue()).decode("utf-8")

    def run(self):
        while True: 
            start_t = time.time()
            frames_to_send = []
            
            with self.lock:
                if len(self.frame_buffer) >= 2:
                    frames_to_send = list(self.frame_buffer)
            
            if frames_to_send:
                try:
                    content_payload = []
                    for frame in frames_to_send:
                        b64 = self._encode_image(frame)
                        content_payload.append({
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
                        })
                    
                    state = self.ctrl.get_state()
                    action_hint = "IDLE"
                    if state["ly"] < -0.1: action_hint = "ZOOM IN"
                    elif abs(state["lx"]) > 0.1: action_hint = "MOVE"
                    
                    content_payload.append({
                        "type": "text", 
                        "text": f"Context: Cyberpunk. Action: {action_hint}. Main object in focus? Return NAME only."
                    })

                    payload = {
                        "model": "qwen",
                        "messages": [{"role": "user", "content": content_payload}],
                        "max_tokens": 12,
                        "temperature": 0.1
                    }
                    
                    r = requests.post(LLM_API_URL, json=payload, timeout=0.8)
                    
                    if r.status_code == 200:
                        response = r.json()
                        text = response['choices'][0]['message']['content']
                        self.gm.update(text)
                        self.status["brain_fps"] = 1.0 / (time.time() - start_t + 0.001)
                        self.status["thought"] = text[:30]
                except: 
                    pass
            
            time.sleep(0.2)

# ==================================================================================
# 🔧 PHYSICS
# ==================================================================================
def apply_physics(img_pil, inp):
    img_np = np.array(img_pil)
    h, w = img_np.shape[:2]
    
    move_x = -(inp["lx"]) * 20 
    zoom_input = (-inp["ly"]) * 0.08
    pan_x = -(inp["rx"]) * 35 
    pan_y = -(inp["ry"]) * 25
    
    total_zoom = 1.002 + zoom_input

    M = cv2.getRotationMatrix2D((w//2, h//2), 0, total_zoom)
    M[0, 2] += move_x + pan_x
    M[1, 2] += pan_y
    
    warped = cv2.warpAffine(img_np, M, (w, h), borderMode=cv2.BORDER_REFLECT_101)
    is_moving = abs(zoom_input) > 0.01 or abs(move_x) > 1
    
    noise_lvl = 10 if is_moving else 4
    noise = np.random.randint(-noise_lvl, noise_lvl, (h, w, 3), dtype=np.int16)
    res = np.clip(warped.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    return Image.fromarray(res), is_moving

def match_palette(source_pil, target_pil, inertia=0.3):
    src = np.array(source_pil).astype(np.float32)
    tgt = np.array(target_pil).astype(np.float32)
    mu_src, std_src = cv2.meanStdDev(src)
    mu_tgt, std_tgt = cv2.meanStdDev(tgt)
    correction = (tgt - mu_tgt.reshape(1,1,3)) * (std_src.reshape(1,1,3) / (std_tgt.reshape(1,1,3) + 1e-5)) + mu_src.reshape(1,1,3)
    correction = np.clip(correction, 0, 255)
    final = correction * inertia + tgt * (1.0 - inertia)
    return Image.fromarray(final.astype(np.uint8))

class Controller:
    def __init__(self):
        os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
        pygame.init()
        pygame.joystick.init()
        self.joy = pygame.joystick.Joystick(0) if pygame.joystick.get_count() > 0 else None
        if self.joy: self.joy.init()
    def _dz(self, val): return val if abs(val) > 0.15 else 0.0
    def get_state(self):
        pygame.event.pump()
        s = {"lx": 0.0, "ly": 0.0, "rx": 0.0, "ry": 0.0, "actions": []}
        if self.joy:
            s["lx"] = self._dz(self.joy.get_axis(0))
            s["ly"] = self._dz(self.joy.get_axis(1))
            ax = self.joy.get_numaxes()
            s["rx"] = self._dz(self.joy.get_axis(3)) if ax > 3 else 0.0
            s["ry"] = self._dz(self.joy.get_axis(4)) if ax > 4 else 0.0
            if self.joy.get_button(3): s["actions"].append("RESET")
        return s

class V99Engine:
    def __init__(self):
        print("☢️ Init V99 Engine (Hybrid)...")
        try:
            self.pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
                MODEL_ID, torch_dtype=torch.float16, use_safetensors=True, safety_checker=None
            ).to(DEVICE)
            try: self.pipe.vae = AutoencoderTiny.from_pretrained(TAESD_ID, torch_dtype=torch.float16).to(DEVICE)
            except: pass
            self.pipe.scheduler = LCMScheduler.from_config(self.pipe.scheduler.config)
            self.pipe.set_progress_bar_config(disable=True)
            if DEVICE == 'cuda':
                # Disable fullgraph to improve stability with attention processors
                self.pipe.unet = torch.compile(self.pipe.unet, mode="reduce-overhead", fullgraph=False)
        except Exception as e:
            print(f"Engine Init Error: {e}")
            self.pipe = None

    @torch.inference_mode()
    def render(self, image_input, prompt, strength):
        if not self.pipe:
            return image_input # Passthrough if failed
        min_safe = (1.0 / LCM_STEPS) + 0.02
        safe_strength = max(strength, min_safe)
        
        result = self.pipe(
            prompt=prompt,
            negative_prompt="candle, fire, blur, low quality, distortion, water, bad anatomy, text, watermark",
            image=image_input,
            num_inference_steps=LCM_STEPS, 
            strength=safe_strength,
            guidance_scale=1.0, 
            output_type="pil"
        ).images[0]
        return result

def main():
    gc.disable()
    
    # START SERVER THREAD
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    
    ctrl = Controller()
    eng = V99Engine()
    gm = GameMaster()
    
    status = {"brain_fps": 0.0, "thought": "Init"}
    brain = VisionCortex(gm, ctrl, status)
    brain.start()

    current_pil = Image.fromarray(np.random.randint(50, 100, (GEN_H, GEN_W, 3), dtype=np.uint8))
    current_pil = eng.render(current_pil, gm.get_prompt(), 1.0)
    
    print("🚀 STARTED V99: HYBRID (NATIVE + STREAM)")
    
    t_last = time.time()
    frame_count = 0
    
    if not HEADLESS:
        cv2.namedWindow("V99 NEURO WORLD", cv2.WINDOW_NORMAL)
    
    running = True
    while running:
        state = ctrl.get_state()
        if "RESET" in state["actions"]:
            gm.focus_obj = "Cyberpunk City"
            current_pil = eng.render(current_pil, gm.get_prompt(), 1.0)

        # 1. Physics & Render
        input_pil, is_moving = apply_physics(current_pil, state)
        prompt = gm.get_prompt()
        strength = 0.55 if is_moving else 0.35
        rendered_pil = eng.render(input_pil, prompt, strength)
        current_pil = match_palette(current_pil, rendered_pil, inertia=0.3)

        # 2. Brain Feed
        if frame_count % 3 == 0:
            brain.see(current_pil)
            
        # 3. Telemetry
        t_now = time.time()
        dt = max(0.001, t_now - t_last)
        fps = 1.0 / dt
        t_last = t_now
        
        if frame_count % 60 == 0:
            logger.log(f"STATS::FPS={int(fps)}::OBJ={gm.focus_obj}")
            if frame_count % GC_FREQ == 0: gc.collect()

        # 4. Display & Stream
        img_np = np.array(current_pil)
        img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
        
        # HUD for Local Window
        cv2.line(img_bgr, (GEN_W//2-10, GEN_H//2), (GEN_W//2+10, GEN_H//2), (0,255,0), 1)
        cv2.putText(img_bgr, f"FPS:{int(fps)}", (10, GEN_H-10), 0, 0.5, (0,255,0), 1)
        
        # PUSH TO BROWSER (If active)
        if stream_manager.active:
            stream_manager.update(img_bgr)

        # LOCAL WINDOW
        if not HEADLESS:
            cv2.imshow("V99 NEURO WORLD", img_bgr)
            if cv2.waitKey(1) & 0xFF == ord('q'): running = False
            
        frame_count += 1

    pygame.quit()
    if not HEADLESS: cv2.destroyAllWindows()
    gc.enable()

if __name__ == "__main__":
    main()
`;

// ==================================================================================
// 2. UI IMPLEMENTATION (STREAM VIEWER)
// ==================================================================================
const NEURO_WORLD_UI_IMPL = `
    const { useState, useEffect, useRef } = React;
    const [status, setStatus] = useState("Idle");
    const [fps, setFps] = useState(0);
    const [biome, setBiome] = useState("Unknown");
    const [logs, setLogs] = useState([]);
    const [serverUrl, setServerUrl] = useState(""); // EMPTY - DYNAMIC ONLY
    const [streamActive, setStreamActive] = useState(false);
    
    const PROCESS_ID = 'neuro_world_native';
    const SCRIPT_NAME = 'neuro_world.py';
    
    const pollLogs = async () => {
        if (!runtime.isServerConnected()) return;
        try {
            const result = await runtime.tools.run('List Managed Processes', {});
            const proc = result.processes?.find(p => p.processId === PROCESS_ID);
            
            if (proc) {
                setStatus("RUNNING");
                const url = "http://localhost:" + proc.port;
                if (url !== serverUrl) setServerUrl(url);
                
                // Parse logs
                const lines = proc.logs || [];
                setLogs(lines.slice(-10));
                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i];
                    if (line.includes("STATS::")) {
                        const parts = line.split("::");
                        parts.forEach(p => {
                            if (p.startsWith("FPS=")) setFps(parseInt(p.split("=")[1]));
                            if (p.startsWith("OBJ=")) setBiome(p.split("=")[1]);
                        });
                        break;
                    }
                }
            } else {
                if (status.includes("RUNNING")) setStatus("STOPPED");
            }
        } catch(e) {}
    };
    
    useEffect(() => {
        const i = setInterval(pollLogs, 1000);
        return () => clearInterval(i);
    }, [serverUrl]); // Dependency added
    
    const launch = async () => {
        if (!runtime.isServerConnected()) return;
        setStatus("Deploying...");
        await runtime.tools.run('Server File Writer', { filePath: SCRIPT_NAME, content: ${JSON.stringify(NEURO_WORLD_PYTHON_CODE)}, baseDir: 'scripts' });
        setStatus("Launching Native Process...");
        await runtime.tools.run('Start Python Process', { processId: PROCESS_ID, scriptPath: SCRIPT_NAME, venv: 'venv_vision' });
    };
    
    const stop = async () => {
        if (!runtime.isServerConnected()) return;
        setStatus("Stopping...");
        await runtime.tools.run('Stop Process', { processId: PROCESS_ID });
        setStatus("Idle");
        setStreamActive(false);
    };
    
    const toggleStream = async () => {
        if (!serverUrl) return;
        try {
            await fetch(serverUrl + '/action/toggle_stream', { method: 'POST' });
            setStreamActive(!streamActive);
        } catch(e) {
            console.error("Toggle failed", e);
        }
    };

    return (
        <div className="p-6 bg-slate-900 h-full text-white font-mono flex flex-col gap-6">
            <div className="border-b border-purple-500 pb-4 flex justify-between items-end">
                <div>
                    <h1 className="text-2xl font-bold text-cyan-400">NEURO WORLD V99</h1>
                    <p className="text-sm text-slate-400">Hybrid Engine (Native + Stream)</p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-purple-400">{fps} FPS</div>
                    <div className="text-xs text-slate-500">ENGINE RATE</div>
                </div>
            </div>
            
            {/* Stream Viewport */}
            <div className="bg-black relative rounded border border-slate-700 flex-grow flex items-center justify-center overflow-hidden min-h-[300px]">
                {status.includes("RUNNING") && serverUrl ? (
                    streamActive ? (
                        <img 
                            src={serverUrl + "/video_feed"} 
                            className="w-full h-full object-contain"
                            alt="Neuro World Stream"
                        />
                    ) : (
                        <div className="text-center">
                            <div className="text-4xl mb-2">👁️</div>
                            <div className="text-slate-400">Stream Paused for Max Performance</div>
                            <div className="text-xs text-slate-600 mt-2">Check Native Window</div>
                        </div>
                    )
                ) : (
                    <div className="text-slate-600">System Offline / Searching Port...</div>
                )}
                
                {/* Overlay HUD */}
                <div className="absolute top-4 left-4 bg-black/50 p-2 rounded text-xs backdrop-blur-sm">
                    <div>BIOME: <span className="text-cyan-300">{biome}</span></div>
                    <div>STATUS: <span className={status.includes("RUNNING") ? "text-green-400" : "text-red-400"}>{status}</span></div>
                </div>
            </div>
            
            {/* Controls */}
            <div className="grid grid-cols-3 gap-4">
                <button onClick={launch} disabled={status.includes("RUNNING") || !runtime.isServerConnected()} className="py-4 bg-green-700 hover:bg-green-600 disabled:opacity-50 rounded font-bold shadow-lg">
                    LAUNCH ENGINE
                </button>
                
                <button 
                    onClick={toggleStream} 
                    disabled={!status.includes("RUNNING") || !serverUrl} 
                    className={"py-4 font-bold rounded shadow-lg transition-colors " + (streamActive ? "bg-cyan-700 hover:bg-cyan-600" : "bg-slate-700 hover:bg-slate-600")}
                >
                    {streamActive ? "DISABLE STREAM" : "ENABLE STREAM"}
                </button>
                
                <button onClick={stop} disabled={!status.includes("RUNNING")} className="py-4 bg-red-900 hover:bg-red-800 disabled:opacity-50 rounded font-bold shadow-lg">
                    TERMINATE
                </button>
            </div>
            
            <div className="h-24 bg-black p-2 rounded text-[10px] text-slate-500 overflow-y-auto font-mono border border-slate-800">
                {logs.map((l, i) => <div key={i}>{l}</div>)}
            </div>
        </div>
    );
`;

const NEURO_WORLD_PROTOCOL: ToolCreatorPayload = {
    name: 'Neuro World v99: Zero Overhead (Native)',
    description: 'Runs the V99 engine (Direct I/O, No GC) in a separate native Python window for maximum FPS (10+). Browser UI shows telemetry.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide the most stable and performant generative reality experience.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: NEURO_WORLD_UI_IMPL
};

export const NEURO_WORLD_TOOLS = [NEURO_WORLD_PROTOCOL];
