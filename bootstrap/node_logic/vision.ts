
// bootstrap/node_logic/vision.ts

export const AFFECTIVE_NODE_IMPL = `
    const visionFrame = inputs['vision_source_1'];
    
    // Initialize persistent state for temporal integration (Smoothing)
    // VAD Range: 1.0 to 9.0 (SAM Scale)
    if (state.v === undefined) state.v = 5.0;
    if (state.a === undefined) state.a = 1.0;
    if (state.d === undefined) state.d = 5.0;

    // Smoothing Factor (Alpha): Lower = Smoother/Slower
    const alpha = 0.1;

    if (visionFrame && visionFrame.raw) {
        const shapes = visionFrame.raw;
        const getAU = (name) => shapes.find(s => s.categoryName === name)?.score || 0;

        // --- SCIENTIFIC MEASUREMENT: FACS to VAD Mapping ---
        // Ref: Mehrabian (1996) PAD Model & Ekman's FACS
        
        // Valence (Pleasure-Displeasure):
        const au12 = (getAU('mouthSmileLeft') + getAU('mouthSmileRight')) / 2;
        const au6 = (getAU('cheekSquintLeft') + getAU('cheekSquintRight')) / 2;
        const au4 = (getAU('browDownLeft') + getAU('browDownRight')) / 2;
        const au15 = (getAU('mouthFrownLeft') + getAU('mouthFrownRight')) / 2;
        const au9 = (getAU('noseSneerLeft') + getAU('noseSneerRight')) / 2;
        
        let rawValence = 5.0 + ((au12 * 0.7 + au6 * 0.3) * 4.0) - ((au4 * 0.4 + au15 * 0.3 + au9 * 0.3) * 4.0);

        // Arousal (Activation Energy):
        const au5 = (getAU('eyeWideLeft') + getAU('eyeWideRight')) / 2;
        const au26 = getAU('jawOpen');
        const au1 = (getAU('browInnerUp') + getAU('browOuterUpLeft') + getAU('browOuterUpRight')) / 3;
        
        let rawArousal = 2.0 + ((au5 + au26 + au1) * 2.5);
        rawArousal += Math.abs(rawValence - 5.0) * 0.3;

        // Dominance (Control vs Submission):
        let headPitch = 0;
        if (visionFrame.matrix) {
             headPitch = -visionFrame.matrix[5] * 2.0; // Approximation
        }
        
        let rawDominance = 5.0;
        rawDominance -= (headPitch * 4.0); // Chin up (neg pitch) -> Increases Dominance
        rawDominance += (au4 * 2.0); // Anger -> Dominance
        rawDominance -= (au1 * 3.0); // Fear -> Submission

        // --- TEMPORAL INTEGRATION (Low-Pass Filter) ---
        const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
        
        state.v = (alpha * clamp(rawValence, 1, 9)) + ((1 - alpha) * state.v);
        state.a = (alpha * clamp(rawArousal, 1, 9)) + ((1 - alpha) * state.a);
        state.d = (alpha * clamp(rawDominance, 1, 9)) + ((1 - alpha) * state.d);
    }

    return { 
        output: { 
            v: state.v, 
            a: state.a, 
            d: state.d 
        },
        state 
    };
`;

export const GAZE_NODE_IMPL = `
    const frame = inputs['vision_source_1'];
    const THREE = window.THREE;
    
    if (!state.x) state.x = 0;
    if (!state.y) state.y = 0;
    if (!state.z) state.z = 5;
    
    const alpha = 0.15; 

    if (frame && frame.raw && THREE) {
        const getAU = (name) => frame.raw.find(s => s.categoryName === name)?.score || 0;

        const lX = getAU('eyeLookInLeft') - getAU('eyeLookOutLeft');
        const lY = getAU('eyeLookUpLeft') - getAU('eyeLookDownLeft');
        const rX = getAU('eyeLookOutRight') - getAU('eyeLookInRight');
        const rY = getAU('eyeLookUpRight') - getAU('eyeLookDownRight');

        const leftDir = new THREE.Vector3(0, 0, 1);
        leftDir.applyEuler(new THREE.Euler(-lY, -lX, 0));
        
        const rightDir = new THREE.Vector3(0, 0, 1);
        rightDir.applyEuler(new THREE.Euler(-rY, rX, 0)); 
        
        const avgDir = new THREE.Vector3().addVectors(leftDir, rightDir).normalize();
        const squintFactor = Math.abs(lX + rX); 
        const dist = 8 - (squintFactor * 10); 
        const target = avgDir.multiplyScalar(Math.max(1, dist));
        
        state.x = (alpha * target.x) + ((1 - alpha) * state.x);
        state.y = (alpha * target.y) + ((1 - alpha) * state.y);
        state.z = (alpha * target.z) + ((1 - alpha) * state.z);
    }

    const result = { x: state.x, y: state.y, z: state.z };

    bus.publish({
        type: 'System',
        sourceId: 'gaze_processor',
        payload: { visualUpdate: { gaze: result } }
    });

    return { output: result, state };
`;

export const BLINK_NODE_IMPL = `
    const frame = inputs['vision_source_1'];
    let blink = { l: 0, r: 0 };
    
    if (frame && frame.raw) {
        const getAU = (name) => frame.raw.find(s => s.categoryName === name)?.score || 0;
        blink = {
            l: getAU('eyeBlinkLeft'),
            r: getAU('eyeBlinkRight')
        };
    }
    
    bus.publish({
        type: 'System',
        sourceId: 'blink_processor',
        payload: { visualUpdate: { blink: blink } }
    });
    
    return { output: blink };
`;
