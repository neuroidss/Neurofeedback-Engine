
// bootstrap/protocols/utils.ts
import type { ToolCreatorPayload, StreamNode } from '../../types';

interface GraphProtocolConfig {
    name: string;
    description: string;
    id: string;
    purpose: string;
    nodes: StreamNode[];
    visualComponent: string; // Key from VISUAL_COMPONENTS
    scientificDossier?: any;
    dataRequirements?: any;
}

export const createGraphProtocol = (config: GraphProtocolConfig): ToolCreatorPayload => {
    const { name, description, id, purpose, nodes, visualComponent, scientificDossier, dataRequirements } = config;

    // Filter inputs for cleanliness
    const cleanedNodes = nodes.map(n => ({
        ...n,
        // Ensure inputs are arrays of strings
        inputs: Array.isArray(n.inputs) ? n.inputs : (typeof n.inputs === 'object' ? Object.values(n.inputs) : [])
    }));

    // Tiny implementation that defers to the universal runtime renderer
    const implementationCode = `return runtime.renderGraphProtocol(args, "${visualComponent}", ${JSON.stringify(cleanedNodes)});`;

    return {
        name,
        description,
        category: 'UI Component',
        executionEnvironment: 'Client',
        purpose,
        parameters: [
            { name: 'processedData', type: 'object', description: 'N/A', required: false },
            { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
        ],
        dataRequirements: dataRequirements || { type: 'eeg', channels: [], metrics: [] },
        scientificDossier,
        processingCode: `(d,r)=>({})`, 
        implementationCode
    };
};
