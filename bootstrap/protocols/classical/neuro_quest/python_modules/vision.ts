
export const NQ_VISION_PY = `
# ==================================================================================
# 👁️ VISION CORTEX (DIRECTOR'S EYE)
# ==================================================================================
import threading
import queue
import io
import os
import base64
import time
from PIL import Image

class StreamManager:
    def __init__(self):
        self.lock = threading.Lock()
        self.latest_jpeg = None
    def update(self, pil_img):
        buf = io.BytesIO()
        pil_img.save(buf, format='JPEG', quality=80)
        with self.lock: self.latest_jpeg = buf.getvalue()
    def get_frame(self):
        with self.lock: return self.latest_jpeg

stream_manager = StreamManager()

class GameMaster:
    """
    Manages the 'Symbolic' layer (World State) and the 'Narrative Stream'.
    """
    def __init__(self):
        self.biome_context = "A void" 
        self.focus_obj = "" 
        self.action_fx = "" 
        self.action_expiry = 0
        self.lock = threading.Lock()
        
        # Narrative Queue for Frontend TTS/Subtitles
        # Format: [{"text": "Hello world", "voice": True}, ...]
        self.narrative_queue = []
        
    def set_context(self, biome_desc):
        with self.lock:
            # NO TRUNCATION: LLM is responsible for brevity.
            self.biome_context = biome_desc
            self.focus_obj = "" 

    def update_focus(self, text):
        with self.lock: 
            # NO TRUNCATION: LLM is responsible for brevity.
            self.focus_obj = text.strip()

    def trigger_fx(self, text, duration=2.0):
        with self.lock:
            self.action_fx = text
            self.action_expiry = time.time() + duration
            
    def queue_narrative(self, text, is_voiceover=False):
        """Adds text to be displayed or spoken by the frontend."""
        with self.lock:
            self.narrative_queue.append({"text": text, "voice": is_voiceover})
            
    def pop_latest_narrative(self):
        """Returns the oldest unread narrative item (FIFO)."""
        with self.lock:
            if self.narrative_queue:
                return self.narrative_queue.pop(0)
            return None
        
    def get_prompt(self):
        """
        Constructs the strict prompt for Stable Diffusion.
        CRITICAL RULE: No additions to what the LLM intends. Only LLM content.
        Max 77 tokens (~40 words).
        """
        with self.lock: 
            prompt = ""
            
            # Logic: 
            # If the Brain LLM has observed something specific (focus_obj), that is the prompt.
            # If not, the Director LLM's world description (biome_context) is the prompt.
            # We do NOT concatenate them to avoid exceeding the token limit and to respect "no additions".
            
            if self.focus_obj:
                prompt = self.focus_obj
            else:
                prompt = self.biome_context
                
            # We do NOT truncate here anymore. 
            # If the LLM output is too long, the error is a signal to fix the LLM prompt, not to cut the text.
            
            return prompt, False # Force "active" state false as we rely purely on img2img physics for motion now

class VisionCortex(threading.Thread):
    def __init__(self, gm, ctrl, status, engine_ref):
        super().__init__()
        self.daemon = True
        self.gm = gm
        self.ctrl = ctrl
        self.status = status
        self.engine = engine_ref
        
        self.frame_buffer = [] 
        self.lock = threading.Lock()
        self.action_queue = []
        self.last_log = 0
        
    def see(self, pil_image):
        with self.lock:
            small = pil_image.resize((256, 192), Image.NEAREST)
            self.frame_buffer.append(small)
            if len(self.frame_buffer) > 3: self.frame_buffer.pop(0)
            
    def queue_action(self, action_text):
        with self.lock:
            self.action_queue.append(action_text)

    def run(self):
        print("[Eye] Vision Cortex Active.", flush=True)
        while True: 
            if not self.engine.active_session_id:
                time.sleep(1); continue

            # Safe check for world state
            if not (self.engine.quest_mgr and self.engine.nav and self.engine.nav.current_biome):
                time.sleep(1); continue

            # Check for player actions (Verb)
            player_action = None
            with self.lock:
                if self.action_queue: player_action = self.action_queue.pop(0)
            
            # --- JUDGMENT LOGIC ---
            if player_action and tool_agent.configured:
                current_biome_id = self.engine.nav.current_biome['id']
                qs = self.engine.quest_mgr.get_active_quests(current_biome_id)
                
                if qs:
                    active_quest = qs[0]
                    frames_to_send = []
                    with self.lock: frames_to_send = list(self.frame_buffer)
                    
                    image_payload = []
                    for frame in frames_to_send:
                        buf = io.BytesIO()
                        frame.save(buf, format="JPEG")
                        b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                        image_payload.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})

                    goal_desc = active_quest.get('success_visual_desc', 'Order restored.')
                    problem_desc = active_quest.get('manifestation_visuals', 'Chaos.')
                    
                    prompt = f"""
                    PLAYER ACTION: {player_action}
                    CURRENT PROBLEM: {problem_desc}
                    TARGET GOAL: {goal_desc}
                    
                    Did the action solve the visual problem?
                    KEEP VISUAL DESCRIPTIONS UNDER 40 WORDS.
                    """
                    
                    print(f"[Judge] Judging: {player_action}", flush=True)
                    try:
                        args = tool_agent.process("Judge", image_payload + [{"type": "text", "text": prompt}], allowed_tools=['evaluate_outcome'])
                        
                        if args and args.get('_tool_name') == 'evaluate_outcome':
                            # Subtitle
                            self.gm.queue_narrative(args['outcome_narrative'], is_voiceover=False)
                            # Voiceover (Short & Dramatic)
                            if args.get('dramatic_voiceover'):
                                self.gm.queue_narrative(args['dramatic_voiceover'], is_voiceover=True)
                            
                            self.gm.update_focus(args['new_visual_state'])
                            
                            if args['is_success']:
                                print("🏆 QUEST COMPLETE!", flush=True)
                                self.engine.quest_mgr.complete_quest(current_biome_id, active_quest['id'], args['outcome_narrative'])
                    except Exception as e:
                        print(f"[Judge] Error: {e}", flush=True)

            elif not player_action and (time.time() - self.last_log > 8):
                # --- PASSIVE OBSERVATION HOOK (THE AUTO-DIRECTOR) ---
                self.last_log = time.time()
                current_biome_id = self.engine.nav.current_biome['id']
                
                if tool_agent.configured:
                    try:
                        qs = self.engine.quest_mgr.get_active_quests(current_biome_id)
                        if not qs:
                            print(f"[Director] 🎬 Silence detected. Forcing Event...", flush=True)
                            self.engine.quest_mgr.generate_next_in_chain(None, current_biome_id)
                    except Exception as e:
                        print(f"[Director] Error in passive generation: {e}", flush=True)
            
            time.sleep(0.5)
`;
