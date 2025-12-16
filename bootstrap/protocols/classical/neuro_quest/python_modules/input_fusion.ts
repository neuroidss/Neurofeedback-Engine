
export const INPUT_FUSION_PY = `
import numpy as np

class NeuroInputFusion:
    def __init__(self, input_dim=384):
        self.input_dim = input_dim
        self.vectors = {}

    def init_vectors(self, embedder):
        if not embedder: return
        # Standard Action Vectors
        self.vectors["ACTION"] = embedder("Action, Force, Movement, Attack, Slash")
        
        # State Vectors (Adverbs)
        self.vectors["FOCUS"]  = embedder("Order, Light, Clarity, Precision, Divine")
        self.vectors["RAGE"]   = embedder("Chaos, Fire, Power, Destruction, Blood")
        self.vectors["CALM"]   = embedder("Water, Ice, Flow, Peace, Healing")
        
        # Normalize
        for k in self.vectors:
            norm = np.linalg.norm(self.vectors[k])
            if norm > 0: self.vectors[k] /= norm

    def fuse(self, eeg_data, gamepad_state, balance=0.0):
        """
        balance:
        0.0 = Fully Gamepad (Emulating EEG via L2 Trigger)
        1.0 = Fully Real EEG
        """
        if not self.vectors: return {"vector": np.zeros(self.input_dim), "intensity": 0}

        # 1. Action Vector (Button A / Cross) -> The VERB
        action_vec = np.zeros(self.input_dim)
        if gamepad_state.get("btn_a"):
            action_vec += self.vectors["ACTION"] * 1.0

        # 2. State Vector (Mind / Trigger) -> The ADVERB
        state_vec = np.zeros(self.input_dim)
        
        has_real_eeg = (eeg_data is not None and len(eeg_data) > 0)
        
        if has_real_eeg and balance > 0.1:
            # --- REAL BRAIN ---
            # Simple heuristic: Mean Amplitude ~ Intensity
            # In production, use Alpha Coherence for Focus vs Rage
            raw_intensity = np.mean(np.abs(eeg_data)) * 5.0 
            state_vec = self.vectors["FOCUS"] * raw_intensity
        else:
            # --- VIRTUAL BRAIN (GAMEPAD) ---
            # L2 Trigger (0.0 to 1.0) acts as the "Mental State Slider"
            # 0%  = Calm / Flow (Ice/Water magic)
            # 100% = Rage / Stress (Fire/Blood magic)
            l2_val = gamepad_state.get("trig_l", 0.0)
            
            if l2_val < 0.1:
                # Relaxed state
                state_vec = self.vectors["CALM"] * 0.8
            else:
                # Intense state
                # Interpolate from Focus to Rage based on pressure
                ratio = l2_val
                state_vec = (self.vectors["FOCUS"] * (1-ratio)) + (self.vectors["RAGE"] * ratio)

        # 3. Fuse
        final_vector = action_vec + state_vec
        intensity = np.linalg.norm(final_vector)
        
        return {
            "vector": final_vector,
            "intensity": intensity,
            "l2_val": gamepad_state.get("trig_l", 0.0)
        }
`;
