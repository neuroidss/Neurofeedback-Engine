
import type { ToolCreatorPayload } from '../types';
import { AUDIO_SOURCE_IMPL } from './common_node_impls';

// --- SHARED CONSTANTS ---
export const DEPLOY_GRAPH_ID = 'Deploy_Stream_Graph';
export const ADD_NODE_ID = 'Add_Stream_Node';

// --- IMPLEMENTATION STRINGS (Exported for Reuse) ---

export const BIND_VISUALS_TEMPLATE = `
    // Robust input retrieval
    let val = inputs['%%INPUT_NODE_ID%%'];
    if (val === undefined && Object.keys(inputs).length > 0) {
        val = Object.values(inputs)[0];
    }
    
    // 1. Property Extraction
    if (config.property && val && typeof val === 'object') {
        val = val[config.property];
    }
    
    // 2. Auto-Unwrap "output" wrapper
    if (val && typeof val === 'object' && val.output !== undefined) {
            val = val.output;
    }

    if (val !== undefined) {
        bus.publish({
            timestamp: Date.now(),
            sourceId: 'visual_binder',
            type: 'System',
            payload: { visualUpdate: { %%PARAMETER%%: val } }
        });
    }
    
    return { output: val };
`;

export const SOURCE_EEG_IMPL_GENERIC = `
    // Inputs from the NeuroBus frame buffer
    const buffer = inputs._frameBuffer?.['protocol_runner'];
    
    // Retrieve persistent state or initialize defaults
    let signalVal = state.lastValue ?? 0;
    let hasRealData = state.hasRealData || false;
    
    const targetChName = config.channel || 'Cz';

    if (buffer && buffer.length > 0) {
        // Search backwards for the latest frame containing target data
        for (let i = buffer.length - 1; i >= 0; i--) {
            const payload = buffer[i].payload;
            if (!payload) continue;
            
            const keys = Object.keys(payload);
            
            // Robust matching
            let targetKey = keys.find(k => {
                if (k === targetChName) return true;
                if (k.endsWith(':' + targetChName)) return true;
                const parts = k.split(':');
                const ch = parts.length > 1 ? parts[1] : parts[0];
                return ch.toLowerCase() === targetChName.toLowerCase();
            });
            
            if (targetKey && payload[targetKey] !== undefined) {
                const rawData = payload[targetKey];
                // Handle both array (taking last sample) and scalar
                const rawVal = Array.isArray(rawData) ? rawData[rawData.length - 1] : rawData;
                
                // Simple normalization for visualization (abs value of uV / 50)
                signalVal = Math.min(1, Math.abs(rawVal) / 50); 
                hasRealData = true;
                
                // Update persistent state
                state.lastValue = signalVal;
                state.hasRealData = true;
                
                break; // Stop once found
            }
        }
    }

    // Simulation Fallback
    if (!hasRealData) {
        const min = (config.simulationRange && typeof config.simulationRange[0] === 'number') ? config.simulationRange[0] : 0;
        const max = (config.simulationRange && typeof config.simulationRange[1] === 'number') ? config.simulationRange[1] : 0.1;
        const freq = config.simulationFrequencyHz || 1;
        
        const time = Date.now() / 1000;
        const norm = (Math.sin(time * freq * 2 * Math.PI) + 1) / 2; 
        signalVal = min + (norm * (max - min));
    }
    
    return { output: signalVal, state };
`;

// --- TOOLS ---

const DEPLOY_STREAM_GRAPH: ToolCreatorPayload = {
    name: DEPLOY_GRAPH_ID,
    description: 'Loads and starts a new dataflow graph in the Stream Engine.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To boot the agents new consciousness.',
    parameters: [
        { name: 'graphId', type: 'string', description: 'Unique ID.', required: true },
        { name: 'nodes', type: 'object', description: 'Dictionary of StreamNode objects.', required: true },
    ],
    implementationCode: `
        const { graphId, nodes } = args;
        if (!nodes || typeof nodes !== 'object') throw new Error("Invalid 'nodes' parameter.");
        if (runtime.streamEngine) {
            runtime.streamEngine.loadGraph({ id: graphId, nodes, edges: [] });
            runtime.streamEngine.start();
            return { success: true };
        }
        throw new Error("StreamEngine not available.");
    `
};

