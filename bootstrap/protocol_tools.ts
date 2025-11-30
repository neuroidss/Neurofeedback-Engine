
import type { ToolCreatorPayload } from '../types';
import { CLASSICAL_PROTOCOLS } from './protocols/classical_protocols';
import { QUANTUM_PROTOCOLS } from './protocols/quantum_protocols';
import { UTILITY_PROTOCOLS } from './protocols/utility_protocols';
import { NEURO_QUEST_TOOLS } from './protocols/classical/neuro_quest';


export const PROTOCOL_TOOLS: ToolCreatorPayload[] = [
    ...CLASSICAL_PROTOCOLS,
    ...QUANTUM_PROTOCOLS,
    ...UTILITY_PROTOCOLS,
    ...NEURO_QUEST_TOOLS,
];
