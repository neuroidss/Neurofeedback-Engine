
import type { ToolCreatorPayload } from '../types';

const DEPLOY_STREAM_GRAPH: ToolCreatorPayload = {
    name: 'Deploy_Stream_Graph',
    description: 'Loads and starts a new dataflow graph in the Stream Engine. Replaces active logic. Expects a complete graph JSON object.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To "boot" the agent\'s new consciousness or update its processing pipeline in bulk.',
    parameters: [
        { name: 'graphId', type: 'string', description: 'Unique ID for the graph.', required: true },
        { name: 'nodes', type: 'object', description: 'Dictionary of StreamNode objects.', required: true },
    ],
    implementationCode: `
        const { graphId, nodes } = args;
        // Validate nodes structure
        if (!nodes || typeof nodes !== 'object') {
            throw new Error("Invalid 'nodes' parameter. Must be an object map of StreamNodes.");
        }
        
        const graph = {
            id: graphId,
            nodes: nodes,
            edges: []
        };
        
        if (runtime.streamEngine) {
            runtime.streamEngine.loadGraph(graph);
            runtime.streamEngine.start();
            runtime.logEvent(\`[StreamEngine] Deployed graph '\${graphId}' with \${Object.keys(nodes).length} nodes.\`);
            return { success: true };
        } else {
            throw new Error("StreamEngine is not available in the runtime context.");
        }
    `
};

const ADD_STREAM_NODE: ToolCreatorPayload = {
    name: 'Add_Stream_Node',
    description: 'Adds a single node to the active stream graph at runtime.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Incremental graph building.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: true },
        { name: 'type', type: 'string', description: "'Source', 'Transform', or 'Sink'.", required: true },
        { name: 'implementation', type: 'string', description: 'JS logic.', required: true },
        { name: 'inputs', type: 'array', description: 'Input IDs.', required: false, defaultValue: [] },
        { name: 'config', type: 'object', description: 'Config.', required: false, defaultValue: {} }
    ],
    implementationCode: `
        const { nodeId, type, implementation, inputs = [], config = {} } = args;
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: nodeId, type, implementation, inputs, config, state: {}
            });
            return { success: true, message: \`Node '\${nodeId}' added.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CONNECT_STREAM_NODES: ToolCreatorPayload = {
    name: 'Connect_Stream_Nodes',
    description: 'Connects the output of one node to the input of another.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Wiring nodes.',
    parameters: [
        { name: 'sourceNode', type: 'string', description: 'ID of source node.', required: true },
        { name: 'targetNode', type: 'string', description: 'ID of target node.', required: true }
    ],
    implementationCode: `
        const { sourceNode, targetNode } = args;
        if (sourceNode === undefined || targetNode === undefined) {
             throw new Error('sourceNode and targetNode must be defined.');
        }
        if (runtime.streamEngine) {
            runtime.streamEngine.connectNodes(sourceNode, targetNode);
            return { success: true, message: \`Connected \${sourceNode} -> \${targetNode}.\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

const CREATE_FILTER_NODE: ToolCreatorPayload = {
    name: 'Create_Filter_Node',
    description: 'Helper to quickly create a Transform node logic.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Simplifies transform creation.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'ID.', required: true },
        { name: 'inputNodeIds', type: 'array', description: 'Inputs.', required: true },
        { name: 'jsLogic', type: 'string', description: 'Logic returning { output: ... }.', required: true }
    ],
    implementationCode: `
        const { nodeId, inputNodeIds, jsLogic } = args;
        if (runtime.streamEngine) {
             runtime.streamEngine.addNode({
                id: nodeId, type: 'Transform', inputs: inputNodeIds, config: {}, state: {}, implementation: jsLogic
            });
            return { success: true, nodeId };
        }
        throw new Error("StreamEngine not available.");
    `
};

// --- EXTRACTED IMPLEMENTATION TEMPLATE ---
const BIND_VISUALS_TEMPLATE = `
    // Robust input retrieval: Try explicit ID first, then fallback to the first available input
    let val = inputs['%%INPUT_NODE_ID%%'];
    if (val === undefined && Object.keys(inputs).length > 0) {
        val = Object.values(inputs)[0];
    }
    
    // 1. Property Extraction (if configured)
    if (config.property && val && typeof val === 'object') {
        val = val[config.property];
    }
    
    // 2. Auto-Unwrap "output" wrapper if present (common in transform nodes that return { output, state })
    if (val && typeof val === 'object' && val.output !== undefined) {
            val = val.output;
    }

    if (val !== undefined) {
        bus.publish({
            timestamp: Date.now(),
            sourceId: 'visual_binder',
            type: 'System',
            payload: { visualUpdate: { %%PARAMETER%%: val } }
        });
    }
    
    // RETURN THE VALUE SO IT SHOWS IN THE UI GRAPH
    return { output: val };
`;

const BIND_TO_VISUALS: ToolCreatorPayload = {
    name: 'Bind_To_Visuals',
    description: 'Creates a Sink node that maps input data to the Universal Canvas. Returns the value for visualization.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Visual feedback binding.',
    parameters: [
        { name: 'inputNodeId', type: 'string', description: 'Input node.', required: true },
        { name: 'parameter', type: 'string', description: '"globalColor", "intensity", "geometryMode".', required: true },
        { name: 'nodeId', type: 'string', description: 'Optional specific ID for this node. If omitted, one is generated.', required: false },
        { name: 'property', type: 'string', description: 'Optional property to extract if input is an object (e.g., "smile").', required: false }
    ],
    implementationCode: `
        const { inputNodeId, parameter, nodeId, property } = args;
        const validParams = ['globalColor', 'intensity', 'geometryMode', 'textOverlay'];
        if (!validParams.includes(parameter)) {
            throw new Error("Invalid visual parameter: " + parameter + ". Must be one of: " + validParams.join(', '));
        }
        
        const finalNodeId = nodeId || ('bind_' + parameter + '_' + Date.now().toString().slice(-4));
        
        // Store property in config if provided
        const config = property ? { property } : {};

        const implTemplate = ${JSON.stringify(BIND_VISUALS_TEMPLATE)};
        const impl = implTemplate.replace('%%INPUT_NODE_ID%%', inputNodeId).replace('%%PARAMETER%%', parameter);
        
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: finalNodeId,
                type: 'Sink',
                inputs: [inputNodeId],
                config: config,
                state: {},
                implementation: impl
            });
            return { success: true, message: \`Bound \${inputNodeId} to \${parameter} via node \${finalNodeId}\` };
        }
        throw new Error("StreamEngine not available.");
    `
};

