
import type { ToolCreatorPayload } from '../types';

import { SERVER_MANAGEMENT_TOOLS } from '../framework/mcp';
import { AUTOMATION_TOOLS } from '../framework/automation';
import { WORKFLOW_TOOLS } from './workflow_tools';
import { RESEARCH_TOOLS } from './research_tools';
import { DATA_RECORDER_TOOLS } from './data_recorder_tools';
import { DIAGNOSTIC_TOOLS } from './diagnostic_tools';
import { PROTOCOL_TOOLS } from './protocol_tools';
import { FIRMWARE_TOOLS } from './firmware_tools';
import { SYNERGY_FORGE_UI_CODE } from './ui_components';

const SYNERGY_FORGE_TOOLS: ToolCreatorPayload[] = [{
    name: 'Neurofeedback Engine Main UI',
    description: 'The main user interface for the Neurofeedback Engine, showing generation controls, a library of created protocols, and a player to run them.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: "To provide a simple, 'fast food' style interface for generating and running novel neurofeedback protocols.",
    parameters: [
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: true },
        { name: 'isSwarmRunning', type: 'boolean', description: 'Indicates if the agent swarm is active.', required: true },
        { name: 'startSwarmTask', type: 'object', description: 'Function to initiate a swarm task.', required: true },
        { name: 'handleStopSwarm', type: 'object', description: 'Function to stop the swarm task.', required: true },
        { name: 'models', type: 'array', description: 'List of available AI models.', required: true },
        { name: 'ollamaModels', type: 'array', description: 'List of available Ollama models.', required: true },
        { name: 'ollamaState', type: 'object', description: 'State of Ollama models fetching (loading, error).', required: true },
        { name: 'fetchOllamaModels', type: 'object', description: 'Function to fetch Ollama models.', required: true },
        { name: 'selectedModel', type: 'object', description: 'The currently selected AI model.', required: true },
        { name: 'setSelectedModel', type: 'object', description: 'Function to set the selected AI model.', required: true },
        { name: 'validatedSources', type: 'array', description: 'List of validated research sources.', required: true },
        { name: 'setValidatedSources', type: 'object', description: 'Function to update the list of validated sources.', required: true },
        { name: 'scriptExecutionState', type: 'string', description: 'The current state of the scripted workflow execution.', required: true },
        { name: 'currentScriptStepIndex', type: 'number', description: 'The index of the currently executing step in the workflow.', required: true },
        { name: 'stepStatuses', type: 'array', description: 'An array of statuses for each step in the workflow.', required: true },
        { name: 'currentUserTask', type: 'object', description: 'The currently active task, which may contain the script.', required: true },
        { name: 'toggleScriptPause', type: 'object', description: 'Function to pause or resume the workflow.', required: true },
        { name: 'stepForward', type: 'object', description: 'Function to execute the next step while paused.', required: true },
        { name: 'stepBackward', type: 'object', description: 'Function to move back to the previous step while paused.', required: true },
        { name: 'runFromStep', type: 'object', description: 'Function to restart the workflow from a specific step.', required: true },
        { name: 'subStepProgress', type: 'object', description: 'The progress object for the current workflow step.', required: true },
        { name: 'apiConfig', type: 'object', description: 'The current API configuration.', required: true },
        { name: 'setApiConfig', type: 'object', description: 'Function to update the API configuration.', required: true },
    ],
    implementationCode: SYNERGY_FORGE_UI_CODE,
}];

export const BOOTSTRAP_TOOL_PAYLOADS: ToolCreatorPayload[] = [
    ...AUTOMATION_TOOLS,
    ...SERVER_MANAGEMENT_TOOLS,
    ...SYNERGY_FORGE_TOOLS,
    ...WORKFLOW_TOOLS,
    ...RESEARCH_TOOLS,
    ...DATA_RECORDER_TOOLS,
    ...DIAGNOSTIC_TOOLS,
    ...PROTOCOL_TOOLS,
    ...FIRMWARE_TOOLS,
];