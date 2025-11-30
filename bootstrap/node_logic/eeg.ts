
// bootstrap/node_logic/eeg.ts

export const AGGREGATOR_SOURCE_IMPL = `
    // Inputs from the NeuroBus frame buffer
    const buffer = inputs._frameBuffer?.['protocol_runner'];
    
    // Persistent State
    if (!state.channelBuffers) state.channelBuffers = {}; // Map<ChannelName, number[]>
    if (!state.lastSeen) state.lastSeen = {}; // Map<ChannelName, Timestamp>
    
    const now = Date.now();
    const DECAY_MS = 3000; // Keep channel alive for 3s after signal loss
    const BUFFER_SIZE = 256; // Match the window size used in Classical DSP

    if (buffer && buffer.length > 0) {
        // Iterate through frames to build a comprehensive snapshot
        for (let i = 0; i < buffer.length; i++) {
            const payload = buffer[i].payload;
            if (!payload) continue;
            
            const keys = Object.keys(payload);
            const hasPrefixes = keys.some(k => k.includes(':'));

            keys.forEach(key => {
                // Filter logic: If prefixed keys exist, only use them. Ignore simple aliases.
                if (hasPrefixes && !key.includes(':')) return;

                const data = payload[key];
                
                if (data !== undefined) {
                    // Init buffer if new
                    if (!state.channelBuffers[key]) state.channelBuffers[key] = new Array(BUFFER_SIZE).fill(0);
                    
                    if (Array.isArray(data)) {
                        for(const sample of data) {
                            state.channelBuffers[key].push(sample); 
                        }
                    } else if (typeof data === 'number') {
                        state.channelBuffers[key].push(data);
                    }
                    
                    // Maintain sliding window size
                    if (state.channelBuffers[key].length > BUFFER_SIZE) {
                        // Efficiently slice the end
                        state.channelBuffers[key] = state.channelBuffers[key].slice(-BUFFER_SIZE);
                    }
                    
                    state.lastSeen[key] = now;
                }
            });
        }
    }
    
    // Prune stale channels (Stabilizes the Graph Topology)
    Object.keys(state.channelBuffers).forEach(key => {
        if (state.lastSeen[key] && (now - state.lastSeen[key] > DECAY_MS)) {
            delete state.channelBuffers[key];
            delete state.lastSeen[key];
        }
    });
    
    return { output: state.channelBuffers, state };
`;

