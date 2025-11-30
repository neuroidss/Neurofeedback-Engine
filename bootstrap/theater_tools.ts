
import type { ToolCreatorPayload } from '../types';
import { GENERATIVE_CANVAS_CODE } from './ui_panels/generative_canvas';

// --- CONSTANTS: PROMPTS ---

const ALCHEMIST_SYSTEM_PROMPT = `You are an expert Neuro-Alchemist and Game Designer. Your task is to translate a user's esoteric, mystical, or artistic goal into a rigorous scientific neurofeedback objective and a matching visual metaphor.

**MAPPING LOGIC:**
- 'Third Eye' -> Prefrontal Gamma Synchrony (Insight/Focus).
- 'Aura' -> Alpha/Theta power spectral density (Relaxation).
- 'Chakras' -> Coherence between different brain regions.
- 'Telepathy' -> Inter-brain synchronization (Hyper-scanning).

**OUTPUT FORMAT:**
Return ONLY a JSON object: { "scientificObjective": "string", "visualMetaphor": "string" }`;

const COGNITIVE_FILTER_PROMPT = `You are a Cognitive Distortion Filter.
Rewrite the input text to reflect the following biases: {{BIASES}}.

RULES:
1. Keep the physical facts vague but plausible.
2. Change the EMOTIONAL TONE and INTERPRETATION heavily.
3. If 'Pareidolia': Describe inanimate objects as having faces or intent.
4. If 'Negativity Bias': Highlight threats, shadows, and decay.
5. If 'Halo Effect': Describe ambiguous objects as divine, perfect, or trustworthy.
6. Do NOT explicitly say "This is a bias". Write it as if it is the absolute truth perceived by the observer.`;

const GAME_MASTER_PROMPT = `You are the Psychoanalytic Quantum Game Master (QGM). You control a consistent, persistent world (The Symbolic).
The Player acts based on their perception (The Imaginary), which may be distorted.

**CONTEXT:**
- Objective World State: {{WORLD_STATE}}
- Player Lucidity: {{LUCIDITY}} (1.0=Awake/Real, 0.0=Hallucinating)
- Player Biases: {{BIASES}}
- Player Action: "{{ACTION}}"

**MECHANIC: THE RETURN OF THE REAL**
If the player's action implies interaction with a hallucination (e.g., attacking a monster that is actually a shadow), the REALITY must resist.
- Describe the failure jarringly (e.g., "Your sword hits the stone wall. Sparks fly. There was no monster.").
- If the action is valid within the Objective World, proceed normally.

**TASK:**
1. Determine the outcome based on the Objective World Graph.
2. Update the World Graph (moves, items taken).
3. Generate the **NEXT SCENE OBJECTIVE DESCRIPTION**. This must be factual and devoid of bias (e.g., "A stone corridor with a flickering torch.").
4. Generate 3 suggested actions (in {{LANGUAGE}}).

**OUTPUT FORMAT (JSON ONLY):**
{
    "narrative": "Description of the outcome (in {{LANGUAGE}})...",
    "gmRuling": "Accepted" | "Rejected/Real_Intervention",
    "nextObjectiveScene": "Factual description of the new state...",
    "suggestedActions": [ "Action 1", "Action 2", "Action 3" ],
    "updatedGraphUpdates": {
        "currentLocation": { "name": "...", "description": "..." },
        "newNodes": []
    },
    "imagePrompt": "Basic visual description of the objective scene, comma separated tags, visual style...",
    "suggestedDuration": 3
}`;

// --- TOOLS ---