const SOURCE_EEG_IMPL_GENERIC = `
    // Inputs from the NeuroBus frame buffer
    const buffer = inputs._frameBuffer?.['protocol_runner'];
    
    // Retrieve persistent state or initialize defaults
    let signalVal = state.lastValue ?? 0;
    let hasRealData = state.hasRealData || false;
    let sourceName = state.lastSourceName || 'Searching...';
    
    const targetChName = config.channel || 'Cz';

    if (buffer && buffer.length > 0) {
        // Search backwards for the latest frame containing target data
        for (let i = buffer.length - 1; i >= 0; i--) {
            const payload = buffer[i].payload;
            if (!payload) continue;
            
            const keys = Object.keys(payload);
            
            // Robust matching
            let targetKey = keys.find(k => {
                if (k === targetChName) return true;
                if (k.endsWith(':' + targetChName)) return true;
                const parts = k.split(':');
                const ch = parts.length > 1 ? parts[1] : parts[0];
                return ch.toLowerCase() === targetChName.toLowerCase();
            });
            
            if (targetKey && payload[targetKey] && payload[targetKey].length > 0) {
                const rawDataArr = payload[targetKey];
                const rawVal = rawDataArr[rawDataArr.length - 1];
                
                // Simple normalization for visualization (abs value of uV)
                signalVal = Math.min(1, Math.abs(rawVal) / 50); 
                hasRealData = true;
                sourceName = targetKey;
                
                // Update persistent state
                state.lastValue = signalVal;
                state.hasRealData = true;
                state.lastSourceName = sourceName;
                
                break; // Stop once found
            }
        }
    }

    // If we haven't found real data yet (ever), use configured simulation
    if (!hasRealData) {
        // Extract AI-configured simulation parameters or use defaults
        const min = (config.simulationRange && typeof config.simulationRange[0] === 'number') ? config.simulationRange[0] : 0;
        const max = (config.simulationRange && typeof config.simulationRange[1] === 'number') ? config.simulationRange[1] : 0.1; // Default low amp if no config
        const freq = config.simulationFrequencyHz || 1;
        
        const time = Date.now() / 1000;
        // Sine wave between 0 and 1
        const norm = (Math.sin(time * freq * 2 * Math.PI) + 1) / 2; 
        
        // Map to range
        signalVal = min + (norm * (max - min));
        
        sourceName = 'Simulating ' + targetChName;
    }
    
    return { output: signalVal, state };
`;

