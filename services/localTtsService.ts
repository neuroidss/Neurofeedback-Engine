
import { pipeline, env } from '@huggingface/transformers';

// Configure environment
env.allowLocalModels = false;
env.useBrowserCache = true;

class LocalTtsService {
    private synthesizer: any = null;
    private speakerEmbeddings: any = null;
    private modelID = 'Xenova/speecht5_tts';
    private vocoderID = 'Xenova/speecht5_hifigan';
    private embeddingsURL = 'https://huggingface.co/datasets/Xenova/cmu-arctic-xvectors-extracted/resolve/main/cmu_us_slt_arctic-wav-arctic_a0001.bin';
    private isLoading = false;

    async loadModel(onProgress: (msg: string) => void) {
        if (this.synthesizer) return;
        if (this.isLoading) return;

        this.isLoading = true;
        onProgress('Loading Neural TTS...');

        try {
            // @ts-ignore
            this.synthesizer = await pipeline('text-to-speech', this.modelID, { quantized: false }); // Quantized often breaks TTS quality
            
            // Load speaker embeddings for SpeechT5
            onProgress('Fetching speaker embeddings...');
            const response = await fetch(this.embeddingsURL);
            const buffer = await response.arrayBuffer();
            this.speakerEmbeddings = new Float32Array(buffer);

            onProgress("TTS Model Ready.");
        } catch (e: any) {
            console.error("TTS Load Error:", e);
            throw e;
        } finally {
            this.isLoading = false;
        }
    }

    async speak(text: string): Promise<Float32Array | null> {
        if (!this.synthesizer) throw new Error("TTS model not loaded.");
        if (!this.speakerEmbeddings) throw new Error("Speaker embeddings not loaded.");

        const result = await this.synthesizer(text, {
            speaker_embeddings: this.speakerEmbeddings,
        });

        // Result is { audio: Float32Array, sampling_rate: number }
        return result.audio;
    }
}

export const localTts = new LocalTtsService();
