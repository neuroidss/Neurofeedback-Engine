
// bootstrap/protocols/classical_protocols.ts
import type { ToolCreatorPayload } from '../../types';
import { EXAMPLE_PROTOCOL } from './classical/example_protocol';
import { SMR_FOCUS_TRAINER } from './classical/smr_focus_trainer';
import { ALPHA_ASYMMETRY_MOOD_BALANCER } from './classical/alpha_asymmetry_balancer';
import { THETA_GAMMA_MEMORY_SYNC } from './classical/theta_gamma_sync';
import { NEURAL_SYNCHRONY_PROTOCOL } from './classical/neural_synchrony';
import { STREAM_ALPHA_LEVITATOR } from './stream_alpha';
import { CAMERA_BIOFEEDBACK_PROTOCOL } from './classical/camera_biofeedback';
import { ADAPTIVE_ENTRAINMENT_PROTOCOL } from './classical/adaptive_entrainment'; 
import { NEURO_AUDIO_STUDIO_PROTOCOL } from './classical/neuro_audio_studio'; 
import { NEURO_AURA_DEMO_PROTOCOL } from './classical/neuro_aura_demo';
import { ADAPTIVE_MUSICGEN_TOOLS } from './classical/musicgen_tools'; 
import { NEURO_WORLD_TOOLS } from './classical/neuro_world';


export const CLASSICAL_PROTOCOLS: ToolCreatorPayload[] = [
    ...ADAPTIVE_MUSICGEN_TOOLS,
    ...NEURO_WORLD_TOOLS,
    NEURO_AURA_DEMO_PROTOCOL,
    NEURO_AUDIO_STUDIO_PROTOCOL,
    CAMERA_BIOFEEDBACK_PROTOCOL, 
    NEURAL_SYNCHRONY_PROTOCOL, 
    STREAM_ALPHA_LEVITATOR, 
    ADAPTIVE_ENTRAINMENT_PROTOCOL, 
    EXAMPLE_PROTOCOL,
    SMR_FOCUS_TRAINER,
    ALPHA_ASYMMETRY_MOOD_BALANCER,
    THETA_GAMMA_MEMORY_SYNC,
];
