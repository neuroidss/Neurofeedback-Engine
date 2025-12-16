
export const NQ_ENGINE_PY = `
import time
import math
import cv2
import numpy as np
import torch
import os
import threading
from PIL import Image, ImageDraw, ImageFont
from diffusers import StableDiffusionImg2ImgPipeline, LCMScheduler
# from config import save_debug_image, log # REMOVED for Monolith Build

MODEL_ID = os.environ.get("MODEL_PATH", "SimianLuo/LCM_Dreamshaper_v7")
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

class NeuroEngine:
    def __init__(self):
        print("[Engine] ⚙️ Initializing Semantic Engine...", flush=True)
        
        self.pipe = None
        self.model_ready = False # CRITICAL: Prevents race conditions during load
        self.current_frame = Image.new('RGB', (512, 384), (0,0,0))
        self.render_lock = threading.Lock()
        self.ip_adapter_active = False
        
        # 1. Semantic Core
        try:
            from sentence_transformers import SentenceTransformer
            embedder = SentenceTransformer('all-MiniLM-L6-v2')
            self.embed = embedder.encode
        except:
            print("[Engine] WARN: No Embedder. Using Random Vectors.", flush=True)
            self.embed = lambda x: np.random.rand(384)
            
        self.physics = SemanticPhysicsEngine(self.embed)
        self.brain = NeuralBrain(self)
        
        # 2. Inputs
        self.gamepad = VirtualGamepad()
        self.fusion = NeuroInputFusion(384)
        self.fusion.init_vectors(self.embed)
        self.ghost = GhostPlayer(self.physics)
        
        # 3. State
        self.active_session_id = None 
        self.show_hud = True
        self.current_asset_filename = None 
        
        self.latest_game_stats = {}
        self.gm = GameMaster() 
        self.music = None 
        
        # Initialize default DB placeholder (Using Central Path)
        try:
            # Use global SESSIONS_DIR if available
            root = globals().get("SESSIONS_DIR", "sessions")
            default_path = os.path.join(root, "world_db.json")
            
            self.db = WorldDatabase(default_path) 
            self.nav = BiomeNavigator(self.db)
            self.quest_mgr = QuestManager(self.db)
            self.quest_mgr.attach_engine(self)
            if tool_agent: tool_agent.attach_engine(self)
        except Exception as e:
            print(f"[Engine] World/Quest Init Error: {e}", flush=True)

        threading.Thread(target=self._load_lcm, daemon=True).start()
        self.brain.start()

    def _load_lcm(self):
        try:
            print(f"[Engine] Loading LCM from: {MODEL_ID}", flush=True)
            if os.path.isfile(MODEL_ID) or MODEL_ID.endswith(".safetensors"):
                self.pipe = StableDiffusionImg2ImgPipeline.from_single_file(MODEL_ID, torch_dtype=torch.float16, safety_checker=None, load_safety_checker=False).to(DEVICE)
            else:
                self.pipe = StableDiffusionImg2ImgPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.float16, safety_checker=None).to(DEVICE)
        except Exception as e:
            print(f"[Engine] ❌ Load Failed: {e}", flush=True)
            return

        if self.pipe:
            if hasattr(self.pipe, 'safety_checker'): self.pipe.safety_checker = None
            if hasattr(self.pipe, 'feature_extractor'): self.pipe.feature_extractor = None
            self.pipe.requires_safety_checker = False
            try: self.pipe.scheduler = LCMScheduler.from_config(self.pipe.scheduler.config)
            except: self.pipe.scheduler = LCMScheduler()
            self.pipe.set_progress_bar_config(disable=True)
            
            # --- IP-ADAPTER LOADING (CONSISTENCY LAYER) ---
            try:
                print("[Engine] 🔌 Loading IP-Adapter for Consistency...", flush=True)
                self.pipe.load_ip_adapter("h94/IP-Adapter", subfolder="models", weight_name="ip-adapter_sd15.bin")
                self.pipe.set_ip_adapter_scale(0.6) 
                self.ip_adapter_active = True
                print("[Engine] ✅ Identity Core Active (IP-Adapter).", flush=True)
            except Exception as e:
                print(f"[Engine] ⚠️ IP-Adapter Warning: {e}. Running in pure text mode.", flush=True)
                self.ip_adapter_active = False

            self.model_ready = True # Signal that rendering can start
            print("[Engine] ✨ LCM Ready (Uncensored).", flush=True)

    def load_session(self, session_id):
        self.active_session_id = session_id
        set_current_session(session_id)
        
        # Use Central Path
        root = globals().get("SESSIONS_DIR", "sessions")
        session_path = os.path.join(root, f"{session_id}.json")
        
        if not os.path.exists(session_path):
            log(f"❌ Session file not found: {session_path}", "ERR")
            return

        log(f"📂 Loading Session Database: {session_path}", "ENG")
        self.db = WorldDatabase(session_path)
        self.nav = BiomeNavigator(self.db)
        self.quest_mgr = QuestManager(self.db)
        self.quest_mgr.attach_engine(self)
        
        game_config = self.db.config
        if not game_config:
            log("⚠️ No config in session DB. Using Default (Rance).", "WARN")
            if "RANCE_10_MODE" in GAMES:
                game_config = GAMES["RANCE_10_MODE"]
            else:
                game_config = list(GAMES.values())[0] if GAMES else {}
            
        self.physics.load_game(game_config)
        log(f"✅ Session {session_id} Loaded. Mode: {game_config.get('title')}", "ENG")

    def set_autopilot(self, enabled):
        self.gamepad.autopilot_enabled = enabled
        if enabled:
            self.gamepad.last_input_time = 0
            print("[Engine] 🤖 Autopilot ENGAGED via API.", flush=True)
        else:
            self.gamepad.last_input_time = time.time()
            print("[Engine] 🎮 Autopilot DISENGAGED via API.", flush=True)

    def save_and_quit(self):
        if self.db: self.db.save_db()
        self.active_session_id = None

    def update_bio_metrics(self, data):
        focus = data.get("focus", 0.5)
        balance = data.get("balance", 0.5)
        if self.ghost: self.ghost.focus_level = focus
        self.current_bio_balance = balance
        self.current_bio_focus = focus 

    def queue_narrative(self, text, is_voiceover=False):
        if self.gm: self.gm.queue_narrative(text, is_voiceover)

    def ensure_asset_exists(self, subject_id, description, asset_path):
        if not asset_path: return False
        if os.path.exists(asset_path): return True 
            
        print(f"[Asset] 🎨 Forging new asset for {subject_id} at {asset_path}...", flush=True)
        try:
            prompt = f"Portrait of {description}, white background, high quality, character design, concept art, distinct face"
            noise = Image.new('RGB', (512, 512), (128,128,128)) 
            noise_np = np.random.randint(0, 255, (512, 512, 3), dtype=np.uint8)
            noise_img = Image.fromarray(noise_np)
            
            kwargs = {
                "prompt": prompt,
                "image": noise_img,
                "strength": 1.0,
                "num_inference_steps": 4,
                "guidance_scale": 1.5
            }

            if self.ip_adapter_active:
                self.pipe.set_ip_adapter_scale(0.0)
                kwargs["ip_adapter_image"] = Image.new('RGB', (224, 224), (0, 0, 0))
                
            with self.render_lock:
                result = self.pipe(**kwargs).images[0]
            
            if self.ip_adapter_active:
                self.pipe.set_ip_adapter_scale(0.6)
                
            os.makedirs(os.path.dirname(asset_path), exist_ok=True)
            result.save(asset_path)
            print(f"[Asset] ✅ Saved: {asset_path}", flush=True)
            return True
        except Exception as e:
            print(f"[Asset] ❌ Forge Failed: {e}", flush=True)
            return False

    def _render_standby(self):
        img = Image.new('RGB', (512, 384), (5, 10, 15))
        draw = ImageDraw.Draw(img)
        t = time.time()
        offset = int((t * 20) % 40)
        for i in range(0, 512, 40): draw.line([(i, 0), (i, 384)], fill=(0, 30, 40))
        for i in range(0, 384, 40): y = (i + offset) % 384; draw.line([(0, y), (512, y)], fill=(0, 30, 40))
        draw.text((180, 150), "NEURO QUEST", fill=(0, 255, 255))
        blink = int(t * 2) % 2 == 0
        status_color = (0, 255, 0) if blink else (0, 100, 0)
        draw.text((155, 170), "AWAITING CARTRIDGE...", fill=status_color)
        if blink: draw.text((155, 190), "> _", fill=(0, 255, 0))
        self.current_frame = img
        stream_manager.update(img)

    def render_loop(self):
        last_time = time.time()
        self.vision = VisionCortex(self.gm, self.gamepad, None, self)
        self.vision.start()
        self.audio = AudioSense(self) 
        self.audio.start()
        
        class MusicLink:
            def __init__(self): self.active = False; self.port = 8000
            def set_config(self, p): self.port = p
            def set_active(self, a): self.active = a
        self.music = MusicLink()

        print("[Engine] 🟢 Render Loop Started. Waiting for Session.", flush=True)

        while True:
            # SAFETY CHECK: Do not touch self.pipe until loader says it's ready
            if not self.model_ready: 
                time.sleep(0.5)
                continue
            
            if not self.active_session_id:
                self._render_standby()
                time.sleep(0.1) 
                last_time = time.time() 
                continue
            
            dt = time.time() - last_time
            last_time = time.time()

            # 1. INPUT & AUTOPILOT
            controls = self.gamepad.update()
            player_vector = None
            
            if self.gamepad.autopilot_enabled:
                if not self.ghost.active: self.ghost.engage()
                ghost_data = self.ghost.update(dt)
                
                if ghost_data:
                    # A. Physical Action (Movement/Combat) -> Gamepad Sim
                    self.gamepad.inject_ai_input({"move": ghost_data["move_vec"][:2], "action": ghost_data["action"]})
                    
                    # B. Meta Action (Social/Farm/End Turn) -> Direct Game Logic Call
                    if ghost_data.get("meta_action"):
                        action = ghost_data["meta_action"]
                        
                        if self.physics.game_logic:
                            if action == "social":
                                inv = self.physics.game_logic.inventory
                                if inv:
                                    target = random.choice(inv)
                                    self.physics.game_logic.trigger_social(target['uid'], 'dinner')
                            
                            elif action == "farm":
                                self.physics.game_logic.trigger_farm()
                                
                            elif action == "end_turn":
                                result = self.physics.game_logic.end_turn()
                                if result:
                                    self.physics.current_visual_prompt = result[1] # Update visual prompt
                                    self.physics.is_new_scene = True
                            
                            elif action == "battle":
                                # Trigger battle using auto-targeting
                                result = self.physics.game_logic.trigger_battle()
                                if result:
                                    self.physics.current_visual_prompt = result[1]
                                    self.physics.is_new_scene = True

                    player_vector = ghost_data["move_vec"]
                    self.current_bio_focus = ghost_data["eeg_focus"] 
            else:
                if self.ghost.active: self.ghost.disengage()
                bal = getattr(self, 'current_bio_balance', 0.0)
                real_eeg_sim = np.array([getattr(self, 'current_bio_focus', 0.5)]) 
                fused = self.fusion.fuse(real_eeg_sim, controls, balance=bal) 
                player_vector = fused["vector"] if fused["intensity"] > 0.1 else None

            # 2. PHYSICS & LOGIC
            gaze_target = self.brain.latest_entity_focus.id if (self.brain and self.brain.latest_entity_focus) else None
            self.physics.tick(player_vector, gaze_target, dt)
            
            focus_val = getattr(self, 'current_bio_focus', 0.5)
            self.physics.advance_game(focus_val, dt, is_autopilot=self.gamepad.autopilot_enabled)
            
            if self.physics.game_logic:
                self.latest_game_stats = {
                    "resources": self.physics.game_logic.resources,
                    "event": self.physics.game_logic.current_event,
                    "logs": self.physics.game_logic.logs,
                    "territories": self.physics.game_logic.territories,
                    "inventory": self.physics.game_logic.inventory,
                    "active_battle": self.physics.game_logic.active_battle # Added to sync battle logs
                }

            # 3. RENDER GENERATION
            current_prompt = self.physics.get_visual_prompt() or "A void" # SAFETY FALLBACK
            
            ip_image = None
            self.current_asset_filename = None
            subject_id = None
            
            if self.ip_adapter_active and self.physics.game_logic:
                subject_id = self.physics.game_logic.current_subject_id
                subject_desc = self.physics.game_logic.current_subject_desc
                asset_path = self.physics.get_active_asset_path()
                
                # Use Global SESSIONS_DIR
                if not asset_path and subject_id:
                    root = globals().get("SESSIONS_DIR", "sessions")
                    safe_id = "".join([c for c in subject_id if c.isalnum() or c in ('_')]).strip()
                    asset_path = os.path.join(root, self.active_session_id, "assets", f"{safe_id}.png")
                
                if asset_path and subject_id:
                    if not os.path.exists(asset_path) and subject_desc:
                        self.ensure_asset_exists(subject_id, subject_desc, asset_path)
                    
                    if os.path.exists(asset_path):
                        try:
                            ip_image = Image.open(asset_path)
                            self.current_asset_filename = asset_path
                        except Exception as e:
                            print(f"[Render] Asset Load Error ({asset_path}): {e}", flush=True)

            if self.physics.is_new_scene:
                strength = 0.75 
            else:
                strength = 0.45 
            
            warped, motion = apply_physics(self.current_frame, controls)
            strength += (motion * 0.1)
            strength = min(0.95, max(0.1, strength))

            try:
                with self.render_lock:
                    kwargs = {
                        "prompt": current_prompt,
                        "image": warped,
                        "strength": strength,
                        "num_inference_steps": 3,
                        "guidance_scale": 1.5
                    }
                    
                    if self.ip_adapter_active:
                        if ip_image:
                            kwargs["ip_adapter_image"] = ip_image
                            self.pipe.set_ip_adapter_scale(0.6)
                        else:
                            kwargs["ip_adapter_image"] = Image.new('RGB', (224, 224), (0, 0, 0)) 
                            self.pipe.set_ip_adapter_scale(0.0)
                    
                    generated_frame = self.pipe(**kwargs).images[0]
                    self.current_frame = generated_frame
                    
                    if self.physics.is_new_scene:
                        save_debug_image(generated_frame, f"scene_{self.physics.game_logic.current_event}")
                    elif self.physics.game_logic and "Battle" in self.physics.game_logic.current_event:
                         if int(time.time() * 10) % 20 == 0: 
                             save_debug_image(generated_frame, f"battle_{int(time.time())}")

            except Exception as e:
                print(f"[Engine] 💥 Renderer Error: {e}", flush=True)
            
            # 4. DRAW HUD
            display_frame = self.current_frame.copy()
            if self.show_hud:
                draw = ImageDraw.Draw(display_frame)
                draw.text((10, 10), f"FPS: {1.0/(dt+0.001):.1f}", fill=(0, 255, 0))
                if ip_image:
                    draw.text((10, 25), f"IP-ADAPTER: ACTIVE ({subject_id})", fill=(255, 0, 255))
                else:
                    draw.text((10, 25), f"IP-ADAPTER: IDLE", fill=(100, 100, 100))
                
                draw.text((10, 360), f"PROMPT: {current_prompt[:60]}...", fill=(255, 255, 255))

            stream_manager.update(display_frame)
            if self.vision: self.vision.see(self.current_frame)
            
            try:
                open_cv_image = np.array(display_frame) 
                open_cv_image = open_cv_image[:, :, ::-1].copy() 
                cv2.imshow('Neuro Quest Native', open_cv_image)
                cv2.waitKey(1)
            except: pass

    def update_audio(self, arousal=0.0, intent=""):
        pass
`;
