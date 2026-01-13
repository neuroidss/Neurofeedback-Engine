
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
import heapq
from typing import List, Dict, Optional
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from PIL import Image, ImageDraw
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler, AutoencoderTiny
from diffusers.utils import logging as diffusers_logging
import pygame

# ==================================================================================
# ☢️ NUCLEAR LOGGING OPTION (BRUTE FORCE V3)
# ==================================================================================

# 1. Master Log (Server Root)
try:
    _ts = int(time.time())
    _log_filename = f"neuro_quest_log_{_ts}.txt"
    _current_script_path = os.path.abspath(__file__)
    _script_dir = os.path.dirname(_current_script_path)
    _server_dir = os.path.dirname(_script_dir)
    MASTER_LOG_FILE = os.path.join(_server_dir, _log_filename)
except:
    MASTER_LOG_FILE = f"neuro_quest_log_{int(time.time())}.txt"

class DualLogger(object):
    """Writes to Console, Master File, AND Session File dynamically."""
    def __init__(self, original_stream, master_path):
        self.terminal = original_stream
        self.master_path = master_path
        self.session_file = None # Dynamic handle
        
        try:
            self.master_file = open(master_path, "a", encoding="utf-8", buffering=1)
        except:
            self.master_file = None

    def set_session_log(self, path):
        """Hot-swap the session log file when a new game starts."""
        if self.session_file:
            try: self.session_file.close()
            except: pass
        
        if path:
            try:
                # Buffering=1 means line buffering, but we will force flush too
                self.session_file = open(path, "a", encoding="utf-8", buffering=1)
                self.write(f"\\n[LOGGER] Attached to Session Log: {path}\\n")
            except Exception as e:
                self.write(f"\\n[LOGGER] Failed to attach session log: {e}\\n")
                self.session_file = None
        else:
            self.session_file = None

    def write(self, message):
        # 1. Console
        try:
            self.terminal.write(message)
            self.terminal.flush()
        except: pass

        # 2. Master File
        if self.master_file:
            try:
                self.master_file.write(message)
                self.master_file.flush() # FORCE FLUSH
            except: pass
            
        # 3. Session File
        if self.session_file:
            try:
                self.session_file.write(message)
                self.session_file.flush() # FORCE FLUSH
            except: pass

    def flush(self):
        try: self.terminal.flush()
        except: pass
        if self.master_file: self.master_file.flush()
        if self.session_file: self.session_file.flush()
        
    def isatty(self): return False
    def fileno(self): return 1

# Hook Streams
sys.stdout = DualLogger(sys.stdout, MASTER_LOG_FILE)
sys.stderr = DualLogger(sys.stderr, MASTER_LOG_FILE)

print(f"\\n==================================================", flush=True)
print(f"☢️ NUCLEAR LOGGING ACTIVE (V3)", flush=True)
print(f"Master Log: {MASTER_LOG_FILE}", flush=True)
print(f"==================================================\\n", flush=True)

# --- CONFIG CONTINUES ---
os.environ["PYTHONUNBUFFERED"] = "1"
os.environ["TQDM_DISABLE"] = "1"
diffusers_logging.set_verbosity_error()

HEADLESS = False 
VERSION = "V105_CINEMA"

MODEL_PATH = os.environ.get("MODEL_PATH", "")
MODEL_ID = MODEL_PATH if MODEL_PATH else "SimianLuo/LCM_Dreamshaper_v7"

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
GEN_W, GEN_H = 512, 384
LCM_STEPS = 3

# --- GLOBAL SESSION STATE ---
CURRENT_SESSION_ID = None

# --- PATH MANAGEMENT ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) 
ROOT_DIR = os.path.dirname(BASE_DIR) 
SESSIONS_DIR = os.path.abspath(os.path.join(ROOT_DIR, "sessions"))

def set_current_session(sess_id):
    global CURRENT_SESSION_ID
    CURRENT_SESSION_ID = sess_id
    if sess_id:
        try:
            session_root = os.path.join(SESSIONS_DIR, sess_id)
            os.makedirs(os.path.join(session_root, "logs"), exist_ok=True)
            os.makedirs(os.path.join(session_root, "images"), exist_ok=True)
            os.makedirs(os.path.join(session_root, "assets"), exist_ok=True)
            
            # ATTACH LOGGER TO SESSION FILE
            session_log_path = os.path.join(session_root, "logs", "session.log")
            if hasattr(sys.stdout, 'set_session_log'):
                sys.stdout.set_session_log(session_log_path)
                sys.stderr.set_session_log(session_log_path)
                
            print(f"[NQ_CONFIG] Session folder ensured: {session_root}", flush=True)
        except Exception as e:
            print(f"[CRITICAL] Failed to create session directories: {e}", flush=True)

def log(msg, tag="SYSTEM"): 
    ts = time.strftime("%H:%M:%S")
    out = f"[{ts}] [{tag}] {msg}"
    print(f"[neuro_quest_v1] {out}", flush=True)

def save_debug_image(pil_image, tag="event"):
    if not CURRENT_SESSION_ID or not pil_image: return
    try:
        ts = int(time.time() * 1000)
        safe_tag = "".join([c for c in tag if c.isalnum() or c in (' ', '_', '-')]).strip().replace(' ', '_')
        filename = os.path.join(SESSIONS_DIR, CURRENT_SESSION_ID, "images", f"{ts}_{safe_tag}.jpg")
        pil_image.save(filename, quality=85)
    except Exception as e:
        log(f"Image Save Failed: {e}", "ERR")

def log_exception(e):
    import traceback
    tb = traceback.format_exc()
    log(f"EXCEPTION: {str(e)}\\n{tb}", "CRITICAL")
`;
