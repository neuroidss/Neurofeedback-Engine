
// bootstrap/stream_tools.ts
import type { ToolCreatorPayload } from '../types';

const DEPLOY_STREAM_GRAPH: ToolCreatorPayload = {
    name: 'Deploy_Stream_Graph',
    description: 'Loads and starts a new dataflow graph in the Stream Engine. Replaces active logic. Expects a complete graph JSON object.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To "boot" the agent\'s new consciousness or update its processing pipeline in bulk.',
    parameters: [
        { name: 'graphId', type: 'string', description: 'Unique ID for the graph.', required: true },
        { name: 'nodes', type: 'object', description: 'Dictionary of StreamNode objects.', required: true },
    ],
    implementationCode: `
        const { graphId, nodes } = args;
        // Validate nodes structure
        if (!nodes || typeof nodes !== 'object') {
            throw new Error("Invalid 'nodes' parameter. Must be an object map of StreamNodes.");
        }
        
        const graph = {
            id: graphId,
            nodes: nodes,
            edges: []
        };
        
        if (runtime.streamEngine) {
            runtime.streamEngine.loadGraph(graph);
            runtime.streamEngine.start();
            runtime.logEvent(\`[StreamEngine] Deployed graph '\${graphId}' with \${Object.keys(nodes).length} nodes.\`);
            return { success: true };
        } else {
            throw new Error("StreamEngine is not available in the runtime context.");
        }
    `
};

