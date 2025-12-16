
export const INPUT_SYSTEM_PYTHON = `
# ==================================================================================
# 🎮 CORE INPUT SYSTEM
# ==================================================================================
import numpy as np
import time
import math
import cv2
import threading
from PIL import Image

def apply_physics(img_pil, inp):
    img_np = np.array(img_pil)
    h, w = img_np.shape[:2]
    
    # Left Stick: Strafe X / Zoom (Movement)
    # LX = Horizontal Pan
    # LY = Zoom (Forward/Back)
    move_x = int(-(inp["lx"]) * 15)
    zoom_input = (-inp["ly"]) * 0.05
    
    # Right Stick: Rotate / Pan Y (Camera Look)
    # RX = Rotation (Z-Axis spin / Yaw approx)
    # RY = Vertical Pan (Pitch approx)
    rotate_angle = (inp["rx"]) * 3.0 # Degrees
    move_y = int(-(inp["ry"]) * 15)

    # Vitality (Adverb) - breathing effect
    pulse = math.sin(time.time()) * 0.002
    zoom_input += pulse

    # Transform Matrix Construction
    total_zoom = 1.005 + zoom_input
    
    # 1. Rotation & Scale centered
    M = cv2.getRotationMatrix2D((w//2, h//2), rotate_angle, total_zoom)
    
    # 2. Translation (Pan X / Pan Y)
    M[0, 2] += move_x
    M[1, 2] += move_y
    
    warped = cv2.warpAffine(img_np, M, (w, h), borderMode=cv2.BORDER_REFLECT_101)
    
    # Render Energy (used for denoising strength modulation)
    # Sum of all movement forces
    movement_factor = min(1.0, (abs(move_x) + abs(move_y) + abs(rotate_angle) + abs(zoom_input)*800) / 100.0)
    
    return Image.fromarray(warped), movement_factor

class VirtualGamepad:
    """
    Abstraction merging Hardware and Ghost inputs.
    """
    def __init__(self):
        self.state = {
            "lx": 0.0, "ly": 0.0,
            "rx": 0.0, "ry": 0.0,
            "btn_a": False, 
            "trig_l": 0.0, # Virtual Brain
            "active": False
        }
        self.last_input_time = time.time()
        self.autopilot_enabled = False
        self.joy = None
        
        try:
            import pygame
            pygame.init()
            pygame.joystick.init()
            if pygame.joystick.get_count() > 0:
                self.joy = pygame.joystick.Joystick(0)
                self.joy.init()
                print(f"[Input] Gamepad found: {self.joy.get_name()}", flush=True)
        except: pass

    def update(self):
        now = time.time()
        
        # 1. Hardware Poll
        if self.joy:
            import pygame
            pygame.event.pump()
            
            # --- AXIS MAPPING (Standard XInput/DualShock) ---
            # 0: Left X, 1: Left Y
            # 2: Left Trigger (Variable) - Sometimes Axis 4/5 depending on OS
            # 3: Right X (Usually)
            # 4: Right Y (Usually)
            
            num_axes = self.joy.get_numaxes()
            
            lx = self.joy.get_axis(0)
            ly = self.joy.get_axis(1)
            
            # Safe fetch for Right Stick
            rx = self.joy.get_axis(3) if num_axes > 3 else 0.0
            ry = self.joy.get_axis(4) if num_axes > 4 else 0.0
            
            # --- DEADZONE FILTER (CRITICAL FIX) ---
            DEADZONE = 0.15
            if abs(lx) < DEADZONE: lx = 0.0
            if abs(ly) < DEADZONE: ly = 0.0
            if abs(rx) < DEADZONE: rx = 0.0
            if abs(ry) < DEADZONE: ry = 0.0
            
            # Trigger L2 (Usually -1 to 1, map to 0-1)
            l2_raw = self.joy.get_axis(2) if num_axes > 2 else -1
            trig_l = (l2_raw + 1) / 2
            if trig_l < 0.05: trig_l = 0.0

            btn_a = self.joy.get_button(0)

            # Check if user is actually touching controls
            is_user_active = (lx != 0 or ly != 0 or rx != 0 or ry != 0 or btn_a or trig_l > 0.1)
            
            if is_user_active:
                # Manual Override: If user touches controls, disable Director Mode
                self.autopilot_enabled = False
                self.last_input_time = now
                
                self.state["lx"] = lx
                self.state["ly"] = ly
                self.state["rx"] = rx
                self.state["ry"] = ry
                self.state["btn_a"] = btn_a
                self.state["trig_l"] = trig_l
            
            # --- RESET STATE ON IDLE ---
            elif not self.autopilot_enabled:
                # If user let go, snap values to 0 immediately
                self.state["lx"] = 0.0
                self.state["ly"] = 0.0
                self.state["rx"] = 0.0
                self.state["ry"] = 0.0
                self.state["btn_a"] = False
                # Keep trigger state? Usually better to reset.
                self.state["trig_l"] = 0.0

        # 2. Autopilot Trigger
        # DISABLED: Removed automatic idle timer. 
        # Autopilot is now exclusively controlled via the API / UI Toggle.
        
        return self.state

    def inject_ai_input(self, data):
        """
        AI "presses buttons" (Ghost Player).
        """
        if self.autopilot_enabled:
            # Smoothly interpolate AI movement
            target_x = data["move"][0] * 5.0 # Pan X
            target_y = 0.0 # Zoom
            
            # AI mostly just wanders
            self.state["lx"] += (target_x - self.state["lx"]) * 0.1
            self.state["ly"] += (target_y - self.state["ly"]) * 0.1
            self.state["rx"] *= 0.9 # Dampen rotation
            self.state["ry"] *= 0.9 # Dampen vertical pan
            
            self.state["btn_a"] = (data["action"] == "attack")
            # Trigger is managed by fusion logic
`;
