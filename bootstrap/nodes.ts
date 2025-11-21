
import type { ToolCreatorPayload } from '../types';

export const STANDARD_NODES = {
    'Math_Multiply': {
        description: 'Multiplies input by a factor. Supports config.property to extract from object inputs.',
        code: `
            const factor = config.factor || 1;
            let val = Object.values(inputs)[0] ?? 0;
            if (config.property && val && typeof val === 'object') {
                val = val[config.property] ?? 0;
            } else if (val && typeof val === 'object') {
                const values = Object.values(val);
                if (values.length > 0 && typeof values[0] === 'number') val = values[0];
            }
            if (typeof val !== 'number') val = 0;
            return { output: val * factor };
        `
    },
    'Math_Divide': {
        description: 'Divides input 0 by input 1 (Input0 / Input1).',
        code: `
            const vals = Object.values(inputs);
            let num = vals[0] ?? 0;
            let den = vals[1] ?? 1;
            
            if (num && typeof num === 'object') num = Object.values(num)[0] ?? 0;
            if (den && typeof den === 'object') den = Object.values(den)[0] ?? 1;
            
            if (typeof num !== 'number') num = 0;
            if (typeof den !== 'number') den = 1;
            
            if (Math.abs(den) < 0.00001) den = 0.00001;
            return { output: num / den };
        `
    },
    'Math_Add': {
        description: 'Adds all inputs.',
        code: `
            const vals = Object.values(inputs);
            let sum = 0;
            for (let val of vals) {
                if (val && typeof val === 'object') val = Object.values(val)[0];
                if (typeof val === 'number') sum += val;
            }
            return { output: sum };
        `
    },
    'Math_Subtract': {
        description: 'Subtracts input 1 from input 0.',
        code: `
            const vals = Object.values(inputs);
            let a = vals[0] ?? 0;
            let b = vals[1] ?? 0;
            
            if (a && typeof a === 'object') a = Object.values(a)[0] ?? 0;
            if (b && typeof b === 'object') b = Object.values(b)[0] ?? 0;
            
            return { output: (typeof a === 'number' ? a : 0) - (typeof b === 'number' ? b : 0) };
        `
    },
    'Math_Abs': {
        description: 'Returns absolute value of input.',
        code: `
            let val = Object.values(inputs)[0] ?? 0;
            if (val && typeof val === 'object') val = Object.values(val)[0] ?? 0;
            if (typeof val !== 'number') val = 0;
            return { output: Math.abs(val) };
        `
    },
    'Math_BandPower': {
        description: 'Calculates power in a frequency band. (Mock: Returns abs value or energy of input).',
        code: `
            // Real FFT requires a window of data. 
            // For this lightweight node, we approximate "Power" as the squared amplitude of the incoming signal signal
            // or simply pass through if it's already a metric.
            let val = Object.values(inputs)[0] ?? 0;
            if (val && typeof val === 'object') val = Object.values(val)[0] ?? 0;
            if (typeof val !== 'number') val = 0;
            // Simple energy proxy
            return { output: Math.abs(val) }; 
        `
    },
    'Math_Clamp': {
        description: 'Clamps input between min and max.',
        code: `
            let val = Object.values(inputs)[0] ?? 0;
            if (val && typeof val === 'object') val = Object.values(val)[0] ?? 0;
            const min = config.min ?? 0;
            const max = config.max ?? 1;
            return { output: Math.max(min, Math.min(max, val)) };
        `
    },
    'Math_Threshold': {
        description: 'Returns 1 if input > threshold, else 0.',
        code: `
            const threshold = config.threshold || 0.5;
            let val = Object.values(inputs)[0] ?? 0;
            if (config.property && val && typeof val === 'object') {
                val = val[config.property] ?? 0;
            } else if (val && typeof val === 'object') {
                const values = Object.values(val);
                if (values.length > 0 && typeof values[0] === 'number') val = values[0];
            }
            if (typeof val !== 'number') val = 0;
            
            // Handle comparison type if provided
            const comp = config.comparison || '>';
            let result = false;
            if (comp === '>' || comp === 'greater_than') result = val > threshold;
            else if (comp === '<' || comp === 'less_than') result = val < threshold;
            else result = val > threshold;

            const outTrue = config.output_true ?? 1;
            const outFalse = config.output_false ?? 0;

            return { output: result ? outTrue : outFalse };
        `
    },
    'Signal_Smooth': {
        description: 'Applies an exponential moving average filter.',
        code: `
            const alpha = config.alpha || 0.1;
            let current = Object.values(inputs)[0] ?? 0;
            if (config.property && current && typeof current === 'object') {
                current = current[config.property] ?? 0;
            } else if (current && typeof current === 'object') {
                const values = Object.values(current);
                if (values.length > 0 && typeof values[0] === 'number') current = values[0];
            }
            if (typeof current !== 'number') current = 0;
            
            const prev = state.lastValue || current;
            const next = prev * (1 - alpha) + current * alpha;
            state.lastValue = next;
            return { output: next, state };
        `
    },
    'Logic_IfElse': {
        description: 'Outputs valueA if condition is true, else valueB.',
        code: `
            // Input 0 is usually the condition
            const vals = Object.values(inputs);
            let condition = vals[0] ?? 0;
            
            // Config might specify which input index is condition
            if (config.condition_input_index !== undefined) condition = vals[config.condition_input_index] ?? 0;

            if (config.condition_property && condition && typeof condition === 'object') {
                condition = condition[config.condition_property] ?? 0;
            } else if (condition && typeof condition === 'object') {
                const values = Object.values(condition);
                if (values.length > 0 && typeof values[0] === 'number') condition = values[0];
            }
            
            // Check for boolean true or number > 0 or match condition_value
            let isTrue = false;
            if (config.condition_value !== undefined) {
                isTrue = condition == config.condition_value;
            } else {
                isTrue = (typeof condition === 'boolean' && condition) || (typeof condition === 'number' && condition > 0);
            }
            
            // Support snake_case keys (e.g. if_true) often generated by AI models
            let valA = config.valueA || config.ifTrue || config.if_true || config.output_true || config.if_true_value || 'gold';
            let valB = config.valueB || config.ifFalse || config.if_false || config.output_false || config.if_false_value || 'cyan';
            
            return { output: isTrue ? valA : valB };
        `
    },
    'Logic_Select': {
        description: 'Selects the first valid input from the list.',
        code: `
            const vals = Object.values(inputs);
            let selected = 0;
            for(const v of vals) {
                if (v !== undefined && v !== null) {
                    selected = v;
                    break;
                }
            }
            // Auto-unwrap
            if (selected && typeof selected === 'object') {
                 const sub = Object.values(selected)[0];
                 if (typeof sub === 'number') selected = sub;
            }
            return { output: selected };
        `
    },
    'Signal_Oscillator': {
        description: 'Generates a sine wave signal.',
        code: `
            const freq = config.frequency || config.frequencyHz || 1;
            const amp = config.amplitude || 1;
            const offset = config.offset || 0;
            const time = Date.now() / 1000;
            return { output: Math.sin(time * freq * 2 * Math.PI) * amp + offset };
        `
    },
    'Signal_SimulateOscillator': {
        description: 'Alias for Oscillator',
        code: `
            const freq = config.frequency || config.frequencyHz || 1;
            const amp = config.amplitude || 1;
            const offset = config.offset || 0;
            const time = Date.now() / 1000;
            return { output: Math.sin(time * freq * 2 * Math.PI) * amp + offset };
        `
    }
};

