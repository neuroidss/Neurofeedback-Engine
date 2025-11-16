import type { ToolCreatorPayload } from '../types';

const EXAMPLE_PROTOCOL: ToolCreatorPayload = {
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
            width: \`\${50 + (alphaRatio * 150)}px\`,
            height: \`\${50 + (alphaRatio * 150)}px\`,
            backgroundColor: \`hsl(200, 100%, \${30 + alphaRatio * 40}%)\`,
            borderRadius: '50%',
            transition: 'all 0.5s ease-out',
            boxShadow: \`0 0 \${alphaRatio * 40}px rgba(100, 200, 255, \${0.5 + alphaRatio * 0.5})\`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }), [alphaRatio]);

        const textStyle = useMemo(() => ({
            marginTop: '20px',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            color: \`rgba(255, 255, 255, \${0.5 + alphaRatio * 0.5})\`,
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

const SMR_FOCUS_TRAINER: ToolCreatorPayload = {
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
            height: \`\${5 + normalizedRatio * 95}%\`,
            backgroundColor: \`hsl(\${120 + (1 - normalizedRatio) * 120}, 80%, 50%)\`, // Interpolates from blue (hue 240) to green (hue 120)
            borderRadius: '8px 8px 0 0',
            transition: 'all 0.4s ease-out',
            boxShadow: \`0 0 25px hsl(\${120 + (1 - normalizedRatio) * 120}, 80%, 50%, 0.7)\`
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

const ALPHA_ASYMMETRY_MOOD_BALANCER: ToolCreatorPayload = {
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
            background: \`radial-gradient(circle, hsl(\${hue}, 90%, 60%) 0%, hsl(\${hue + 20}, 80%, 30%) 70%, #000 100%)\`
        }), [hue]);

        if (!processedData) {
            return <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><p>Waiting for EEG data...</p></div>;
        }

        return <div style={backgroundStyle} />;
    `
};

const THETA_GAMMA_MEMORY_SYNC: ToolCreatorPayload = {
    name: 'Theta-Gamma Memory Sync',
    description: "Abstract: Theta-gamma phase-amplitude coupling (PAC) in the prefrontal cortex is a key mechanism for working memory. In this process, the phase of the slower theta rhythm (4-8 Hz) modulates the amplitude of the faster gamma rhythm (30-50 Hz). This protocol provides feedback on the strength of this coupling. The metric is `pac_strength`. The visualization should represent the theta rhythm as a slow, pulsating central orb, and the gamma rhythm as bright, brief sparks that appear in sync with the orb's pulse. The higher the `pac_strength`, the more sparks appear precisely at the peak of the orb's pulse.",
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To improve working memory by strengthening theta-gamma phase-amplitude coupling.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time EEG data with `pac_strength`.', required: true },
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['Fz'],
        metrics: ['pac_strength']
    },
    processingCode: `
(eegData, sampleRate) => {
    // Simulate Phase-Amplitude Coupling strength. A value from 0 (no coupling) to 1 (perfect coupling).
    const strength = Math.random();
    return { 
        pac_strength: strength
    };
}
    `,
    implementationCode: `
        const { useState, useEffect, useMemo, useRef } = React;

        const pacStrength = processedData?.pac_strength || 0;
        const [phase, setPhase] = useState(0);
        const [sparks, setSparks] = useState([]);
        const lastSpawnTimeRef = useRef(0);

        // Animation loop for theta phase and spark management
        useEffect(() => {
            let animationFrameId;
            const animate = (time) => {
                // Theta phase cycles roughly every 166ms (at 6 Hz)
                setPhase(prev => (prev + 0.04) % (2 * Math.PI));

                // Spark spawning logic
                const sineOfPhase = Math.sin(phase);
                // The peak of the theta pulse
                if (sineOfPhase > 0.9 && (time - lastSpawnTimeRef.current) > 100) { 
                    // Higher pacStrength = higher chance of spawning a spark IN SYNC
                    if (Math.random() < pacStrength) {
                        setSparks(currentSparks => [
                            ...currentSparks.slice(-50), // Keep the list from growing too large
                            { 
                                id: time,
                                angle: Math.random() * 2 * Math.PI,
                                distance: 40 + Math.random() * 60,
                                opacity: 1,
                                size: 2 + Math.random() * 3
                            }
                        ]);
                        lastSpawnTimeRef.current = time;
                    }
                }
                
                // CHAOTIC sparks (low pacStrength = more chaos)
                // This runs more frequently than the sync check
                 if ((time - lastSpawnTimeRef.current) > 50) {
                     if (Math.random() < (1 - pacStrength) * 0.2) { // more chaos when pacStrength is low
                        setSparks(currentSparks => [
                            ...currentSparks.slice(-50),
                            { 
                                id: time,
                                angle: Math.random() * 2 * Math.PI,
                                distance: 40 + Math.random() * 60,
                                opacity: 0.6, // chaotic sparks are dimmer
                                size: 1 + Math.random() * 2
                            }
                        ]);
                        lastSpawnTimeRef.current = time;
                     }
                 }
                
                // Update and fade out all sparks
                setSparks(currentSparks => 
                    currentSparks
                        .map(s => ({ ...s, opacity: s.opacity - 0.03 }))
                        .filter(s => s.opacity > 0)
                );

                animationFrameId = requestAnimationFrame(animate);
            };
            animationFrameId = requestAnimationFrame(animate);
            return () => cancelAnimationFrame(animationFrameId);
        }, [phase, pacStrength]);

        const orbSize = 50 + Math.sin(phase) * 20;
        const orbOpacity = 0.6 + Math.sin(phase) * 0.4;
        
        if (!processedData) {
            return <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><p>Waiting for EEG data...</p></div>;
        }

        return (
            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{
                    width: orbSize, height: orbSize,
                    backgroundColor: 'cyan',
                    borderRadius: '50%',
                    opacity: orbOpacity,
                    transition: 'all 0.1s linear',
                    boxShadow: '0 0 30px cyan, 0 0 60px cyan'
                }} />
                {sparks.map(spark => (
                    <div key={spark.id} style={{
                        position: 'absolute',
                        left: '50%', top: '50%',
                        width: spark.size, height: spark.size,
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transform: \`translate(-50%, -50%) translate(\${Math.cos(spark.angle) * spark.distance}px, \${Math.sin(spark.angle) * spark.distance}px)\`,
                        opacity: spark.opacity,
                        boxShadow: '0 0 10px white'
                    }} />
                ))}
            </div>
        );
    `
};

