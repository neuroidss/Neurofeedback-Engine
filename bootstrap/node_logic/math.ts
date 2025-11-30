
// bootstrap/node_logic/math.ts

export const SMR_RATIO_LOGIC = `
    const val = inputs['eeg_source'] || 0;
    // SMR (12-15Hz) / Theta (4-8Hz) Ratio Approximation
    // Maps normalized input (0-1) to a ratio (0.5-2.0)
    let ratio = 2.0 - (typeof val === 'number' ? val * 1.5 : 0.5); 
    
    // Smooth
    if (state.smoothRatio === undefined) state.smoothRatio = 1.0;
    state.smoothRatio += (ratio - state.smoothRatio) * 0.1;
    
    bus.publish({ type: 'System', sourceId: 'smr_logic', payload: { visualUpdate: { focusRatio: state.smoothRatio } } });
    return { output: state.smoothRatio, state };
`;

export const ASYMMETRY_LOGIC = `
    // Frontal Alpha Asymmetry (F4 - F3) / (F4 + F3)
    const left = Math.abs(inputs['source_f3'] || 0);
    const right = Math.abs(inputs['source_f4'] || 0);
    
    let index = 0;
    const sum = right + left;
    if (sum > 0.001) index = (right - left) / sum;
    
    // Smooth
    if (state.val === undefined) state.val = 0;
    state.val += (index - state.val) * 0.05;
    
    bus.publish({ type: 'System', sourceId: 'asymmetry_logic', payload: { visualUpdate: { asymmetryIndex: state.val } } });
    return { output: state.val, state };
`;

export const PAC_LOGIC_IMPL = `
    // Theta Phase -> Gamma Amplitude Coupling
    const eeg = inputs['source_fz'] || 0;
    // Simulation: Strength proportional to signal variance/amplitude
    let strength = Math.min(1, Math.abs(eeg) * 2); 
    
    if (state.val === undefined) state.val = 0;
    state.val += (strength - state.val) * 0.1;

    bus.publish({ type: 'System', sourceId: 'pac_logic', payload: { visualUpdate: { pacStrength: state.val } } });
    return { output: state.val, state };
`;

export const ALPHA_RELAX_LOGIC = `
    const input = inputs['eeg_source'];
    let val = (typeof input === 'number') ? input : (Math.sin(Date.now()/1000)+1)/2;
    
    if (state.val === undefined) state.val = 0;
    state.val += (val - state.val) * 0.1;
    
    bus.publish({ type: 'System', sourceId: 'alpha_logic', payload: { visualUpdate: { alphaRatio: state.val } } });
    return { output: state.val, state };
`;

export const FOCUS_CALC_IMPL = `
    const eeg = inputs['eeg_source_1'];
    let val = (typeof eeg === 'number') ? eeg : (Math.sin(Date.now()/2000)+1)/2;

    let targetBeat = 10; 
    let stateLabel = 'Flow';
    
    if (val < 0.3) { targetBeat = 18; stateLabel = 'Boosting Alertness'; }
    else if (val > 0.7) { targetBeat = 7.83; stateLabel = 'Grounding'; }
    else { targetBeat = 12; stateLabel = 'Maintaining SMR'; }

    bus.publish({ type: 'System', sourceId: 'entrainment_logic', payload: { visualUpdate: { textOverlay: stateLabel + ' (' + targetBeat + 'Hz)' } } });
    return { output: targetBeat };
`;
