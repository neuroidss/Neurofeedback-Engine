
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
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from PIL import Image, ImageDraw
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler, AutoencoderTiny
from diffusers.utils import logging as diffusers_logging
import pygame

# ==================================================================================
# ☢️ NUCLEAR LOGGING OPTION (BRUTE FORCE V2)
# ==================================================================================
# This block runs before anything else. It captures ALL output to a unique .txt file.

# 1. Determine unique log filename with timestamp
try:
    _ts = int(time.time())
    _log_filename = f"neuro_quest_log_{_ts}.txt"
    
    _current_script_path = os.path.abspath(__file__)
    _script_dir = os.path.dirname(_current_script_path) # server/scripts
    _server_dir = os.path.dirname(_script_dir)          # server/
    
    MASTER_LOG_FILE = os.path.join(_server_dir, _log_filename)
except:
    # Fallback if __file__ is missing
    MASTER_LOG_FILE = f"neuro_quest_log_{int(time.time())}.txt"

class DualLogger(object):
    """Writes to both the console (for Node) and a file (for Sanity)."""
    def __init__(self, original_stream, file_path):
        self.terminal = original_stream
        self.file_path = file_path
        # Open in Append mode, buffering=1 (line buffered)
        try:
            self.log_file = open(file_path, "a", encoding="utf-8", buffering=1)
        except Exception as e:
            # Fallback to local dir if permission denied
            self.log_file = open(os.path.basename(file_path), "a", encoding="utf-8", buffering=1)

    def write(self, message):
        # 1. Write to Console (Standard)
        try:
            self.terminal.write(message)
            self.terminal.flush()
        except: pass

        # 2. Write to File (Brute Force)
        try:
            self.log_file.write(message)
            self.log_file.flush() # FORCE DISK WRITE
            os.fsync(self.log_file.fileno()) # FORCE OS FLUSH
        except Exception as e:
            # If writing fails, try to reopen (maybe file was locked/deleted)
            pass

    def flush(self):
        try:
            self.terminal.flush()
            self.log_file.flush()
        except: pass
        
    def isatty(self):
        # CRITICAL FIX for Uvicorn/FastAPI logging which checks for color support
        return False

    def fileno(self):
        # Some low-level libs might check this
        try: return self.terminal.fileno()
        except: return 1 # Stdout default

# Redirect System Streams
sys.stdout = DualLogger(sys.stdout, MASTER_LOG_FILE)
sys.stderr = DualLogger(sys.stderr, MASTER_LOG_FILE)

print(f"\\n==================================================", flush=True)
print(f"☢️ NUCLEAR LOGGING ACTIVE", flush=True)
print(f"Timestamp: {time.ctime()}", flush=True)
print(f"Writing ALL output to: {MASTER_LOG_FILE}", flush=True)
print(f"==================================================\\n", flush=True)

# ==================================================================================

# --- CONFIG CONTINUES ---
# Force Unbuffered (Redundant now, but kept for safety)
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
            print(f"[NQ_CONFIG] Session folder ensured: {session_root}", flush=True)
        except Exception as e:
            print(f"[CRITICAL] Failed to create session directories: {e}", flush=True)

# --- STANDARD LOGGING FUNCTION ---
# Just wraps print now, since print is hijacked by DualLogger
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
