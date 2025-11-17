import type { ToolCreatorPayload } from '../types';
import { CLASSICAL_PROTOCOLS } from './protocols/classical_protocols';
import { QUANTUM_PROTOCOLS } from './protocols/quantum_protocols';
import { UTILITY_PROTOCOLS } from './protocols/utility_protocols';


export const PROTOCOL_TOOLS: ToolCreatorPayload[] = [
    ...CLASSICAL_PROTOCOLS,
    ...QUANTUM_PROTOCOLS,
    ...UTILITY_PROTOCOLS,
];
