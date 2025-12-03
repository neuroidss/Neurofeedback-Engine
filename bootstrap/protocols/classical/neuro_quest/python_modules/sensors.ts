
export const NQ_SENSORS_PY = `
# ==================================================================================
# 📡 SENSOR CORTEX (DISABLED)
# ==================================================================================
# Sensors disabled by user request to improve stability.
# This stub ensures calls from other modules don't crash.

class SensorCortex:
    def __init__(self, device):
        self.is_ready = False

    def load_models(self):
        log("Sensors (Florence-2/CLAP) Disabled.", "SYS")

    def configure(self, **kwargs):
        pass

    def scan_frame(self, pil_image):
        return None

    def scan_audio(self, audio_data, sample_rate=48000):
        return None

# Global Instance
sensor_cortex = None
`;
