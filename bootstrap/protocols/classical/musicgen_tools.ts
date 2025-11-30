import type { ToolCreatorPayload } from '../../../types';
import { MUSICGEN_SERVER_SIMPLE_CODE } from './musicgen/server_simple';
import { MUSICGEN_SERVER_NEURO_CODE } from './musicgen/server_neuro';
import { SIMPLE_MUSICGEN_CLIENT_IMPL } from './musicgen/client_ui_test';
import { MUSICGEN_NEURO_CLIENT_IMPL } from './musicgen/client_ui_neuro';
import { MUSICGEN_NODE_IMPL } from './musicgen/stream_node';
import { AGGREGATOR_SOURCE_IMPL, MATRIX_PROCESSOR_IMPL } from '../../common_node_impls';

const DEPLOY_MUSICGEN_SERVER: ToolCreatorPayload = {
    name: 'Deploy Adaptive MusicGen Server',
    description: 'Deploys the simple/legacy adaptive_musicgen.py script.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To install the backend for the Simple Test Protocol.',
    parameters: [],
    implementationCode: `
        const scriptContent = ${JSON.stringify(MUSICGEN_SERVER_SIMPLE_CODE)};
        await runtime.tools.run('Server File Writer', {
            filePath: 'simple_musicgen.py',
            content: scriptContent,
            baseDir: 'scripts'
        });
        return { success: true, message: 'Simple MusicGen Server script deployed.' };
    `
};

const DEPLOY_MUSICGEN_NEURO_SERVER: ToolCreatorPayload = {
    name: 'Deploy Neuro MusicGen Server',
    description: 'Deploys the advanced neuro_musicgen.py script with Attention Mask Monkey-Patching for EEG Coherence mapping.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To install the backend for the Coherence Protocol.',
    parameters: [],
    implementationCode: `
        const scriptContent = ${JSON.stringify(MUSICGEN_SERVER_NEURO_CODE)};
        await runtime.tools.run('Server File Writer', {
            filePath: 'neuro_musicgen.py',
            content: scriptContent,
            baseDir: 'scripts'
        });
        return { success: true, message: 'Neuro MusicGen Server script deployed.' };
    `
};

const FINAL_NEURO_CLIENT_CODE = MUSICGEN_NEURO_CLIENT_IMPL
    .replace('%%AGGREGATOR_LOGIC%%', JSON.stringify(AGGREGATOR_SOURCE_IMPL))
    .replace('%%MATRIX_LOGIC%%', JSON.stringify(MATRIX_PROCESSOR_IMPL));

export const MUSICGEN_COHERENCE_PROTOCOL: ToolCreatorPayload = {
    name: 'MusicGen Adaptive Coherence',
    description: 'Generative AI Music modulated by real-time EEG Coherence (ciPLV). Uses GPU acceleration to map brain connectivity directly to the Transformer Attention Mask.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'High-performance generative neurofeedback.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Data from runtime', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: FINAL_NEURO_CLIENT_CODE
};

export const SIMPLE_MUSICGEN_PROTOCOL: ToolCreatorPayload = {
    name: 'MusicGen Adaptive (Test)',
    description: 'A diagnostic tool for MusicGen. Supports 1:1 Generation tests.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To debug generation capabilities.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Data from runtime', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(eeg, rate) => ({})`,
    implementationCode: SIMPLE_MUSICGEN_CLIENT_IMPL
};

export const CREATE_MUSICGEN_NODE: ToolCreatorPayload = {
    name: 'Create_MusicGen_Node',
    description: 'Creates a Sink node that connects to the MusicGen MCP server.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To integrate AI Music Generation into the Stream Graph.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: false, defaultValue: 'musicgen_sink' },
        { name: 'inputs', type: 'array', description: 'Array of input node IDs.', required: false, defaultValue: [] },
        { name: 'prompt', type: 'string', description: 'Default text prompt.', required: false, defaultValue: 'ambient drone' },
        { name: 'serverUrl', type: 'string', description: 'URL of the server.', required: false },
        { name: 'config', type: 'object', description: 'Additional config.', required: false }
    ],
    implementationCode: `
        const { nodeId = 'musicgen_sink', inputs = [], prompt, serverUrl, config = {} } = args;
        
        let finalUrl = serverUrl;
        if (!finalUrl) {
            try {
                const result = await runtime.tools.run('List Managed Processes', {});
                // Look for either server variant
                const proc = result.processes?.find(p => p.processId === 'neuro_musicgen_mcp') || 
                             result.processes?.find(p => p.processId === 'adaptive_musicgen_mcp');
                if (proc) finalUrl = 'http://localhost:' + proc.port;
            } catch(e) {}
        }
        
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: nodeId,
                type: 'Sink',
                inputs: inputs,
                config: { serverUrl: finalUrl, prompt, ...config },
                state: {},
                implementation: ${JSON.stringify(MUSICGEN_NODE_IMPL)}
            });
            return { success: true, message: "MusicGen Node initialized." };
        }
        throw new Error("StreamEngine not available.");
    `
};

export const ADAPTIVE_MUSICGEN_TOOLS = [
    MUSICGEN_COHERENCE_PROTOCOL,
    SIMPLE_MUSICGEN_PROTOCOL, 
    DEPLOY_MUSICGEN_SERVER, 
    DEPLOY_MUSICGEN_NEURO_SERVER,
    CREATE_MUSICGEN_NODE
];