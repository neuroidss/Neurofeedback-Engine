
export const NQ_ENGINE_PY = `
# ==================================================================================
# ⚙️ MAIN ENGINE
# ==================================================================================

# --- ASYNC IMAGE WRITER ---
# Prevents IO blocking in the render loop while saving high-quality frames for video
class ImageWriter(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.queue = queue.Queue()
        self.start()
        
    def save(self, img, session_id, frame_num, context_obj):
        # We copy the image before queueing to prevent mutation during processing
        self.queue.put((img.copy(), session_id, frame_num, context_obj))
        
    def run(self):
        while True:
            img, sess_id, num, ctx = self.queue.get()
            try:
                if sess_id:
                    path_dir = f"sessions/{sess_id}/images"
                    os.makedirs(path_dir, exist_ok=True)
                    
                    filename = f"frame_{num:06d}.jpg"
                    full_path = f"{path_dir}/{filename}"
                    
                    # High quality save for video compilation
                    img.save(full_path, quality=90, subsampling=0)
                    
                    # LOG MATCHING: Allows correlating a specific image file to the game state at that moment
                    # The format [IMG] SAVED filename | PROMPT: ... is machine-parsable
                    log(f"SAVED {filename} | PROMPT: {ctx}", "IMG")
            except Exception as e:
                print(f"[NQ] Image Save Error: {e}")
            self.queue.task_done()

image_writer = ImageWriter()

def draw_hud(img, state, engine):
    if not engine.show_hud:
        return

    h, w = img.shape[:2]
    def put_text(txt, x, y, size=0.5, color=(255,255,255), thickness=1):
        cv2.putText(img, txt, (x+1, y+1), cv2.FONT_HERSHEY_SIMPLEX, size, (0,0,0), thickness+1)
        cv2.putText(img, txt, (x, y), cv2.FONT_HERSHEY_SIMPLEX, size, color, thickness)

    if not engine.active_session_id:
        # "Press Start" vibe
        overlay = img.copy()
        cv2.rectangle(overlay, (0, h//2-40), (w, h//2+40), (0,0,0), -1)
        cv2.addWeighted(overlay, 0.7, img, 0.3, 0, img)
        
        cv2.putText(img, "NEURAL LINK ESTABLISHED", (w//2-180, h//2-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,255,255), 2)
        
        pulse = int(time.time() * 2) % 2
        if pulse:
            cv2.putText(img, "AWAITING SESSION DATA...", (w//2-140, h//2+25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200,200,200), 1)
        return

    # --- TOP LEFT: Biome Info ---
    biome_desc = engine.nav.current_biome['description'].split('.')[0][:40]
    put_text(biome_desc, 10, 25, 0.6, (0, 255, 255))
    
    # --- QUEST VISUALIZATION (RAG Index) ---
    current_ctx = engine.gm.focus_obj + " " + engine.nav.current_biome['description']
    engine.quest_mgr.update_relevance(current_ctx, engine.nav.current_biome['id'])
    quests = engine.quest_mgr.get_active_quests(engine.nav.current_biome['id'])
    quests.sort(key=lambda x: x.get('relevance', 0), reverse=True)
    
    y_off = 50
    show_hints = "REQ_HINT" in state["actions"]

    for q in quests:
        rel = q.get('relevance', 0.5)
        if rel < 0.15: continue
        
        r = int(100 * rel)
        g = int(200 * rel)
        b = int(255 * rel)
        text_color = (r, g, b)
        
        put_text(" * " + q['text'][:45], 10, y_off, 0.5, text_color)
        y_off += 20
        
        if rel > 0.4 or show_hints:
            logic = q.get('verification_logic', 'Standard interaction.')
            logic_short = logic[:60] + "..." if len(logic) > 60 else logic
            put_text(f"   [TEST]: {logic_short}", 15, y_off, 0.4, (200, 100, 255))
            y_off += 20
    
    # --- ACTION FEEDBACK (Center Screen) ---
    if engine.last_action_time > 0 and (time.time() - engine.last_action_time < 1.5):
        action_txt = f"ACTION: {engine.last_action_text}"
        text_size = cv2.getTextSize(action_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)[0]
        tx = (w - text_size[0]) // 2
        ty = h // 2 - 50
        put_text(action_txt, tx, ty, 0.8, (0, 255, 0), 2)

    # --- INVENTORY (Bottom Left) ---
    if engine.db and engine.db.inventory:
        inv_str = " | ".join([i['name'] for i in engine.db.inventory[-3:]])
        put_text(f"INV: {inv_str}", 10, h-60, 0.4, (200, 200, 255))
    
    # --- BIO HUD (Lucidity) ---
    focus_pct = int(engine.current_lucidity * 100)
    color_f = (0, 255, 0) if focus_pct > 70 else ((0, 255, 255) if focus_pct > 40 else (0, 0, 255))
    
    mode_str = "MANUAL (LT)" if engine.bio_mode == 'manual' else "NEURO-LINK (EEG)"
    put_text(f"{mode_str}", 10, h-95, 0.35, (150, 150, 150))
    put_text(f"LUCIDITY: {focus_pct}%", 10, h-80, 0.5, color_f)

    # --- ELEMENTAL BARS (Bottom) ---
    bar_w = w // 4
    elements = ["FIRE", "WATER", "LIGHTNING", "WIND"]
    colors = [(0, 0, 255), (255, 0, 0), (0, 255, 0), (200, 200, 200)] 
    now = time.time()
    
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
            
        skill_cd = engine.ctrl.CD_SKILL - (now - engine.ctrl.skill_last_used[el])
        burst_cd = engine.ctrl.CD_BURST - (now - engine.ctrl.burst_last_used[el])
        if skill_cd > 0: put_text(f"{skill_cd:.1f}s", x+40, h-5, 0.4, (100,100,255))
        if energy >= 40 and burst_cd <= 0:
            if int(now * 5) % 2 == 0: cv2.rectangle(img, (x+2, h-18), (x+bar_w-2, h-2), (255,255,255), 1)

class NeuroEngine:
    def __init__(self):
        log(f"Init NeuroEngine Wrapper...")
        self.pipe = None
        self.is_ready = False
        self.loading_status = "INITIALIZING BOOT SEQUENCE..."
        self.loading_progress = 0.0
        self.show_hud = True 
        
        # We defer torch.compile to the render thread to ensure context affinity
        self.needs_compile = (DEVICE == 'cuda')
        
        self.loader_thread = threading.Thread(target=self._async_load, daemon=True)
        self.loader_thread.start()
        
        self.active_session_id = None
        self.db = None
        self.quest_mgr = None
        self.nav = None
        
        self.ctrl = Controller()
        self.gm = GameMaster()
        self.current_img = Image.new('RGB', (GEN_W, GEN_H), (0,0,0))
        self.active_quests = []
        self.status = {"thought": "Init"}
        self.brain = VisionCortex(self.gm, self.ctrl, self.status, self)
        self.brain.start()
        self.last_check = 0
        
        self.bio_metrics = {"focus": 1.0}
        self.last_bio_update = 0
        self.current_lucidity = 1.0
        self.bio_mode = 'manual' 
        
        self.last_action_text = ""
        self.last_action_time = 0
        
        self.artifact_queue = []
        self.artifact_active = None
        self.artifact_timer = 0

    def update_bio_metrics(self, data):
        if 'focus' in data: 
            self.bio_metrics['focus'] = float(data['focus'])
            self.last_bio_update = time.time()

    def _async_load(self):
        try:
            self.loading_status = "LOADING DIFFUSION PIPELINE..."
            self.loading_progress = 0.1
            time.sleep(0.1) 
            
            if os.path.isfile(MODEL_ID) or MODEL_ID.endswith(".safetensors"):
                self.pipe = StableDiffusionImg2ImgPipeline.from_single_file(MODEL_ID, torch_dtype=torch.float16, safety_checker=None).to(DEVICE)
            else:
                self.pipe = StableDiffusionImg2ImgPipeline.from_pretrained(MODEL_ID, torch_dtype=torch.float16, safety_checker=None).to(DEVICE)
            
            self.loading_status = "CONFIGURING SCHEDULER..."
            self.loading_progress = 0.5
            self.pipe.scheduler = LCMScheduler.from_config(self.pipe.scheduler.config)
            self.pipe.set_progress_bar_config(disable=True)
            
            # NOTE: We do NOT compile here. We compile in the render loop.
            # This prevents "RuntimeError: cannot reshape tensor" due to thread context mismatches.
            
            self.loading_status = "NEURO ENGINE READY."
            self.loading_progress = 1.0
            time.sleep(0.5)
            self.is_ready = True
            log("Engine Load Complete (Pipeline Ready).", "SYS")
            
        except Exception as e:
            self.loading_status = f"FATAL ERROR: {str(e)[:50]}..."
            log(f"SD Init Failed: {e}", "ERR")
            self.pipe = None 

    def load_session(self, session_id):
        log(f"📥 Loading Session: {session_id}", "SYS")
        path = os.path.join(session_manager.root_dir, f"{session_id}.json")
        self.db = WorldDatabase(path)
        self.quest_mgr = QuestManager(self.db)
        self.nav = BiomeNavigator(self.db)
        biome_desc = self.nav.current_biome['description']
        self.gm.set_context(biome_desc)
        self.active_session_id = session_id
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

    @torch.inference_mode()
    def render(self, image_input, prompt, strength):
        if not self.pipe: return image_input
        
        # --- THREAD-SAFE COMPILATION ---
        # We compile here, in the render thread, on first run.
        if self.needs_compile:
            log("Compiling UNet in Render Thread...", "SYS")
            try:
                self.pipe.unet = torch.compile(self.pipe.unet, mode="reduce-overhead", fullgraph=False)
                log("Compilation Complete.", "SYS")
            except Exception as e:
                log(f"Compile Skipped/Failed: {e}", "WARN")
            self.needs_compile = False

        min_safe = (1.0 / LCM_STEPS) + 0.02
        safe_strength = max(strength, min_safe)
        
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
            # Catch transient errors (like shape mismatches during warmup)
            log(f"Render Error: {e}", "ERR")
            return image_input

    def draw_loading_screen(self, frame_num):
        img = np.zeros((GEN_H, GEN_W, 3), dtype=np.uint8)
        grid_spacing = 40
        offset = (frame_num % grid_spacing)
        for x in range(0, GEN_W, grid_spacing):
            cv2.line(img, (x, 0), (x, GEN_H), (20, 10, 20), 1)
        for y in range(offset, GEN_H, grid_spacing):
            cv2.line(img, (0, y), (GEN_W, y), (20, 10, 20), 1)
        cv2.putText(img, "NEURO QUEST", (GEN_W//2 - 160, GEN_H//2 - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 0, 255), 3)
        cv2.putText(img, "NEURO QUEST", (GEN_W//2 - 160, GEN_H//2 - 40), cv2.FONT_HERSHEY_SIMPLEX, 1.5, (255, 255, 255), 1)
        cv2.putText(img, self.loading_status, (GEN_W//2 - 200, GEN_H//2 + 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)
        bar_w = 300
        bar_h = 10
        x1 = (GEN_W - bar_w) // 2
        y1 = GEN_H // 2 + 40
        cv2.rectangle(img, (x1, y1), (x1 + bar_w, y1 + bar_h), (100, 100, 100), 1)
        fill_w = int(bar_w * self.loading_progress)
        if fill_w > 0:
            g = int(150 + 100 * math.sin(frame_num * 0.2))
            cv2.rectangle(img, (x1 + 2, y1 + 2), (x1 + fill_w - 2, y1 + bar_h - 2), (0, g, 255), -1)
        return img

    def render_loop(self):
        if not HEADLESS:
            cv2.namedWindow("NEURO QUEST NATIVE", cv2.WINDOW_NORMAL)
        
        self.current_img = Image.fromarray(np.random.randint(50, 100, (GEN_H, GEN_W, 3), dtype=np.uint8))
        
        frame_count = 0
        t_last = time.time()
        fps_val = 0
        
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
                    img = self.render(self.current_img, prompt, 0.8) # Strong transformation for icon
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
                    text_x = (w - text_size[0]) // 2
                    cv2.putText(img_bgr, text, (text_x, h-30), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255,255,0), 2)
                    
                    if stream_manager.active:
                        ret, buf = cv2.imencode('.jpg', img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                        with stream_manager.lock: stream_manager.latest_jpeg = buf.tobytes()
                    if not HEADLESS:
                        cv2.imshow("NEURO QUEST NATIVE", img_bgr)
                        cv2.waitKey(1)
                    continue 

            # --- PHASE 3: GAME LOOP ---
            state = self.ctrl.get_state()
            
            for act in state["actions"]:
                self.last_action_text = act
                self.last_action_time = time.time()
                self.brain.queue_action(act)
                
                if "SKILL" in act:
                    if "FIRE" in act: self.gm.trigger_fx("explosive fire magic spells, glowing embers, heat distortion", 1.5)
                    elif "WATER" in act: self.gm.trigger_fx("swirling water magic, splashing droplets, hydro power", 1.5)
                    elif "LIGHTNING" in act: self.gm.trigger_fx("lightning bolts, electrical arcs, static discharge", 1.5)
                    elif "WIND" in act: self.gm.trigger_fx("tornado swirling wind effects, dust clouds", 1.5)
                elif "ULTIMATE" in act:
                    if "FIRE" in act: self.gm.trigger_fx("massive firestorm apocalypse, inferno, burning world", 3.0)
                    elif "WATER" in act: self.gm.trigger_fx("huge tsunami wave, flood, underwater distortion", 3.0)
                    elif "LIGHTNING" in act: self.gm.trigger_fx("thunderstorm giant lightning strike, blinding light", 3.0)
                    elif "WIND" in act: self.gm.trigger_fx("hurricane eye of the storm, debris flying", 3.0)

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

            # --- RENDER ---
            input_pil, is_moving = apply_physics(self.current_img, state)
            
            if self.active_session_id:
                if now - self.last_check > 1.0:
                    if self.quest_mgr and self.nav:
                        self.active_quests = self.quest_mgr.get_active_quests(self.nav.current_biome['id'])
                    self.last_check = now
            
            if self.pipe:
                prompt, is_fx_active = self.gm.get_prompt()
                strength = 0.45 if is_moving else 0.25
                if self.current_lucidity < 0.3:
                    strength += 0.3
                
                # Use the new robust render method
                res = self.render(input_pil, prompt, strength)
                
                inertia = 0.0 if is_fx_active else 0.3
                self.current_img = match_palette(self.current_img, res, inertia=inertia)
                
                # --- AUTO-SAVE LOGIC ---
                # Save every 2nd frame (approx 5-10fps) for video compilation later
                if self.active_session_id and frame_count % 2 == 0:
                    # Pass the semantic context (prompt) for debugging matching
                    image_writer.save(self.current_img, self.active_session_id, frame_count, self.gm.focus_obj)

                img_np = np.array(self.current_img)
                img_bgr = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGR)
                draw_hud(img_bgr, state, self)
                
                if not HEADLESS:
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
`;
