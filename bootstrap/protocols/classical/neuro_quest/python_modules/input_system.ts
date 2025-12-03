
export const INPUT_SYSTEM_PYTHON = `
# ==================================================================================
# 🎮 CORE INPUT SYSTEM (IMMUTABLE)
# ==================================================================================
# Contains: Controller (Verbs), Spirit (Adverbs), Physics (Transforms)
# ==================================================================================

def apply_physics(img_pil, inp):
    img_np = np.array(img_pil)
    h, w = img_np.shape[:2]
    
    # --- ADVERB: Mental State (Spirit) ---
    adverbs = inp.get("adverbs", {})
    arousal = adverbs.get("arousal", 0.0) # 0.0 (Calm) -> 1.0 (Panic/Dream)
    valence = adverbs.get("valence", 0.0) # -1.0 (Negative) -> 1.0 (Positive)

    # --- VERB: Physical Movement (Gamepad/AI) ---
    move_x = -(inp["lx"]) * 20 
    zoom_input = (-inp["ly"]) * 0.08
    pan_x = -(inp["rx"]) * 40 
    pan_y = -(inp["ry"]) * 30
    
    # --- VITALITY DRIFT (Virtual Gyroscope) ---
    # "Life is movement. Stillness is death."
    t = time.time()
    
    # 1. The "Pulse" (Breathing) - Always active
    # Freq increases with arousal (Panic = Hyperventilation)
    pulse_freq = 0.8 + (arousal * 2.0)
    pulse_amp = 0.0025 + (arousal * 0.015)
    breath = math.sin(t * pulse_freq) * pulse_amp
    zoom_input += breath
    
    # 2. The "Tremor" (Handheld Camera / Floating Eye)
    # Never perfectly still.
    tremor_base = 1.0
    tremor_psych = arousal * 15.0 # Hallucinatory shaking
    total_tremor = tremor_base + tremor_psych
    
    drift_x = (math.sin(t * 1.1) + math.cos(t * 0.3)) * total_tremor
    drift_y = (math.cos(t * 1.2) + math.sin(t * 0.4)) * total_tremor
    
    move_x += drift_x
    pan_y += drift_y

    # --- TRANSFORM ---
    total_zoom = 1.002 + zoom_input

    M = cv2.getRotationMatrix2D((w//2, h//2), 0, total_zoom)
    M[0, 2] += move_x + pan_x
    M[1, 2] += pan_y
    
    warped = cv2.warpAffine(img_np, M, (w, h), borderMode=cv2.BORDER_REFLECT_101)
    
    # --- ENERGY CALCULATION (Continuous) ---
    # Sum absolute deltas (weighted)
    physical_energy = abs(move_x) + abs(pan_x) + abs(pan_y) + (abs(zoom_input) * 800)
    
    # Arousal adds to energy (visual distortion/melting)
    mental_energy = arousal * 80.0
    
    total_energy = physical_energy + mental_energy
    
    # Normalize to 0.0 - 1.0 range for strength calculation
    movement_factor = min(1.0, total_energy / 80.0)
    
    res = warped
    
    # Effect 1: Visual Grain (Film Noise)
    noise_lvl = int(3 + (movement_factor * 25))
    noise = np.random.randint(-noise_lvl, noise_lvl, (h, w, 3), dtype=np.int16)
    res = np.clip(res.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    # Effect 2: Color Shift (Valence)
    if abs(valence) > 0.1:
        res = res.astype(np.float32)
        if valence < 0: # Sad/Scary -> Blue/Cold tint
            res[:, :, 0] *= (1.0 + abs(valence)*0.1) 
            res[:, :, 2] *= (1.0 - abs(valence)*0.1) 
        else: # Happy/Safe -> Gold/Warm tint
            res[:, :, 1] *= (1.0 + valence*0.05) 
            res[:, :, 2] *= (1.0 + valence*0.1) 
        res = np.clip(res, 0, 255).astype(np.uint8)

    return Image.fromarray(res), movement_factor

def match_palette(source_pil, target_pil, inertia=0.3):
    src = np.array(source_pil).astype(np.float32)
    tgt = np.array(target_pil).astype(np.float32)
    mu_src, std_src = cv2.meanStdDev(src)
    mu_tgt, std_tgt = cv2.meanStdDev(tgt)
    correction = (tgt - mu_tgt.reshape(1,1,3)) * (std_src.reshape(1,1,3) / (std_tgt.reshape(1,1,3) + 1e-5)) + mu_src.reshape(1,1,3)
    correction = np.clip(correction, 0, 255)
    return Image.fromarray((correction * inertia + tgt * (1.0 - inertia)).astype(np.uint8))

class SpiritInput:
    """
    Handles 'Adverbial' inputs: Voice (Intent) and BCI (State).
    """
    def __init__(self):
        self.lock = threading.Lock()
        self.state = {
            "arousal": 0.0, # 0.0 - 1.0 (Combined Audio + Focus)
            "valence": 0.0, # -1.0 - 1.0 (Focus)
            "intent": "",   # "burn", "hide", "run" (From Voice)
            "focus": 1.0,   # 0.0 (Dream) - 1.0 (Lucid)
            "audio_rms": 0.0 # Raw volume
        }
    
    def update_metrics(self, focus=None):
        with self.lock:
            if focus is not None: 
                self.state["focus"] = float(focus)
                # Low focus (dreaming) = Higher Arousal (Chaos)
                base_arousal = max(0.0, 1.0 - self.state["focus"])
                self.state["arousal"] = max(base_arousal, self.state["audio_rms"])
                self.state["valence"] = (self.state["focus"] * 2.0) - 1.0

    def update_audio(self, arousal=None, intent=None):
        with self.lock:
            if arousal is not None:
                self.state["audio_rms"] = float(arousal)
                base_arousal = max(0.0, 1.0 - self.state["focus"])
                self.state["arousal"] = max(base_arousal, float(arousal))
            
            if intent is not None:
                self.state["intent"] = str(intent)

    def get_snapshot(self):
        with self.lock:
            return self.state.copy()

class Autopilot:
    """
    Intelligent Director: Reads Quest Solutions AND Camera Directives to act them out.
    """
    def __init__(self):
        self.active = True
        self.current_solution = None
        
        # State Machines
        self.state = "WANDER" # WANDER, APPROACH, ACT, COOLDOWN
        self.state_timer = 0
        
        # Cinematography State
        self.cine_state = "IDLE"
        self.cine_reason = "" # DEBUG REASONING
        self.cine_timer = 0
        self.cine_velocity = {"rx": 0.0, "ry": 0.0, "ly": 0.0} # Yaw, Pitch, Zoom
        
        self.t_start = time.time()
        
        # Action Planning
        self.planned_element = 0 # 0=Fire, etc
        self.planned_action = None
        
        # Wander noise seeds
        self.seed_x = random.random() * 100
        self.seed_y = random.random() * 100

    def engage(self):
        self.active = True
        self.state = "WANDER"
        
    def disengage(self):
        self.active = False
        self.current_solution = None

    def set_cinematography(self, movement, duration=3.0, intensity=0.5, reason=""):
        """
        Receives camera commands from the LLM Director.
        """
        if not self.active: return
        
        self.cine_state = movement
        self.cine_reason = reason if reason else "Director Override"
        self.cine_timer = time.time() + (duration if duration else 3.0)
        
        # Parse Movement -> Velocity
        v = 0.0
        rx, ry, ly = 0.0, 0.0, 0.0
        
        intensity = intensity if intensity else 0.5
        speed = 0.3 + (intensity * 0.7) # Map to usable range
        
        if movement == "pan_left": rx = -speed
        elif movement == "pan_right": rx = speed
        elif movement == "tilt_up": ry = -speed
        elif movement == "tilt_down": ry = speed
        elif movement == "zoom_in" or movement == "dolly_in": ly = -speed
        elif movement == "zoom_out" or movement == "dolly_out": ly = speed
        elif movement == "scan": rx = 0.2 # Slow pan
        elif movement == "shake": pass # Handled in physics via arousal injection
        
        self.cine_velocity = {"rx": rx, "ry": ry, "ly": ly}
        print(f"[Director] 🎥 CUT! Camera: {movement} | Reason: {self.cine_reason} | Dur: {duration}s", flush=True)

    def set_objective(self, solution_text):
        if not self.active or not solution_text: 
            return
            
        if self.current_solution == solution_text:
            return # Already working on it
            
        # New Objective Received
        self.current_solution = solution_text
        self.state = "APPROACH"
        self.state_timer = time.time() + random.uniform(3.0, 5.0) # Approach time
        
        # Parse Intent
        text = solution_text.upper()
        
        # 1. Determine Element
        if "FIRE" in text: self.planned_element = 0
        elif "WATER" in text: self.planned_element = 1
        elif "LIGHTNING" in text or "SHOCK" in text: self.planned_element = 2
        elif "WIND" in text or "AIR" in text: self.planned_element = 3
        # Keep current if unspecified
        
        # 2. Determine Action
        self.planned_action = "INTERACT" # Default safety
        if "ATTACK" in text or "HIT" in text or "STRIKE" in text: self.planned_action = "ATTACK"
        elif "SKILL" in text or "CAST" in text or "USE" in text: self.planned_action = "SKILL"
        elif "ULTIMATE" in text or "BURST" in text: self.planned_action = "ULTIMATE"
        elif "INTERACT" in text or "TOUCH" in text or "SPEAK" in text: self.planned_action = "INTERACT"
        
        print(f"[Director] 🎬 CUT! New Scene. Goal: {solution_text}. Action: {self.planned_action}", flush=True)

    def get_control(self, current_element_idx):
        if not self.active: return {"lx":0.0, "ly":0.0, "rx":0.0, "ry":0.0, "actions": [], "set_element": None, "reason": "Inactive"}
        
        t = time.time()
        actions = []
        set_element = None
        debug_reason = "Idle"
        
        # --- ZERO BASE MOVEMENT (NO WANDER) ---
        lx, ly, rx, ry = 0.0, 0.0, 0.0, 0.0
        
        # --- CAMERA LAYER (Intelligent Cinematography) ---
        
        # Check if Director Override is active (Smart Cinema)
        is_directed = time.time() < self.cine_timer and self.cine_state != "IDLE"
        
        if is_directed:
            # STRICTLY obey the director
            rx = self.cine_velocity["rx"]
            ry = self.cine_velocity["ry"]
            ly = self.cine_velocity["ly"]
            debug_reason = f"DIRECTOR: {self.cine_state} ({self.cine_reason})"
        
        # --- STATE MACHINE OVERRIDES (Objective Execution) ---
        # These override camera unless explicitly directing
        
        if self.state == "APPROACH":
            ly = -0.6 # Move forward purposefully
            debug_reason = f"APPROACHING: {self.current_solution[:20]}..."
            
            if self.planned_element != current_element_idx:
                if random.random() > 0.9: 
                    set_element = self.planned_element
            
            if time.time() > self.state_timer:
                self.state = "ACT"
                self.state_timer = time.time() + 0.5 
                
        elif self.state == "ACT":
            # HALT
            ly = 0.0
            lx = 0.0
            if self.planned_action:
                actions.append(self.planned_action)
                debug_reason = f"EXECUTING: {self.planned_action}"
                
            self.state = "COOLDOWN"
            self.state_timer = time.time() + 4.0 
            
        elif self.state == "COOLDOWN":
            ly = 0.3 # Back up to admire
            debug_reason = "COOLDOWN / OBSERVING"
            if time.time() > self.state_timer:
                self.state = "WANDER"
                self.current_solution = None 
                
        elif self.state == "WANDER":
            if not is_directed:
                debug_reason = "WANDERING (Awaiting Orders)"
            # DO NOTHING. Wait for Director or User.
            pass

        return {
            "lx": lx, "ly": ly, 
            "rx": rx, "ry": ry, 
            "actions": actions,
            "set_element": set_element,
            "reason": debug_reason
        }

class Controller:
    def __init__(self):
        # --- CRITICAL FIX: Initialize Autopilot FIRST ---
        self.autopilot = Autopilot()
        
        # Initialize spirit safely
        self.spirit = None
        try:
            self.spirit = SpiritInput()
        except Exception as e:
            print(f"[Controller] ⚠️ SpiritInput Init Error: {e}", flush=True)

        self.lock = threading.Lock()
        self.keys_pressed = set()
        
        os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
        try:
            pygame.init()
            pygame.joystick.init()
            self.joy = pygame.joystick.Joystick(0) if pygame.joystick.get_count() > 0 else None
            if self.joy: 
                self.joy.init()
                print("[Controller] 🎮 Gamepad initialized: " + self.joy.get_name())
        except Exception as e: 
            self.joy = None
            print(f"[Controller] ⚠️ Gamepad/Pygame Init Error: {e}")
        
        # Elemental System State
        self.elements = ["FIRE", "WATER", "LIGHTNING", "WIND"]
        self.active_element_idx = 0
        self.element_energy = { "FIRE": 0.0, "WATER": 0.0, "LIGHTNING": 0.0, "WIND": 0.0 }
        self.max_energy = 100.0
        
        # Cooldown Management
        self.CD_SKILL = 6.0
        self.CD_BURST = 15.0
        self.skill_last_used = {e: 0.0 for e in self.elements}
        self.burst_last_used = {e: 0.0 for e in self.elements}
        
        self.action_cooldown = 0

    def update_keys(self, key_code, is_down):
        with self.lock:
            if is_down: self.keys_pressed.add(key_code)
            elif key_code in self.keys_pressed: self.keys_pressed.remove(key_code)

    def _dz(self, val): 
        return val if abs(val) > 0.2 else 0.0

    def get_state(self):
        # If autopilot is active, it overrides manual input
        if self.autopilot.active:
            # We still allow "Adverbial" injection from Spirit
            spirit_snapshot = self.spirit.get_snapshot() if self.spirit else {}
            
            # Pass current element so autopilot knows if it needs to switch
            auto_ctrl = self.autopilot.get_control(self.active_element_idx)
            
            # Apply Element Switch
            if auto_ctrl["set_element"] is not None:
                self.active_element_idx = auto_ctrl["set_element"]
                
            # Apply Actions (Sharing cooldown logic)
            # We construct a synthetic state to pass to the cooldown block below
            # But we must return immediately to avoid double processing or needing complex refactor
            # So we duplicate the cooldown/energy logic briefly here for Autopilot
            
            s = {
                "lx": auto_ctrl["lx"], "ly": auto_ctrl["ly"], 
                "rx": auto_ctrl["rx"], "ry": auto_ctrl["ry"], 
                "lt": 0.0, 
                "actions": [], 
                "active_element": self.elements[self.active_element_idx],
                "energies": self.element_energy.copy(),
                "adverbs": spirit_snapshot,
                "is_autopilot": True,
                "debug_reason": auto_ctrl.get("reason", "")
            }
            
            # Execute Actions
            now = time.time()
            if auto_ctrl["actions"] and (now - self.action_cooldown > 0.5):
                self.action_cooldown = now
                act = auto_ctrl["actions"][0]
                el = s["active_element"]
                
                if act == "ATTACK": s["actions"].append("Physical Attack")
                elif act == "INTERACT": s["actions"].append("INTERACT")
                elif act == "SKILL":
                    self.skill_last_used[el] = now
                    gain = 15.0
                    self.element_energy[el] = min(self.max_energy, self.element_energy[el] + gain)
                    s["actions"].append(f"SKILL: {el} (+{gain})")
                elif act == "ULTIMATE":
                    self.burst_last_used[el] = now
                    self.element_energy[el] = 0.0
                    s["actions"].append(f"ULTIMATE: {el} BLAST")
            
            s["energies"] = self.element_energy # Update return dict
            return s

        pygame.event.pump()
        now = time.time()
        
        # Safe access to spirit
        spirit_snapshot = self.spirit.get_snapshot() if self.spirit else {
            "arousal": 0.0, "valence": 0.0, "intent": "", "focus": 1.0, "audio_rms": 0.0
        }
        
        s = {
            "lx": 0.0, "ly": 0.0, "rx": 0.0, "ry": 0.0, "lt": 0.0,
            "actions": [], 
            "active_element": self.elements[self.active_element_idx],
            "energies": self.element_energy.copy(),
            "adverbs": spirit_snapshot,
            "is_autopilot": False
        }
        
        triggered_action = None
        
        # --- GAMEPAD INPUT ---
        if self.joy:
            # Left Stick (Move)
            s["lx"] = self._dz(self.joy.get_axis(0))
            s["ly"] = self._dz(self.joy.get_axis(1))
            
            # Right Stick (Camera)
            num_axes = self.joy.get_numaxes()
            if num_axes >= 5:
                s["rx"] = self._dz(self.joy.get_axis(3))
                s["ry"] = self._dz(self.joy.get_axis(4))
            elif num_axes >= 3:
                s["rx"] = self._dz(self.joy.get_axis(2))
                s["ry"] = self._dz(self.joy.get_axis(3))
            
            # Left Trigger (Lucidity Dampener)
            if num_axes > 2:
                raw_lt = self.joy.get_axis(2)
                s["lt"] = (raw_lt + 1.0) / 2.0
            
            # D-Pad
            if self.joy.get_numhats() > 0:
                hat = self.joy.get_hat(0)
                if hat[1] == 1: self.active_element_idx = 0 
                elif hat[0] == 1: self.active_element_idx = 1 
                elif hat[1] == -1: self.active_element_idx = 2 
                elif hat[0] == -1: self.active_element_idx = 3 
            
            # Buttons
            if self.joy.get_button(1): triggered_action = "ATTACK"
            if self.joy.get_button(2): triggered_action = "ULTIMATE"
            if self.joy.get_button(3): triggered_action = "INTERACT"
            if num_axes > 5 and self.joy.get_axis(5) > 0.0: triggered_action = "SKILL" 
            elif num_axes < 5 and self.joy.get_button(5): triggered_action = "SKILL"
            if self.joy.get_button(4): s["actions"].append("REQ_MANIFEST")

        # --- KEYBOARD FALLBACK ---
        with self.lock:
            if ord('w') in self.keys_pressed: s["ly"] = -1.0
            if ord('s') in self.keys_pressed: s["ly"] = 1.0
            if ord('a') in self.keys_pressed: s["lx"] = -1.0
            if ord('d') in self.keys_pressed: s["lx"] = 1.0
            if ord('l') in self.keys_pressed: s["lt"] = 1.0
            
            if ord('1') in self.keys_pressed: self.active_element_idx = 0
            if ord('2') in self.keys_pressed: self.active_element_idx = 1
            if ord('3') in self.keys_pressed: self.active_element_idx = 2
            if ord('4') in self.keys_pressed: self.active_element_idx = 3
            
            if 32 in self.keys_pressed: triggered_action = "ATTACK" 
            if ord('f') in self.keys_pressed: triggered_action = "INTERACT"
            if ord('e') in self.keys_pressed: triggered_action = "SKILL"
            if ord('q') in self.keys_pressed: triggered_action = "ULTIMATE"
            if ord('h') in self.keys_pressed: s["actions"].append("REQ_MANIFEST")

        # --- ACTION LOGIC ---
        if triggered_action and (now - self.action_cooldown > 0.2):
            self.action_cooldown = now
            el = s["active_element"]
            
            if triggered_action == "ATTACK": s["actions"].append(f"Physical Attack")
            elif triggered_action == "INTERACT": s["actions"].append("INTERACT")
            elif triggered_action == "SKILL":
                last = self.skill_last_used[el]
                if now - last > self.CD_SKILL:
                    self.skill_last_used[el] = now
                    gain = 15.0
                    self.element_energy[el] = min(self.max_energy, self.element_energy[el] + gain)
                    s["actions"].append(f"SKILL: {el} (+{gain})")
                else:
                    rem = self.CD_SKILL - (now - last)
                    s["actions"].append(f"SKILL_ATTEMPT: {el} (Fizzle: CD {rem:.1f}s)")
            elif triggered_action == "ULTIMATE":
                last = self.burst_last_used[el]
                charge = self.element_energy[el]
                if now - last > self.CD_BURST and charge >= 40:
                    self.burst_last_used[el] = now
                    self.element_energy[el] = 0.0
                    s["actions"].append(f"ULTIMATE: {el} BLAST (Power {int(charge)})")
                else:
                    reason = f"CD {self.CD_BURST - (now-last):.1f}s" if now - last <= self.CD_BURST else "Low Energy"
                    s["actions"].append(f"ULTIMATE_ATTEMPT: {el} (Fizzle: {reason})")
            
        s["energies"] = self.element_energy 
        s["cooldowns"] = {
            "skill": {e: max(0, self.CD_SKILL - (now - self.skill_last_used[e])) for e in self.elements},
            "burst": {e: max(0, self.CD_BURST - (now - self.burst_last_used[e])) for e in self.elements}
        }
        return s
`;