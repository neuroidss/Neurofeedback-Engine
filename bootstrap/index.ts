import type { ToolCreatorPayload } from '../types';

import { SERVER_MANAGEMENT_TOOLS } from '../framework/mcp';
import { AUTOMATION_TOOLS } from '../framework/automation';
import { WORKFLOW_TOOLS } from './workflow_tools';
import { RESEARCH_TOOLS } from './research_tools';
import { DATA_RECORDER_TOOLS } from './data_recorder_tools';
import { DIAGNOSTIC_TOOLS } from './diagnostic_tools';
import { NEUROFEEDBACK_TOOLS } from './neurofeedback_tools';
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
    ...NEUROFEEDBACK_TOOLS,
];