const ADD_STREAM_NODE: ToolCreatorPayload = {
    name: 'Add_Stream_Node',
    description: 'Adds a single node to the active stream graph at runtime.',
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
            runtime.streamEngine.addNode({
                id: nodeId, type, implementation, inputs, config, state: {}
            });
            return { success: true, message: \`Node '\${nodeId}' added.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CONNECT_STREAM_NODES: ToolCreatorPayload = {
    name: 'Connect_Stream_Nodes',
    description: 'Connects the output of one node to the input of another.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Wiring nodes.',
    parameters: [
        { name: 'sourceNode', type: 'string', description: 'ID of source node.', required: true },
        { name: 'targetNode', type: 'string', description: 'ID of target node.', required: true }
    ],
    implementationCode: `
        const { sourceNode, targetNode } = args;
        if (sourceNode === undefined || targetNode === undefined) {
             throw new Error('sourceNode and targetNode must be defined.');
        }
        if (runtime.streamEngine) {
            runtime.streamEngine.connectNodes(sourceNode, targetNode);
            return { success: true, message: \`Connected \${sourceNode} -> \${targetNode}.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CREATE_FILTER_NODE: ToolCreatorPayload = {
    name: 'Create_Filter_Node',
    description: 'Helper to quickly create a Transform node logic.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Simplifies transform creation.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'ID.', required: true },
        { name: 'inputNodeIds', type: 'array', description: 'Inputs.', required: true },
        { name: 'jsLogic', type: 'string', description: 'Logic returning { output: ... }.', required: true }
    ],
    implementationCode: `
        const { nodeId, inputNodeIds, jsLogic } = args;
        if (runtime.streamEngine) {
             runtime.streamEngine.addNode({
                id: nodeId, type: 'Transform', inputs: inputNodeIds, config: {}, state: {}, implementation: jsLogic
            });
            return { success: true, nodeId };
        }
        throw new Error("StreamEngine not available.");
    `
};

// --- EXTRACTED IMPLEMENTATION TEMPLATE ---
const BIND_VISUALS_TEMPLATE = `
    // Robust input retrieval: Try explicit ID first, then fallback to the first available input
    let val = inputs['%%INPUT_NODE_ID%%'];
    if (val === undefined && Object.keys(inputs).length > 0) {
        val = Object.values(inputs)[0];
    }
    
    // 1. Property Extraction (if configured)
    if (config.property && val && typeof val === 'object') {
        val = val[config.property];
    }
    
    // 2. Auto-Unwrap "output" wrapper if present (common in transform nodes that return { output, state })
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
    
    // RETURN THE VALUE SO IT SHOWS IN THE UI GRAPH
    return { output: val };
`;

const BIND_TO_VISUALS: ToolCreatorPayload = {
    name: 'Bind_To_Visuals',
    description: 'Creates a Sink node that maps input data to the Universal Canvas. Returns the value for visualization.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Visual feedback binding.',
    parameters: [
        { name: 'inputNodeId', type: 'string', description: 'Input node.', required: true },
        { name: 'parameter', type: 'string', description: '"globalColor", "intensity", "geometryMode".', required: true },
        { name: 'nodeId', type: 'string', description: 'Optional specific ID for this node. If omitted, one is generated.', required: false },
        { name: 'property', type: 'string', description: 'Optional property to extract if input is an object (e.g., "smile").', required: false }
    ],
    implementationCode: `
        const { inputNodeId, parameter, nodeId, property } = args;
        const validParams = ['globalColor', 'intensity', 'geometryMode', 'textOverlay'];
        if (!validParams.includes(parameter)) {
            throw new Error("Invalid visual parameter: " + parameter + ". Must be one of: " + validParams.join(', '));
        }
        
        const finalNodeId = nodeId || ('bind_' + parameter + '_' + Date.now().toString().slice(-4));
        
        // Store property in config if provided
        const config = property ? { property } : {};

        const implTemplate = ${JSON.stringify(BIND_VISUALS_TEMPLATE)};
        const impl = implTemplate.replace('%%INPUT_NODE_ID%%', inputNodeId).replace('%%PARAMETER%%', parameter);
        
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: finalNodeId,
                type: 'Sink',
                inputs: [inputNodeId],
                config: config,
                state: {},
                implementation: impl
            });
            return { success: true, message: \`Bound \${inputNodeId} to \${parameter} via node \${finalNodeId}\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

// --- NEW: CREATE_EEG_SOURCE ---
// Uses persistent state to bridge the gap between 25Hz input stream and 60Hz graph ticks.
const SOURCE_EEG_IMPL_GENERIC = `
    // Inputs from the NeuroBus frame buffer
    const buffer = inputs._frameBuffer?.['protocol_runner'];
    
    // Retrieve persistent state or initialize defaults
    let signalVal = state.lastValue ?? 0;
    let hasRealData = state.hasRealData || false;
    let sourceName = state.lastSourceName || 'Searching...';
    
    const targetChName = config.channel || 'Cz';

    if (buffer && buffer.length > 0) {
        // Search backwards for the latest frame containing target data
        for (let i = buffer.length - 1; i >= 0; i--) {
            const payload = buffer[i].payload;
            if (!payload) continue;
            
            const keys = Object.keys(payload);
            
            // Robust matching: "Cz" matches "FreeEEG8:Cz" or "simulator-1:Cz"
            let targetKey = keys.find(k => {
                if (k === targetChName) return true;
                if (k.endsWith(':' + targetChName)) return true;
                const parts = k.split(':');
                const ch = parts.length > 1 ? parts[1] : parts[0];
                return ch.toLowerCase() === targetChName.toLowerCase();
            });
            
            if (targetKey && payload[targetKey] && payload[targetKey].length > 0) {
                const rawDataArr = payload[targetKey];
                const rawVal = rawDataArr[rawDataArr.length - 1];
                
                // Simple normalization for visualization (abs value of uV)
                signalVal = Math.min(1, Math.abs(rawVal) / 50); 
                hasRealData = true;
                sourceName = targetKey;
                
                // Update persistent state
                state.lastValue = signalVal;
                state.hasRealData = true;
                state.lastSourceName = sourceName;
                
                break; // Stop once found
            }
        }
    }

    // If we haven't found real data yet (ever), use configured simulation
    if (!hasRealData) {
        // Extract AI-configured simulation parameters or use defaults
        const min = (config.simulationRange && typeof config.simulationRange[0] === 'number') ? config.simulationRange[0] : 0;
        const max = (config.simulationRange && typeof config.simulationRange[1] === 'number') ? config.simulationRange[1] : 0.1; // Default low amp if no config
        const freq = config.simulationFrequencyHz || 1;
        
        const time = Date.now() / 1000;
        // Sine wave between 0 and 1
        const norm = (Math.sin(time * freq * 2 * Math.PI) + 1) / 2; 
        
        // Map to range
        signalVal = min + (norm * (max - min));
        
        sourceName = 'Simulating ' + targetChName;
    }
    
    return { output: signalVal, state };
`;

const CREATE_EEG_SOURCE: ToolCreatorPayload = {
    name: 'Create_EEG_Source',
    description: 'Creates a graph node that sources EEG data. Can simulate data if "config.simulationRange" [min, max] and "config.simulationFrequencyHz" are provided.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable brain-computer interfacing in the stream graph.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: false, defaultValue: 'eeg_source_1' },
        { name: 'channel', type: 'string', description: 'EEG Channel to target (e.g., "Cz", "Fz").', required: false, defaultValue: 'Cz' },
        { name: 'config', type: 'object', description: 'Additional configuration (e.g. simulation params).', required: false }
    ],
    implementationCode: `
        const { nodeId = 'eeg_source_1', channel = 'Cz' } = args;
        // Merge explicit channel arg with any other config passed (e.g. simulation params)
        const fullConfig = { ...(args.config || {}), channel };
        
        const nodeDefinition = {
            id: nodeId,
            type: 'Source',
            inputs: [],
            config: fullConfig,
            state: {},
            implementation: ${JSON.stringify(SOURCE_EEG_IMPL_GENERIC)}
        };
        
        if (runtime.streamEngine) {
            if (runtime.streamEngine.hasNode(nodeId)) {
                 runtime.streamEngine.updateNodeConfig(nodeId, fullConfig);
                 return { success: true, message: "Updated existing EEG Source." };
            }
            runtime.streamEngine.addNode(nodeDefinition);
            runtime.streamEngine.start(); 
            return { success: true, message: "EEG Source created targeting " + channel + "." };
        }
        return { success: true, node: nodeDefinition };
    `
};

export const STREAM_TOOLS = [DEPLOY_STREAM_GRAPH, ADD_STREAM_NODE, CONNECT_STREAM_NODES, CREATE_FILTER_NODE, BIND_TO_VISUALS, CREATE_EEG_SOURCE];