const ADD_STREAM_NODE: ToolCreatorPayload = {
    name: ADD_NODE_ID,
    description: 'Adds a single node to the active stream graph.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Incremental graph building.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: true },
        { name: 'type', type: 'string', description: "'Source', 'Transform', or 'Sink'.", required: true },
        { name: 'implementation', type: 'string', description: 'JS logic.', required: true },
        { name: 'inputs', type: 'array', description: 'Input IDs.', required: false, defaultValue: [] },
        { name: 'config', type: 'object', description: 'Config.', required: false, defaultValue: {} }
    ],
    implementationCode: `
        const { nodeId, type, implementation, inputs = [], config = {} } = args;
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({ id: nodeId, type, implementation, inputs, config, state: {} });
            return { success: true, message: \`Node '\${nodeId}' added.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CONNECT_STREAM_NODES: ToolCreatorPayload = {
    name: 'Connect_Stream_Nodes',
    description: 'Connects two nodes.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Wiring.',
    parameters: [
        { name: 'sourceNode', type: 'string', description: 'Source ID.', required: true },
        { name: 'targetNode', type: 'string', description: 'Target ID.', required: true }
    ],
    implementationCode: `
        const { sourceNode, targetNode } = args;
        if (runtime.streamEngine) {
            runtime.streamEngine.connectNodes(sourceNode, targetNode);
            return { success: true };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CREATE_CUSTOM_NODE: ToolCreatorPayload = {
    name: 'Create_Custom_Node',
    description: 'Creates a node with custom JavaScript logic. Useful for specific math or logic not covered by standard nodes.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To allow flexibility in graph construction.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'ID.', required: true },
        { name: 'jsLogic', type: 'string', description: 'The function body code.', required: true },
        { name: 'inputs', type: 'array', description: 'Input IDs.', required: false, defaultValue: [] },
        { name: 'config', type: 'object', description: 'Config object.', required: false }
    ],
    implementationCode: `
        const { nodeId, jsLogic, inputs, config } = args;
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: nodeId,
                type: 'Transform',
                implementation: jsLogic,
                inputs: inputs || [],
                config: config || {},
                state: {}
            });
            return { success: true, message: "Custom node created." };
        }
        throw new Error("StreamEngine not available.");
    `
};

const BIND_TO_VISUALS: ToolCreatorPayload = {
    name: 'Bind_To_Visuals',
    description: 'Maps input data to the Universal Canvas parameters.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Visual feedback.',
    parameters: [
        { name: 'inputNodeId', type: 'string', description: 'Input node.', required: true },
        { name: 'parameter', type: 'string', description: '"globalColor", "intensity", "geometryMode".', required: true },
        { name: 'nodeId', type: 'string', description: 'Optional ID.', required: false },
        { name: 'property', type: 'string', description: 'Optional property extraction.', required: false }
    ],
    implementationCode: `
        const { inputNodeId, parameter, nodeId, property } = args;
        const finalNodeId = nodeId || ('bind_' + parameter + '_' + Date.now().toString().slice(-4));
        const config = property ? { property } : {};
        const implTemplate = ${JSON.stringify(BIND_VISUALS_TEMPLATE)};
        const impl = implTemplate.replace('%%INPUT_NODE_ID%%', inputNodeId).replace('%%PARAMETER%%', parameter);
        
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: finalNodeId, type: 'Sink', inputs: [inputNodeId], config, state: {}, implementation: impl
            });
            return { success: true };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CREATE_EEG_SOURCE: ToolCreatorPayload = {
    name: 'Create_EEG_Source',
    description: 'Creates a graph node that sources EEG data.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'BCI Input.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'ID.', required: false, defaultValue: 'eeg_source_1' },
        { name: 'channel', type: 'string', description: 'Channel (e.g. "Cz").', required: false, defaultValue: 'Cz' },
        { name: 'config', type: 'object', description: 'Config (simulation).', required: false }
    ],
    implementationCode: `
        const { nodeId = 'eeg_source_1', channel = 'Cz' } = args;
        const fullConfig = { ...(args.config || {}), channel };
        
        if (runtime.streamEngine) {
            if (runtime.streamEngine.hasNode(nodeId)) {
                 runtime.streamEngine.updateNodeConfig(nodeId, fullConfig);
                 return { success: true };
            }
            runtime.streamEngine.addNode({
                id: nodeId, type: 'Source', inputs: [], config: fullConfig, state: {}, 
                implementation: ${JSON.stringify(SOURCE_EEG_IMPL_GENERIC)}
            });
            runtime.streamEngine.start();
            return { success: true };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CREATE_AUDIO_SOURCE: ToolCreatorPayload = {
    name: 'Create_Audio_Source',
    description: 'Creates a mic input node.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Audio Input.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'ID.', required: false, defaultValue: 'audio_source_1' }
    ],
    implementationCode: `
        const { nodeId = 'audio_source_1' } = args;
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: nodeId, type: 'Source', inputs: [], config: {}, state: {}, 
                implementation: ${JSON.stringify(AUDIO_SOURCE_IMPL)}
            });
            return { success: true };
        }
        throw new Error("StreamEngine not available.");
    `
};

export const STREAM_TOOLS = [
    DEPLOY_STREAM_GRAPH, 
    ADD_STREAM_NODE, 
    CONNECT_STREAM_NODES, 
    CREATE_CUSTOM_NODE,
    BIND_TO_VISUALS, 
    CREATE_EEG_SOURCE, 
    CREATE_AUDIO_SOURCE,
];