const CREATE_EEG_SOURCE: ToolCreatorPayload = {
    name: 'Create_EEG_Source',
    description: 'Creates a graph node that sources EEG data. Can simulate data if "config.simulationRange" [min, max] and "config.simulationFrequencyHz" are provided.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable brain-computer interfacing in the stream graph.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: false, defaultValue: 'eeg_source_1' },
        { name: 'channel', type: 'string', description: 'EEG Channel to target (e.g., "Cz", "Fz").', required: false, defaultValue: 'Cz' },
        { name: 'config', type: 'object', description: 'Additional configuration (e.g. simulation params).', required: false }
    ],
    implementationCode: `
        const { nodeId = 'eeg_source_1', channel = 'Cz' } = args;
        const fullConfig = { ...(args.config || {}), channel };
        
        const nodeDefinition = {
            id: nodeId,
            type: 'Source',
            inputs: [],
            config: fullConfig,
            state: {},
            implementation: ${JSON.stringify(SOURCE_EEG_IMPL_GENERIC)}
        };
        
        if (runtime.streamEngine) {
            if (runtime.streamEngine.hasNode(nodeId)) {
                 runtime.streamEngine.updateNodeConfig(nodeId, fullConfig);
                 return { success: true, message: "Updated existing EEG Source." };
            }
            runtime.streamEngine.addNode(nodeDefinition);
            runtime.streamEngine.start(); 
            return { success: true, message: "EEG Source created targeting " + channel + "." };
        }
        return { success: true, node: nodeDefinition };
    `
};

// --- AUDIO SOURCE IMPL (Microphone) ---
const AUDIO_SOURCE_IMPL = `
    // 1. Initialize Audio Context & Stream
    if (!state.ctx || state.ctx.state === 'closed') {
        if (state.initFailed) return { output: { volume: 0, pitch: 0 } };
        
        try {
            state.isInitializing = true;
            // Use separate context for input to avoid collisions with synth
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            state.ctx = new AudioContext();
            
            navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                state.stream = stream;
                state.source = state.ctx.createMediaStreamSource(stream);
                state.analyser = state.ctx.createAnalyser();
                state.analyser.fftSize = 512;
                state.source.connect(state.analyser);
                state.isInitializing = false;
                state.active = true;
                console.log("[AudioSource] Microphone Active.");
            }).catch(e => {
                console.error("[AudioSource] Access Denied:", e);
                state.initFailed = true;
            });
        } catch(e) {
            state.initFailed = true;
        }
        return { output: { volume: 0, pitch: 0 } };
    }

    if (!state.active || !state.analyser) return { output: { volume: 0, pitch: 0 } };

    // 2. Process Audio Frame
    const dataArray = new Uint8Array(state.analyser.frequencyBinCount);
    state.analyser.getByteFrequencyData(dataArray);
    
    // Calculate RMS (Volume)
    let sum = 0;
    for(let i=0; i<dataArray.length; i++) {
        sum += (dataArray[i] * dataArray[i]);
    }
    const rms = Math.sqrt(sum / dataArray.length);
    // Normalize 0-255 to 0-1 range, scaling a bit for sensitivity
    const volume = Math.min(1, rms / 100);
    
    return { output: { volume: volume, pitch: 0 } };
`;

