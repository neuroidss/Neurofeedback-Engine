
export const NQ_AUDIO_PY = `
# ==================================================================================
# 👂 AUDIO SENSE (THE SPIRIT EAR)
# ==================================================================================
import numpy as np
import sounddevice as sd
import queue
import collections
import threading

class AudioSense(threading.Thread):
    def __init__(self, spirit_ref):
        super().__init__(daemon=True)
        self.spirit = spirit_ref
        self.active = True
        self.audio_queue = queue.Queue()
        self.rms_history = collections.deque(maxlen=10)
        self.silence_threshold = 0.02
        self.model = None
        
        # Config
        self.sr = 48000 # CLAP prefers 48k
        self.block_size = 4096 
        self.buffer_duration = 3.0 # CLAP window is usually 3-7s
        self.audio_buffer = np.array([], dtype=np.float32)
        self.buffer_lock = threading.Lock()
        
        self.last_intent_time = 0

    def callback(self, indata, frames, time_info, status):
        # Fast Loop: RMS (Arousal)
        rms = np.sqrt(np.mean(indata**2))
        self.rms_history.append(rms)
        
        avg_rms = sum(self.rms_history) / len(self.rms_history)
        # Normalize: typical speech ~0.1 rms. Scream ~0.5?
        normalized_arousal = min(1.0, avg_rms * 4.0)
        
        self.spirit.update_audio(arousal=normalized_arousal)
        self.audio_queue.put(indata.copy())

    def _load_whisper(self):
        try:
            from faster_whisper import WhisperModel
            log("Loading Whisper (tiny.en)...", "EAR")
            # Run on CPU int8 for minimal overhead
            self.model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
            log("Whisper Active.", "EAR")
        except Exception as e:
            log(f"Whisper Init Failed (Voice Disabled): {e}", "ERR")

    def run(self):
        threading.Thread(target=self._load_whisper, daemon=True).start()
        
        try:
            # Query devices to avoid error if no mic
            if len(sd.query_devices()) == 0:
                log("No input device found.", "EAR")
                return

            with sd.InputStream(callback=self.callback, channels=1, samplerate=self.sr, blocksize=self.block_size):
                log("Audio Stream Listening...", "EAR")
                while self.active:
                    try:
                        chunk = self.audio_queue.get(timeout=1.0)
                        
                        # Accumulate for STT & CLAP
                        with self.buffer_lock:
                            self.audio_buffer = np.append(self.audio_buffer, chunk.flatten())
                            
                            # Check Periodically
                            if len(self.audio_buffer) > self.sr * self.buffer_duration:
                                to_process = self.audio_buffer.copy()
                                self.audio_buffer = np.array([], dtype=np.float32) # Flush
                                
                                # VAD Check (Simple RMS)
                                buf_rms = np.sqrt(np.mean(to_process**2))
                                if buf_rms > self.silence_threshold:
                                    
                                    # 1. CLAP (Environment)
                                    if sensor_cortex and sensor_cortex.is_ready:
                                        alerts = sensor_cortex.scan_audio(to_process, self.sr)
                                        if alerts:
                                            alert_str = ", ".join(alerts)
                                            log(f"👂 HEARD: {alert_str}", "EAR")
                                            # Push to Game Master as generic system event
                                            content = [{"type": "text", "text": f"SYSTEM SENSORS HEARD: {alert_str}. The player environment is noisy."}]
                                            try: tool_agent.process("Sensors", content, allowed_tools=['describe_scene'])
                                            except: pass

                                    # 2. Whisper (Speech)
                                    if self.model:
                                        try:
                                            segments, _ = self.model.transcribe(to_process, beam_size=1, language="en")
                                            text = " ".join([s.text for s in segments]).strip()
                                            if len(text) > 2:
                                                log(f"🗣️ SPOKE: '{text}'", "EAR")
                                                self.spirit.update_audio(intent=text)
                                        except: pass
                                else:
                                    self.spirit.update_audio(intent="")
                                    
                    except queue.Empty:
                        pass
        except Exception as e:
            log(f"Audio Loop Error: {e}", "ERR")
`;
