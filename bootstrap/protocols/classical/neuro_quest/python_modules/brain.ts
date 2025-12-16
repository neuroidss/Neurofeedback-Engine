
export const NQ_BRAIN_PY = `
# ==================================================================================
# 🧠 THE BRAIN: QWEN2.5-VL (VIA LOCAL LLAMA SERVER)
# ==================================================================================
import threading
import time
import heapq
import numpy as np
import requests
import base64
import io
import json
import re
import os
from PIL import Image

# Use the same env var as the main LLM agent for consistency, fallback to local llama.cpp
API_URL = os.environ.get("LLM_API_URL", "http://127.0.0.1:8080/v1/chat/completions")
API_KEY = os.environ.get("LLM_API_KEY", "dummy")
MODEL_ID = os.environ.get("LLM_MODEL", "default")

VISION_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "report_visual_observation",
            "description": "Report the state of the entity based on visual evidence.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Brief visual analysis."},
                    "observation_narrative": {"type": "string", "description": "Short description."},
                    "visual_tags": {"type": "array", "items": {"type": "string"}, "description": "Key visual elements (e.g. 'fire', 'glitch', 'peace', 'blue sky')."}
                },
                "required": ["observation_narrative", "visual_tags"]
            }
        }
    }
]

class NeuralBrain(threading.Thread):
    def __init__(self, engine_ref):
        super().__init__(daemon=True)
        self.engine = engine_ref
        self.is_ready = False
        self.active = True
        self.lock = threading.Lock()
        self.latest_frame = None
        self.latest_entity_focus = None

    def load(self):
        print(f"[Brain] 🧠 Connecting to Vision Service at {API_URL}...", flush=True)
        self.is_ready = True

    def observe(self, pil_image, target_entity):
        with self.lock:
            self.latest_frame = pil_image.resize((384, 384))
            self.latest_entity_focus = target_entity

    def run(self):
        self.load()
        while self.active:
            if not self.is_ready: time.sleep(1); continue
            if not self.engine.physics.initialized: time.sleep(1); continue

            queue = self.engine.physics.get_attention_queue()
            if not queue: time.sleep(0.1); continue
                
            prio, entity = heapq.heappop(queue)
            
            img = None
            with self.lock:
                if self.latest_frame:
                    img = self.latest_frame.copy()
                    self.latest_frame = None
            
            if img and abs(prio) > 0.05:
                self._collapse_wavefunction(img, entity)
            
            time.sleep(1.0) 

    def _collapse_wavefunction(self, image, entity):
        prompt = f"""
        TARGET: {entity.archetype}
        TASK: What is happening visually? Look for chaos or order.
        """
        try:
            tool_data = self._vision_inference(image, prompt)
            
            if tool_data and tool_data.get('observation_narrative'):
                narrative = tool_data['observation_narrative']
                tags = tool_data.get('visual_tags', [])
                print(f"[GM] 👁️ Saw: {narrative} | Tags: {tags}", flush=True)
                
                # Update Narrative
                self.engine.queue_narrative(narrative)
                
                # --- VISUAL FEEDBACK LOOP (The "What describes events" part) ---
                # If the brain sees "Chaos" (Fire, Glitch), it increases Game Difficulty.
                # If it sees "Order" (Blue Sky, Light), it decreases it.
                if self.engine.physics.game_logic:
                    chaos_score = 0
                    for t in tags:
                        t = t.lower()
                        if t in ['fire', 'glitch', 'red', 'blood', 'ruins', 'smoke', 'dark']: chaos_score += 1
                        if t in ['peace', 'light', 'blue', 'green', 'sky', 'clean', 'gold']: chaos_score -= 1
                    
                    if chaos_score > 0:
                        self.engine.physics.game_logic.entropy_level += 0.05
                        # print(f"[Brain] 📉 Observed Chaos. Difficulty increased.", flush=True)
                    elif chaos_score < 0:
                        self.engine.physics.game_logic.entropy_level = max(0, self.engine.physics.game_logic.entropy_level - 0.05)
                        # print(f"[Brain] 📈 Observed Order. Difficulty reduced.", flush=True)

                entity.last_observed_vector = entity.current_vector.copy()
                entity.current_stress = 0.0 
        except Exception as e:
            print(f"[Brain] Inference Error: {e}", flush=True)

    def _vision_inference(self, image, user_text, retry_count=0):
        if retry_count > 2: return None 
        buffered = io.BytesIO()
        image.save(buffered, format="JPEG")
        img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
        img_data = f"data:image/jpeg;base64,{img_str}"

        payload = {
            "model": MODEL_ID, 
            "messages": [
                {"role": "system", "content": "You are the Game Master Eyes. Use the tool."},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": img_data}}
                    ]
                }
            ],
            "max_tokens": 512,
            "temperature": 0.1,
            "stream": False,
            "tools": VISION_TOOLS,
            "tool_choice": "required"
        }

        try:
            response = requests.post(API_URL, json=payload, headers={"Authorization": f"Bearer {API_KEY}"}, timeout=10)
            if response.status_code != 200: return None
            result = response.json()
            msg = result.get('choices', [{}])[0].get('message', {})
            
            if msg.get('tool_calls'):
                tc = msg['tool_calls'][0]
                return json.loads(tc['function']['arguments'])
            return None
        except Exception: return None
`;