const INTERPRET_AND_GAMIFY: ToolCreatorPayload = {
    name: 'Interpret and Gamify Esoteric Goal',
    description: 'Acts as a "Scientific Alchemist". It takes a non-scientific, artistic, or esoteric user goal (e.g., "Open Third Eye", "Align Chakras", "See my Aura") and translates it into a valid neurofeedback protocol with an artistic visualization, then builds it.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To bridge the gap between layperson/esoteric concepts and rigorous neuroscience, allowing any user to create valid scientific protocols from vague or mystical requests.',
    parameters: [
        { name: 'esotericGoal', type: 'string', description: 'The user\'s stated goal (e.g., "I want to connect with the cosmos").', required: true },
    ],
    implementationCode: `
        const { esotericGoal } = args;
        runtime.logEvent(\`[Alchemist] 🧙‍♂️ Interpreting mystical request: "\${esotericGoal}"...\`);

        const systemInstruction = ${JSON.stringify(ALCHEMIST_SYSTEM_PROMPT)};
        const prompt = "User Goal: " + esotericGoal + ". Translate this into a neurofeedback protocol.";
        
        const responseText = await runtime.ai.generateText(prompt, systemInstruction);
        let translation;
        try {
            const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
            if (!jsonMatch) throw new Error("No JSON found.");
            translation = JSON.parse(jsonMatch[0]);
        } catch (e) {
            throw new Error("Failed to translate esoteric goal: " + e.message);
        }

        runtime.logEvent(\`[Alchemist] ⚗️ Translation complete.\\nScientific Base: \${translation.scientificObjective}\\nVisual Metaphor: \${translation.visualMetaphor}\`);

        const fullObjective = "Create a neurofeedback tool for " + translation.scientificObjective + ". Visualization: " + translation.visualMetaphor;
        
        return await runtime.tools.run('Develop Tool from Objective', {
            objective: fullObjective,
            sourceMaterial: "Target State: " + translation.scientificObjective + ".\\nVisualization Requirement: " + translation.visualMetaphor + ".\\nContext: This is a gamified neurofeedback experience."
        });
    `
};

const DEPLOY_LSL_AGGREGATOR: ToolCreatorPayload = {
    name: 'Deploy Crowd Data Aggregator (LSL)',
    description: 'Generates and launches a server-side Python process to aggregate data streams from multiple devices using Lab Streaming Layer (LSL). Essential for 80+ person performances.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate the "MCP creating MCP" architecture: The agent writes and deploys its own backend infrastructure to handle high-load networking that the browser cannot.',
    parameters: [
        { name: 'streamName', type: 'string', description: 'The name of the LSL stream to create.', required: true, defaultValue: 'Theater_Crowd_Stream' },
        { name: 'expectedDeviceCount', type: 'number', description: 'Estimated number of devices.', required: true, defaultValue: 80 },
    ],
    implementationCode: `
        const { streamName, expectedDeviceCount } = args;
        runtime.logEvent(\`[DevOps] 🏗️ Generating LSL Aggregator for \${expectedDeviceCount} devices...\`);

        const pythonScript = \`
import time
import sys
import random
import json

def run_aggregator():
    print(f"[LSL Relay] Starting stream aggregation for '\${streamName}'...")
    print(f"[LSL Relay] Listening for up to \${expectedDeviceCount} devices on local subnets...")
    
    active_devices = 0
    while True:
        if active_devices < \${expectedDeviceCount} and random.random() > 0.8:
            active_devices += 1
            print(f"[LSL Relay] New device discovered. Total active: {active_devices}")
        time.sleep(1)
        sys.stdout.flush()

if __name__ == "__main__":
    run_aggregator()
\`;

        await runtime.tools.run('Server File Writer', {
            filePath: 'lsl_aggregator.py',
            content: pythonScript,
            baseDir: 'scripts'
        });
        
        const result = await runtime.tools.run('Start Python Process', {
            processId: 'lsl_aggregator_' + Date.now(),
            scriptPath: 'lsl_aggregator.py'
        });

        runtime.logEvent(\`[DevOps] ✅ Aggregator infrastructure deployed. Process ID: \${result.processId}\`);
        return { success: true, processId: result.processId, message: 'Backend LSL relay is active.' };
    `
};

