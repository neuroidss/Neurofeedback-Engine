
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
import { ADAPTIVE_ENTRAINMENT_PROTOCOL } from './classical/adaptive_entrainment'; 
import { NEURO_AUDIO_STUDIO_PROTOCOL } from './classical/neuro_audio_studio'; // Imported


export const CLASSICAL_PROTOCOLS: ToolCreatorPayload[] = [
    NEURO_AUDIO_STUDIO_PROTOCOL, // Zero-Hardware Entry Point (Top Priority)
    CAMERA_BIOFEEDBACK_PROTOCOL, 
    CAMERA_BIOFEEDBACK_GRAPH_PROTOCOL,
    NEURAL_SYNCHRONY_PROTOCOL, 
    NEURAL_SYNCHRONY_GRAPH_PROTOCOL,
    STREAM_ALPHA_LEVITATOR, 
    ADAPTIVE_ENTRAINMENT_PROTOCOL, 
    EXAMPLE_PROTOCOL,
    SMR_FOCUS_TRAINER,
    ALPHA_ASYMMETRY_MOOD_BALANCER,
    THETA_GAMMA_MEMORY_SYNC,
];
