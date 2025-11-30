
// bootstrap/node_logic/audio.ts

export const AUDIO_SOURCE_IMPL = `
    if (!state.ctx || state.ctx.state === 'closed') {
        if (state.initFailed) return { output: { volume: 0, pitch: 0 } };
        try {
            state.isInitializing = true;
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            state.ctx = new AudioContext();
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                state.stream = stream;
                state.source = state.ctx.createMediaStreamSource(stream);
                state.analyser = state.ctx.createAnalyser();
                state.analyser.fftSize = 512;
                state.source.connect(state.analyser);
                state.isInitializing = false;
                state.active = true;
            }).catch(e => { state.initFailed = true; });
        } catch(e) { state.initFailed = true; }
        return { output: { volume: 0, pitch: 0 } };
    }
    if (!state.active || !state.analyser) return { output: { volume: 0, pitch: 0 } };

    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(dataArray);
    let sum = 0;
    for(let i=0; i<dataArray.length; i++) sum += (dataArray[i] * dataArray[i]);
    const rms = Math.sqrt(sum / dataArray.length);
    const volume = Math.min(1, rms / 100);
    
    return { output: { volume: volume, pitch: 0 } };
`;

export const UNIVERSAL_AUDIO_NODE_IMPL = `
    // --- Universal Audio Node ---
    // Supports: Binaural Beats, Polyphonic Drones, and Noise Masks
    
    if (!state.ctx) {
        state.ctx = new (window.AudioContext || window.webkitAudioContext)();
        state.master = state.ctx.createGain();
        state.master.connect(state.ctx.destination);
        state.master.gain.value = 0.1; // Master volume
        
        state.oscs = []; // For drones
        state.binOscs = null; // For binaural
        
        // Noise Buffer (Brown/Pink Approximation)
        const bSize = state.ctx.sampleRate * 2;
        const buffer = state.ctx.createBuffer(1, bSize, state.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bSize; i++) {
            // Brownian noise: integrate white noise
            const white = Math.random() * 2 - 1;
            lastOut = (lastOut + (0.02 * white)) / 1.02;
            data[i] = lastOut * 3.5; // Compensate for gain loss
            if(data[i] > 1) data[i] = 1;
            if(data[i] < -1) data[i] = -1;
        }
        
        state.noiseBuf = buffer;
        state.noiseNode = state.ctx.createBufferSource();
        state.noiseNode.buffer = buffer;
        state.noiseNode.loop = true;
        state.noiseGain = state.ctx.createGain();
        state.noiseNode.connect(state.noiseGain).connect(state.master);
        state.noiseNode.start();
        state.noiseGain.gain.value = 0;
    }
    
    // Resume audio if suspended
    if (state.ctx.state === 'suspended') state.ctx.resume().catch(()=>{});

    // Parse Inputs & Config
    const inputData = Object.values(inputs)[0] || {};
    const carrier = inputData.carrier || config.carrierHz || 200;
    const beat = inputData.beat || config.beatHz || 0;
    const noiseVol = inputData.noise || config.noiseVolume || 0;
    const scale = inputData.scale || config.scale || 'minor';
    
    // Determine Mode
    const mode = config.mode || (beat > 0 ? 'binaural' : 'drone');

    // 1. Binaural Beat Mode
    if (mode === 'binaural') {
        // Cleanup Polyphonic Drones
        if (state.oscs.length > 0) {
            state.oscs.forEach(o => { try{o.osc.stop()}catch(e){} });
            state.oscs = [];
        }
        
        if (!state.binOscs) {
            const oscL = state.ctx.createOscillator();
            const oscR = state.ctx.createOscillator();
            const panL = state.ctx.createStereoPanner();
            const panR = state.ctx.createStereoPanner();
            panL.pan.value = -1;
            panR.pan.value = 1;
            
            oscL.connect(panL).connect(state.master);
            oscR.connect(panR).connect(state.master);
            oscL.start();
            oscR.start();
            state.binOscs = { oscL, oscR };
        }
        
        const t = state.ctx.currentTime;
        state.binOscs.oscL.frequency.setTargetAtTime(carrier, t, 0.1);
        state.binOscs.oscR.frequency.setTargetAtTime(carrier + beat, t, 0.1);
    }
    
    // 2. Polyphonic Drone Mode
    else {
        // Cleanup Binaural
        if (state.binOscs) {
            try { state.binOscs.oscL.stop(); state.binOscs.oscR.stop(); } catch(e){}
            state.binOscs = null;
        }
        
        if (state.oscs.length === 0) {
            // Initialize 4-voice drone (Pentatonic Minor spacing approx)
            const ratios = [1, 1.2, 1.5, 1.77]; 
            ratios.forEach(r => {
                const o = state.ctx.createOscillator();
                const g = state.ctx.createGain();
                const p = state.ctx.createStereoPanner();
                o.connect(g).connect(p).connect(state.master);
                g.gain.value = 0.15;
                p.pan.value = (Math.random() * 2) - 1;
                o.start();
                state.oscs.push({osc: o, gain: g, pan: p, ratio: r});
            });
        }
        
        const t = state.ctx.currentTime;
        state.oscs.forEach(item => {
            let targetF = carrier * item.ratio;
            if (scale === 'major') {
                // Shift minor 3rd (1.2) to Major 3rd (1.25)
                if (item.ratio === 1.2) targetF = carrier * 1.25;
            }
            // Organic Drift
            const drift = Math.sin(t * 0.5 + item.ratio) * 2;
            item.osc.frequency.setTargetAtTime(targetF + drift, t, 0.2);
        });
    }
    
    // Apply Noise Level (Sonic Shield)
    state.noiseGain.gain.setTargetAtTime(noiseVol, state.ctx.currentTime, 0.5);
    
    return { output: { active: true, mode, carrier, beat, noise: noiseVol } };
`;
