// bootstrap/protocols/classical_protocols.ts
import type { ToolCreatorPayload } from '../../types';
import { EXAMPLE_PROTOCOL } from './classical/example_protocol';
import { SMR_FOCUS_TRAINER } from './classical/smr_focus_trainer';
import { ALPHA_ASYMMETRY_MOOD_BALANCER } from './classical/alpha_asymmetry_balancer';
import { THETA_GAMMA_MEMORY_SYNC } from './classical/theta_gamma_sync';
import { NEURAL_SYNCHRONY_PROTOCOL } from './classical/neural_synchrony';


export const CLASSICAL_PROTOCOLS: ToolCreatorPayload[] = [
    EXAMPLE_PROTOCOL,
    SMR_FOCUS_TRAINER,
    ALPHA_ASYMMETRY_MOOD_BALANCER,
    THETA_GAMMA_MEMORY_SYNC,
    NEURAL_SYNCHRONY_PROTOCOL,
];