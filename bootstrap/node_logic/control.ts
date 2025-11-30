
// bootstrap/node_logic/control.ts

export const HYBRID_CONTROLLER_IMPL = `
    const eeg = inputs['eeg_source_1']; 
    const vision = inputs['vision_source_1']; 
    const mic = inputs['audio_source_1']; 
    
    const manual = config.manualTarget || 10; 
    const mode = config.mode || 'manual'; 
    
    const enableShield = config.enableShield || false;
    const baseNoise = config.baseNoise || 0; 
    
    let targetBeat = manual;
    let targetScale = null; 
    let targetNoise = baseNoise;
    let feedbackStr = 'Manual: ' + manual + 'Hz';

    if (state.smoothMetric === undefined) state.smoothMetric = 0.5;
    if (state.smoothAmbient === undefined) state.smoothAmbient = 0;

    // 1. Beat Frequency Logic
    if (mode === 'neuro') {
        let rawMetric = 0.5;
        if (typeof eeg === 'number') rawMetric = eeg;
        
        const smoothing = 0.05; 
        state.smoothMetric = (rawMetric * smoothing) + (state.smoothMetric * (1 - smoothing));
        const metric = state.smoothMetric;
        
        if (metric < 0.3) {
            targetBeat = 18; 
            feedbackStr = 'Neuro: Boosting (Beta)';
        } else if (metric > 0.7) {
            targetBeat = 14; 
            feedbackStr = 'Neuro: Flow (SMR)';
        } else {
            targetBeat = 10; 
            feedbackStr = 'Neuro: Guiding (Alpha)';
        }
    } else {
        targetBeat = manual;
        feedbackStr = 'Target: ' + manual + 'Hz';
    }

    // 2. Musical Scale Logic
    if (mode === 'bio_harmony' && vision) {
        const smile = vision.smile || 0;
        if (smile > 0.6) {
            targetScale = 'lydian'; 
            feedbackStr += ' | Mood: Radiant';
        } else if (smile > 0.2) {
            targetScale = 'major';
            feedbackStr += ' | Mood: Positive';
        } else {
            targetScale = 'dorian';
            feedbackStr += ' | Mood: Deep';
        }
    }
    
    // 3. SONIC SHIELD
    let shieldLevel = 0;
    if (enableShield && mic) {
        const rawAmbient = mic.volume || 0;
        if (rawAmbient > state.smoothAmbient) {
            state.smoothAmbient = (rawAmbient * 0.2) + (state.smoothAmbient * 0.8); 
        } else {
            state.smoothAmbient = (rawAmbient * 0.01) + (state.smoothAmbient * 0.99); 
        }
        const boost = Math.max(0, (state.smoothAmbient - 0.05) * 3.0);
        targetNoise = Math.min(0.8, baseNoise + boost);
        shieldLevel = boost;
        if (boost > 0.1) feedbackStr += ' | 🛡️ Shield Active';
    } else {
        state.smoothAmbient = 0;
        targetNoise = baseNoise;
    }

    bus.publish({
        type: 'System',
        sourceId: 'studio_logic',
        payload: { 
            visualUpdate: { textOverlay: feedbackStr, intensity: (targetBeat / 30), beatHz: targetBeat },
            debug: { shieldLevel } 
        }
    });

    return { output: { beat: targetBeat, scale: targetScale, noise: targetNoise }, state };
`;

export const AURA_LOGIC_IMPL = `
    const vision = inputs['vision_source_1'];
    const audio = inputs['audio_source_1'];
    const eeg = inputs['eeg_source_1'];
    
    const mode = config.mode || 'EXPRESSED'; 

    if (!state.smoothFace) state.smoothFace = 0;
    if (!state.smoothBrain) state.smoothBrain = 0;
    
    const hasFace = (vision?.status === 'active');
    const smile = vision?.smile || 0;
    const vol = audio?.volume || 0;
    
    let faceEnergy = smile + (vol * 1.5);
    faceEnergy = Math.min(1, Math.max(0, faceEnergy));
    state.smoothFace += (faceEnergy - state.smoothFace) * 0.1;

    const hasEEG = (typeof eeg === 'number' && eeg > 0.1);
    let brainEnergy = 0.5; 
    
    if (hasEEG) {
        brainEnergy = Math.min(1, Math.max(0, eeg));
    } else {
        const t = Date.now() / 2000;
        brainEnergy = (Math.sin(t) + 1) / 2; 
    }
    state.smoothBrain += (brainEnergy - state.smoothBrain) * 0.1;

    let targetColor = '#22d3ee'; 
    let targetIntensity = 0.2;
    let auraType = 'FLOW';
    let statusText = 'MODE: ' + mode;
    let authenticity = 1.0;

    if (mode === 'EXPRESSED') {
        statusText = hasFace ? 'EMPATHY FIELD: ACTIVE' : 'SEARCHING FOR FACE...';
        const hue = 240 - (state.smoothFace * 200); 
        targetColor = 'hsl(' + hue + ', 100%, 50%)';
        targetIntensity = 0.2 + (state.smoothFace * 0.8);
        auraType = state.smoothFace > 0.6 ? 'RADIATE' : 'FLOW';
        
    } else if (mode === 'INTERNAL') {
        statusText = hasEEG ? 'NEURO-LINK: CONNECTED' : 'NEURO-LINK: SIMULATING...';
        const hue = 270 - (state.smoothBrain * 240);
        targetColor = 'hsl(' + hue + ', 100%, 50%)';
        targetIntensity = 0.2 + (state.smoothBrain * 0.8);
        auraType = state.smoothBrain > 0.6 ? 'SPIKE' : 'BREATHE';

    } else if (mode === 'RESONANCE') {
        if (hasFace) { 
            const delta = Math.abs(state.smoothBrain - state.smoothFace);
            authenticity = 1.0 - delta;
            statusText = 'AUTHENTICITY: ' + (authenticity * 100).toFixed(0) + '%';
            
            if (delta < 0.35) {
                targetColor = '#4ade80'; 
                targetIntensity = 0.4 + authenticity * 0.6; 
                auraType = 'HARMONIC';
            } else {
                targetColor = '#f43f5e'; 
                targetIntensity = 0.3 + delta * 0.5; 
                auraType = 'GLITCH'; 
            }
        } else {
            statusText = 'WAITING FOR EXPRESSION...';
            targetColor = '#334155';
            targetIntensity = 0.1;
            auraType = 'IDLE';
        }
    }

    bus.publish({
        type: 'System',
        sourceId: 'aura_engine',
        payload: { 
            visualUpdate: { 
                globalColor: targetColor, 
                intensity: targetIntensity,
                textOverlay: statusText
            },
            auraMode: auraType,
            debugInfo: { face: state.smoothFace, brain: state.smoothBrain, auth: authenticity }
        }
    });

    return { output: { color: targetColor, intensity: targetIntensity } };
`;
