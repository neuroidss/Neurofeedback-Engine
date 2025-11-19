
import type { ToolCreatorPayload } from '../types';
import { GENERATIVE_CANVAS_CODE } from './ui_panels/generative_canvas';

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

        const systemInstruction = "You are an expert Neuro-Alchemist and Game Designer. Your task is to translate a user's esoteric, mystical, or artistic goal into a rigorous scientific neurofeedback objective and a matching visual metaphor.\\n\\n**MAPPING LOGIC:**\\n- 'Third Eye' -> Prefrontal Gamma Synchrony (Insight/Focus).\\n- 'Aura' -> Alpha/Theta power spectral density (Relaxation).\\n- 'Chakras' -> Coherence between different brain regions.\\n- 'Telepathy' -> Inter-brain synchronization (Hyper-scanning).\\n\\n**OUTPUT FORMAT:**\\nReturn ONLY a JSON object: { \\"scientificObjective\\": \\"string\\", \\"visualMetaphor\\": \\"string\\" }";

        const prompt = \`User Goal: "\${esotericGoal}". Translate this into a neurofeedback protocol.\`;
        
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

        // Trigger the standard development workflow with the translated objective
        const fullObjective = \`Create a neurofeedback tool for \${translation.scientificObjective}. Visualization: \${translation.visualMetaphor}\`;
        
        return await runtime.tools.run('Develop Tool from Objective', {
            objective: fullObjective,
            sourceMaterial: \`Target State: \${translation.scientificObjective}.\\nVisualization Requirement: \${translation.visualMetaphor}.\\nContext: This is a gamified neurofeedback experience.\`
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
# Note: In a real deployment, 'pylsl' would be imported.
# from pylsl import StreamInfo, StreamOutlet

def run_aggregator():
    print(f"[LSL Relay] Starting stream aggregation for '\${streamName}'...")
    print(f"[LSL Relay] Listening for up to \${expectedDeviceCount} devices on local subnets...")
    
    # Simulation of a high-performance aggregation loop
    active_devices = 0
    while True:
        # Simulate device discovery
        if active_devices < \${expectedDeviceCount} and random.random() > 0.8:
            active_devices += 1
            print(f"[LSL Relay] New device discovered. Total active: {active_devices}")
        
        # Simulate aggregating 80 streams into one vector
        # In real life, this pushes data to an LSL Outlet
        
        time.sleep(1)
        sys.stdout.flush()

if __name__ == "__main__":
    run_aggregator()
\`;

        // 1. Write the script to the server
        await runtime.tools.run('Server File Writer', {
            filePath: 'lsl_aggregator.py',
            content: pythonScript,
            baseDir: 'scripts'
        });
        
        // 2. Launch the process
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
    description: 'Modifies a scene description by applying a specific cognitive bias filter (e.g., "Negativity Bias", "Pareidolia").',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To algorithmically distort the narrative based on the user\'s neural state.',
    parameters: [
        { name: 'rawSceneDescription', type: 'string', description: 'The original, objective description.', required: true },
        { name: 'activeBiases', type: 'array', description: 'List of biases to apply.', required: true }
    ],
    implementationCode: `
        const { rawSceneDescription, activeBiases } = args;
        if (!activeBiases || activeBiases.length === 0) return { success: true, filteredDescription: rawSceneDescription };
        
        const systemInstruction = "You are a Cognitive Distortion Filter. Rewrite the input text to reflect the following biases: " + activeBiases.join(', ') + ".\\nKeep the physical facts the same, but change the emotional tone and interpretation. Return ONLY the rewritten text.";
        
        const response = await runtime.ai.generateText(rawSceneDescription, systemInstruction);
        return { success: true, filteredDescription: response };
    `
};

const GENERATE_SCENE_QUANTUM_V2: ToolCreatorPayload = {
    name: 'Generate_Scene_Quantum_V2',
    description: 'The Advanced AI Game Master. Manages a persistent World Graph. Generates narrative based on User Action + EEG State. Calculates Quantum Superposition of possible outcomes and collapses one based on Bias/Lucidity.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To simulate a fuzzy, responsive world where the GM enforces consistency but the user experiences their own biases.',
    parameters: [
        { name: 'worldGraph', type: 'object', description: 'The current persistent state of the world (Nodes, Edges, Entropy).', required: true },
        { name: 'lucidityLevel', type: 'number', description: '0.0 to 1.0. User neural stability.', required: true },
        { name: 'userAction', type: 'string', description: 'The action proposed by the player (optional).', required: false },
        { name: 'userAudio', type: 'string', description: 'Base64 encoded audio input from the player (optional). If provided, the model should analyze the emotional tone.', required: false },
        { name: 'activeBiases', type: 'array', description: 'List of active cognitive distortions.', required: true },
        { name: 'targetLanguage', type: 'string', description: 'The language for the narrative output (e.g., "Russian", "English").', required: false, defaultValue: 'English' }
    ],
    implementationCode: `
        const { worldGraph, lucidityLevel, userAction, userAudio, activeBiases, targetLanguage = 'English' } = args;
        
        const systemInstruction = \`You are the Quantum Game Master (QGM). You control a consistent, persistent world.
        The Player is a visitor. The Player proposes actions, but YOU (the GM) are the final authority. You must check the World Graph (Physics/Lore) to decide if an action is possible.
        
        **INPUT CONTEXT:**
        - World Graph: \${JSON.stringify(worldGraph)}
        - User Proposal: "\${userAction || "None (Initial State)"}"
        - Neural Lucidity: \${lucidityLevel.toFixed(2)} (1.0=Rational, 0.0=Delirious)
        - Active Biases: \${activeBiases.join(', ')}
        
        **LANGUAGE REQUIREMENT:**
        - You MUST generate the 'narrative' and 'suggestedActions' in: **\${targetLanguage}**.
        - The JSON keys (like 'narrative', 'gmRuling') MUST remain in English.
        
        **AUDIO INPUT:**
        If audio is provided, listen closely to the EMOTIONAL TONE.
        - Fear/Panic: Make the outcome more chaotic or hostile.
        - Calm/Assertive: Make the outcome more controlled.
        - Whispering: Enhance the surreal/mysterious elements.
        
        **EXECUTION LOGIC:**
        1. **GM AUTHORITY CHECK:**
           - Is the User Proposal possible? (e.g. If they try to fly but have no wings -> REJECT. If they try to open a locked door without a key -> REJECT).
           - If Rejected: Describe the failure. Do NOT advance the plot significantly.
           - If Accepted: Proceed to Branching.
        
        2. **QUANTUM BRANCHING (If Valid):**
           Generate 3 potential timelines (A, B, C).
           - A: Materialist/Rational outcome.
           - B: Distorted outcome (Apply Active Biases heavily).
           - C: Surreal/Symbolic outcome.
        
        3. **COLLAPSE:**
           Select the branch that best fits the current Lucidity.
        
        4. **NEXT ACTION GENERATION (CRITICAL):**
           - You MUST generate 3-4 *Suggested Actions* for the player in **\${targetLanguage}**.
           - These actions must be influenced by the Active Biases. 
             - E.g., If 'Paranoia' -> Suggest "Check the shadows", "Lock the door".
             - If 'Lucid' -> Suggest "Examine the object", "Walk forward".
        
        **OUTPUT FORMAT (JSON ONLY):**
        {
            "narrative": "Description of what happened (in \${targetLanguage})...",
            "gmRuling": "Accepted" | "Rejected" | "Distorted",
            "suggestedActions": [ "Action 1", "Action 2", "Action 3" ],
            "updatedGraphUpdates": {
                "currentLocation": { "name": "...", "description": "..." },
                "newNodes": [ { "id": "item_1", "description": "...", "entropy": 0.5 } ]
            },
            "quantumBranches": [
                { "id": "A", "desc": "...", "prob": 0.8 },
                { "id": "B", "desc": "...", "prob": 0.2 }
            ],
            "imagePrompt": "...",
            "audioTone": "...",
            "suggestedDuration": 3 // Integer seconds. How long should the player linger on this scene? If the narrative is profound or the image complex, suggest 5-8s. If fast action, 2s.
        }\`;

        const prompt = "Simulate the next time step based on the user proposal.";
        
        // --- MULTIMODAL HANDLING ---
        const files = [];
        if (userAudio) {
            // Treat audio as 'audio/webm' or 'audio/wav' depending on recorder, but 'audio/wav' is safer generic for AI
            files.push({ type: 'audio/wav', data: userAudio });
        }

        // Call AI with correct signature: (text, systemInstruction, tools, files, model)
        const response = await runtime.ai.processRequest(prompt, systemInstruction, [], files, runtime.getState().selectedModel);
        const responseText = response.text;
        
        let resultData;
        
        try {
             const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
             if (!jsonMatch) throw new Error("No JSON found.");
             resultData = JSON.parse(jsonMatch[0]);
        } catch (e) {
             resultData = { 
                 narrative: "The simulation destabilizes. The Game Master is silent. " + e.message, 
                 gmRuling: "Error",
                 suggestedActions: ["Wait", "Focus"],
                 updatedGraphUpdates: {},
                 quantumBranches: []
             };
        }

        // 2. MEDIA GENERATION (Parallel)
        // Use the selected image model from config
        const imagePrompt = resultData.imagePrompt + " . " + (lucidityLevel < 0.5 ? "Surreal, distorted, dreamlike" : "Realistic, gritty, detailed");
        const imagePromise = runtime.ai.generateImage(imagePrompt); 
        
        // Only generate audio for the narrative
        const audioPromise = runtime.ai.generateSpeech(resultData.narrative, lucidityLevel < 0.5 ? 'Fenrir' : 'Zephyr');
        
        const [imageUrl, audioUrl] = await Promise.all([imagePromise, audioPromise]);
        
        return { 
            success: true, 
            narrative: resultData.narrative,
            gmRuling: resultData.gmRuling,
            suggestedActions: resultData.suggestedActions,
            debugData: {
                branches: resultData.quantumBranches,
                graphUpdates: resultData.updatedGraphUpdates,
                suggestedDuration: resultData.suggestedDuration || 3
            },
            imageUrl,
            audioUrl
        };
    `
};