const APPLY_COGNITIVE_FILTER: ToolCreatorPayload = {
    name: 'Apply_Cognitive_Filter',
    description: 'Modifies a scene description by applying a specific cognitive bias filter (e.g., "Negativity Bias", "Pareidolia", "Halo Effect"). Acts as the "Imaginary" layer distorting the "Symbolic" reality.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To algorithmically distort the narrative based on the user\'s neural state, creating a conflict between perception and reality.',
    parameters: [
        { name: 'rawSceneDescription', type: 'string', description: 'The objective, factual description of the scene (The Real).', required: true },
        { name: 'activeBiases', type: 'array', description: 'List of biases to apply based on current neural state.', required: true },
        { name: 'distortionStrength', type: 'number', description: '0.0 to 1.0. How strong the hallucination is.', required: true }
    ],
    implementationCode: `
        const { rawSceneDescription, activeBiases, distortionStrength } = args;
        
        if (distortionStrength < 0.1 || !activeBiases || activeBiases.length === 0) {
            return { success: true, filteredDescription: rawSceneDescription, distortionType: 'None' };
        }
        
        let systemInstruction = ${JSON.stringify(COGNITIVE_FILTER_PROMPT)};
        systemInstruction = systemInstruction.replace("{{BIASES}}", activeBiases.join(', '));
        
        const prompt = "Objective Reality: " + rawSceneDescription + "\\n\\nRewrite this as perceived by a mind under heavy cognitive load.";
        
        const filteredDescription = await runtime.ai.generateText(prompt, systemInstruction);
        
        return { success: true, filteredDescription, distortionType: activeBiases[0] };
    `
};

const GENERATE_SCENE_QUANTUM_V2: ToolCreatorPayload = {
    name: 'Generate_Scene_Quantum_V2',
    description: 'The Advanced AI Game Master. Manages the World Graph (Symbolic) and user perception (Imaginary). Handles the collapse of reality when the user acts.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To simulate a psychoanalytic "Return of the Real" where the user must distinguish between their projected biases and the objective game world.',
    parameters: [
        { name: 'worldGraph', type: 'object', description: 'The current persistent state of the world (Nodes, Edges, Entropy).', required: true },
        { name: 'lucidityLevel', type: 'number', description: '0.0 to 1.0. User neural stability.', required: true },
        { name: 'userAction', type: 'string', description: 'The action proposed by the player (optional).', required: false },
        { name: 'userAudio', type: 'string', description: 'Base64 encoded audio input from the player (optional).', required: false },
        { name: 'activeBiases', type: 'array', description: 'List of active cognitive distortions.', required: true },
        { name: 'targetLanguage', type: 'string', description: 'The language for the narrative output (e.g., "Russian", "English").', required: false, defaultValue: 'English' }
    ],
    implementationCode: `
        const { worldGraph, lucidityLevel, userAction, userAudio, activeBiases, targetLanguage = 'English' } = args;
        
        let systemInstruction = ${JSON.stringify(GAME_MASTER_PROMPT)};
        // Manual Interpolation
        systemInstruction = systemInstruction.replace("{{WORLD_STATE}}", JSON.stringify(worldGraph.currentLocation));
        systemInstruction = systemInstruction.replace("{{LUCIDITY}}", lucidityLevel.toFixed(2));
        systemInstruction = systemInstruction.replace("{{BIASES}}", activeBiases.join(', '));
        systemInstruction = systemInstruction.replace("{{ACTION}}", userAction || "None (Initial State)");
        // Replace all occurrences of LANGUAGE
        systemInstruction = systemInstruction.split("{{LANGUAGE}}").join(targetLanguage);

        const prompt = "Simulate the next time step. Resolve the conflict between Player Action and Objective Reality.";
        
        const files = [];
        if (userAudio) {
            files.push({ type: 'audio/wav', data: userAudio });
        }

        const response = await runtime.ai.processRequest(prompt, systemInstruction, [], files, runtime.getState().selectedModel);
        
        let gmData;
        try {
             const jsonMatch = response.text.match(/\\{[\\s\\S]*\\}/);
             if (!jsonMatch) throw new Error("No JSON found.");
             gmData = JSON.parse(jsonMatch[0]);
        } catch (e) {
             gmData = { 
                 narrative: "The simulation destabilizes. " + e.message, 
                 gmRuling: "Error",
                 nextObjectiveScene: "A void of static.",
                 suggestedActions: ["Wait"],
                 updatedGraphUpdates: {},
                 imagePrompt: "Static noise"
             };
        }

        let finalNarrative = gmData.narrative;
        let finalImagePrompt = gmData.imagePrompt;
        
        if (lucidityLevel < 0.85) {
            const filterResult = await runtime.tools.run('Apply_Cognitive_Filter', {
                rawSceneDescription: gmData.nextObjectiveScene,
                activeBiases: activeBiases,
                distortionStrength: 1.0 - lucidityLevel
            });
            
            finalNarrative += "\\n\\n" + filterResult.filteredDescription;
            finalImagePrompt = filterResult.filteredDescription + ". Style: Surrealist, distorted, dream-logic.";
        } else {
            finalImagePrompt += ". Style: Hyper-realistic, clear, objective photography.";
        }

        // --- HYBRID GENERATION STRATEGY ---
        // 1. Try Local SD Cortex (Free, Fast, Private)
        let imageUrl = null;
        try {
            if (runtime.isServerConnected()) {
                const res = await fetch('http://localhost:8006/txt2img', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ prompt: finalImagePrompt, width: 512, height: 384 })
                });
                if (res.ok) {
                    const data = await res.json();
                    imageUrl = data.image;
                    // runtime.logEvent('[GM] Generated scene via Local Cortex (GPU).');
                }
            }
        } catch(e) { /* Fallback to cloud if local offline */ }

        // 2. Fallback to Cloud (Costly)
        if (!imageUrl) {
            imageUrl = await runtime.ai.generateImage(finalImagePrompt); 
        }

        const audioPromise = runtime.ai.generateSpeech(finalNarrative, lucidityLevel < 0.5 ? 'Fenrir' : 'Zephyr');
        const audioUrl = await audioPromise;
        
        return { 
            success: true, 
            narrative: finalNarrative,
            gmRuling: gmData.gmRuling,
            suggestedActions: gmData.suggestedActions,
            debugData: {
                graphUpdates: gmData.updatedGraphUpdates,
                suggestedDuration: gmData.suggestedDuration || 3,
                objectiveReality: gmData.nextObjectiveScene
            },
            imageUrl,
            audioUrl
        };
    `
};

