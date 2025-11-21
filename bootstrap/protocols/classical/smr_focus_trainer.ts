
// bootstrap/protocols/classical/smr_focus_trainer.ts
import type { ToolCreatorPayload } from '../../../types';

export const SMR_FOCUS_TRAINER: ToolCreatorPayload = {
    name: 'SMR "Aperture" Focus Trainer',
    description: `### Protocol Specification: SMR "Aperture" Focus Trainer

**Objective:** Enhance cognitive inhibition and attention by training the Sensorimotor Rhythm (SMR) while suppressing Theta activity.

**Signal Processing Logic:**
1.  **Input:** EEG channel 'Cz' (primary) or 'C3'/'C4' (fallback).
2.  **Metric:** \`focusRatio\` = (Power of 12-15 Hz) / (Power of 4-8 Hz).
3.  **Simulation:** If real data is absent, generate a smooth 0.5Hz oscillating signal ranging from 0.5 to 1.8 to demonstrate the full visual range.

**Visual Interface (The "Camera Lens" Metaphor):**
1.  **The Aperture (Focus):** A central ring that expands as \`focusRatio\` increases.
2.  **The Blur (Distraction):** A foggy overlay. Opacity decreases as focus increases.
3.  **Lock-On State:** When \`focusRatio > 1.2\`:
    *   The Aperture turns Gold and pulses.
    *   The Blur vanishes completely.
    *   Text "LOCK ON" appears.
4.  **Idle State:** Below 1.2, the Aperture is Cyan and the fog is visible.`,
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To help users achieve a state of "locked-in" focus using a camera lens metaphor.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time processed EEG data, expected to contain `focusRatio`.', required: true },
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['Cz'],
        metrics: ['focusRatio']
    },
    scientificDossier: {
        title: "SMR/Theta Ratio Training for Attention",
        hypothesis: "Increasing SMR (12-15Hz) while suppressing Theta (4-8Hz) reduces motor hyperactivity and improves sensory processing accuracy.",
        mechanism: "Operant conditioning via visual clarity (Aperture metaphor).",
        targetNeuralState: "Relaxed, immobile focus.",
        citations: [
            "Sterman, M. B. (2000). Basic concepts and clinical findings in the treatment of seizure disorders with EEG operant conditioning.",
            "Monastra, V. J., et al. (2005). Electroencephalographic biofeedback in the treatment of attention-deficit/hyperactivity disorder."
        ],
        relatedKeywords: ["ADHD", "Sensory Motor Rhythm", "Focus", "Inhibition"]
    },
    processingCode: `
(eegData, sampleRate) => {
    // Ideal Processing Logic
    // 1. Check inputs
    const channelData = eegData['Cz'] || eegData['C3'] || eegData['C4'];
    
    // 2. Simulation Fallback (CRITICAL for UX)
    if (!channelData || channelData.length < sampleRate) {
        const t = Date.now() / 1000;
        // Oscillate between 0.5 (distracted) and 1.8 (super focused)
        const simRatio = 1.15 + Math.sin(t * 2) * 0.65; 
        return { focusRatio: simRatio };
    }
    
    // 3. Real DSP (Simplified FFT proxy for example)
    // In a real generated tool, this would use the window.dsp utils
    // Here we approximate power using simple filters or mock for the 'concept'
    
    // For this specific 'Ideal Example', we will assume the DSP happened upstream 
    // or use a high-quality simulation if raw data isn't sufficient.
    // Ideally, this function WOULD contain the FFT logic.
    
    return { focusRatio: 1.0 }; // Placeholder for real FFT code
}
    `,
    implementationCode: `
        const { useMemo, useState, useEffect } = React;
        
        // 1. Data Binding
        const rawRatio = processedData?.focusRatio ?? 1.0;
        
        // 2. Smoothing (UI Polish)
        const [smoothRatio, setSmoothRatio] = useState(1.0);
        useEffect(() => {
            // Simple lerp for smooth visuals
            setSmoothRatio(prev => prev + (rawRatio - prev) * 0.1);
        }, [rawRatio]);

        // 3. State Logic
        const isLocked = smoothRatio > 1.2;
        const normalizedFocus = Math.min(1, Math.max(0, (smoothRatio - 0.5) / 1.5)); // Map 0.5->2.0 to 0->1
        
        // 4. Visual Parameters
        const apertureSize = 100 + (normalizedFocus * 150); // 100px to 250px
        const blurAmount = Math.max(0, (1 - normalizedFocus) * 10); // 10px blur to 0px
        const opacityAmount = Math.max(0, 0.5 - (normalizedFocus * 0.5)); // Fog opacity
        
        // Colors
        const baseColor = isLocked ? '#fbbf24' : '#22d3ee'; // Amber-400 vs Cyan-400
        const glowColor = isLocked ? 'rgba(251, 191, 36, 0.6)' : 'rgba(34, 211, 238, 0.3)';
        
        // 5. Styles
        const containerStyle = {
            width: '100%', height: '100%',
            backgroundColor: '#0f172a',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative', overflow: 'hidden',
            fontFamily: 'monospace'
        };

        const lensStyle = {
            width: apertureSize + 'px',
            height: apertureSize + 'px',
            borderRadius: '50%',
            border: '4px solid ' + baseColor,
            boxShadow: '0 0 30px ' + glowColor + ', inset 0 0 20px ' + glowColor,
            transition: 'all 0.1s ease-out',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
            backgroundColor: 'transparent'
        };

        const fogLayer = {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backdropFilter: 'blur(' + blurAmount + 'px)',
            backgroundColor: 'rgba(0,0,0,' + opacityAmount + ')',
            transition: 'all 0.2s ease-out',
            zIndex: 5,
            pointerEvents: 'none'
        };

        const reticleStyle = {
            position: 'absolute', width: '280px', height: '280px',
            border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '50%',
            zIndex: 1
        };

        return (
            <div style={containerStyle}>
                {/* Background Grid */}
                <div style={{
                    position: 'absolute', inset: 0, opacity: 0.1,
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
                    backgroundSize: '40px 40px'
                }} />

                {/* The "Fog" of Distraction */}
                <div style={fogLayer} />
                
                {/* Target Reticle */}
                <div style={reticleStyle} />

                {/* The Aperture */}
                <div style={lensStyle}>
                    {isLocked && (
                        <div style={{
                            width: '10px', height: '10px', borderRadius: '50%',
                            backgroundColor: baseColor,
                            boxShadow: '0 0 10px ' + baseColor
                        }} />
                    )}
                </div>

                {/* HUD */}
                <div style={{ zIndex: 20, marginTop: '40px', textAlign: 'center' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: baseColor, textShadow: '0 0 10px ' + glowColor }}>
                        {isLocked ? 'LOCK ON' : 'ACQUIRING...'}
                    </div>
                    <div style={{ color: '#64748b', fontSize: '0.8rem', marginTop: '5px' }}>
                        RATIO: {smoothRatio.toFixed(2)} | THRESHOLD: 1.2
                    </div>
                </div>
            </div>
        );
    `
};
