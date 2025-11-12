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

export const NEUROFEEDBACK_TOOLS: ToolCreatorPayload[] = [
    EXAMPLE_PROTOCOL,
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

export {};