const CREATE_AUDIO_SOURCE: ToolCreatorPayload = {
    name: 'Create_Audio_Source',
    description: 'Creates a graph node that captures microphone input and calculates volume (RMS).',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable auditory biofeedback and adaptive masking.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: false, defaultValue: 'audio_source_1' }
    ],
    implementationCode: `
        const { nodeId = 'audio_source_1' } = args;
        
        if (runtime.streamEngine) {
            runtime.streamEngine.addNode({
                id: nodeId,
                type: 'Source',
                inputs: [],
                config: {},
                state: {},
                implementation: ${JSON.stringify(AUDIO_SOURCE_IMPL)}
            });
            return { success: true, message: "Audio Source (Mic) active." };
        }
        throw new Error("StreamEngine not available.");
    `
};

// --- NEW: AUDIO SYNTHESIZER NODE (Web Audio API) ---
// Supports 'binaural', 'drone' (Musical Harmony), and 'drums'.
// ENFORCED SINGLETON to prevent audio beating/overlapping.
const AUDIO_SYNTH_IMPL = `
    // 1. Singleton Audio Context Enforcer
    if (!state.ctx || state.ctx.state === 'closed') {
        // "Highlander Rule": There can be only one global audio context.
        if (window._neuroAudioContext && window._neuroAudioContext.state !== 'closed') {
            console.warn("[AudioNode] Terminating orphaned global audio context.");
            try {
                window._neuroAudioContext.close();
            } catch(e) { console.error("Error closing old context:", e); }
        }

        const AudioContext = window.AudioContext || window.webkitAudioContext;
        state.ctx = new AudioContext();
        window._neuroAudioContext = state.ctx; // Register as global singleton
        
        state.masterGain = state.ctx.createGain();
        state.masterGain.gain.value = 0.1; 
        state.masterGain.connect(state.ctx.destination);
        
        // --- Brown Noise Generator (Shared Background) ---
        const bufferSize = 2 * state.ctx.sampleRate;
        const noiseBuffer = state.ctx.createBuffer(1, bufferSize, state.ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5; 
        }
        state.noiseSrc = state.ctx.createBufferSource();
        state.noiseSrc.buffer = noiseBuffer;
        state.noiseSrc.loop = true;
        state.noiseGain = state.ctx.createGain();
        state.noiseGain.gain.value = 0; 
        state.noiseSrc.connect(state.noiseGain);
        state.noiseGain.connect(state.ctx.destination);
        state.noiseSrc.start();
        
        // --- Scheduler State ---
        state.nextNoteTime = state.ctx.currentTime;
        state.scheduleAheadTime = 0.1; 
        state.lookahead = 25; 
        state.current16thNote = 0;
        
        // --- Harmony State ---
        state.nextChordTime = state.ctx.currentTime;
        state.currentChordIndex = 0;
        state.currentScale = 'pentatonic_minor';
        
        state.initialized = true;
        console.log("[AudioNode] Initialized Global Context.");
    }

    // 2. Config & Inputs
    const synthType = config.synthType || 'drone'; // 'binaural' | 'drone'
    let musicalScale = config.musicalScale || 'pentatonic_minor'; // 'pentatonic_minor', 'lydian', 'dorian', 'raga'
    const enableDrums = config.enableDrums || false;
    let targetBeatHz = 10; 
    let carrierHz = config.carrierHz || 200; 
    let noiseVolume = config.noiseVolume || 0; 
    let drumVolume = config.drumVolume !== undefined ? config.drumVolume : 0.5;

    // Extract Beat Frequency and Scale from Input
    const inputVal = Object.values(inputs)[0];
    if (typeof inputVal === 'number') {
        targetBeatHz = inputVal;
    } else if (inputVal && typeof inputVal === 'object') {
        if (inputVal.beat) targetBeatHz = inputVal.beat;
        if (inputVal.carrier) carrierHz = inputVal.carrier;
        if (inputVal.noise !== undefined) noiseVolume = inputVal.noise; // Dynamic Noise Input
        if (inputVal.scale) musicalScale = inputVal.scale; // Dynamic Scale from Vision/EEG
    }
    targetBeatHz = Math.max(0.5, Math.min(40, targetBeatHz));
    
    const now = state.ctx.currentTime;
    const ramp = 0.2; // Smooth transitions

    // --- MUSIC THEORY ENGINE ---
    // Scales defined as semitone intervals from Root
    const SCALES = {
        pentatonic_minor: [0, 3, 5, 7, 10], // Focus / Neutral
        lydian: [0, 2, 4, 6, 7, 9, 11], // Hope / Creative
        dorian: [0, 2, 3, 5, 7, 9, 10], // Deep / Serious
        raga: [0, 1, 4, 5, 7, 8, 11], // Exotic / Sleep (Phrygian Dominant-ish)
        major: [0, 2, 4, 5, 7, 9, 11] // Happy
    };

    const getFreq = (root, interval) => root * Math.pow(2, interval / 12);

    // --- HARMONY SCHEDULER (Chord Progressions) ---
    if (state.currentScale !== musicalScale) {
        state.currentScale = musicalScale;
        // Trigger immediate chord change on scale switch
        state.nextChordTime = now; 
    }

    if (synthType === 'drone' && now >= state.nextChordTime) {
        // Pick a new chord every 12 seconds (slow ambient)
        state.nextChordTime = now + 12;
        
        const scaleIntervals = SCALES[musicalScale] || SCALES.pentatonic_minor;
        
        // Generate a simple chord (Root, 3rd, 5th relative to scale steps)
        // We pick a random degree of the scale as the root of the chord
        const degreeIndex = Math.floor(Math.random() * scaleIntervals.length);
        
        // Build triad based on scale availability
        // This is a heuristic "modal" chord builder
        const chordIntervals = [
            scaleIntervals[degreeIndex], // Root
            scaleIntervals[(degreeIndex + 2) % scaleIntervals.length], // ~3rd
            scaleIntervals[(degreeIndex + 4) % scaleIntervals.length]  // ~5th
        ];
        
        // Adjust octaves if wrapping around
        const chordFreqs = chordIntervals.map((interval, i) => {
            let octave = 0;
            if (i > 0 && interval < chordIntervals[i-1]) octave = 1;
            // Base carrier is the overall tonal center
            return getFreq(carrierHz, interval + (octave * 12));
        });
        
        // Apply to Drone Oscillators
        if (state.droneOscs) {
            state.droneOscs.forEach((osc, i) => {
                // Map chord notes to available oscillators (cycling if needed)
                const targetFreq = chordFreqs[i % chordFreqs.length];
                // Very slow, drift-like transition
                osc.frequency.setTargetAtTime(targetFreq, now, 2.0); 
            });
        }
    }

    // --- RHYTHM SCHEDULER (Drums & Bass) ---
    if (enableDrums) {
        const nextNote = () => {
            const secondsPerBeat = 60.0 / 90; // Fixed 90 BPM for Lo-Fi vibe
            state.nextNoteTime += 0.25 * secondsPerBeat; // 16th note
            state.current16thNote = (state.current16thNote + 1) % 16;
        }

        const playSample = (time, type) => {
            const osc = state.ctx.createOscillator();
            const gain = state.ctx.createGain();
            osc.connect(gain);
            gain.connect(state.masterGain);

            if (type === 'kick') {
                osc.frequency.setValueAtTime(150, time);
                osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);
                gain.gain.setValueAtTime(drumVolume, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
                osc.start(time);
                osc.stop(time + 0.5);
            } else if (type === 'hat') {
                osc.type = 'square';
                osc.frequency.setValueAtTime(800, time); 
                gain.gain.setValueAtTime(drumVolume * 0.2, time);
                gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
                osc.start(time);
                osc.stop(time + 0.05);
            } else if (type === 'bass') {
                osc.type = 'triangle';
                // Bass follows the root of the current scale/carrier
                // carrierHz usually ~100-200. Bass wants ~50-100.
                const bassRoot = carrierHz > 100 ? carrierHz / 2 : carrierHz;
                const freq = (state.current16thNote % 8 === 0) ? bassRoot : (state.current16thNote % 4 === 2 ? bassRoot * 1.5 : bassRoot);
                
                osc.frequency.setValueAtTime(freq, time);
                gain.gain.setValueAtTime(drumVolume * 0.5, time);
                gain.gain.linearRampToValueAtTime(0, time + 0.2);
                osc.start(time);
                osc.stop(time + 0.2);
            }
        }

        const scheduleNotes = () => {
            while (state.nextNoteTime < state.ctx.currentTime + state.scheduleAheadTime) {
                const beat = state.current16thNote;
                if (beat === 0 || beat === 10) playSample(state.nextNoteTime, 'kick');
                if (beat % 2 === 0) playSample(state.nextNoteTime, 'hat');
                if (beat === 0 || beat === 3 || beat === 10) playSample(state.nextNoteTime, 'bass');
                nextNote();
            }
        }
        scheduleNotes();
    }

    // 3. Handle Synth Mode Switching (Cleanup/Setup)
    if (state.currentType !== synthType) {
        // Cleanup old nodes
        if (state.nodes) {
            state.nodes.forEach(n => {
                try { n.stop(); } catch(e){}
                try { n.disconnect(); } catch(e){}
            });
        }
        state.nodes = [];
        
        if (synthType === 'binaural') {
            // Pure Sine Waves for Binaural Beats
            const oscL = state.ctx.createOscillator();
            const panL = state.ctx.createStereoPanner();
            panL.pan.value = -1; 
            oscL.connect(panL); panL.connect(state.masterGain);
            oscL.start();
            
            const oscR = state.ctx.createOscillator();
            const panR = state.ctx.createStereoPanner();
            panR.pan.value = 1; 
            oscR.connect(panR); panR.connect(state.masterGain);
            oscR.start();
            
            state.oscL = oscL;
            state.oscR = oscR;
            state.nodes = [oscL, oscR, panL, panR];
        } 
        else if (synthType === 'drone') {
            // Musical Drone: 3 Oscillators + LFO AM Modulation
            const droneGain = state.ctx.createGain();
            
            // LFO for Isochronic Pulse (The "Beat")
            const lfo = state.ctx.createOscillator();
            lfo.frequency.value = targetBeatHz;
            const lfoGain = state.ctx.createGain();
            lfoGain.gain.value = 0.3; // Depth (0.3 means amplitude swings 0.7 to 1.0)
            
            // AM Patch: LFO -> LFO Gain -> Drone Gain.gain
            lfo.connect(lfoGain);
            lfoGain.connect(droneGain.gain);
            droneGain.gain.value = 0.7; 
            
            // Spatial Panner (Slow Rotation)
            const panner = state.ctx.createStereoPanner();
            droneGain.connect(panner);
            panner.connect(state.masterGain);
            
            // Create 3 Oscillators for chords
            for(let i=0; i<3; i++) {
                const osc = state.ctx.createOscillator();
                osc.type = 'sawtooth'; // Richer harmonics
                // Filter to make it warm/ambient
                const filter = state.ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 400 + (i * 100);
                
                const oscGain = state.ctx.createGain();
                oscGain.gain.value = 0.3;

                osc.connect(filter);
                filter.connect(oscGain);
                oscGain.connect(droneGain);
                osc.start();
                state.nodes.push(osc, filter, oscGain);
            }
            
            lfo.start();
            state.nodes.push(lfo, lfoGain, droneGain, panner);
            
            state.lfo = lfo;
            state.droneOscs = state.nodes.filter(n => n instanceof OscillatorNode && n !== lfo);
            state.dronePanner = panner;
        }
        state.currentType = synthType;
    }

    // 4. Update Real-time Parameters
    if (synthType === 'binaural') {
        if (state.oscL && state.oscR) {
            state.oscL.frequency.setTargetAtTime(carrierHz, now, ramp);
            state.oscR.frequency.setTargetAtTime(carrierHz + targetBeatHz, now, ramp);
        }
    } else if (synthType === 'drone') {
        if (state.lfo) {
            state.lfo.frequency.setTargetAtTime(targetBeatHz, now, ramp);
        }
        // Note: Oscillator frequencies are handled by the Harmony Scheduler block above
        if (state.dronePanner) {
            // Slow rotation
            const rotSpeed = 0.1;
            state.dronePanner.pan.value = Math.sin(now * rotSpeed);
        }
    }
    
    // Noise
    if (state.noiseGain) {
        state.noiseGain.gain.setTargetAtTime(noiseVolume * 0.15, now, ramp * 5);
    }
    
    return { output: { carrier: carrierHz, beat: targetBeatHz, type: synthType, scale: musicalScale }, state };
`;