const CREATE_STANDARD_NODE: ToolCreatorPayload = {
    name: 'Create_Standard_Node',
    description: 'Creates a standard logic or math node in the stream graph. Required: nodeType (e.g., "Math_Multiply", "Signal_Smooth").',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To provide ready-to-use signal processing nodes for the stream graph, enabling rapid construction of logic pipelines.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID for the node.', required: true },
        { name: 'nodeType', type: 'string', description: 'Type of standard node: "Math_Multiply", "Math_Threshold", "Signal_Smooth", "Logic_IfElse", "Math_Divide", "Math_Add", "Signal_Oscillator".', required: true },
        { name: 'inputs', type: 'array', description: 'List of input node IDs.', required: true },
        { name: 'config', type: 'object', description: 'Configuration parameters (e.g., { factor: 2.0, property: "smile" }).', required: false }
    ],
    implementationCode: `
        const { nodeId, nodeType, inputs, config } = args;
        const lib = ${JSON.stringify(STANDARD_NODES)};
        
        // Resilience: Allow 'type' as alias for 'nodeType' since agents confuse them
        // Also check config.type (common hallucination)
        const effectiveType = nodeType || args.type || (config && config.type);

        if (!effectiveType || !lib[effectiveType]) {
            const validTypes = Object.keys(lib).join(', ');
            throw new Error("Unknown standard node type: '" + effectiveType + "'. Valid types are: " + validTypes);
        }
        
        // SANITIZE INPUTS: AI sometimes outputs object {"in":"id"} instead of array ["id"]
        let cleanInputs = inputs;
        if (cleanInputs && !Array.isArray(cleanInputs)) {
            if (typeof cleanInputs === 'object') {
                cleanInputs = Object.values(cleanInputs);
            } else {
                cleanInputs = [];
            }
        }
        
        // Filter out any non-string inputs (like constant value objects) to avoid crashing the engine
        cleanInputs = cleanInputs.filter(i => typeof i === 'string');

        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: nodeId,
                type: 'Transform',
                inputs: cleanInputs || [], 
                config: config || {},
                state: {},
                implementation: lib[effectiveType].code
            });
            return { success: true, message: \`Standard node '\${nodeId}' (\${effectiveType}) created.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

export const NODE_TOOLS = [CREATE_STANDARD_NODE];
