
import type { ToolCreatorPayload } from '../types';

const CREATE_STANDARD_NODE: ToolCreatorPayload = {
    name: 'Create_Standard_Node',
    description: 'Creates a standard logic or math node in the stream graph.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To provide ready-to-use signal processing nodes without code generation.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID for the node.', required: true },
        { name: 'nodeType', type: 'string', description: 'Type of standard node. Available: Math_Multiply, Math_Divide, Math_Add, Math_Subtract, Math_Abs, Math_Clamp, Math_Threshold, Signal_Smooth, Signal_Oscillator, Logic_IfElse.', required: true },
        { name: 'inputs', type: 'array', description: 'List of input node IDs.', required: true },
        { name: 'config', type: 'object', description: 'Configuration parameters.', required: false }
    ],
    implementationCode: `
        const { nodeId, nodeType, inputs, config } = args;
        
        let cleanInputs = inputs;
        if (cleanInputs && !Array.isArray(cleanInputs) && typeof cleanInputs === 'object') cleanInputs = Object.values(cleanInputs);
        if (!Array.isArray(cleanInputs)) cleanInputs = [];
        cleanInputs = cleanInputs.filter(i => typeof i === 'string');

        if (runtime.streamEngine) {
            // We now pass 'nodeType' directly. The StreamEngine will look it up in NATIVE_NODE_LIBRARY.
            // implementation string is NOT required for standard nodes anymore.
            runtime.streamEngine.addNode({
                id: nodeId,
                type: 'Transform',
                nodeType: nodeType,
                inputs: cleanInputs, 
                config: config || {},
                state: {},
                implementation: '' // Empty because nodeType handles it
            });
            return { success: true, message: \`Node '\${nodeId}' created.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

export const NODE_TOOLS = [CREATE_STANDARD_NODE];