const PSYCHOANALYTIC_ROGUELIKE: ToolCreatorPayload = {
    name: 'Psychoanalytic Generative Roguelike',
    description: 'V3: GM Authority & Cognitive Bias Integration. The player proposes actions, but the AI Game Master validates them against the world lore and the user\'s neural state.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate the "Semantic Uncanny Valley" with full transparency into the generative process and GM authority.',
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
    // --- SIMULATED QUANTUM BIAS SOLVER ---
    const BIAS_POOL = ['Pareidolia', 'Jamais Vu', 'Hyper-vigilance', 'Apophenia', 'Loss Aversion', 'Anchoring', 'False Memory'];

    return {
        update: async (eegData, sampleRate) => {
             // 1. Calculate Neural State (Lucidity)
             let lucidity = 0.5;
             let vetoSignal = 0;
             try {
                 const time = Date.now() / 3000;
                 // Simulate lucidity drifting based on "Focus" (mocked)
                 lucidity = 0.6 + Math.sin(time) * 0.3 + (Math.random() - 0.5) * 0.15;
                 lucidity = Math.max(0.05, Math.min(0.95, lucidity));
                 
                 // Veto (Beta/Gamma spike simulation)
                 if (eegData && eegData['Fz']) {
                     vetoSignal = Math.random() * 0.8; 
                 }
             } catch(e) {}

             // 2. Determine Active Biases based on Lucidity
             // Lower lucidity = More active biases filtering the world
             const activeBiases = [];
             const biasCount = Math.floor((1.0 - lucidity) * 3); 
             const shuffled = [...BIAS_POOL].sort(() => 0.5 - Math.random());
             for(let i=0; i<biasCount; i++) activeBiases.push(shuffled[i]);

             return { lucidity, activeBiases, vetoSignal };
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
