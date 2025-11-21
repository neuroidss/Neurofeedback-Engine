
// bootstrap/protocols/classical_protocols.ts
import type { ToolCreatorPayload } from '../../types';
import { EXAMPLE_PROTOCOL } from './classical/example_protocol';
import { SMR_FOCUS_TRAINER } from './classical/smr_focus_trainer';
import { ALPHA_ASYMMETRY_MOOD_BALANCER } from './classical/alpha_asymmetry_balancer';
import { THETA_GAMMA_MEMORY_SYNC } from './classical/theta_gamma_sync';
import { NEURAL_SYNCHRONY_PROTOCOL } from './classical/neural_synchrony';
import { STREAM_ALPHA_LEVITATOR } from './stream_alpha';
import { CAMERA_BIOFEEDBACK_PROTOCOL } from './classical/camera_biofeedback';
import { CAMERA_BIOFEEDBACK_GRAPH_PROTOCOL } from './classical/camera_biofeedback_graph';
import { NEURAL_SYNCHRONY_GRAPH_PROTOCOL } from './classical/neural_synchrony_graph';


export const CLASSICAL_PROTOCOLS: ToolCreatorPayload[] = [
    CAMERA_BIOFEEDBACK_PROTOCOL, // V1 (Classical)
    CAMERA_BIOFEEDBACK_GRAPH_PROTOCOL, // V2 (Graph)
    NEURAL_SYNCHRONY_PROTOCOL, // V1 (Classical)
    NEURAL_SYNCHRONY_GRAPH_PROTOCOL, // V2 (Graph)
    STREAM_ALPHA_LEVITATOR, 
    EXAMPLE_PROTOCOL,
    SMR_FOCUS_TRAINER,
    ALPHA_ASYMMETRY_MOOD_BALANCER,
    THETA_GAMMA_MEMORY_SYNC,
];
