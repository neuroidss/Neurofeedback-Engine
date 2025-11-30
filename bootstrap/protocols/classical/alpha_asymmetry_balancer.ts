
import { createGraphProtocol } from '../utils';

export const ALPHA_ASYMMETRY_MOOD_BALANCER = createGraphProtocol({
    name: 'Alpha Asymmetry Mood Balancer',
    id: 'asymmetry_graph',
    description: 'Trains positive affect by balancing Left vs Right frontal alpha power.',
    purpose: 'Emotional regulation.',
    visualComponent: 'GRADIENT',
    nodes: [
        { id: 'source_f3', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'F3', simulationRange: [0.2, 0.8], simulationFrequencyHz: 0.2 }, implementation: '', state: {} },
        { id: 'source_f4', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'F4', simulationRange: [0.2, 0.8], simulationFrequencyHz: 0.3 }, implementation: '', state: {} },
        // (R - L) / (R + L) logic implemented with standard nodes would be verbose, using simplified single custom node for math efficiency here
        // BUT for strict deduplication, we can assume the runtime handles simple math or we inject a tiny custom
        { id: 'asymmetry_calc', type: 'Transform', inputs: ['source_f3', 'source_f4'], implementation: "const l = inputs['source_f3']||0; const r = inputs['source_f4']||0; return { output: (r-l)/(r+l+0.001) };", config: {}, state: {} },
        { id: 'smooth_idx', type: 'Transform', nodeType: 'Signal_Smooth', inputs: ['asymmetry_calc'], config: { alpha: 0.05 }, implementation: '', state: {} },
        { id: 'bind_idx', type: 'Sink', nodeType: 'Bind_To_Visuals', inputs: ['smooth_idx'], config: { parameter: 'asymmetryIndex' }, implementation: '', state: {} }
    ]
});
