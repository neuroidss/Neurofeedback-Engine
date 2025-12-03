
export const NQ_ENGINE_PY = `
# ==================================================================================
# ⚙️ MAIN ENGINE (ADVERBIAL + CHAOS ENABLED)
# ==================================================================================

# --- ASYNC IMAGE WRITER ---
class ImageWriter(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.queue = queue.Queue()
        self.start()
        
    def save(self, img, session_id, frame_num, context_obj):
        self.queue.put((img.copy(), session_id, frame_num, context_obj))
        
    def run(self):
        while True:
            img, sess_id, num, ctx = self.queue.get()
            try:
                if sess_id:
                    path_dir = f"sessions/{sess_id}/logs/images"
                    os.makedirs(path_dir, exist_ok=True)
                    filename = f"frame_{num:06d}.jpg"
                    full_path = f"{path_dir}/{filename}"
                    img.save(full_path, quality=90, subsampling=0)
                    # log(f"SAVED {filename}", "IMG") # LOGGING DISABLED TO REDUCE SPAM
            except Exception as e:
                print(f"[NQ] Image Save Error: {e}")
            self.queue.task_done()

image_writer = ImageWriter()

def draw_hud(img, state, engine):
    if not engine.show_hud: return

    h, w = img.shape[:2]
    def put_text(txt, x, y, size=0.5, color=(255,255,255), thickness=1):
        cv2.putText(img, txt, (x+1, y+1), cv2.FONT_HERSHEY_SIMPLEX, size, (0,0,0), thickness+1)
        cv2.putText(img, txt, (x, y), cv2.FONT_HERSHEY_SIMPLEX, size, color, thickness)

    if not engine.active_session_id:
        overlay = img.copy()
        cv2.rectangle(overlay, (0, h//2-40), (w, h//2+40), (0,0,0), -1)
        cv2.addWeighted(overlay, 0.7, img, 0.3, 0, img)
        cv2.putText(img, "NEURO LINK ESTABLISHED", (w//2-180, h//2-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,255,255), 2)
        if int(time.time() * 2) % 2:
            cv2.putText(img, "AWAITING SESSION DATA...", (w//2-140, h//2+25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200,200,200), 1)
        return

    # --- AUTOPILOT INDICATOR ---
    if state.get("is_autopilot", False):
        cv2.rectangle(img, (w//2-80, 10), (w//2+80, 40), (0,0,0), -1)
        cv2.rectangle(img, (w//2-80, 10), (w//2+80, 40), (255, 0, 255), 2)
        
        # Show what the director is doing
        status_text = "DIRECTING"
        if engine.ctrl.autopilot.state == "APPROACH": status_text = "APPROACHING"
        elif engine.ctrl.autopilot.state == "ACT": status_text = "ACTING"
        
        put_text(status_text, w//2-50, 30, 0.6, (255, 255, 255), 2)
        
        # DEBUG REASON
        reason = state.get("debug_reason", "")
        if reason:
            put_text(reason, w//2-100, 50, 0.4, (200, 200, 255), 1)

    # --- BIOME ---
    biome_desc = engine.nav.current_biome['description'].split('.')[0][:40]
    put_text(biome_desc, 10, 25, 0.6, (0, 255, 255))
    
    # --- QUESTS ---
    current_ctx = engine.gm.focus_obj + " " + engine.nav.current_biome['description']
    engine.quest_mgr.update_relevance(current_ctx, engine.nav.current_biome['id'])
    quests = engine.quest_mgr.get_active_quests(engine.nav.current_biome['id'])
    quests.sort(key=lambda x: x.get('relevance', 0), reverse=True)
    
    y_off = 70 # Moved down to accommodate autopilot debug
    show_hints = "REQ_HINT" in state["actions"] or state.get("is_autopilot", False)

    for q in quests:
        rel = q.get('relevance', 0.5)
        if rel < 0.15: continue
        text_color = (int(100*rel), int(200*rel), int(255*rel))
        put_text(" * " + q['text'][:45], 10, y_off, 0.5, text_color)
        y_off += 20
        
        # --- PROGRESS REPORT DISPLAY ---
        report = q.get('progress_report')
        if report:
             put_text(f"   > {report[:55]}", 15, y_off, 0.4, (220, 220, 255))
             y_off += 15
        
        if rel > 0.4 or show_hints:
            logic = q.get('concrete_solution') if show_hints else q.get('verification_logic', 'Dream Logic')
            if not logic: logic = q.get('verification_logic', 'Dream Logic')
            
            logic_short = logic[:60] + "..." if len(logic) > 60 else logic
            label = "SOLUTION" if show_hints else "INTENT"
            
            put_text(f"   [{label}]: {logic_short}", 15, y_off, 0.4, (200, 100, 255))
            y_off += 20
    
    # --- ACTION FEEDBACK ---
    if engine.last_action_time > 0 and (time.time() - engine.last_action_time < 1.5):
        action_txt = f"ACTION: {engine.last_action_text}"
        text_size = cv2.getTextSize(action_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
        put_text(action_txt, (w - text_size[0]) // 2, h // 2 - 50, 0.8, (0, 255, 0), 2)

    # --- BIO HUD ---
    focus_pct = int(engine.current_lucidity * 100)
    color_f = (0, 255, 0) if focus_pct > 70 else ((0, 255, 255) if focus_pct > 40 else (0, 0, 255))
    put_text(f"LUCIDITY: {focus_pct}%", 10, h-80, 0.5, color_f)
    
    arousal = state.get("adverbs", {}).get("arousal", 0.0)
    intent = state.get("adverbs", {}).get("intent", "")
    if arousal > 0.1:
        put_text(f"ENTROPY: {int(arousal*100)}%", 10, h-95, 0.4, (0, 0, 255))
    if intent:
        put_text(f"VOICE: {intent}", 10, h-110, 0.4, (255, 0, 255))

    # --- ELEMENTAL BARS ---
    bar_w = w // 4
    elements = ["FIRE", "WATER", "LIGHTNING", "WIND"]
    colors = [(0, 0, 255), (255, 0, 0), (0, 255, 0), (200, 200, 200)] 
    
    for i, el in enumerate(elements):
        x = i * bar_w
        energy = state["energies"][el]
        cv2.rectangle(img, (x, h-20), (x+bar_w, h), (30,30,30), -1)
        fill_w = int((energy / 100.0) * bar_w)
        cv2.rectangle(img, (x, h-20), (x+fill_w, h), colors[i], -1)
        if el == state["active_element"]:
            cv2.rectangle(img, (x, h-20), (x+bar_w, h), (255,255,255), 2)
            put_text(el, x+5, h-5, 0.4, (255,255,255))
        else:
            cv2.rectangle(img, (x, h-20), (x+bar_w, h), (50,50,50), 1)
            put_text(el, x+5, h-5, 0.4, (150,150,150))

class NeuroEngine:
    def __init__(self):
        log(f"Init NeuroEngine Wrapper...")
        self.pipe = None
        self.dream_pipe = None # Specialized Imagination Pipeline (Text2Img)
        self.is_ready = False
        self.loading_status = "INITIALIZING BOOT SEQUENCE..."
        self.loading_progress = 0.0
        self.show_hud = True 
        
        # GPU Resource Lock to prevent render clashes between Main Loop and Fantasy Gen
        self.render_lock = threading.Lock()
        
        self.needs_compile = (DEVICE == 'cuda')
        self.loader_thread = threading.Thread(target=self._async_load, daemon=True)
        self.loader_thread.start()
        
        self.active_session_id = None
        self.db = None; self.quest_mgr = None; self.nav = None
        
        self.ctrl = Controller()
        self.gm = GameMaster()
        self.current_img = Image.new('RGB', (GEN_H, GEN_W), (0,0,0)) 
        self.status = {"thought": "Init"}
        self.brain = VisionCortex(self.gm, self.ctrl, self.status, self)
        self.brain.start()
        
        self.audio_sense = None
        # self.audio_sense = AudioSense(self.ctrl.spirit)
        # if not HEADLESS: self.audio_sense.start()
        
        self.bio_metrics = {"focus": 1.0}
        self.last_bio_update = 0
        self.current_lucidity = 1.0
        self.bio_mode = 'manual' 
        
        self.last_action_text = ""; self.last_action_time = 0
        self.artifact_queue = []; self.artifact_active = None; self.artifact_timer = 0
        self.last_music_prompt = ""
        
        # Stagnation Monitor (GM Invocation)
        self.last_quest_progress = time.time()

    def update_bio_metrics(self, data):
        if 'focus' in data: 
            self.bio_metrics['focus'] = float(data['focus'])
            self.last_bio_update = time.time()
            if self.ctrl.spirit:
                self.ctrl.spirit.update_metrics(focus=self.bio_metrics['focus'])

    def _async_load(self):
        try:
            self.loading_status = "LOADING DIFFUSION PIPELINE..."
            self.loading_progress = 0.1
            time.sleep(0.1) 
            
            # 1. LOAD MAIN PIPE (Img2Img)
            if os.path.isfile(MODEL_ID) or MODEL_ID.endswith(".safetensors"):
                self.pipe = StableDiffusionImg2ImgPipeline.from_single_file(MODEL_ID, torch_dtype=torch.float16, safety_checker=None).to(DEVICE)
            else:
                self.pipe = StableDiffusionImg2ImgPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.float16, safety_checker=None).to(DEVICE)
            
            self.loading_status = "CONFIGURING SCHEDULER..."
            self.loading_progress = 0.5
            self.pipe.scheduler = LCMScheduler.from_config(self.pipe.scheduler.config)
            self.pipe.set_progress_bar_config(disable=True)
            
            # 2. INIT IMAGINATION ENGINE (Txt2Img)
            # Sharing components to save VRAM, but providing a dedicated pipeline interface
            # so the Game Master can imagine things from scratch without input images.
            from diffusers import StableDiffusionPipeline
            
            self.loading_status = "INITIALIZING IMAGINATION ENGINE..."
            self.dream_pipe = StableDiffusionPipeline(
                vae=self.pipe.vae,
                text_encoder=self.pipe.text_encoder,
                tokenizer=self.pipe.tokenizer,
                unet=self.pipe.unet,
                scheduler=self.pipe.scheduler,
                safety_checker=None,
                feature_extractor=None,
                requires_safety_checker=False
            ).to(DEVICE)
            
            self.loading_status = "NEURO ENGINE READY."
            self.loading_progress = 1.0
            time.sleep(0.5)
            self.is_ready = True
            log("Engine Load Complete (Main + Imagination).", "SYS")
            
        except Exception as e:
            self.loading_status = f"FATAL ERROR: {str(e)[:50]}..."
            log(f"SD Init Failed: {e}", "ERR")
            self.pipe = None 

    def load_session(self, session_id):
        log(f"📥 Loading Session: {session_id}", "SYS")
        path = os.path.join(session_manager.root_dir, f"{session_id}.json")
        self.db = WorldDatabase(path)
        self.quest_mgr = QuestManager(self.db)
        self.quest_mgr.attach_engine(self) # ATTACH ENGINE for Fantasy Renders
        self.nav = BiomeNavigator(self.db)
        biome_desc = self.nav.current_biome['description']
        self.gm.set_context(biome_desc)
        self.active_session_id = session_id
        self.last_quest_progress = time.time()
        
        # --- RESTORE ACTIVE QUEST OVERLAY ---
        # If we load a game with an active quest, we must re-inject the visual 
        # so the world doesn't look blank.
        active_quests = self.quest_mgr.get_active_quests(self.nav.current_biome['id'])
        if active_quests:
            q = active_quests[0]
            visuals = q.get('manifestation_visuals', q.get('concrete_solution', q['text']))
            self.gm.set_quest_overlay(visuals)
            log(f"Restored Active Quest Overlay: {visuals}", "SYS")
        
        log(f"✅ Session Loaded. Biome: {biome_desc}", "SYS")
        
    def save_and_quit(self):
        if self.db:
            log("💾 Auto-saving...", "SYS")
            self.db.update_summary()
            self.db.save_db()
        self.active_session_id = None
        log("⏹️ Session Closed.", "SYS")
        
    def trigger_artifact_event(self, name, desc):
        log(f"💎 Triggering Artifact Event: {name}", "GAME")
        self.artifact_queue.append({"name": name, "desc": desc})
        self.last_quest_progress = time.time() # Reset Stagnation Timer
        
    def trigger_music_update(self, prompt):
        if prompt == self.last_music_prompt: return
        self.last_music_prompt = prompt
        
        # --- REMOTE MUSIC CONTROL ---
        def _call_music():
            try:
                log(f"🎵 Tuning Orchestra: {prompt}", "MUSIC")
                # MusicGen microservice typically on port 8000
                requests.post("http://localhost:8000/control/start", json={"prompt": prompt}, timeout=1.0)
            except:
                log("MusicGen Offline (Port 8000).", "WARN")
        threading.Thread(target=_call_music, daemon=True).start()

    @torch.inference_mode()
    def render(self, image_input, prompt, strength, blocking=True):
        """
        Main Render method. Supports non-blocking mode for the main loop
        to avoid freezing when background threads (Quest Generation) are using the GPU.
        """
        if not self.pipe: return image_input
        if self.needs_compile:
            log("Compiling UNet in Render Thread...", "SYS")
            try:
                self.pipe.unet = torch.compile(self.pipe.unet, mode="reduce-overhead", fullgraph=False)
                log("Compilation Complete.", "SYS")
            except Exception as e: log(f"Compile Skipped/Failed: {e}", "WARN")
            self.needs_compile = False

        min_safe = (1.0 / LCM_STEPS) + 0.02
        safe_strength = max(strength, min_safe)
        
        # --- GPU LOCKING ---
        # If blocking=False and we can't get the lock, we return input immediately.
        # This keeps the UI responsive (physics/HUD updates) even if AI is busy.
        got_lock = self.render_lock.acquire(blocking=blocking)
        if not got_lock:
            return image_input # Skip AI render this frame
            
        try:
            result = self.pipe(
                prompt=prompt,
                negative_prompt="candle, fire, blur, low quality, distortion, water, bad anatomy, text, watermark",
                image=image_input,
                num_inference_steps=LCM_STEPS, 
                strength=safe_strength,
                guidance_scale=1.0, 
                output_type="pil"
            ).images[0]
            return result
        except Exception as e:
            log(f"Render Error: {e}", "ERR")
            return image_input
        finally:
            self.render_lock.release()

    def render_fantasy(self, prompt, save_path):
        """
        Renders a fantasy vision of the quest goal using the IMAGINATION ENGINE.
        Uses pure Text-to-Image (via dream_pipe) instead of Img2Img to ensure
        the quest visualization is clean, distinct, and not influenced by current visual noise.
        """
        if not self.dream_pipe: 
            log("Imagination Engine not ready.", "ERR")
            return
        
        # Ensure we don't crash if called before model is ready
        if not self.is_ready: 
            time.sleep(1)
            if not self.is_ready: return

        log(f"🧙‍♂️ GM IMAGINATION: Rendering '{prompt[:30]}...'", "ART")

        try:
            # 2. RENDER FANTASY (Using dedicated Txt2Img Pipe)
            # This will block the main loop's AI render for ~0.5s-1s, but UI remains responsive
            # because main loop uses blocking=False.
            
            # Note: We must acquire the lock manually here since we call pipe directly
            with self.render_lock:
                fantasy_img = self.dream_pipe(
                    prompt=prompt + ", masterpiece, distinct object, glowing, concept art, centered",
                    negative_prompt="blur, low quality, distortion, watermark, artifacts, ugly",
                    num_inference_steps=4, # Slightly higher quality for static quest image
                    guidance_scale=1.5, 
                    width=GEN_W,
                    height=GEN_H,
                    output_type="pil"
                ).images[0]
            
            fantasy_img.save(save_path, quality=95)
            
        except Exception as e:
            # Enhanced Error Logging with Traceback
            import traceback
            tb = traceback.format_exc()
            log(f"Fantasy Render Failed: {e}\\n{tb}", "ERR")
            raise e

    def snapshot_moment(self, save_path):
        """
        Captures the current state of reality to a file.
        """
        try:
            with self.render_lock:
                # Copy under lock to prevent tearing
                snap = self.current_img.copy()
            snap.save(save_path, quality=95)
        except Exception as e:
            log(f"Snapshot Failed: {e}", "ERR")

    def draw_loading_screen(self, frame_num):
        img = np.zeros((GEN_H, GEN_W, 3), dtype=np.uint8)
        cv2.putText(img, "NEURO QUEST", (GEN_W//2 - 160, GEN_H//2 - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 0, 255), 3)
        cv2.putText(img, "NEURO QUEST", (GEN_W//2 - 160, GEN_H//2 - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 1)
        cv2.putText(img, self.loading_status, (GEN_W//2 - 200, GEN_H//2 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        return img

    def render_loop(self):
        if not HEADLESS: 
            cv2.namedWindow("NEURO QUEST NATIVE", cv2.WINDOW_NORMAL)
            cv2.namedWindow("GM IMAGINATION", cv2.WINDOW_NORMAL) # Dedicated window for quests
            cv2.resizeWindow("GM IMAGINATION", 400, 300)

        self.current_img = Image.fromarray(np.random.randint(50, 100, (GEN_H, GEN_W, 3), dtype=np.uint8))
        
        # State for Imagination Window
        last_imag_path = None
        imag_img = np.zeros((300, 400, 3), dtype=np.uint8)
        cv2.putText(imag_img, "WAITING FOR DREAM...", (30, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100,100,100), 1)

        frame_count = 0
        t_last = time.time()
        
        while True:
            # --- PHASE 1: LOADING ---
            if not self.is_ready:
                loading_frame = self.draw_loading_screen(frame_count)
                ret, buf = cv2.imencode('.jpg', loading_frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                with stream_manager.lock: stream_manager.latest_jpeg = buf.tobytes()
                if not HEADLESS:
                    cv2.imshow("NEURO QUEST NATIVE", loading_frame)
                    if cv2.waitKey(10) & 0xFF == 27: break
                frame_count += 1
                continue

            # --- PHASE 2: ARTIFACT OVERLAY ---
            if self.artifact_queue and not self.artifact_active:
                item = self.artifact_queue.pop(0)
                if self.pipe:
                    prompt = f"icon of {item['name']}, {item['desc']}, fantasy rpg item, magical glow, black background, high quality, 8k"
                    img = self.render(self.current_img, prompt, 0.8, blocking=True) 
                    self.artifact_active = {"img": img, "name": item['name']}
                    self.artifact_timer = time.time() + 4.0 
            
            if self.artifact_active:
                if time.time() > self.artifact_timer:
                    self.artifact_active = None
                else:
                    img_np = np.array(self.artifact_active["img"])
                    img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                    h, w = img_bgr.shape[:2]
                    cv2.rectangle(img_bgr, (0, h-80), (w, h), (0,0,0), -1)
                    text = f"ACQUIRED: {self.artifact_active['name']}"
                    text_size = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 1.0, 2)[0]
                    cv2.putText(img_bgr, text, ((w - text_size[0]) // 2, h-30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255,255,0), 2)
                    
                    if stream_manager.active:
                        ret, buf = cv2.imencode('.jpg', img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                        with stream_manager.lock: stream_manager.latest_jpeg = buf.tobytes()
                    if not HEADLESS:
                        cv2.imshow("NEURO QUEST NATIVE", img_bgr)
                        cv2.waitKey(1)
                    continue 

            # --- PHASE 3: GAME LOOP ---
            state = self.ctrl.get_state()
            
            # --- DIRECTOR BRIDGE ---
            if state.get("is_autopilot") and self.quest_mgr and self.nav:
                active_quests = self.quest_mgr.get_active_quests(self.nav.current_biome['id'])
                if active_quests:
                    top_quest = active_quests[0]
                    sol = top_quest.get("concrete_solution")
                    progress = top_quest.get("progress_report")
                    if sol:
                        objective_text = sol
                        if progress: objective_text += f". STATUS: {progress}"
                        self.ctrl.autopilot.set_objective(objective_text)
                        
                # --- STAGNATION MONITOR ---
                if time.time() - self.last_quest_progress > 20.0:
                    log("⌛ WORLD STAGNANT: Invoking Game Master...", "GM")
                    self.last_quest_progress = time.time()
                    if not active_quests:
                        log("⚠️ No active quests. Forcing Generation...", "GM")
                        self.quest_mgr.generate_next_in_chain(self.gm.biome_context, self.nav.current_biome['id'])
                        active_quests = self.quest_mgr.get_active_quests(self.nav.current_biome['id'])
                    
                    if active_quests:
                        self.brain.queue_action("REQ_MANIFEST")
                        self.gm.trigger_fx("glitch art, reality breaking", 1.0)
            
            for act in state["actions"]:
                self.last_action_text = act
                self.last_action_time = time.time()
                self.last_quest_progress = time.time()
                self.brain.queue_action(act)
                if "SKILL" in act: self.gm.trigger_fx(f"{state['active_element']} energy burst", 1.5)
                elif "ULTIMATE" in act: self.gm.trigger_fx(f"massive {state['active_element']} explosion", 3.0)

            # Bio-Metrics
            now = time.time()
            if now - self.last_bio_update > 2.0:
                self.bio_mode = 'manual'
                base_lucidity = 1.0 
            else:
                self.bio_mode = 'eeg'
                base_lucidity = self.bio_metrics.get('focus', 0.5)
            
            lt_val = state.get('lt', 0.0)
            self.current_lucidity = base_lucidity * (1.0 - lt_val)
            self.bio_metrics['focus'] = self.current_lucidity

            # --- PHYSICS & RENDER ---
            input_pil, movement_energy = apply_physics(self.current_img, state)
            
            if self.pipe:
                prompt, is_fx_active = self.gm.get_prompt()
                
                if prompt is None:
                    self.current_img = input_pil
                else:
                    strength = 0.28 + (movement_energy * 0.37)
                    res = self.render(input_pil, prompt, strength, blocking=False)
                    inertia = 0.0 if is_fx_active else 0.3
                    self.current_img = match_palette(self.current_img, res, inertia=inertia)
                
                if self.active_session_id and frame_count % 2 == 0:
                    image_writer.save(self.current_img, self.active_session_id, frame_count, self.gm.focus_obj)

                img_np = np.array(self.current_img)
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                draw_hud(img_bgr, state, self)
                
                if not HEADLESS:
                    # Update Imagination Window
                    target_path = None
                    if self.quest_mgr and self.nav and hasattr(self.nav, 'current_biome') and self.nav.current_biome:
                        qs = self.quest_mgr.get_active_quests(self.nav.current_biome['id'])
                        if qs:
                            for q in qs:
                                p = q.get('image_path')
                                if p and os.path.exists(p):
                                    target_path = p
                                    break
                    
                    if target_path != last_imag_path:
                        last_imag_path = target_path
                        if target_path:
                            try:
                                loaded = cv2.imread(target_path)
                                if loaded is not None:
                                    imag_img = loaded
                            except: pass
                        else:
                            imag_img = np.zeros((300, 400, 3), dtype=np.uint8)
                            cv2.putText(imag_img, "DREAMING...", (30, 150), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100,100,100), 1)

                    cv2.imshow("GM IMAGINATION", imag_img)
                    cv2.imshow("NEURO QUEST NATIVE", img_bgr)
                    
                    key = cv2.waitKey(1) & 0xFF
                    if key == 27: break
                    self.ctrl.update_keys(key, True)
                    self.ctrl.keys_pressed = set([key]) if key != 255 else set()

                stream_manager.update(self.current_img)
                self.brain.see(self.current_img)
                
                dt = time.time() - t_last
                fps_val = 1.0 / (dt + 0.0001)
                t_last = time.time()

                if frame_count % 100 == 0:
                    try: log(f"STATS::FPS={int(fps_val)}::OBJ={self.gm.focus_obj}", "STATS")
                    except: pass
            else: time.sleep(0.1)
            
            frame_count = (frame_count + 1) % 1000000
            
        if not HEADLESS: cv2.destroyAllWindows()
        pygame.quit()
        os._exit(0)
`
