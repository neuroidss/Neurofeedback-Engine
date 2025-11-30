import { MUSICGEN_SERVER_SIMPLE_CODE } from './server_simple';

// We take the robust legacy structure and inject the Neuro-Link logic into it.
export const MUSICGEN_SERVER_NEURO_CODE = `
import os
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
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from audiocraft.models import MusicGen
import sounddevice as sd

# --- FORCE UNBUFFERED OUTPUT ---
sys.stdout.reconfigure(line_buffering=True)

# --- CONFIG ---
DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
SAMPLE_RATE = 32000

print(f"[NeuroGen] Initializing on {DEVICE}...", flush=True)

# --- GLOBAL STATE ---
GLOBAL_COHERENCE_MATRIX = None 
GLOBAL_COHERENCE_LOCK = threading.Lock()

local_stop_event = threading.Event()
local_audio_queue = queue.Queue(maxsize=40)
local_gen_thread = None
local_play_thread = None

# Default params (Adaptive)
session_params = {
    "target_block": 1.0,
    "target_context": 3.0,
    "speed_safety_factor": 1.0,
    "target_buffer_count": 2,
    "prompt": "ambient drone"
}

current_speed = 1.0
current_block_duration = 1.0

# --- 1. NEURO ATTENTION HOOK ---
_original_sdpa = torch.nn.functional.scaled_dot_product_attention

def neuro_sdpa(query, key, value, attn_mask=None, dropout_p=0.0, is_causal=False, **kwargs):
    global GLOBAL_COHERENCE_MATRIX
    
    if GLOBAL_COHERENCE_MATRIX is not None:
        try:
            L, S = query.size(-2), key.size(-2)
            # Apply only to Self-Attention (L <= S)
            if L <= S:
                with GLOBAL_COHERENCE_LOCK:
                    coh = GLOBAL_COHERENCE_MATRIX.clone().detach().float().unsqueeze(0).unsqueeze(0)
                
                # Interpolate (stretch to transformer attention size)
                if coh.shape[-1] != S or coh.shape[-2] != L:
                    bias = F.interpolate(coh, size=(L, S), mode='bilinear', align_corners=False)
                else:
                    bias = coh

                # Bias Strength (Matrix 0..1 -> -7.5 .. +7.5)
                bias = (bias - 0.5) * 15.0 
                bias = bias.squeeze(0).squeeze(0).to(query.device).type(query.dtype)

                # Construct Mask if missing
                if is_causal or attn_mask is None:
                    if L == 1:
                        mask = torch.zeros((L, S), device=query.device, dtype=query.dtype)
                    else:
                        temp = torch.ones((L, S), device=query.device, dtype=torch.bool).tril(diagonal=0)
                        mask = torch.zeros((L, S), device=query.device, dtype=query.dtype).masked_fill(temp.logical_not(), float('-inf'))
                    attn_mask = mask + bias
                    is_causal = False 
                else:
                    attn_mask = attn_mask + bias
        except Exception:
            pass 

    return _original_sdpa(query, key, value, attn_mask=attn_mask, dropout_p=dropout_p, is_causal=is_causal, **kwargs)

torch.nn.functional.scaled_dot_product_attention = neuro_sdpa

# --- 2. ADAPTIVE LOGIC (From Legacy) ---
def apply_sliders(strategy, safety, buffer_val, context_val):
    global session_params
    session_params['target_block'] = 0.4 + (7.6 * float(strategy))
    session_params['speed_safety_factor'] = 1.0 - (0.3 * float(safety))
    session_params['target_buffer_count'] = 1 + int(4 * float(buffer_val))
    session_params['target_context'] = 0.1 + (9.9 * float(context_val))
    print(f"[NeuroGen] Params: Blk={session_params['target_block']:.2f}s, Ctx={session_params['target_context']:.2f}s, Buf={session_params['target_buffer_count']}", flush=True)
    return session_params

def adapt_system(gen_time, audio_duration, buffer_size):
    global current_speed, current_block_duration, session_params
    gen_time = max(gen_time, 0.000001)
    real_rtf = audio_duration / gen_time
    target_block = session_params['target_block']
    
    # Smooth block size adjustment
    if current_block_duration < target_block: current_block_duration *= 1.1
    else: current_block_duration *= 0.9
    current_block_duration = max(0.3, min(10.0, current_block_duration))
    
    # Calculate safe playback speed
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

# --- 3. SERVER SETUP ---
model = None
is_loading = False

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    local_stop_event.set()
    global model
    if model: del model
    torch.cuda.empty_cache()

app = FastAPI(lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.get("/health")
def health():
    if model is None: return JSONResponse(status_code=503, content={"status": "idle"})
    return {"status": "ok", "config": {"device": DEVICE}}

@app.post("/configure")
async def configure(request: Request):
    global model, is_loading
    if is_loading: return JSONResponse(status_code=429, content={"error": "Busy"})
    
    async def loader():
        global model, is_loading
        is_loading = True
        try:
            if model: del model; torch.cuda.empty_cache()
            print(f"[NeuroGen] Loading MusicGen Small on {DEVICE}...", flush=True)
            m = MusicGen.get_pretrained('facebook/musicgen-small', device=DEVICE)
            m.lm.eval()
            m.compression_model.eval()
            m.lm.to(torch.float16)
            m.compression_model.to(torch.float16)
            model = m
            print(f"[NeuroGen] Model Loaded & Patched.", flush=True)
        except Exception as e: 
            print(f"[NeuroGen] Load Error: {e}", flush=True)
        finally: is_loading = False
    
    asyncio.create_task(loader())
    return {"status": "loading"}

@app.post("/update_params")
async def update_params(request: Request):
    data = await request.json()
    apply_sliders(data.get('strategy', 0.5), data.get('safety', 0.5), data.get('buffer', 0.5), data.get('context', 0.5))
    return {"status": "updated"}

@app.post("/feed_brain_data")
async def feed_brain(request: Request):
    global GLOBAL_COHERENCE_MATRIX
    try:
        data = await request.json()
        matrix_flat = data.get("matrix", [])
        if matrix_flat:
            sz = int(np.sqrt(len(matrix_flat)))
            if sz*sz == len(matrix_flat):
                arr = np.array(matrix_flat, dtype=np.float32).reshape(sz, sz)
                t = torch.from_numpy(arr).to(DEVICE)
                with GLOBAL_COHERENCE_LOCK: 
                    GLOBAL_COHERENCE_MATRIX = t
        return {"status": "ok"}
    except: return {"status": "err"}

# --- 4. PLAYBACK ENGINE ---
@app.post("/start_local")
@app.post("/control/start") 
async def start_local(request: Request):
    global local_gen_thread, local_play_thread, current_block_duration, current_speed
    
    if (local_gen_thread and local_gen_thread.is_alive()):
        return {"status": "already_running"}
    if not model:
        return JSONResponse(status_code=503, content={"error": "Model not loaded"})

    data = await request.json()
    prompt = data.get('prompt', session_params['prompt'])
    session_params['prompt'] = prompt
    
    # Apply initial params if provided
    if 'strategy' in data:
        apply_sliders(data.get('strategy', 0.5), data.get('safety', 0.5), data.get('buffer', 0.5), data.get('context', 0.5))

    print(f"[NeuroGen] Starting Generator. Prompt: '{prompt}'", flush=True)
    
    local_stop_event.clear()
    current_block_duration = session_params['target_block']
    current_speed = 1.0
    
    # Drain queue
    while not local_audio_queue.empty():
        try: local_audio_queue.get_nowait()
        except: pass

    def run_generator():
        global model, current_block_duration, session_params
        try:
            print("[NeuroGen] Generator Loop Active.", flush=True)
            with torch.inference_mode():
                # Warmup / Initial
                dummy_wav = torch.randn(1, 1, int(SAMPLE_RATE * 0.2), device=DEVICE, dtype=torch.float16)
                model.set_generation_params(duration=current_block_duration, cfg_coef=1.0, use_sampling=False)
                
                chunk = model.generate([prompt], progress=False)
                last_audio = chunk
                
                # Push first chunk
                wav_cpu = chunk[0, 0].cpu().float().numpy()
                local_audio_queue.put(wav_cpu)
                
                count = 0
                while not local_stop_event.is_set():
                    t0 = time.time()
                    target_ctx_sec = session_params['target_context']
                    ctx_samples = int(SAMPLE_RATE * target_ctx_sec)
                    
                    # Context Windowing
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
                    
                    # Adaptive Logic
                    speed_f, next_dur, real_rtf = adapt_system(dt, audio_len, local_audio_queue.qsize())
                    processed = resample_chunk(new_chunk, speed_f)
                    
                    local_audio_queue.put(processed[0, 0].cpu().float().numpy())
                    current_block_duration = next_dur
                    
                    count += 1
                    if count % 2 == 0:
                        print(f"[NeuroGen] Gen:{count} | RTF:{real_rtf:.2f}x | Buf:{local_audio_queue.qsize()} | Spd:{speed_f:.2f}", flush=True)
                    
        except Exception as e:
            traceback.print_exc()
            print(f"[NeuroGen] Generator Crashed: {e}", flush=True)
            local_stop_event.set()

    def run_player():
        try:
            target_buf = session_params['target_buffer_count']
            print(f"[NeuroGen] Player waiting for {target_buf} chunks...", flush=True)
            # Pre-buffer
            while local_audio_queue.qsize() < target_buf and not local_stop_event.is_set(): 
                time.sleep(0.05)
            
            print(f"[NeuroGen] Player Started.", flush=True)
            with sd.RawOutputStream(samplerate=SAMPLE_RATE, channels=1, dtype='float32', latency='high') as stream:
                while not local_stop_event.is_set():
                    try:
                        data_np = local_audio_queue.get(timeout=1.0)
                        stream.write(data_np.tobytes())
                    except queue.Empty:
                        if local_stop_event.is_set(): break
                    except Exception: break
        except Exception as e: print(f"[Player Error] {e}", flush=True)

    local_gen_thread = threading.Thread(target=run_generator, daemon=True)
    local_play_thread = threading.Thread(target=run_player, daemon=True)
    local_gen_thread.start()
    local_play_thread.start()
    
    return {"status": "started", "params": session_params}

@app.post("/stop_local")
@app.post("/control/stop")
def stop_local():
    print("[NeuroGen] Stopping...", flush=True)
    local_stop_event.set()
    return {"status": "stopping"}

# Streaming endpoint compatible with Graph Node (Optional usage)
@app.get("/stream_audio")
async def stream_audio_get():
    # Only works if local player isn't consuming queue, or we duplicate. 
    # For now, this is a placeholder to prevent 404s if graph tries to connect.
    # The Legacy architecture prioritizes local playback.
    return JSONResponse(status_code=200, content={"status": "use_local_playback"})

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"[NeuroGen] Server starting on port {port}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=port, log_config=None)
`;