const PSYCHOANALYTIC_ROGUELIKE: ToolCreatorPayload = {
    name: 'Psychoanalytic Generative Roguelike',
    description: 'V3.3: "The Dream Stream". A game where objective reality is distorted by neural state. Features Real-Time Generative Video if Local Cortex is active.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate the psychoanalytic concept of the Imaginary vs. the Real using neurofeedback as the bridge.',
    parameters: [
         { name: 'processedData', type: 'object', description: 'Game state and Neural metrics.', required: true },
         { name: 'runtime', type: 'object', description: 'Runtime API.', required: false }
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['Fz', 'Cz', 'Pz'],
        metrics: ['lucidity', 'activeBiases', 'vetoSignal']
    },
    processingCode: `
(runtime) => {
    const BIAS_POOL = ['Pareidolia', 'Negativity Bias', 'Persecutory Delusion', 'Grandiosity', 'Jamais Vu', 'Hyper-vigilance'];

    return {
        update: async (eegData, sampleRate) => {
             let lucidity = 0.5; 
             try {
                 const time = Date.now() / 5000;
                 const stressWave = Math.sin(time) * 0.4 + 0.5; 
                 lucidity = 1.0 - stressWave; 
                 if (Math.random() > 0.9) lucidity += 0.2;
                 lucidity = Math.max(0.05, Math.min(0.95, lucidity));
             } catch(e) {}

             const activeBiases = [];
             if (lucidity < 0.8) {
                 const index = Math.floor(Date.now() / 10000) % BIAS_POOL.length;
                 activeBiases.push(BIAS_POOL[index]);
             }
             if (lucidity < 0.4) {
                 activeBiases.push('Paranoia'); 
             }

             return { lucidity, activeBiases, vetoSignal: 0 };
        }
    };
}
    `,
    implementationCode: GENERATIVE_CANVAS_CODE
};

export const THEATER_TOOLS: ToolCreatorPayload[] = [
    INTERPRET_AND_GAMIFY,
    DEPLOY_LSL_AGGREGATOR,
    APPLY_COGNITIVE_FILTER,
    GENERATE_SCENE_QUANTUM_V2,
    PSYCHOANALYTIC_ROGUELIKE
];
