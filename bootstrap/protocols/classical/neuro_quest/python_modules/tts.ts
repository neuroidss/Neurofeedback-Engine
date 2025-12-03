
export const NQ_TTS_PY = `
# ==================================================================================
# 🗣️ NEURAL VOICE (DISABLED)
# ==================================================================================
# TTS disabled by user request.

import threading

class NeuralVoice(threading.Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.active = False

    def speak(self, text, voice="af_sarah", speed=1.0):
        # log(f"TTS Disabled: {text[:30]}...", "SYS")
        pass

    def run(self):
        pass

# Global Instance
neural_voice = NeuralVoice()
`;
