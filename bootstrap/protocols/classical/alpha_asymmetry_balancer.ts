// bootstrap/protocols/classical/alpha_asymmetry_balancer.ts
import type { ToolCreatorPayload } from '../../../types';

export const ALPHA_ASYMMETRY_MOOD_BALANCER: ToolCreatorPayload = {
    name: 'Alpha Asymmetry Mood Balancer',
    description: 'Abstract: Frontal alpha asymmetry is a well-established marker of an emotional state. Greater relative alpha power in the left frontal lobe (e.g., at electrode site F3) compared to the right (F4) is associated with positive affect and approach motivation. This protocol trains users to increase this asymmetry. The key metric is `alpha_asymmetry_index`, calculated as (Right_Alpha - Left_Alpha) / (Right_Alpha + Left_Alpha). The visual feedback should be an abstract color gradient that shifts from cool, blue tones (right-dominant alpha) to warm, orange/yellow tones (left-dominant alpha).',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To help achieve a more positive emotional state by balancing frontal lobe alpha wave activity.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time EEG data with `alpha_asymmetry_index`.', required: true },
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['F3', 'F4'],
        metrics: ['alpha_asymmetry_index']
    },
    processingCode: `
(eegData, sampleRate) => {
    // Simulate alpha power from F3 (Left) and F4 (Right)
    const leftAlpha = Math.random() * 10;
    const rightAlpha = Math.random() * 10;
    
    // Calculate asymmetry index: (R - L) / (R + L). Ranges from -1 to 1.
    // Positive values = more left activity (approach/positive)
    const index = (rightAlpha - leftAlpha) / (rightAlpha + leftAlpha + 1e-6);

    return { 
        alpha_asymmetry_index: index 
    };
}
    `,
    implementationCode: `
        const { useMemo } = React;
        const index = processedData?.alpha_asymmetry_index || 0; // Ranges from -1 (right dominant) to 1 (left dominant)

        // Map the index to a color hue. -1 -> Blue (~240), 0 -> Purple (~280), 1 -> Orange (~40)
        const normalizedValue = (index + 1) / 2; // Map to 0-1 range
        const hue = 40 + (1 - normalizedValue) * 200; // Interpolate from Orange (40) to Blue (240)

        const backgroundStyle = useMemo(() => ({
            width: '100%',
            height: '100%',
            borderRadius: '8px',
            transition: 'background 0.8s ease-out',
            background: 'radial-gradient(circle, hsl(' + hue + ', 90%, 60%) 0%, hsl(' + (hue + 20) + ', 80%, 30%) 70%, #000 100%)'
        }), [hue]);

        if (!processedData) {
            return <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><p>Waiting for EEG data...</p></div>;
        }

        return <div style={backgroundStyle} />;
    `
};