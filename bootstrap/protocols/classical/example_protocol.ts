
import { createGraphProtocol } from '../utils';

export const EXAMPLE_PROTOCOL = createGraphProtocol({
    name: 'Example: Alpha Wave Relaxation',
    id: 'example_graph',
    description: 'Visualizes Alpha power growth.',
    purpose: 'Relaxation.',
    visualComponent: 'CIRCLE',
    nodes: [
        { id: 'eeg_source_1', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'Cz', simulationRange: [0, 1], simulationFrequencyHz: 0.5 }, implementation: '', state: {} },
        { id: 'alpha_smooth', type: 'Transform', nodeType: 'Signal_Smooth', inputs: ['eeg_source_1'], config: { alpha: 0.1 }, implementation: '', state: {} },
        { id: 'bind_alpha', type: 'Sink', nodeType: 'Bind_To_Visuals', inputs: ['alpha_smooth'], config: { parameter: 'alphaRatio' }, implementation: '', state: {} }
    ]
});
