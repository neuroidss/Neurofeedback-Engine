
export const NQ_VISION_PY = `
# ==================================================================================
# 👁️ VISION CORTEX & GAME MASTER
# ==================================================================================

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
    def __init__(self):
        self.biome_context = "A void" 
        self.focus_obj = "" 
        self.action_fx = "" 
        self.action_expiry = 0
        self.lock = threading.Lock()
        
    def set_context(self, biome_desc):
        with self.lock:
            self.biome_context = biome_desc
            self.focus_obj = "" 
            
    def update_focus(self, text):
        with self.lock: self.focus_obj = text.strip()[:100]

    def trigger_fx(self, text, duration=2.0):
        with self.lock:
            self.action_fx = text
            self.action_expiry = time.time() + duration
        
    def get_prompt(self):
        with self.lock: 
            p = self.biome_context
            if self.focus_obj and len(self.focus_obj) > 3:
                p += f", {self.focus_obj}"
            
            is_fx_active = time.time() < self.action_expiry
            if is_fx_active:
                p += f", {self.action_fx}"
                
            return f"{p}, masterpiece, 8k, raw photo, cinematic lighting", is_fx_active

class VisionCortex(threading.Thread):
    def __init__(self, gm, ctrl, status, engine_ref):
        super().__init__()
        self.daemon = True
        self.gm = gm; self.ctrl = ctrl; self.status = status; self.engine = engine_ref
        self.frame_buffer = [] 
        self.lock = threading.Lock()
        self.boot_time = time.time()
        self.last_log = 0
        self.action_queue = []
        
    def see(self, pil_image):
        with self.lock:
            small = pil_image.resize((256, 192), Image.NEAREST)
            self.frame_buffer.append(small)
            if len(self.frame_buffer) > 2: self.frame_buffer.pop(0)
            
    def queue_action(self, action_text):
        """Buffers an action from the main loop to ensure it is caught by the slower vision loop"""
        with self.lock:
            self.action_queue.append(action_text)
            
    def save_snapshot(self, pil_image, tag="vision"):
        if not CURRENT_SESSION_ID: return
        try:
            filename = f"sessions/{CURRENT_SESSION_ID}/images/{int(time.time())}_{tag}.jpg"
            pil_image.save(filename, quality=80)
        except: pass

    def run(self):
        log("Vision Cortex warming up... (10s)", "EYE")
        time.sleep(10)
        log("Vision Cortex Active.", "EYE")
        
        while True: 
            if not self.engine.active_session_id:
                time.sleep(1)
                continue

            if time.time() - self.last_log > 10:
                self.last_log = time.time()
                if not tool_agent.configured:
                    log("Waiting for LLM Configuration...", "EYE")
                else:
                    log("Vision Cortex Monitoring...", "EYE")

            frames_to_send = []
            with self.lock:
                if len(self.frame_buffer) >= 1: frames_to_send = [self.frame_buffer[-1]]
            
            # --- ACTION CONSUMPTION (LATCH) ---
            player_action = None
            with self.lock:
                if self.action_queue:
                    # Take the latest action, clear the queue
                    player_action = self.action_queue.pop(0)
                    self.action_queue.clear() # One action per vision cycle is enough
            
            # Fallback to controller polling if no latched action (e.g. holding a button)
            if not player_action:
                state = self.ctrl.get_state()
                if state["actions"]:
                    for act in state["actions"]:
                        if "ULTIMATE" in act: player_action = act; break
                        if "SKILL" in act: player_action = act; break
                        if "REQ_MANIFEST" in act: player_action = "REQ_MANIFEST"; break
                        if "Attack" in act: player_action = act
                        if "INTERACT" in act and not player_action: player_action = act
            
            if frames_to_send and tool_agent.configured:
                
                buf = io.BytesIO()
                frames_to_send[0].save(buf, format="JPEG")
                b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                
                # --- ENHANCED CONTEXT INJECTION ---
                active_quests = []
                if self.engine.quest_mgr and self.engine.nav:
                    active_quests = self.engine.quest_mgr.get_active_quests(self.engine.nav.current_biome['id'])
                
                # Inject Bio-Metrics
                focus = self.engine.bio_metrics.get('focus', 0.5)
                neural_ctx = f"PLAYER LUCIDITY: {int(focus*100)}%."
                
                quest_hint = ""
                if active_quests:
                    quest_hint = f"ACTIVE QUEST: {active_quests[0]['text']}."

                content = [
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}},
                    {"type": "text", "text": f"Describe the scene briefly. {quest_hint} {neural_ctx}"}
                ]
                
                if player_action:
                    # --- HANDLING MANIFESTATION (FORCE QUEST OBJECT) ---
                    if player_action == "REQ_MANIFEST":
                        log(f"🔮 MANIFESTATION INVOKED: Forcing quest target to appear.", "GM")
                        if active_quests:
                            target = active_quests[0]['text']
                            content.append({"type": "text", "text": f"SYSTEM OVERRIDE: The player invokes Game Master power. Rewrite the scene to explicitly feature the target of this quest: '{target}'. Ensure it is center frame."})
                            
                            try:
                                args = tool_agent.process("GM (Manifest)", content, allowed_tools=['describe_scene'])
                                if args and 'description' in args:
                                    scene_desc = args['description']
                                    log(f"Manifested Scene: {scene_desc}", "GM")
                                    # Force update the prompt immediately
                                    self.gm.update_focus(scene_desc)
                                    self.engine.quest_mgr.evaluate_visual_context(scene_desc, self.engine.nav.current_biome['id'], self.engine.bio_metrics)
                            except Exception as e:
                                log(f"Manifestation Error: {e}", "ERR")
                        else:
                            log(f"Manifestation Failed: No active quest.", "GM")

                    else:
                        # --- NORMAL ACTION ---
                        log(f"⚔️ TRIGGER: Player Action Detected: {player_action}", "GM")
                        context_msg = f"Context: Player used {player_action}. {quest_hint} Describe result."
                        content.append({"type": "text", "text": context_msg})
                        
                        try:
                            args = tool_agent.process("Vision (Action)", content, allowed_tools=['describe_scene'])
                            if args and 'description' in args:
                                scene_desc = args['description']
                                log(f"Action Result Scene: {scene_desc}", "GM")
                                self.gm.update_focus(scene_desc)
                                
                                # Always pass through Judge if interacting
                                if "INTERACT" in player_action or "ATTACK" in player_action:
                                    result = self.engine.quest_mgr.evaluate_combat_action(scene_desc, player_action, active_quests, self.engine.nav.current_biome['id'])
                                    if isinstance(result, dict) and result.get("type") == "ITEM_FOUND":
                                        item = result["item"]
                                        log(f"🎁 LOOT: {item['item_name']}", "GAME")
                                        self.engine.trigger_artifact_event(item['item_name'], item['visual_description'])
                                    elif result == "COMPLETE":
                                        log(f"✅ Quest logic signal received.", "GAME")
                                else:
                                    self.engine.quest_mgr.evaluate_combat_action(scene_desc, player_action, active_quests, self.engine.nav.current_biome['id'])
                        except Exception as e:
                            log(f"Error processing action: {e}", "ERR")
                        
                else:
                    # Passive Observation
                    try:
                        args = tool_agent.process("Vision (Passive)", content, allowed_tools=['describe_scene'])
                        if args and 'description' in args:
                            text = args['description']
                            self.gm.update_focus(text)
                            self.status["thought"] = text[:40]
                            
                            # --- RAG / PASSIVE CHECK ---
                            if self.engine.quest_mgr and self.engine.nav:
                                self.engine.quest_mgr.evaluate_visual_context(text, self.engine.nav.current_biome['id'], self.engine.bio_metrics)
                                
                    except Exception as e:
                        log(f"Error in passive vision: {e}", "ERR")
            
            time.sleep(1.5)
`;
