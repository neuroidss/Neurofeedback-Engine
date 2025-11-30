
// bootstrap/node_logic/mappers.ts

export const COLOR_MAPPER_IMPL = `
    // Tries to find 'globalSync' from matrix processor, or 'v' (valence) from affective processor
    const data = inputs['matrix_processor'] || inputs['affective_processor'];
    if (!data) return { output: '#444' };
    
    let val = 0;
    let hue = 0;

    if (data.globalSync !== undefined) {
        // Neural Sync Mode: Blue (Low) -> Gold (High)
        val = data.globalSync;
        hue = 220 - (val * 180); 
    } else if (data.v !== undefined) {
        // Valence Mode: Red (Low) -> Green (High)
        // Input is SAM Scale (1-9). Normalize to 0-1.
        val = (data.v - 1) / 8; 
        val = Math.max(0, Math.min(1, val));
        hue = val * 120;
    }

    const color = \`hsl(\${hue.toFixed(2)}, 100%, 50%)\`;
    
    bus.publish({ 
        type: 'System', 
        sourceId: 'mapper_color', 
        timestamp: Date.now(),
        payload: { visualUpdate: { globalColor: color } } 
    });
    return { output: color };
`;

export const INTENSITY_MAPPER_IMPL = `
    const data = inputs['matrix_processor'] || inputs['affective_processor'];
    if (!data) return { output: 0 };
    
    let intensity = 0;

    if (data.globalSync !== undefined) {
        // Neural Sync
        intensity = data.globalSync * data.globalSync * 1.5;
    } else if (data.a !== undefined) {
        // Arousal (1-9)
        const a = (data.a - 1) / 8;
        intensity = a * 2.0; 
    }
    
    // Soft clamp
    intensity = Math.max(0, Math.min(1.5, intensity));
    
    bus.publish({ 
        type: 'System', 
        sourceId: 'mapper_intensity', 
        timestamp: Date.now(),
        payload: { visualUpdate: { intensity: intensity } } 
    });
    return { output: intensity };
`;
