
import { pipeline, env } from '@huggingface/transformers';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

class LocalWhisperService {
    private transcriber: any = null;
    private modelID = 'onnx-community/whisper-tiny.en';
    private isLoading = false;

    async loadModel(onProgress: (msg: string) => void) {
        if (this.transcriber) return;
        if (this.isLoading) return;

        this.isLoading = true;
        onProgress('Checking GPU capabilities...');

        try {
            // 1. Check for WebGPU
            const hasWebGPU = typeof navigator !== 'undefined' && (navigator as any).gpu;
            let deviceToUse = 'wasm'; 
            let dtype: any = 'q8'; // Default for CPU

            if (hasWebGPU) {
                try {
                    const adapter = await (navigator as any).gpu.requestAdapter();
                    if (adapter) {
                        onProgress(`WebGPU adapter found: ${adapter.info.device}`);
                        deviceToUse = 'webgpu';
                        // GPU typically needs fp32 for encoder stability in some implementations, 
                        // or q4 for merged models. Using safe defaults for tiny.en
                        dtype = {
                            encoder_model: 'fp32',
                            decoder_model_merged: 'q4',
                        };
                    } else {
                        onProgress("WebGPU supported but no adapter found. Using CPU.");
                    }
                } catch (e: any) {
                    onProgress("WebGPU check failed: " + e.message);
                }
            } else {
                onProgress("WebGPU NOT supported. Forcing CPU (WASM).");
            }

            onProgress(`Loading Whisper (${deviceToUse})...`);

            // 2. Load Pipeline
            // @ts-ignore
            this.transcriber = await pipeline('automatic-speech-recognition', this.modelID, {
                device: deviceToUse,
                dtype: dtype,
            });

            onProgress("Whisper Model Loaded.");
        } catch (e: any) {
            console.error("Whisper Load Error:", e);
            throw e;
        } finally {
            this.isLoading = false;
        }
    }

    async transcribe(audioBlob: Blob): Promise<string> {
        if (!this.transcriber) throw new Error("Whisper model not loaded.");

        // Convert Blob -> AudioBuffer -> Float32Array (16kHz)
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const decoded = await audioCtx.decodeAudioData(arrayBuffer);
        const audioData = decoded.getChannelData(0); // Mono

        const result = await this.transcriber(audioData);
        if (Array.isArray(result)) return result[0].text;
        return result.text;
    }
}

export const localWhisper = new LocalWhisperService();
