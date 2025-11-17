// bootstrap/protocols/classical/smr_focus_trainer.ts
import type { ToolCreatorPayload } from '../../../types';

export const SMR_FOCUS_TRAINER: ToolCreatorPayload = {
    name: 'SMR Focus Trainer',
    description: 'Abstract: Sensorimotor rhythm (SMR) neurofeedback, targeting the 12-15 Hz frequency band, is associated with states of focused calm. The protocol aims to enhance SMR activity. The core metric is the ratio of SMR power (12-15 Hz) to theta power (4-8 Hz). Positive reinforcement is provided when this SMR/theta ratio increases. The user interface should provide simple, clear feedback via a vertical bar that grows in height and changes color from blue to green as the ratio improves.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To help a user enter a state of calm concentration by increasing the sensorimotor rhythm (SMR).',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time processed EEG data, expected to contain `smr_theta_ratio`.', required: true },
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['Cz'],
        metrics: ['smr_theta_ratio']
    },
    processingCode: `
(eegData, sampleRate) => {
    // Simulate calculating the ratio of SMR power (12-15 Hz) to theta power (4-8 Hz).
    // A higher ratio indicates focused calm.
    // A plausible ratio is generally between 0.5 and 2.5
    const ratio = Math.random() * 2.0 + 0.5;
    return { 
        smr_theta_ratio: ratio 
    };
}
    `,
    implementationCode: `
        const { useMemo } = React;
        const ratio = processedData?.smr_theta_ratio || 0;

        // Normalize ratio for visual mapping (from a 0.5-2.5 range to a 0-1 range)
        const normalizedRatio = Math.max(0, Math.min(1, (ratio - 0.5) / 2.0));

        const containerStyle = {
            width: '100%', height: '100%', display: 'flex',
            flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-end',
            backgroundColor: 'rgba(10, 20, 30, 0.5)', borderRadius: '8px', padding: '20px'
        };

        const barStyle = useMemo(() => ({
            width: '50%',
            height: (5 + normalizedRatio * 95) + '%',
            backgroundColor: 'hsl(' + (120 + (1 - normalizedRatio) * 120) + ', 80%, 50%)', // Interpolates from blue (hue 240) to green (hue 120)
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.4s ease-out',
            boxShadow: '0 0 25px hsl(' + (120 + (1 - normalizedRatio) * 120) + ', 80%, 50%, 0.7)'
        }), [normalizedRatio]);
        
        if (!processedData) {
            return <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><p>Waiting for EEG data...</p></div>;
        }

        return (
            <div style={containerStyle}>
                <div style={barStyle} />
                <p style={{ color: 'white', marginTop: '10px', fontSize: '1rem' }}>
                    Focus Level: { (normalizedRatio * 100).toFixed(0) }%
                </p>
            </div>
        );
    `
};