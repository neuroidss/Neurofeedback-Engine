
import { createGraphProtocol } from '../utils';

export const THETA_GAMMA_MEMORY_SYNC = createGraphProtocol({
    name: 'Theta-Gamma Memory Sync',
    id: 'pac_graph',
    description: "Visualizes Theta-Gamma coupling (PAC) for memory training.",
    purpose: 'Working Memory training.',
    visualComponent: 'PARTICLES',
    nodes: [
        { id: 'source_fz', type: 'Source', nodeType: 'Create_EEG_Source', inputs: [], config: { channel: 'Fz', simulationRange: [0.1, 0.9], simulationFrequencyHz: 0.33 }, implementation: '', state: {} },
        { id: 'pac_strength', type: 'Transform', nodeType: 'Signal_Smooth', inputs: ['source_fz'], config: { alpha: 0.1 }, implementation: '', state: {} },
        { id: 'bind_pac', type: 'Sink', nodeType: 'Bind_To_Visuals', inputs: ['pac_strength'], config: { parameter: 'pacStrength' }, implementation: '', state: {} }
    ]
});
