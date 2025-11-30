
import type { ToolCreatorPayload } from '../../../types';
import { NEURO_QUEST_PYTHON_CODE } from './neuro_quest/backend';
import { NEURO_QUEST_UI_IMPL } from './neuro_quest/frontend';

// We inject the python code into the UI string at runtime construction
// Double escape backticks for the Python code inside the JS string
const SAFE_PYTHON_CODE = JSON.stringify(NEURO_QUEST_PYTHON_CODE).replace(/`/g, '\\\\`');
const FINAL_UI_CODE = NEURO_QUEST_UI_IMPL.replace('%%PYTHON_CODE%%', SAFE_PYTHON_CODE);

const DEPLOY_QUEST_SERVER: ToolCreatorPayload = {
    name: 'Deploy Neuro Quest Server',
    description: 'Installs the Native Python backend for Neuro Quest.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'Setup.',
    parameters: [],
    implementationCode: `
        const safeContent = ${SAFE_PYTHON_CODE};
        await runtime.tools.run('Server File Writer', { filePath: 'neuro_quest.py', content: safeContent, baseDir: 'scripts' });
        return { success: true };
    `
};

export const NEURO_QUEST_PROTOCOL: ToolCreatorPayload = {
    name: 'Neuro Quest (Native Launcher)',
    description: 'Launches the Native Python Window for Neuro Quest. High performance, direct input, elemental combat.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To play the game.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: FINAL_UI_CODE
};

export const NEURO_QUEST_TOOLS = [DEPLOY_QUEST_SERVER, NEURO_QUEST_PROTOCOL];