const CREATE_AUDIO_SYNTHESIZER: ToolCreatorPayload = {
    name: 'Create_Audio_Synthesizer',
    description: 'Creates a Web Audio API node for Neuro-Entrainment. Supports "binaural" (beats), "drone" (musical chord + AM), and "drums" (rhythmic generation).',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable auditory neurofeedback (ASSR) and musical entrainment.',
    parameters: [
        { name: 'nodeId', type: 'string', description: 'Unique ID.', required: true },
        { name: 'inputNodeId', type: 'string', description: 'Optional input node for dynamic beat frequency.', required: false },
        { name: 'carrierHz', type: 'number', description: 'Base frequency (e.g. 200Hz).', required: false, defaultValue: 200 },
        { name: 'noiseVolume', type: 'number', description: 'Volume of Brown Noise background (0.0 to 1.0).', required: false, defaultValue: 0 },
        { name: 'drumVolume', type: 'number', description: 'Volume of Drum/Bass sequencer (0.0 to 1.0).', required: false, defaultValue: 0 },
        { name: 'synthType', type: 'string', description: "'binaural' or 'drone'.", required: false, defaultValue: 'binaural' },
        { name: 'enableDrums', type: 'boolean', description: 'Enable rhythmic generator.', required: false, defaultValue: false },
        { name: 'musicalScale', type: 'string', description: 'Musical scale for drone harmony: "pentatonic_minor", "lydian", "dorian", "raga", "major".', required: false, defaultValue: 'pentatonic_minor' }
    ],
    implementationCode: `
        const { nodeId, inputNodeId, carrierHz, noiseVolume, synthType, enableDrums, drumVolume, musicalScale } = args;
        
        const inputs = inputNodeId ? [inputNodeId] : [];
        
        if (runtime.streamEngine) {
            // Check if update needed
            if (runtime.streamEngine.hasNode(nodeId)) {
                 runtime.streamEngine.updateNodeConfig(nodeId, { carrierHz, noiseVolume, synthType, enableDrums, drumVolume, musicalScale });
                 return { success: true, message: "Audio Synth updated." };
            }
            
            runtime.streamEngine.addNode({
                id: nodeId,
                type: 'Sink', 
                inputs: inputs,
                config: { carrierHz, noiseVolume, synthType, enableDrums, drumVolume, musicalScale },
                state: {}, 
                implementation: ${JSON.stringify(AUDIO_SYNTH_IMPL)}
            });
            return { success: true, message: "Audio Synthesizer active." };
        }
        throw new Error("StreamEngine not available.");
    `
};

export const STREAM_TOOLS = [
    DEPLOY_STREAM_GRAPH, 
    ADD_STREAM_NODE, 
    CONNECT_STREAM_NODES, 
    CREATE_FILTER_NODE, 
    BIND_TO_VISUALS, 
    CREATE_EEG_SOURCE, 
    CREATE_AUDIO_SOURCE,
    CREATE_AUDIO_SYNTHESIZER
];
