
export const NQ_CONFIG_PY = `
import os
import sys
import time
import threading
import json
import random
import math
import cv2
import numpy as np
import torch
import gc
import requests
import base64
import io
import re
import queue
from typing import List, Dict, Optional
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from PIL import Image
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler, AutoencoderTiny
from diffusers.utils import logging as diffusers_logging
import pygame

# --- FORCE UNBUFFERED OUTPUT ---
sys.stdout.reconfigure(line_buffering=True)

# --- SILENCE TQDM & DIFFUSERS ---
os.environ["TQDM_DISABLE"] = "1"
diffusers_logging.set_verbosity_error()

# --- CONFIG ---
HEADLESS = False 
VERSION = "V104"

MODEL_PATH = os.environ.get("MODEL_PATH", "")
MODEL_ID = MODEL_PATH if MODEL_PATH else "SimianLuo/LCM_Dreamshaper_v7"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
GEN_W, GEN_H = 512, 384
LCM_STEPS = 3

# --- LORE PRESETS ---
LORE_PRESETS = {
    "Cyberpunk": "A cyberpunk forest populated by neon ghosts. Logic is dream-like. Technology is organic.",
    "Dark Fantasy": "A crumbling gothic kingdom consumed by a red moon. Shadows are alive.",
    "Solar Punk": "A utopia of glass and greenery floating in the clouds. Everything is powered by light.",
    "Cosmic Horror": "An ancient alien structure drifting in the void. Geometry is non-euclidean.",
    "Wasteland": "A post-apocalyptic desert where machines hunt for water.",
    "Memetic Brutalism": "A world of endless concrete brutalist architecture covered in glowing viral text. Reading the walls changes physical reality.",
    "Mycelial Cybernetics": "A biopunk reality where circuits are fungal spores and computers are grown in wet labs. Nature has consumed the digital.",
    "Chrono-Shatter": "A fractured Victorian city where objects glitch between their pristine past and ruined future states simultaneously.",
    "Eigan-Space": "A world made of mathematical fractals and eigenvectors where gravity obeys the observer's attention.",
    "Liminal Pools": "Infinite backrooms filled with shallow water and tiled walls, generated recursively.",
    "Glitch-Gardens": "Nature reclaiming server farms, where flowers bloom as datamoshed pixels."
}
# Default to empty/generic to force session loading to provide true lore
ACTIVE_LORE = "" 

# --- GLOBAL SESSION STATE FOR LOGGING ---
CURRENT_SESSION_ID = None

def set_current_session(sess_id):
    global CURRENT_SESSION_ID
    CURRENT_SESSION_ID = sess_id
    # Ensure directories exist
    if sess_id:
        os.makedirs(f"sessions/{sess_id}/logs", exist_ok=True)
        os.makedirs(f"sessions/{sess_id}/images", exist_ok=True)

# --- DEBUG LOGGING ---
# Main system log (kept minimal)
SYS_LOG_FILE = "neuro_quest_system.txt"

def log(msg, tag="SYSTEM"): 
    ts = time.strftime("%H:%M:%S")
    out = f"[{ts}] [{tag}] {msg}"
    print(f"[NQ] {out}", flush=True)
    
    # Write to session-specific log if active, else global system log
    target_file = f"sessions/{CURRENT_SESSION_ID}/logs/session.txt" if CURRENT_SESSION_ID else SYS_LOG_FILE
    try:
        # Create dir if not exists (redundant safety)
        if CURRENT_SESSION_ID: os.makedirs(os.path.dirname(target_file), exist_ok=True)
        with open(target_file, 'a', encoding='utf-8') as f:
            f.write(out + "\\n")
    except: pass

def strip_base64(text):
    # Regex to replace long base64 strings with [BASE64_IMAGE_DATA]
    # Matches "data:image..." patterns
    return re.sub(r'data:image\/[a-zA-Z]+;base64,[a-zA-Z0-9+/=]{100,}', '[BASE64_IMAGE_DATA_REMOVED]', text)

def log_llm(context, prompt, response):
    try:
        # Strip heavy data for display/logging
        clean_prompt = strip_base64(str(prompt))
        clean_response = strip_base64(str(response)).strip()
        
        # CLI Output (truncated)
        print(f"\\n[NQ_GM] ╔════ {context} ════╗", flush=True)
        print(f"[NQ_GM] ❓ PROMPT: {clean_prompt[:150]}...", flush=True)
        print(f"[NQ_GM] 💡 RESPONSE: {clean_response[:150]}...", flush=True)
        print(f"[NQ_GM] ╚════════════════════╝\\n", flush=True)

        # File Output (Full text, but without base64 bloat)
        # Using .txt extension as requested for easier sharing
        target_file = f"sessions/{CURRENT_SESSION_ID}/logs/llm_trace.txt" if CURRENT_SESSION_ID else "llm_trace_global.txt"
        if CURRENT_SESSION_ID: os.makedirs(os.path.dirname(target_file), exist_ok=True)
        
        with open(target_file, 'a', encoding='utf-8') as f:
            f.write(f"\\n=== {time.ctime()} | {context} ===\\n")
            f.write(f"PROMPT:\\n{clean_prompt}\\n")
            f.write(f"RESPONSE:\\n{clean_response}\\n")
            f.write("="*40 + "\\n")
            
    except Exception as e:
        print(f"[NQ] [LOG_ERR] Failed to print LLM log: {e}", flush=True)

# --- PROCEDURAL FALLBACKS ---
FALLBACK_BIOMES = [
    "A misty void where reality is thin.",
    "A quiet stone chamber."
]

FALLBACK_QUESTS = [
    {"text": "Look around.", "reward": 100},
]
`;
