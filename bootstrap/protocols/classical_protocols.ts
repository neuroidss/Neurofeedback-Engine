
// bootstrap/protocols/classical_protocols.ts
import type { ToolCreatorPayload } from '../../types';
import { ADAPTIVE_MUSICGEN_TOOLS } from './classical/musicgen_tools'; 

// We have purged:
// - Neuro World (Superseded by Neuro Quest)
// - Neuro Audio Studio (Superseded by Neuro Quest Audio)
// - Neuro Aura (Legacy Demo)
// - Camera Biofeedback (Legacy)
// - Stream Alpha / Neural Synchrony (Legacy)
// - Classical 2D Protocols (SMR, Alpha Asymmetry, Theta Gamma)

export const CLASSICAL_PROTOCOLS: ToolCreatorPayload[] = [
    ...ADAPTIVE_MUSICGEN_TOOLS,
];
