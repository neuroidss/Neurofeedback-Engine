
export const INPUT_SYSTEM_PYTHON = `
# ==================================================================================
# 🎮 CORE INPUT SYSTEM (IMMUTABLE)
# ==================================================================================
# Contains: Controller Mapping, Physics/Camera Logic, Palette Matching
# ==================================================================================

def apply_physics(img_pil, inp):
    img_np = np.array(img_pil)
    h, w = img_np.shape[:2]
    
    # Left Stick: Move (Translate) & Zoom
    # We use LX for sideways movement, LY for zoom (dolly)
    move_x = -(inp["lx"]) * 20 
    zoom_input = (-inp["ly"]) * 0.08
    
    # Right Stick: Camera Pan (Look)
    # Panning the image opposite to stick direction creates the illusion of looking around
    pan_x = -(inp["rx"]) * 40 
    pan_y = -(inp["ry"]) * 30
    
    total_zoom = 1.002 + zoom_input

    M = cv2.getRotationMatrix2D((w//2, h//2), 0, total_zoom)
    
    # Apply translation (Move + Pan)
    # M[0, 2] is X translation, M[1, 2] is Y translation
    M[0, 2] += move_x + pan_x
    M[1, 2] += pan_y
    
    # BorderMode=REFLECT_101 fills empty space with mirrored image content (seamless-ish)
    warped = cv2.warpAffine(img_np, M, (w, h), borderMode=cv2.BORDER_REFLECT_101)
    
    is_moving = abs(zoom_input) > 0.01 or abs(move_x) > 1 or abs(pan_x) > 1 or abs(pan_y) > 1
    
    # NO MANUAL TINTING OR DRAWING HERE.
    # The Game Master handles all visual effects via the prompt.
    res = warped
    
    # Add Motion Noise (Grain) to simulate sensor noise during rapid movement
    noise_lvl = 12 if is_moving else 3
    noise = np.random.randint(-noise_lvl, noise_lvl, (h, w, 3), dtype=np.int16)
    res = np.clip(res.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    
    return Image.fromarray(res), is_moving

def match_palette(source_pil, target_pil, inertia=0.3):
    src = np.array(source_pil).astype(np.float32)
    tgt = np.array(target_pil).astype(np.float32)
    mu_src, std_src = cv2.meanStdDev(src)
    mu_tgt, std_tgt = cv2.meanStdDev(tgt)
    correction = (tgt - mu_tgt.reshape(1,1,3)) * (std_src.reshape(1,1,3) / (std_tgt.reshape(1,1,3) + 1e-5)) + mu_src.reshape(1,1,3)
    correction = np.clip(correction, 0, 255)
    return Image.fromarray((correction * inertia + tgt * (1.0 - inertia)).astype(np.uint8))

class Controller:
    def __init__(self):
        os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"
        try:
            pygame.init()
            pygame.joystick.init()
            self.joy = pygame.joystick.Joystick(0) if pygame.joystick.get_count() > 0 else None
            if self.joy: 
                self.joy.init()
                print("[Controller] 🎮 Gamepad initialized: " + self.joy.get_name())
        except: 
            self.joy = None
            print("[Controller] ⚠️ No Gamepad found.")
            
        self.keys_pressed = set()
        self.lock = threading.Lock()
        
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
        pygame.event.pump()
        now = time.time()
        s = {
            "lx": 0.0, "ly": 0.0, "rx": 0.0, "ry": 0.0, "lt": 0.0,
            "actions": [], 
            "active_element": self.elements[self.active_element_idx],
            "energies": self.element_energy.copy()
        }
        
        triggered_action = None
        
        # --- GAMEPAD INPUT ---
        if self.joy:
            # Left Stick (Move)
            s["lx"] = self._dz(self.joy.get_axis(0))
            s["ly"] = self._dz(self.joy.get_axis(1))
            
            # Right Stick (Camera)
            # SDL2 Linux: 3=RightX, 4=RightY
            num_axes = self.joy.get_numaxes()
            if num_axes >= 5:
                s["rx"] = self._dz(self.joy.get_axis(3))
                s["ry"] = self._dz(self.joy.get_axis(4))
            elif num_axes >= 3:
                # Fallback for some drivers
                s["rx"] = self._dz(self.joy.get_axis(2))
                s["ry"] = self._dz(self.joy.get_axis(3))
            
            # Left Trigger (Lucidity Dampener)
            # Usually Axis 2. Range -1 (released) to 1 (pressed).
            # We normalize to 0.0 (released) to 1.0 (pressed)
            if num_axes > 2:
                raw_lt = self.joy.get_axis(2)
                s["lt"] = (raw_lt + 1.0) / 2.0
            
            # D-Pad (Switch Element)
            # Hat 0: (x, y). x=-1(Left), x=1(Right), y=-1(Down), y=1(Up)
            if self.joy.get_numhats() > 0:
                hat = self.joy.get_hat(0)
                if hat[1] == 1: self.active_element_idx = 0 # Up: Fire
                elif hat[0] == 1: self.active_element_idx = 1 # Right: Water
                elif hat[1] == -1: self.active_element_idx = 2 # Down: Lightning
                elif hat[0] == -1: self.active_element_idx = 3 # Left: Wind
            
            # Buttons (Genshin Style)
            # 0=A, 1=B, 2=X, 3=Y
            if self.joy.get_button(1): triggered_action = "ATTACK"   # B (Physical)
            
            # --- SWAPPED MAPPING (User Request) ---
            # X (Button 2) is typically Left. Y (Button 3) is typically Top.
            # User wants X to be ULTIMATE and Y to be INTERACT.
            if self.joy.get_button(2): triggered_action = "ULTIMATE" # X (Burst/Ultimate)
            if self.joy.get_button(3): triggered_action = "INTERACT" # Y (Interact)
            
            # RT (Trigger) for Skill
            # Axis 5 is typically RT. Range -1 (released) to 1 (pressed).
            if num_axes > 5 and self.joy.get_axis(5) > 0.0: 
                triggered_action = "SKILL" 
            elif num_axes < 5 and self.joy.get_button(5): # RB Fallback
                triggered_action = "SKILL"
            
            # LB (Bumper) for Manifestation / GM Call
            if self.joy.get_button(4): s["actions"].append("REQ_MANIFEST")

        # --- KEYBOARD FALLBACK ---
        with self.lock:
            # WASD Move
            if ord('w') in self.keys_pressed: s["ly"] = -1.0
            if ord('s') in self.keys_pressed: s["ly"] = 1.0
            if ord('a') in self.keys_pressed: s["lx"] = -1.0
            if ord('d') in self.keys_pressed: s["lx"] = 1.0
            
            # LT Simulation (L Key)
            if ord('l') in self.keys_pressed: s["lt"] = 1.0
            
            # Arrow Keys Camera (Mappings vary, using OpenCV codes logic in main loop)
            # We assume main loop passes 2424 etc.
            
            # 1-4 Elements
            if ord('1') in self.keys_pressed: self.active_element_idx = 0
            if ord('2') in self.keys_pressed: self.active_element_idx = 1
            if ord('3') in self.keys_pressed: self.active_element_idx = 2
            if ord('4') in self.keys_pressed: self.active_element_idx = 3
            
            # Actions
            if 32 in self.keys_pressed: triggered_action = "ATTACK" # Space
            if ord('f') in self.keys_pressed: triggered_action = "INTERACT" # F
            if ord('e') in self.keys_pressed: triggered_action = "SKILL" # E
            if ord('q') in self.keys_pressed: triggered_action = "ULTIMATE" # Q
            if ord('h') in self.keys_pressed: s["actions"].append("REQ_MANIFEST") # H for Manifest

        # --- ACTION LOGIC & COOLDOWNS ---
        if triggered_action and (now - self.action_cooldown > 0.2):
            self.action_cooldown = now
            el = s["active_element"]
            
            if triggered_action == "ATTACK":
                s["actions"].append(f"Physical Attack")
                
            elif triggered_action == "INTERACT":
                s["actions"].append("INTERACT")
                
            elif triggered_action == "SKILL":
                last = self.skill_last_used[el]
                if now - last > self.CD_SKILL:
                    # Success
                    self.skill_last_used[el] = now
                    gain = 15.0
                    self.element_energy[el] = min(self.max_energy, self.element_energy[el] + gain)
                    s["actions"].append(f"SKILL: {el} (+{gain})")
                else:
                    # Fizzle
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
            
        s["energies"] = self.element_energy # Update return dict
        s["cooldowns"] = {
            "skill": {e: max(0, self.CD_SKILL - (now - self.skill_last_used[e])) for e in self.elements},
            "burst": {e: max(0, self.CD_BURST - (now - self.burst_last_used[e])) for e in self.elements}
        }
        return s
`;