export const MATRIX_PROCESSOR_IMPL = `
    // Input is now { ChannelName: Array(256) }
    const channelBuffers = inputs['eeg_aggregator'];
    if (!channelBuffers || Object.keys(channelBuffers).length < 2) {
        return { output: { matrix: {}, globalSync: 0, engine: 'Waiting for Signal' } };
    }
    
    const channels = Object.keys(channelBuffers).sort();
    const numChannels = channels.length;
    const WINDOW_SIZE = 256; 
    
    // Ensure all buffers are full size (pad if necessary, though Aggregator handles this)
    // We map the buffers to a flat array-of-arrays structure for the GPU
    const rawMatrix = channels.map(ch => {
        const buf = channelBuffers[ch] || []; // Safety check
        if (buf.length === WINDOW_SIZE) return buf;
        // Padding for new channels
        const padded = new Array(WINDOW_SIZE).fill(0);
        // Fill from end
        for(let i=0; i<buf.length; i++) padded[WINDOW_SIZE - buf.length + i] = buf[i];
        return padded;
    });

    let matrix = {};
    let totalSync = 0;
    let pairCount = 0;
    let engine = 'CPU';
    let debugMsg = '';
    
    // --- SMOOTHING STATE ---
    if (!state.smoothMatrix) state.smoothMatrix = {};
    const alpha = 0.15; // Smoothing factor (0.15 = smooth, 1.0 = raw)

    // --- GPU ACCELERATION (ciPLV) ---
    // Only attempt if we haven't crashed before and have enough data
    // GPU.js is injected globally in index.html
    if (window.gpuInstance || (window.GPU && !state.gpuFailed)) {
        if (!state.gpu) {
             try {
                 if (window.gpuInstance) {
                     state.gpu = window.gpuInstance;
                 } else {
                     const GPU = window.GPU.GPU || window.GPU;
                     state.gpu = new GPU();
                 }
             } catch(e) { 
                 state.gpuFailed = true;
                 debugMsg = 'GPU Init Failed: ' + e.message;
             }
        }
        
        if (state.gpu && !state.gpuFailed) {
            try {
                // Recompile kernels if dimensions change (e.g. new device connected)
                if (state.dim_ch !== numChannels || state.dim_len !== WINDOW_SIZE) {
                    
                    // Cleanup old kernels to free VRAM
                    if (state.kernels) {
                        try { 
                            if(state.kernels.analytic) state.kernels.analytic.destroy(); 
                            if(state.kernels.corr) state.kernels.corr.destroy(); 
                        } catch(e){}
                    }
                    
                    state.kernels = {};
                    
                    // Kernel 1: Analytic Signal (Hilbert Approx)
                    state.kernels.analytic = state.gpu.createKernel(function(data) {
                        const comp = this.thread.x; // 0 = Real, 1 = Imag
                        const t = this.thread.y;
                        const ch = this.thread.z;
                        
                        const val = data[ch][t];
                        const delay = 5; 
                        const imag = (t >= delay) ? data[ch][t-delay] : 0;
                        const mag = Math.sqrt(val*val + imag*imag) + 0.00001;
                        
                        if (comp == 0) return val / mag;
                        else return imag / mag;
                    })
                    .setOutput([2, WINDOW_SIZE, numChannels])
                    .setPipeline(true);

                    // Kernel 2: Corrected Imaginary Phase Locking Value (ciPLV)
                    state.kernels.corr = state.gpu.createKernel(function(analytic) {
                        const chA = this.thread.y;
                        const chB = this.thread.x;
                        let sumRe = 0;
                        let sumIm = 0;
                        
                        for(let k=0; k<this.constants.len; k++) {
                            const aRe = analytic[chA][k][0];
                            const aIm = analytic[chA][k][1];
                            const bRe = analytic[chB][k][0];
                            const bIm = analytic[chB][k][1];
                            sumRe += (aRe * bRe + aIm * bIm);
                            sumIm += (aIm * bRe - aRe * bIm);
                        }
                        
                        const meanRe = sumRe / this.constants.len;
                        const meanIm = sumIm / this.constants.len;
                        const numer = Math.abs(meanIm);
                        const denomSq = 1 - (meanRe * meanRe);
                        
                        let result = 0;
                        if (denomSq > 0.000001) {
                            result = numer / Math.sqrt(denomSq);
                        }
                        if (result > 1) result = 1;
                        return result;
                    })
                    .setOutput([numChannels, numChannels])
                    .setConstants({ len: WINDOW_SIZE });
                    
                    state.dim_ch = numChannels;
                    state.dim_len = WINDOW_SIZE;
                }
                
                const analyticTex = state.kernels.analytic(rawMatrix);
                const res = state.kernels.corr(analyticTex);
                
                for(let i=0; i<numChannels; i++) {
                    for(let j=i+1; j<numChannels; j++) {
                        const key = channels[i] + '__' + channels[j];
                        const rawVal = res[i][j];
                        
                        const prevVal = state.smoothMatrix[key] || 0;
                        const smoothVal = prevVal * (1 - alpha) + rawVal * alpha;
                        state.smoothMatrix[key] = smoothVal;
                        matrix[key] = smoothVal;
                        
                        totalSync += smoothVal;
                        pairCount++;
                    }
                }
                engine = 'GPU (WebGL ciPLV)';
            } catch(e) {
                console.error("GPU Error", e);
                state.gpuFailed = true; // Fallback permanently
                debugMsg = 'GPU Crashed: ' + e.message;
            }
        }
    }

    // --- CPU FALLBACK (ciPLV) ---
    if (pairCount === 0) {
        engine = 'CPU (Fallback ciPLV)';
        if (debugMsg) engine += ' | ' + debugMsg;
        
        const analyticCPU = channels.map(ch => {
            const d = rawMatrix[channels.indexOf(ch)];
            const arr = [];
            for(let t=0; t<WINDOW_SIZE; t++) {
                const r = d[t];
                const i = (t>=5) ? d[t-5] : 0;
                const mag = Math.sqrt(r*r + i*i) + 0.00001;
                arr.push({ r: r/mag, i: i/mag });
            }
            return arr;
        });

        for (let i = 0; i < numChannels; i++) {
            for (let j = i + 1; j < numChannels; j++) {
                const a = analyticCPU[i];
                const b = analyticCPU[j];
                let sumRe = 0;
                let sumIm = 0;
                for(let k=0; k<WINDOW_SIZE; k++) {
                    sumRe += (a[k].r * b[k].r + a[k].i * b[k].i);
                    sumIm += (a[k].i * b[k].r - a[k].r * b[k].i);
                }
                const meanRe = sumRe / WINDOW_SIZE;
                const meanIm = sumIm / WINDOW_SIZE;
                const denomSq = 1 - (meanRe * meanRe);
                const rawVal = (denomSq > 1e-6) ? (Math.abs(meanIm) / Math.sqrt(denomSq)) : 0;
                
                const key = channels[i] + '__' + channels[j];
                const prevVal = state.smoothMatrix[key] || 0;
                const smoothVal = prevVal * (1 - alpha) + rawVal * alpha;
                state.smoothMatrix[key] = smoothVal;
                matrix[key] = smoothVal;

                totalSync += smoothVal;
                pairCount++;
            }
        }
    }
    
    const globalSync = pairCount > 0 ? totalSync / pairCount : 0;
    
    return { output: { matrix, globalSync, engine }, state };
`;
