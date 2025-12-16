
import type { ToolCreatorPayload } from '../types';
import { CLASSICAL_PROTOCOLS } from './protocols/classical_protocols';
import { QUANTUM_PROTOCOLS } from './protocols/quantum_protocols';
import { UTILITY_PROTOCOLS } from './protocols/utility_protocols';
import { NEURO_QUEST_TOOLS } from './protocols/classical/neuro_quest';
import { GENOME_FORGE_PROTOCOL } from './protocols/classical/genome_forge';
import { ECHOES_REVERIE_PROTOCOL } from './protocols/classical/echoes_reverie';
import { ECHOES_TOOLS } from './protocols/classical/echoes/tools';
import { VISION_BENCHMARK_PROTOCOL } from './protocols/classical/vision_benchmark';
import { SPATIAL_DEPTH_PROTOCOL } from './protocols/classical/spatial_depth_benchmark';

export const PROTOCOL_TOOLS: ToolCreatorPayload[] = [
    ...CLASSICAL_PROTOCOLS,
    ...QUANTUM_PROTOCOLS,
    ...UTILITY_PROTOCOLS,
    ...NEURO_QUEST_TOOLS,
    GENOME_FORGE_PROTOCOL,
    ECHOES_REVERIE_PROTOCOL,
    ...ECHOES_TOOLS,
    VISION_BENCHMARK_PROTOCOL,
    SPATIAL_DEPTH_PROTOCOL
];