export const PROTOCOL_TOOLS: ToolCreatorPayload[] = [
    EXAMPLE_PROTOCOL,
    SMR_FOCUS_TRAINER,
    ALPHA_ASYMMETRY_MOOD_BALANCER,
    THETA_GAMMA_MEMORY_SYNC,
    {
        name: 'Export Neurofeedback Protocols',
        description: 'Exports all user-created or AI-generated neurofeedback protocols to a JSON string.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To allow users to save, share, and back up the protocols they have created.',
        parameters: [],
        implementationCode: `
            const allTools = runtime.tools.list();
            const protocolTools = allTools.filter(tool => 
                tool.category === 'UI Component' && 
                tool.name !== 'Neurofeedback Engine Main UI' && 
                tool.name !== 'Debug Log View'
            );

            const exportableProtocols = protocolTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                category: tool.category,
                executionEnvironment: tool.executionEnvironment,
                parameters: tool.parameters,
                implementationCode: tool.implementationCode,
                processingCode: tool.processingCode,
                purpose: tool.purpose,
                dataRequirements: tool.dataRequirements,
            }));

            const jsonString = JSON.stringify(exportableProtocols, null, 2);
            runtime.logEvent(\`[Export] Successfully prepared \${exportableProtocols.length} protocols for export.\`);

            return { success: true, protocolsJson: jsonString };
        `
    },
    {
        name: 'Import Neurofeedback Protocols',
        description: 'Imports one or more neurofeedback protocols from a JSON string, creating them as new tools.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To allow users to load saved or shared neurofeedback protocols into their library.',
        parameters: [
            { name: 'protocolsJson', type: 'string', description: 'A JSON string containing an array of protocol definitions to import.', required: true },
        ],
        implementationCode: `
            const { protocolsJson } = args;
            let protocolsToImport;
            try {
                protocolsToImport = JSON.parse(protocolsJson);
                if (!Array.isArray(protocolsToImport)) {
                    throw new Error("JSON data is not an array.");
                }
            } catch (e) {
                throw new Error(\`Invalid JSON format: \${e.message}\`);
            }

            let successfulImports = 0;
            let failedImports = 0;

            for (const protocolPayload of protocolsToImport) {
                try {
                    // Basic validation
                    if (!protocolPayload.name || !protocolPayload.description || !protocolPayload.implementationCode) {
                        throw new Error(\`Protocol missing required fields (name, description, implementationCode). Skipping.\`);
                    }
                    // Force category to be correct
                    protocolPayload.category = 'UI Component';
                    protocolPayload.executionEnvironment = 'Client';

                    await runtime.tools.run('Tool Creator', protocolPayload);
                    successfulImports++;
                } catch (e) {
                    failedImports++;
                    runtime.logEvent(\`[Import] Failed to import protocol '\${protocolPayload.name || 'Unknown'}': \${e.message}\`);
                }
            }
            
            const message = \`Import complete. Successfully imported \${successfulImports} protocols. Failed to import \${failedImports}.\`;
            runtime.logEvent(\`[Import] \${message}\`);
            return { success: true, message: message };
        `
    },
];
