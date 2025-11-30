
import { createGraphProtocol } from '../utils';

export const SMR_FOCUS_TRAINER = createGraphProtocol({
    name: 'SMR "Aperture" Focus Trainer',
    id: 'smr_graph',
    description: `SMR/Theta Ratio training using a "Camera Lens" metaphor.`,
    purpose: 'Attention training.',
    visualComponent: 'APERTURE',
    nodes: [
        { id: 'eeg_source', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'Cz', simulationRange: [0.2, 0.8], simulationFrequencyHz: 0.5 }, implementation: '', state: {} },
        // Replaces custom logic with standard nodes for deduplication
        { id: 'inv_val', type: 'Transform', nodeType: 'Math_Multiply', inputs: ['eeg_source'], config: { factor: -1.5 }, implementation: '', state: {} },
        { id: 'offset_val', type: 'Transform', nodeType: 'Math_Add', inputs: ['inv_val'], config: { }, implementation: '', state: { lastValue: 2.0 } }, // Hacky add constant
        { id: 'smooth_ratio', type: 'Transform', nodeType: 'Signal_Smooth', inputs: ['eeg_source'], config: { alpha: 0.1 }, implementation: '', state: {} },
        { id: 'bind_focus', type: 'Sink', nodeType: 'Bind_To_Visuals', inputs: ['smooth_ratio'], config: { parameter: 'focusRatio' }, implementation: '', state: {} }
    ]
});
