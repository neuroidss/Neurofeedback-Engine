
// V26: Simple (Preserved Legacy - Fixed NameError + Logs)
// This file is deployed as 'simple_musicgen.py'

export const MUSICGEN_SERVER_SIMPLE_CODE = `import os
import sys
import json
import time
import torch
import torch.nn as nn
import torch.nn.functional as F
import gc
import traceback
import asyncio
import threading
import queue
from contextlib import asynccontextmanager
import numpy as np

# --- FORCE UNBUFFERED OUTPUT ---
sys.stdout.reconfigure(line_buffering=True)

# --- CONFIG ---
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
SAMPLE_RATE = 32000

print(f"[MusicGen] Initializing on {DEVICE}...", flush=True)

torch.backends.cuda.matmul.allow_tf32 = True
torch.backends.cudnn.allow_tf32 = True
torch.backends.cudnn.benchmark = True

os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["TORCH_LOGS"] = "-all"

model = None
is_loading = False
local_stop_event = threading.Event()
local_audio_queue = queue.Queue(maxsize=40)

# FIX: Initialize threads globally to prevent NameError
local_gen_thread = None
local_play_thread = None

# Default params
session_params = {
    "target_block": 1.0,
    "target_context": 3.0,
    "speed_safety_factor": 1.0,
    "target_buffer_count": 2
}

current_speed = 1.0
current_block_duration = 1.0

def apply_sliders(strategy, safety, buffer_val, context_val):
    global session_params
    session_params['target_block'] = 0.4 + (7.6 * float(strategy))
    session_params['speed_safety_factor'] = 1.0 - (0.3 * float(safety))
    session_params['target_buffer_count'] = 1 + int(4 * float(buffer_val))
    session_params['target_context'] = 0.1 + (9.9 * float(context_val))
    print(f"[MusicGen] Params Updated: Block={session_params['target_block']:.2f}s, Ctx={session_params['target_context']:.2f}s", flush=True)
    return session_params

def adapt_system(gen_time, audio_duration, buffer_size):
    global current_speed, current_block_duration, session_params
    gen_time = max(gen_time, 0.000001)
    real_rtf = audio_duration / gen_time
    target_block = session_params['target_block']
    
    if current_block_duration < target_block: current_block_duration *= 1.1
    else: current_block_duration *= 0.9
    current_block_duration = max(0.3, min(10.0, current_block_duration))
    
    base_speed = real_rtf * session_params['speed_safety_factor']
    target_buf = session_params['target_buffer_count']
    
    if buffer_size == 0: base_speed *= 0.6 
    elif buffer_size < target_buf: base_speed *= 0.95
    elif buffer_size > target_buf + 1: base_speed *= 1.05
        
    alpha = 0.3
    current_speed = (current_speed * (1 - alpha)) + (base_speed * alpha)
    current_speed = max(0.3, min(1.3, current_speed))
    return current_speed, current_block_duration, real_rtf

def resample_chunk(wav, speed):
    if abs(speed - 1.0) < 0.01: return wav
    new_len = int(wav.shape[-1] / speed)
    if new_len < 1: return wav
    return F.interpolate(wav, size=new_len, mode='linear', align_corners=False)

try:
    from fastapi import FastAPI, Request
    from fastapi.responses import JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    import uvicorn
    from audiocraft.models import MusicGen
    import sounddevice as sd
except ImportError as e:
    print(f"CRITICAL ERROR: {e}", flush=True)
    sys.exit(1)

def load_model_sync(size):
    print(f"[MusicGen] Loading {size} model...", flush=True)
    m = MusicGen.get_pretrained(f'facebook/musicgen-{size}', device=DEVICE)
    m.lm.eval()
    m.compression_model.eval()
    m.lm.to(torch.float16)
    m.compression_model.to(torch.float16)
    print(f"[MusicGen] Model Loaded.", flush=True)
    return m

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    local_stop_event.set()
    global model
    if model: del model
    if torch.cuda.is_available(): torch.cuda.empty_cache()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    if is_loading: return JSONResponse(status_code=503, content={"status": "loading"})
    if model is None: return JSONResponse(status_code=503, content={"status": "idle"})
    return {"status": "ok", "params": session_params}

@app.post("/configure")
async def configure(request: Request):
    global model, is_loading
    if is_loading: return JSONResponse(status_code=429, content={"error": "Busy"})
    data = await request.json()
    size = data.get('size', 'small')
    async def loader():
        global model, is_loading
        is_loading = True
        try:
            if model: del model; torch.cuda.empty_cache()
            model = await asyncio.to_thread(load_model_sync, size)
        except Exception as e: 
            traceback.print_exc()
            print(f"[MusicGen] Load Error: {e}", flush=True)
        finally: is_loading = False
    asyncio.create_task(loader())
    return {"status": "loading"}

@app.post("/update_params")
async def update_params(request: Request):
    data = await request.json()
    apply_sliders(data.get('strategy', 0.5), data.get('safety', 0.5), data.get('buffer', 0.5), data.get('context', 0.5))
    return {"status": "updated", "params": session_params}

@app.post("/start_local")
async def start_local(request: Request):
    global local_gen_thread, local_play_thread, current_block_duration, current_speed
    
    if (local_gen_thread and local_gen_thread.is_alive()) or (local_play_thread and local_play_thread.is_alive()):
        print("[MusicGen] Already running.", flush=True)
        return {"status": "already_running"}
    if not model: 
        print("[MusicGen] Error: Model not loaded.", flush=True)
        return JSONResponse(status_code=503, content={"error": "Model not loaded"})

    data = await request.json()
    prompt = data.get('prompt', 'psytrance')
    print(f"[MusicGen] Starting Session. Prompt: '{prompt}'", flush=True)
    
    apply_sliders(data.get('strategy', 0.5), data.get('safety', 0.5), data.get('buffer', 0.5), data.get('context', 0.5))
    
    local_stop_event.clear()
    current_block_duration = session_params['target_block']
    current_speed = 1.0
    while not local_audio_queue.empty():
        try: local_audio_queue.get_nowait()
        except: pass

    def run_generator():
        global model, current_block_duration, session_params
        try:
            print("[MusicGen] Generator Thread Started.", flush=True)
            with torch.inference_mode(), torch.nn.attention.sdpa_kernel(torch.nn.attention.SDPBackend.FLASH_ATTENTION):
                dummy_wav = torch.randn(1, 1, int(SAMPLE_RATE * 0.2), device=DEVICE, dtype=torch.float16)
                model.set_generation_params(duration=current_block_duration, cfg_coef=1.0, use_sampling=False)
                
                print("[MusicGen] Generating initial chunk...", flush=True)
                model.generate([prompt], progress=False)
                model.generate_continuation(dummy_wav, SAMPLE_RATE, [prompt], progress=False)
                
                chunk = model.generate([prompt], progress=False)
                last_audio = chunk
                wav_cpu = chunk[0, 0].cpu().float().numpy()
                local_audio_queue.put(wav_cpu)
                
                print("[MusicGen] Generator Loop Active.", flush=True)
                count = 0
                
                while not local_stop_event.is_set():
                    t0 = time.time()
                    target_ctx_sec = session_params['target_context']
                    ctx_samples = int(SAMPLE_RATE * target_ctx_sec)
                    
                    if last_audio is not None:
                        if last_audio.shape[-1] > ctx_samples: audio_prompt = last_audio[..., -ctx_samples:]
                        else: audio_prompt = last_audio
                        prompt_dur = audio_prompt.shape[-1] / SAMPLE_RATE
                        model.set_generation_params(duration=prompt_dur + current_block_duration)
                        full_wav = model.generate_continuation(prompt=audio_prompt, prompt_sample_rate=SAMPLE_RATE, descriptions=[prompt], progress=False)
                        new_chunk = full_wav[..., audio_prompt.shape[-1]:]
                        last_audio = full_wav
                    else:
                        new_chunk = model.generate([prompt], progress=False)
                        last_audio = new_chunk
                    
                    torch.cuda.synchronize()
                    dt = time.time() - t0
                    audio_len = new_chunk.shape[-1] / SAMPLE_RATE
                    speed_f, next_dur, real_rtf = adapt_system(dt, audio_len, local_audio_queue.qsize())
                    processed = resample_chunk(new_chunk, speed_f)
                    local_audio_queue.put(processed[0, 0].cpu().float().numpy())
                    current_block_duration = next_dur
                    count += 1
                    
                    if count % 2 == 0:
                        print(f"[MusicGen] Gen: {count} | RTF: {real_rtf:.2f}x | Buf: {local_audio_queue.qsize()}", flush=True)
                    
        except Exception as e:
            traceback.print_exc()
            print(f"[MusicGen] Generator Crashed: {e}", flush=True)
            local_stop_event.set()

    def run_player():
        try:
            target_buf = session_params['target_buffer_count']
            print(f"[MusicGen] Player waiting for {target_buf} chunks...", flush=True)
            while local_audio_queue.qsize() < target_buf and not local_stop_event.is_set(): time.sleep(0.05)
            
            print(f"[MusicGen] Player Started.", flush=True)
            with sd.RawOutputStream(samplerate=SAMPLE_RATE, channels=1, dtype='float32', latency='high') as stream:
                while not local_stop_event.is_set():
                    try:
                        data_np = local_audio_queue.get(timeout=1.0)
                        stream.write(data_np.tobytes())
                    except queue.Empty:
                        if local_stop_event.is_set(): break
                    except Exception as e: break
        except Exception as e: print(f"[Stream Error] {e}", flush=True)

    local_gen_thread = threading.Thread(target=run_generator, daemon=True)
    local_play_thread = threading.Thread(target=run_player, daemon=True)
    local_gen_thread.start()
    local_play_thread.start()
    return {"status": "started", "params": session_params}

@app.post("/stop_local")
def stop_local():
    print("[MusicGen] Stopping...", flush=True)
    local_stop_event.set()
    return {"status": "stopping"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"[MusicGen] Server starting on port {port}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_config=None)
`;
