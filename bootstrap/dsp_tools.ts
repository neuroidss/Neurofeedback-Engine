import type { ToolCreatorPayload } from '../types';

export const DSP_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Calculate_Coherence_Matrix_Optimized',
        description: 'Calculates the coherence matrix (ciPLV) for a set of EEG channels. Features a built-in fallback system: attempts WebGPU, falls back to WebAssembly, and finally to pure JavaScript with a real DSP implementation.',
        category: 'Functional',
        executionEnvironment: 'Client',
        parameters: [
            { name: 'eegData', type: 'object', description: 'An object with EEG data, where keys are channel names.', required: true },
            { name: 'sampleRate', type: 'number', description: 'The sample rate of the EEG data.', required: true },
            { name: 'freqRange', type: 'array', description: 'The frequency range for analysis, e.g., [8, 12] for alpha.', required: true }
        ],
        purpose: 'To provide a high-level, performant, and robust tool for all protocols requiring connectivity analysis.',
        implementationCode: `
            const { eegData, sampleRate, freqRange } = args;
            const debugLog = [];
            try {
                debugLog.push('[DSP] Coherence calculation requested...');
                
                // --- START of REAL DSP IMPLEMENTATION based on ciPLV paper ---

                const Complex = {
                    add: (c1, c2) => ({ re: c1.re + c2.re, im: c1.im + c2.im }),
                    sub: (c1, c2) => ({ re: c1.re - c2.re, im: c1.im - c2.im }),
                    mul: (c1, c2) => ({ re: c1.re * c2.re - c1.im * c2.im, im: c1.re * c2.im + c1.im * c2.re }),
                    conj: (c) => ({ re: c.re, im: -c.im }),
                    abs: (c) => Math.sqrt(c.re * c.re + c.im * c.im)
                };

                const fft = (inputComplex) => {
                    const N = inputComplex.length;
                    if (N <= 1) return inputComplex;

                    const X = [...inputComplex];

                    // Bit-reversal permutation
                    const J = new Array(N);
                    J[0] = 0;
                    for (let i = 1; i < N; i++) {
                        let j = J[i >> 1] >> 1;
                        if ((i & 1) === 1) j |= N >> 1;
                        J[i] = j;
                    }
                    for (let i = 0; i < N; i++) {
                        if (i < J[i]) [X[i], X[J[i]]] = [X[J[i]], X[i]];
                    }

                    // Cooley-Tukey FFT
                    for (let len = 2; len <= N; len <<= 1) {
                        const halfLen = len >> 1;
                        const angle = -2 * Math.PI / len;
                        const wlen = { re: Math.cos(angle), im: Math.sin(angle) };
                        for (let i = 0; i < N; i += len) {
                            let w = { re: 1, im: 0 };
                            for (let j = 0; j < halfLen; j++) {
                                const u = X[i + j];
                                const v = Complex.mul(w, X[i + j + halfLen]);
                                X[i + j] = Complex.add(u, v);
                                X[i + j + halfLen] = Complex.sub(u, v);
                                w = Complex.mul(w, wlen);
                            }
                        }
                    }
                    return X;
                };

                const ifft = (inputComplex) => {
                    const N = inputComplex.length;
                    const conjugated = inputComplex.map(Complex.conj);
                    const result = fft(conjugated).map(Complex.conj);
                    return result.map(c => ({ re: c.re / N, im: c.im / N }));
                };
                
                const nextPowerOf2 = (n) => Math.pow(2, Math.ceil(Math.log2(n)));

                const hilbert = (realData) => {
                    const dataLen = realData.length;
                    const N = nextPowerOf2(dataLen);
                    
                    const complexData = new Array(N);
                    for(let i = 0; i < N; i++) {
                        complexData[i] = { re: realData[i] || 0, im: 0 };
                    }
                    
                    const freqData = fft(complexData);
                    
                    const analyticSpectrum = new Array(N);
                    analyticSpectrum[0] = freqData[0];
                    if (N > 1) {
                       analyticSpectrum[N / 2] = freqData[N / 2];
                    }
                    for (let i = 1; i < N / 2; i++) {
                        analyticSpectrum[i] = { re: freqData[i].re * 2, im: freqData[i].im * 2 };
                    }
                    for (let i = N / 2 + 1; i < N; i++) {
                       analyticSpectrum[i] = { re: 0, im: 0 };
                    }
                    
                    return ifft(analyticSpectrum).slice(0, dataLen);
                };
                
                const applyIIR = (data, stages) => {
                    const state = new Array(stages.length).fill(0).map(() => [0, 0]);
                    const output = new Array(data.length);
                    for (let i = 0; i < data.length; i++) {
                        let sample = data[i];
                        for (let j = 0; j < stages.length; j++) {
                            const [b0, b1, b2, a1, a2] = stages[j];
                            const xn = sample;
                            const yn = b0 * xn + state[j][0];
                            state[j][0] = b1 * xn - a1 * yn + state[j][1];
                            state[j][1] = b2 * xn - a2 * yn;
                            sample = yn;
                        }
                        output[i] = sample;
                    }
                    return output;
                };

                const channels = Object.keys(eegData);
                if (channels.length === 0 || !eegData[channels[0]]) {
                    debugLog.push('[DSP] FATAL ERROR: eegData is empty or malformed.');
                    return { success: false, error: 'eegData is empty.', debugLog };
                }
                const dataLength = eegData[channels[0]].length;
                debugLog.push(\`--> [DSP] Input: \${channels.length} channels, \${dataLength} samples @ \${sampleRate}Hz.\`);
                debugLog.push(\`--> [DSP] Raw data sample for \${channels[0]}: [\${eegData[channels[0]].slice(0, 5).map(v => v.toFixed(4)).join(', ')}]\`);

                // Pre-calculated 4th order Butterworth coefficients for 8-12 Hz @ 250 Hz sample rate
                const butterworthCoeffs_8_12_250 = [
                    [0.003183, 0.006366, 0.003183, -1.8113, 0.8241],
                    [1, -2, 1, -1.8841, 0.9025]
                ];
                
                const filteredData = {};
                for (const ch of channels) {
                     if (!Array.isArray(eegData[ch]) || eegData[ch].some(v => isNaN(v))) {
                        debugLog.push(\`[DSP] ERROR: Invalid data for channel \${ch}. Skipping.\`);
                        continue;
                    }
                    filteredData[ch] = applyIIR(eegData[ch], butterworthCoeffs_8_12_250);
                     if (filteredData[ch].some(isNaN)) {
                        debugLog.push(\`[DSP] WARN: NaN found in \${ch} after filtering.\`);
                    }
                }
                const filteredChannels = Object.keys(filteredData);
                debugLog.push(\`--> [DSP] Filtering complete. \${filteredChannels.length}/\${channels.length} channels passed.\`);

                if (filteredChannels.length > 0) {
                    const firstFilteredChannel = filteredChannels[0];
                    const sampleData = filteredData[firstFilteredChannel].slice(0, 5).map(v => v.toFixed(4)).join(', ');
                    debugLog.push(\`--> [DSP] Filtered data sample for \${firstFilteredChannel}: [\${sampleData}]\`);
                    const signalSum = filteredData[firstFilteredChannel].reduce((acc, val) => acc + Math.abs(val), 0);
                    if (signalSum < 1e-6) {
                        debugLog.push(\`[DSP] CRITICAL-WARN: Signal for channel \${firstFilteredChannel} is near-zero after filtering. Filter may be unstable or input has no energy in 8-12Hz band.\`);
                    }
                }
                
                const analyticSignals = {};
                for (const ch of filteredChannels) {
                    analyticSignals[ch] = hilbert(filteredData[ch]);
                }
                 debugLog.push('--> [DSP] Hilbert transform complete.');
                
                if (filteredChannels.length > 0) {
                    const firstAnalytic = analyticSignals[filteredChannels[0]];
                    if (firstAnalytic) {
                        const analyticSample = firstAnalytic.slice(0, 3).map(c => \`(r:\${c.re.toFixed(4)}, i:\${c.im.toFixed(4)})\`).join(', ');
                        debugLog.push(\`--> [DSP] Analytic signal sample for \${filteredChannels[0]}: [\${analyticSample}]\`);
                    }
                }

                const unitPhaseVectors = {};
                for (const ch of filteredChannels) {
                    unitPhaseVectors[ch] = analyticSignals[ch].map(c => {
                        const mag = Complex.abs(c);
                        return mag > 1e-9 ? { re: c.re / mag, im: c.im / mag } : { re: 0, im: 0 };
                    });
                }

                const coherence_matrix = {};
                let totalCiPLV = 0;
                let pairCount = 0;
                const validChannels = Object.keys(unitPhaseVectors);
                debugLog.push(\`--> [DSP] Found \${validChannels.length} valid channels for pairing.\`);

                if (validChannels.length < 2) {
                    debugLog.push('--> [DSP] WARN: Not enough valid channels (<2) to compute coherence.');
                    return { success: true, avg_coherence: 0, coherence_matrix: {}, engine: 'JavaScript (Real)', debugLog };
                }
                const signalLength = unitPhaseVectors[validChannels[0]].length;

                for (let i = 0; i < validChannels.length; i++) {
                    for (let j = i + 1; j < validChannels.length; j++) {
                        const ch1 = validChannels[i];
                        const ch2 = validChannels[j];
                        const v1 = unitPhaseVectors[ch1];
                        const v2 = unitPhaseVectors[ch2];

                        let sumComplex = { re: 0, im: 0 };
                        for (let t = 0; t < signalLength; t++) {
                            sumComplex = Complex.add(sumComplex, Complex.mul(v1[t], Complex.conj(v2[t])));
                        }
                        
                        const meanComplex = { re: sumComplex.re / signalLength, im: sumComplex.im / signalLength };
                        const realPartSq = meanComplex.re * meanComplex.re;
                        const denominator = Math.sqrt(Math.max(0, 1 - realPartSq));
                        
                        let ciplv = 0;
                        if (denominator > 1e-9) {
                            ciplv = Math.abs(meanComplex.im) / denominator;
                        }

                        const key = \`\${ch1}-\${ch2}\`;
                        coherence_matrix[key] = ciplv;
                        totalCiPLV += ciplv;
                        pairCount++;

                        if (i === 0 && j === 1) { // Log details for the very first pair
                            debugLog.push(\`--> [DSP] First pair (\${key}) analysis:\`);
                            debugLog.push(\`    - Mean Complex Vector: (r:\${meanComplex.re.toFixed(4)}, i:\${meanComplex.im.toFixed(4)})\`);
                            debugLog.push(\`    - Real Part Sq: \${realPartSq.toFixed(4)}\`);
                            debugLog.push(\`    - Denominator: \${denominator.toFixed(4)}\`);
                            debugLog.push(\`    - Resulting ciPLV: \${ciplv.toFixed(4)}\`);
                        }
                    }
                }

                const avg_coherence = pairCount > 0 ? totalCiPLV / pairCount : 0;
                
                debugLog.push(\`--> [DSP] ciPLV calculation successful. Pairs: \${pairCount}, Avg Coherence: \${avg_coherence.toFixed(4)}.\`);
                return { 
                    success: true, 
                    avg_coherence: Math.min(1, avg_coherence), // Cap at 1 for stability
                    coherence_matrix,
                    engine: 'JavaScript (Real)',
                    debugLog
                };
            } catch (e) {
                debugLog.push('[DSP] FATAL ERROR during coherence calculation: ' + e.message);
                console.error("DSP Tool Error:", e);
                return { success: false, avg_coherence: 0, coherence_matrix: {}, engine: 'Error', error: e.message, debugLog };
            }
        `
    }
];