
import { createGraphProtocol } from '../utils';

export const STREAM_ALPHA_LEVITATOR = createGraphProtocol({
    name: 'Stream: Alpha Levitator',
    description: '[GENESIS DEMO] A graph-based protocol connecting Simulated EEG -> Smooth -> Visuals.',
    id: 'alpha_levitator_graph',
    purpose: 'To demonstrate the Stream Engine capabilities.',
    visualComponent: 'CIRCLE',
    nodes: [
        { id: 'source_eeg', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'Cz', simulationRange: [0, 0.5], simulationFrequencyHz: 0.3 }, implementation: '', state: {} },
        { id: 'filter_smooth', type: 'Transform', nodeType: 'Signal_Smooth', inputs: ['source_eeg'], config: { alpha: 0.05 }, implementation: '', state: {} },
        { id: 'bind_intensity', type: 'Sink', nodeType: 'Bind_To_Visuals', inputs: ['filter_smooth'], config: { parameter: 'intensity' }, implementation: '', state: {} },
        // Custom logic for specific color mapping is fine to keep as tiny implementation string
        { id: 'bind_color', type: 'Transform', inputs: ['filter_smooth'], implementation: "const val = inputs['filter_smooth'] || 0; const hue = 200 + (val * 40); const color = 'hsl(' + hue + ', 100%, 50%)'; bus.publish({ type: 'System', sourceId: 'binder_color', payload: { visualUpdate: { globalColor: color } } }); return { output: color };", config: {}, state: {} }
    ]
});
