
import { NeuroBusService } from './neuroBus';

// Type definition for a Node Function
type NodeFn = (inputs: Record<string, any>, config: Record<string, any>, state: any, bus: NeuroBusService) => Promise<{ output?: any, state?: any }>;

export const NATIVE_NODE_LIBRARY: Record<string, NodeFn> = {
    'Math_Multiply': async (inputs, config) => {
        const factor = config.factor ?? 1;
        let val = Object.values(inputs)[0] ?? 0;
        if (config.property && val && typeof val === 'object') val = val[config.property] ?? 0;
        else if (val && typeof val === 'object') { const v = Object.values(val); if(v.length && typeof v[0]==='number') val=v[0]; }
        return { output: (typeof val === 'number' ? val : 0) * factor };
    },
    'Math_Divide': async (inputs) => {
        const vals = Object.values(inputs);
        let n=vals[0]??0, d=vals[1]??1;
        if(n&&typeof n==='object')n=Object.values(n)[0]??0;
        if(d&&typeof d==='object')d=Object.values(d)[0]??1;
        return { output: (typeof n==='number'?n:0) / (Math.abs(d)<1e-5?1e-5:d) };
    },
    'Math_Add': async (inputs) => {
        let sum=0; 
        for(let v of Object.values(inputs)) {
            if(v&&typeof v==='object') v=Object.values(v)[0];
            if(typeof v==='number') sum+=v;
        }
        return { output: sum };
    },
    'Math_Subtract': async (inputs) => {
        const v=Object.values(inputs);
        let a=v[0]??0, b=v[1]??0;
        if(typeof a==='object') a=Object.values(a)[0]??0;
        if(typeof b==='object') b=Object.values(b)[0]??0;
        return { output: a-b };
    },
    'Math_Abs': async (inputs) => {
        let v=Object.values(inputs)[0]??0;
        if(typeof v==='object') v=Object.values(v)[0]??0;
        return { output: Math.abs(typeof v==='number'?v:0) };
    },
    'Math_Clamp': async (inputs, config) => {
        let v=Object.values(inputs)[0]??0;
        if(typeof v==='object') v=Object.values(v)[0]??0;
        return { output: Math.max(config.min??0, Math.min(config.max??1, typeof v==='number'?v:0)) };
    },
    'Math_Threshold': async (inputs, config) => {
        let v=Object.values(inputs)[0]??0;
        if(config.property && v && typeof v==='object') v=v[config.property]??0;
        else if(typeof v==='object') v=Object.values(v)[0]??0;
        const t = config.threshold ?? 0.5;
        const pass = (config.comparison==='<' ? v<t : v>t);
        return { output: pass ? (config.output_true??1) : (config.output_false??0) };
    },
    'Signal_Smooth': async (inputs, config, state) => {
        const alpha = config.alpha || 0.1;
        let cur = Object.values(inputs)[0] ?? 0;
        if (config.property && cur && typeof cur === 'object') cur = cur[config.property] ?? 0;
        else if (typeof cur === 'object') cur = Object.values(cur)[0] ?? 0;
        if (typeof cur !== 'number') cur = 0;
        const n = (state.lastValue||cur) * (1 - alpha) + cur * alpha;
        return { output: n, state: { ...state, lastValue: n } };
    },
    'Signal_Oscillator': async (inputs, config) => {
        const f = config.frequency || config.frequencyHz || 1;
        const a = config.amplitude || 1;
        const o = config.offset || 0;
        return { output: Math.sin(Date.now()/1000 * f * 2 * Math.PI) * a + o };
    },
    'Logic_IfElse': async (inputs, config) => {
        const vals = Object.values(inputs);
        let cond = vals[0] ?? 0;
        if(config.condition_input_index !== undefined) cond = vals[config.condition_input_index] ?? 0;
        if(config.condition_property && cond && typeof cond === 'object') cond = cond[config.condition_property] ?? 0;
        else if(typeof cond === 'object') cond = Object.values(cond)[0] ?? 0;
        
        let isTrue = (config.condition_value !== undefined) ? (cond == config.condition_value) : (cond > 0 || cond === true);
        const valA = config.valueA || config.ifTrue || 'gold';
        const valB = config.valueB || config.ifFalse || 'cyan';
        return { output: isTrue ? valA : valB };
    },
    'Create_EEG_Source': async (inputs, config, state) => {
        // Inputs from the NeuroBus frame buffer (injected by StreamEngine)
        const buffer = inputs._frameBuffer?.['protocol_runner'];
        let signalVal = state.lastValue ?? 0;
        let hasRealData = state.hasRealData || false;
        const targetChName = config.channel || 'Cz';

        if (buffer && buffer.length > 0) {
            for (let i = buffer.length - 1; i >= 0; i--) {
                const payload = buffer[i].payload;
                if (!payload) continue;
                const keys = Object.keys(payload);
                let targetKey = keys.find(k => {
                    if (k === targetChName) return true;
                    if (k.endsWith(':' + targetChName)) return true;
                    const parts = k.split(':');
                    return (parts.length > 1 ? parts[1] : parts[0]).toLowerCase() === targetChName.toLowerCase();
                });
                if (targetKey && payload[targetKey] !== undefined) {
                    const rawData = payload[targetKey];
                    const rawVal = Array.isArray(rawData) ? rawData[rawData.length - 1] : rawData;
                    signalVal = Math.min(1, Math.abs(rawVal) / 50); 
                    hasRealData = true;
                    break;
                }
            }
        }
        // Simulation Fallback
        if (!hasRealData) {
            const min = (config.simulationRange?.[0]) ?? 0;
            const max = (config.simulationRange?.[1]) ?? 0.1;
            const freq = config.simulationFrequencyHz || 1;
            const time = Date.now() / 1000;
            const norm = (Math.sin(time * freq * 2 * Math.PI) + 1) / 2; 
            signalVal = min + (norm * (max - min));
        }
        return { output: signalVal, state: { ...state, lastValue: signalVal, hasRealData } };
    },
    'Bind_To_Visuals': async (inputs, config, state, bus) => {
        // Robust input retrieval
        let val = Object.values(inputs)[0];
        if (config.property && val && typeof val === 'object') val = val[config.property];
        if (val && typeof val === 'object' && val.output !== undefined) val = val.output;

        if (val !== undefined && config.parameter) {
            bus.publish({
                timestamp: Date.now(),
                sourceId: 'visual_binder',
                type: 'System',
                payload: { visualUpdate: { [config.parameter]: val } }
            });
        }
        return { output: val };
    }
};
