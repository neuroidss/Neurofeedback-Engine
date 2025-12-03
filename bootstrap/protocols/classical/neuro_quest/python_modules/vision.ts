
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
            if len(biome_desc) > 250:
                log(f"[GM] REJECTED Biome: Too long ({len(biome_desc)} chars).", "ERR")
                return
            self.biome_context = biome_desc
            self.focus_obj = "" 

    def update_focus(self, text):
        with self.lock: 
            if len(text) > 150:
                log(f"[GM] REJECTED Focus: Too long ({len(text)} chars).", "ERR")
                return
            self.focus_obj = text.strip()

    def trigger_fx(self, text, duration=2.0):
        with self.lock:
            self.action_fx = text
            self.action_expiry = time.time() + duration
        
    def get_prompt(self):
        with self.lock: 
            # Construct strictly based on GM State (Symbolic Layer)
            parts = []
            
            # 1. FX (Temporary Glitches/Actions)
            is_fx_active = time.time() < self.action_expiry
            if is_fx_active:
                parts.append(f"({self.action_fx}:1.2)")

            # 2. FOCUS (The GM's current attention/description)
            if self.focus_obj:
                parts.append(f"({self.focus_obj}:1.1)")
                
            # 3. BIOME (Background Context)
            parts.append(self.biome_context)
            
            # Style tags
            style = "masterpiece, 8k, raw photo, cinematic lighting"
            
            # Assemble
            base_p = ", ".join(parts)
            full_p = f"{base_p}, {style}"
            
            if len(full_p) > 350:
                full_p = full_p[:350]
                
            return full_p, is_fx_active

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
            if len(self.frame_buffer) > 3: self.frame_buffer.pop(0)
            
    def queue_action(self, action_text):
        with self.lock:
            self.action_queue.append(action_text)
            
    def save_snapshot(self, pil_image, tag="vision"):
        if not CURRENT_SESSION_ID: return
        try:
            filename = f"sessions/{CURRENT_SESSION_ID}/images/{int(time.time())}_{tag}.jpg"
            pil_image.save(filename, quality=80)
        except: pass

    def run(self):
        log("Vision Cortex warming up... (5s)", "EYE")
        time.sleep(5)
        log("Vision Cortex Active.", "EYE")
        
        while True: 
            if not self.engine.active_session_id:
                time.sleep(1)
                continue

            frames_to_send = []
            with self.lock:
                if len(self.frame_buffer) >= 1: 
                    frames_to_send = list(self.frame_buffer)
            
            if not frames_to_send:
                time.sleep(0.5)
                continue
            
            # --- REALITY CHECK: QUEST CONSISTENCY ---
            active_quests = []
            quest_instructions = ""
            
            if self.engine.quest_mgr and self.engine.nav:
                active_quests = self.engine.quest_mgr.get_active_quests(self.engine.nav.current_biome['id'])
                if active_quests:
                    q = active_quests[0]
                    # What did the GM imagine in the Imagination Deck?
                    target_visual = q.get('manifestation_visuals', q.get('concrete_solution', q['text']))
                    
                    # PROMPT INJECTION: Inform GM of the discrepancy
                    quest_instructions = f"""
**MASTER'S ARBITRARINESS REQUIRED:**
Active Quest Goal: "{target_visual}"
Observe the image. Is this object clearly visible?
- IF NO: You MUST use 'describe_scene' to force it into reality immediately. Describe it appearing.
- IF YES: You may proceed normally.
"""

            # --- ACTION CONSUMPTION ---
            player_action = None
            with self.lock:
                if self.action_queue:
                    player_action = self.action_queue.pop(0)
                    self.action_queue.clear()
            
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
                
                image_payload = []
                for i, frame in enumerate(frames_to_send):
                    buf = io.BytesIO()
                    frame.save(buf, format="JPEG")
                    b64 = base64.b64encode(buf.getvalue()).decode("utf-8")
                    image_payload.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
                
                is_autopilot = self.ctrl.autopilot.active
                
                # Inject Bio-Metrics
                focus = self.engine.bio_metrics.get('focus', 0.5)
                neural_ctx = f"LUCIDITY: {int(focus*100)}%."
                
                director_instruction = ""
                if is_autopilot:
                    director_instruction = " DIRECTOR MODE ACTIVE. Is the target visible? If not, use 'direct_cinematography' to pan/scan."

                content = image_payload + [{"type": "text", "text": f"Analyze visual. {quest_instructions} {neural_ctx} {director_instruction}"}]
                
                if player_action:
                    # --- HANDLING MANIFESTATION ---
                    if player_action == "REQ_MANIFEST":
                        log(f"🔮 MANIFESTATION INVOKED.", "GM")
                        if active_quests:
                            content.append({"type": "text", "text": f"EVENT: Player uses FORCE OF WILL to manifest the quest object. You MUST describe it appearing immediately using 'describe_scene'."})
                            try:
                                args = tool_agent.process("GM (Manifest)", content, allowed_tools=['describe_scene'])
                                if args and 'description' in args:
                                    scene_desc = args['description']
                                    log(f"Manifested: {scene_desc}", "GM")
                                    self.gm.update_focus(scene_desc)
                                    # PASS VISUAL CONTEXT
                                    self.engine.quest_mgr.evaluate_visual_context(scene_desc, self.engine.nav.current_biome['id'], self.engine.bio_metrics, visual_context=image_payload)
                            except Exception as e:
                                log(f"Manifest Error: {e}", "ERR")
                        else:
                            log(f"No active quest to manifest.", "GM")

                    else:
                        # --- NORMAL ACTION ---
                        log(f"⚔️ ACTION: {player_action}", "GM")
                        context_msg = f"Player used {player_action}. Did they hit the target?"
                        content.append({"type": "text", "text": context_msg})
                        
                        try:
                            # We allow 'complete_quest_action' here so combat can trigger success
                            args = tool_agent.process("Vision (Action)", content, allowed_tools=['describe_scene', 'complete_quest_action', 'update_quest_progress'])
                            
                            if args:
                                tool_name = args.get('_tool_name')
                                if tool_name == 'complete_quest_action':
                                    self.engine.quest_mgr.complete_quest(self.engine.nav.current_biome['id'], args.get('quest_id'), args.get('outcome_summary'))
                                elif tool_name == 'update_quest_progress':
                                    self.engine.quest_mgr.db.update_quest_progress(self.engine.nav.current_biome['id'], args['quest_id'], args['progress_report'])
                                elif tool_name == 'describe_scene' and 'description' in args:
                                    scene_desc = args['description']
                                    log(f"Result: {scene_desc}", "GM")
                                    self.gm.update_focus(scene_desc)
                                    # Double check logic
                                    self.engine.quest_mgr.evaluate_combat_action(scene_desc, player_action, active_quests, self.engine.nav.current_biome['id'], visual_context=image_payload)
                        except Exception as e:
                            log(f"Action Error: {e}", "ERR")
                        
                else:
                    # Passive Observation (~5s)
                    if time.time() - self.last_log > 5:
                        try:
                            allowed = ['describe_scene', 'complete_quest_action', 'update_quest_progress']
                            if is_autopilot: allowed.append('direct_cinematography')
                            
                            args = tool_agent.process("Vision (Passive)", content, allowed_tools=allowed)
                            
                            if args:
                                tool_name = args.get('_tool_name')
                                if tool_name == 'describe_scene' and 'description' in args:
                                    text = args['description']
                                    self.gm.update_focus(text) # Update Global Context
                                    self.status["thought"] = text[:40]
                                    if self.engine.quest_mgr and self.engine.nav:
                                        self.engine.quest_mgr.evaluate_visual_context(text, self.engine.nav.current_biome['id'], self.engine.bio_metrics, visual_context=image_payload)
                                        
                                elif tool_name == 'direct_cinematography' and self.engine.ctrl.autopilot:
                                    self.engine.ctrl.autopilot.set_cinematography(
                                        args.get('movement'), 
                                        args.get('duration', 3.0),
                                        args.get('intensity', 0.5),
                                        args.get('_thought', 'Directing...')
                                    )
                                elif tool_name == 'complete_quest_action':
                                    self.engine.quest_mgr.complete_quest(self.engine.nav.current_biome['id'], args.get('quest_id'), args.get('outcome_summary'))
                                    
                        except Exception as e:
                            log(f"Passive Error: {e}", "ERR")
                        self.last_log = time.time()
            
            time.sleep(0.5)
`;
