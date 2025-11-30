
import { createGraphProtocol } from '../utils';
import { UNIVERSAL_AUDIO_NODE_IMPL } from '../../common_node_impls';

export const ADAPTIVE_ENTRAINMENT_PROTOCOL = createGraphProtocol({
    name: 'Adaptive Focus Entrainment',
    id: 'entrainment_graph',
    description: 'Closed-loop Binaural Beats that adapt frequency to your focus level.',
    purpose: 'Dynamic Entrainment.',
    visualComponent: 'BRAIN_3D',
    scientificDossier: {
        title: "Closed-Loop Auditory Beat Stimulation",
        hypothesis: "Dynamic frequency adjustment enhances entrainment.",
        mechanism: "ASSR via carrier modulation.",
        targetNeuralState: "SMR (12-15Hz).",
        citations: ["Lane, J. D., et al. (1998)."],
        relatedKeywords: ["Binaural Beats", "ASSR"]
    },
    nodes: [
        { id: 'eeg_source_1', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'Fz', simulationRange: [0.1, 0.9], simulationFrequencyHz: 0.2 }, implementation: '', state: {} },
        // Logic to calculate beat: Low eeg -> 18Hz, High -> 12Hz
        { id: 'calc_beat', type: 'Transform', inputs: ['eeg_source_1'], implementation: "const v=inputs['eeg_source_1']||0; return { output: v < 0.3 ? 18 : (v > 0.7 ? 7.83 : 12) };", config: {}, state: {} },
        { id: 'audio_out', type: 'Sink', inputs: ['calc_beat'], implementation: UNIVERSAL_AUDIO_NODE_IMPL, config: { carrierHz: 200, mode: 'binaural' }, state: {} },
        { id: 'bind_beat', type: 'Sink', nodeType: 'Bind_To_Visuals', inputs: ['calc_beat'], config: { parameter: 'beat' }, implementation: '', state: {} }
    ]
});
