// bootstrap/protocols/classical/example_protocol.ts
import type { ToolCreatorPayload } from '../../../types';

export const EXAMPLE_PROTOCOL: ToolCreatorPayload = {
    name: 'Example: Alpha Wave Relaxation',
    description: 'This neurofeedback protocol is based on research indicating a correlation between increased alpha wave (8-12 Hz) power and states of relaxed alertness. The objective is to guide the user towards this state by providing positive visual feedback when their alpha power, relative to their total spectral power, increases. The primary metric calculated is the ratio of power in the alpha band to the total power across all bands (delta, theta, alpha, beta, gamma).',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To provide a pre-packaged, working example of a neurofeedback protocol, demonstrating the expected structure and functionality of a generated tool.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time processed EEG data, expected to contain `alpha_power_ratio`.', required: true },
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: false }
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['Cz'],
        metrics: ['alpha_power_ratio']
    },
    processingCode: `
(eegData, sampleRate) => {
    // This example uses a single channel 'Cz' as defined in its dataRequirements.
    // eegData will be { Cz: [...] }
    const signal = eegData['Cz'];
    
    // Simple simulation of alpha power. In a real scenario, this would involve FFT.
    const currentRatio = Math.random() * 0.4 + 0.3; // Simulate a plausible alpha ratio between 0.3 and 0.7
    
    // Add some drift to the simulation
    const drift = (Math.random() - 0.45) * 0.1;
    const newRatio = Math.max(0.1, Math.min(0.9, currentRatio + drift));

    return { 
        alpha_power_ratio: newRatio 
    };
}
    `,
    implementationCode: `
        const { useMemo } = React;

        const alphaRatio = processedData?.alpha_power_ratio || 0;

        // Memoize styles to prevent recalculations on every render
        const containerStyle = useMemo(() => ({
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            color: 'white',
            fontFamily: 'sans-serif',
            transition: 'background-color 0.5s ease',
        }), []);
        
        const circleStyle = useMemo(() => ({
            width: (50 + (alphaRatio * 150)) + 'px',
            height: (50 + (alphaRatio * 150)) + 'px',
            backgroundColor: 'hsl(200, 100%, ' + (30 + alphaRatio * 40) + '%)',
            borderRadius: '50%',
            transition: 'all 0.5s ease-out',
            boxShadow: '0 0 ' + (alphaRatio * 40) + 'px rgba(100, 200, 255, ' + (0.5 + alphaRatio * 0.5) + ')',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }), [alphaRatio]);

        const textStyle = useMemo(() => ({
            marginTop: '20px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            color: 'rgba(255, 255, 255, ' + (0.5 + alphaRatio * 0.5) + ')',
            transition: 'color 0.5s ease'
        }), [alphaRatio]);

        if (!processedData) {
            return (
                <div style={containerStyle}>
                    <p>Waiting for EEG data...</p>
                </div>
            );
        }

        return (
            <div style={containerStyle}>
                <div style={circleStyle}></div>
                <p style={textStyle}>
                    Alpha Power: { (alphaRatio * 100).toFixed(1) }%
                </p>
                <p style={{ fontSize: '0.9rem', color: '#aaa', marginTop: '8px' }}>
                    Relax and let the circle grow.
                </p>
            </div>
        );
    `
};