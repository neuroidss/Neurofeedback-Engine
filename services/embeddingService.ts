
// services/embeddingService.ts
import { pipeline, env } from '@huggingface/transformers';

// --- CONFIGURATION ---
// Disable local models to force CDN usage
env.allowLocalModels = false;
env.useBrowserCache = true;

// Singleton cache to prevent multiple loads of the same model
const pipelineCache: Record<string, Promise<any>> = {};

/**
 * Standard Robust Loader
 * Attempts WebGPU (fp32) first, then falls back to WASM (q8).
 */
export const getFeatureExtractor = (modelId: string, onProgress?: (msg: string) => void): Promise<any> => {
    // Return existing promise if already loading/loaded
    if (pipelineCache[modelId]) {
        return pipelineCache[modelId];
    }

    const loadTask = (async () => {
        // Throttled progress callback to prevent UI freezing
        let lastProgress = 0;
        const handleProgress = (x: any) => {
            if (onProgress && x.status === 'download') {
                if (!x.total) return;
                const percent = Math.round((x.loaded / x.total) * 100);
                // Only log every 10% or if complete
                if (percent === 100 || percent - lastProgress >= 10) {
                    onProgress(`[${modelId}] Downloading ${x.file} (${percent}%)`);
                    lastProgress = percent;
                }
            } else if (onProgress && x.status === 'initiate') {
                 onProgress(`[${modelId}] Initiating ${x.file}...`);
            }
        };

        // 1. ATTEMPT WEBGPU (FP32)
        try {
            // Quick check for GPU support before attempting
            if (!(navigator as any)?.gpu) {
                throw new Error("WebGPU not supported in this browser.");
            }

            if (onProgress) onProgress(`[${modelId}] 🚀 Initializing WebGPU...`);
            
            // Standard Transformers.js WebGPU invocation
            // dtype: 'fp32' is CRITICAL for WebGPU stability. 
            // Most quantized (q8) models are optimized for CPU/WASM and fail on GPU.
            const pipe = await pipeline('feature-extraction', modelId, {
                device: 'webgpu',
                dtype: 'fp32', 
                progress_callback: handleProgress
            });
            
            if (onProgress) onProgress(`[${modelId}] ✅ Loaded on WebGPU (FP32).`);
            return pipe;

        } catch (gpuError) {
            const errString = gpuError instanceof Error ? gpuError.message : String(gpuError);
            console.warn(`[Embedding] WebGPU init failed for ${modelId}: ${errString}`);
            if (onProgress) onProgress(`[${modelId}] ⚠️ WebGPU unavailable (${errString}). Switching to CPU...`);
        }

        // 2. FALLBACK TO WASM (Q8)
        try {
            if (onProgress) onProgress(`[${modelId}] 🐢 Loading CPU (WASM)...`);
            
            const pipe = await pipeline('feature-extraction', modelId, {
                device: 'wasm',
                dtype: 'q8', // Quantized for CPU performance
                progress_callback: handleProgress
            });
            
            if (onProgress) onProgress(`[${modelId}] ✅ Loaded on CPU (Q8).`);
            return pipe;

        } catch (cpuError) {
            console.error(`[Embedding] Critical failure for ${modelId}:`, cpuError);
            throw new Error(`Failed to load ${modelId}: ${(cpuError as Error).message}`);
        }
    })();

    // Store the promise in cache
    pipelineCache[modelId] = loadTask;
    
    // If it fails, clear cache so we can retry later
    loadTask.catch(() => {
        delete pipelineCache[modelId];
    });

    return loadTask;
};

export const generateEmbeddings = async (texts: string[], onProgress?: (msg: string) => void): Promise<number[][]> => {
    try {
        const modelId = 'Xenova/all-MiniLM-L6-v2';
        const extractor = await getFeatureExtractor(modelId, onProgress);
        
        // Output is a Tensor, convert to standard array
        const output = await extractor(texts, { pooling: 'mean', normalize: true });
        
        if (texts.length === 1) {
            // @ts-ignore
            return [Array.from(output.data)];
        }
        // @ts-ignore
        return output.tolist();
    } catch(e) {
        console.error("Embedding generation failed:", e);
        throw e;
    }
};

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        magA += vecA[i] * vecA[i];
        magB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB) + 0.00001);
};
