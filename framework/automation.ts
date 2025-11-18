// framework/automation.ts
import type { ToolCreatorPayload } from '../types';

const ARCHITECTURAL_PRINCIPLE_RECORDER: ToolCreatorPayload = {
    name: 'Core Architectural Principle: Multiple Tool Calls Over JSON',
    description: '"For everything, make a tool. Do not generate JSON. The architecture is multiple tool calls." - This is the foundational rule for building robust, predictable agentic systems.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To permanently record and serve as a constant reminder of the core design philosophy. Its existence in the tool list ensures the principle is always present during agent operation and self-modification.',
    parameters: [],
    implementationCode: `
      const principle = "For everything, make a tool. Do not generate JSON. The architecture is multiple tool calls.";
      runtime.logEvent('[FRAMEWORK] Core architectural principle acknowledged: ' + principle);
      return { success: true, message: 'This tool serves as a record of the core architectural principle and performs no operational action.' };
    `
};


const WORKFLOW_CREATOR_TOOL: ToolCreatorPayload = {
    name: 'Workflow Creator',
    description: 'Creates a new, high-level "Automation" tool by combining a sequence of other tool calls into a single, reusable workflow. These workflows run on the client.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To allow the agent to learn and automate repetitive tasks, creating higher-level skills from basic components.",
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new workflow tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear, concise description of what the entire workflow accomplishes.', required: true },
      { name: 'purpose', type: 'string', description: 'An explanation of why this workflow is valuable and what problem it automates.', required: true },
      { name: 'steps', type: 'array', description: 'An array of objects, where each object defines a step with a "toolName" and "arguments".', required: true },
    ],
    implementationCode: `
      const { name, description, purpose, steps } = args;
      if (!name || !description || !purpose || !Array.isArray(steps) || steps.length === 0) {
        throw new Error("Workflow name, description, purpose, and at least one step are required.");
      }

      const newToolImplementation = 
        'const results = [];\\n' +
        'const workflowSteps = ' + JSON.stringify(steps, null, 2) + ';\\n' +
        'for (const step of workflowSteps) {\\n' +
        '    console.log("Running workflow step: " + step.toolName);\\n' +
        '    try {\\n' +
        '        const result = await runtime.tools.run(step.toolName, step.arguments);\\n' +
        '        results.push({ step: step.toolName, success: true, result });\\n' +
        '    } catch (e) {\\n' +
        '        results.push({ step: step.toolName, success: false, error: e.message });\\n' +
        '        throw new Error("Workflow \\'' + name + '\\' failed at step \\'' + step.toolName + '\\': " + e.message);\\n' +
        '    }\\n' +
        '}\\n' +
        'return { success: true, message: "Workflow completed successfully.", results };';
      
      const result = await runtime.tools.run('Tool Creator', {
        name,
        description,
        category: 'Automation',
        executionEnvironment: 'Client',
        parameters: [], 
        implementationCode: newToolImplementation,
        purpose,
      });
      
      return { success: true, message: 'Successfully created new workflow tool: \\'' + name + '\\'.', tool: result.tool };
    `
  };

const PROPOSE_SKILL_TOOL: ToolCreatorPayload = {
    name: 'Propose Skill From Observation',
    description: "Analyzes the recent history of the user's actions, infers the high-level intent, and proposes a new, reusable tool (a workflow or functional tool) to automate that task.",
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To enable the agent to learn from a human pilot by turning observed actions into new, generalized, and reusable skills.',
    parameters: [
      { name: 'skillName', type: 'string', description: 'A descriptive name for the new skill (e.g., "PatrolSquarePattern").', required: true },
      { name: 'skillDescription', type: 'string', description: 'A clear description of what the new skill will accomplish.', required: true },
      { name: 'skillPurpose', type: 'string', description: 'An explanation of why this new skill is valuable.', required: true },
    ],
    implementationCode: `
      const { skillName, skillDescription, skillPurpose } = args;
      const observedActions = runtime.getObservationHistory();

      if (observedActions.length < 2) {
        throw new Error("Not enough actions observed to create a skill. Manually perform at least 2 actions first.");
      }

      const steps = observedActions.map(action => ({
        toolName: action.name,
        arguments: action.arguments,
      }));

      await runtime.tools.run('Workflow Creator', {
        name: skillName,
        description: skillDescription,
        purpose: skillPurpose,
        steps: steps,
      });

      runtime.clearObservationHistory();

      return { success: true, message: 'Successfully created new skill \\'' + skillName + '\\' based on ' + observedActions.length + ' observed actions.' };
    `
};

// --- START: Core Self-Development Tools ---

// FIX: Radically simplified and strengthened the prompts for UI code generation and correction.
// These new instructions use clearer rules, positive/negative examples, and a direct tone
// to minimize the chance of the AI producing malformed JSX, which was causing runtime errors.

const GENERATE_UI_CODE_SYSTEM_INSTRUCTION = `You are a React code generator. Your output is executed directly. You MUST follow these rules perfectly.

**RULE 1: NO WRAPPERS.**
- Your entire response is ONLY the body of a React component.
- DO NOT write \`const MyComponent = (props) => { ... }\`.
- DO NOT write \`import\` or \`export\`.
- DO NOT wrap your code in markdown backticks like \`\`\`jsx ... \`\`\`.

**RULE 2: HANDLE MISSING DATA.**
- The component receives one prop: \`processedData\`.
- Always check if \`processedData\` exists. If not, show a "Waiting for data..." message.
- Example: \`if (!processedData) { return <div>Waiting...</div>; }\`

**RULE 3: USE INLINE STYLES.**
- All styling MUST be inline style objects, like \`style={{ color: 'red', fontSize: 12 }}\`.
- DO NOT use CSS classes or \`<style>\` tags.

**RULE 4: DIRECT RETURN.**
- Your code must be a valid series of JavaScript statements that ends in a \`return\` of JSX.
- It can start with variable declarations (\`const x = ...\`) and must end with \`return (...);\`.

**RULE 5: NO TEMPLATE LITERALS.**
- DO NOT use backticks (\`) for strings. Use single quotes ('') or double quotes ("").
- To combine strings and variables, use the '+' operator.
- Example: \`'hsl(200, 100%, ' + (30 + alphaRatio * 40) + '%)'\`

---
**PERFECT RESPONSE EXAMPLE:**
(Your output should look EXACTLY like this, with NO surrounding text or markdown)

const alphaRatio = processedData?.alpha_power_ratio || 0;
const circleSize = 50 + (alphaRatio * 150);
const circleColor = 'hsl(200, 100%, ' + (30 + alphaRatio * 40) + '%)';

if (!processedData) {
  return <div style={{ color: '#888' }}>Waiting for EEG data...</div>;
}

return (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
    <div style={{ width: circleSize, height: circleSize, backgroundColor: circleColor, borderRadius: '50%', transition: 'all 0.5s ease-out' }} />
    <p style={{ marginTop: 20, fontSize: '1.2rem', fontWeight: 'bold' }}>
        Alpha Power: { (alphaRatio * 100).toFixed(1) }%
    </p>
  </div>
);

---
**BAD RESPONSE EXAMPLE (DO NOT DO THIS):**
\`\`\`jsx
const MyComponent = ({ processedData }) => {
  // ... code ...
}
export default MyComponent;
\`\`\`

Now, based on the provided source material, write the React component code.`;


const CORRECT_UI_CODE_SYSTEM_INSTRUCTION = `You are a React code debugger. You are fixing faulty JSX code. Your output is executed directly. You MUST follow these rules perfectly.

**THE PROBLEM:** The \`faultyCode\` you received caused the error: \`errorMessage\`. This is usually because it violates the required format.

**RULES FOR THE FIX:**
1.  **NO WRAPPERS:** The corrected code must be ONLY the body of a React component. No function definition, no imports/exports, no markdown backticks.
2.  **HANDLE MISSING DATA:** The code must check for \`processedData\` and show a "Waiting..." message if it's missing.
3.  **INLINE STYLES ONLY:** All styles must be inline style objects, like \`style={{ color: 'red' }}\`.
4.  **DIRECT RETURN:** The code must be valid JavaScript statements ending in a \`return\` of JSX.
5.  **NO TEMPLATE LITERALS:** Do not use backticks (\`). Use string concatenation with the '+' operator.

**YOUR TASK:**
Analyze the \`faultyCode\` and \`errorMessage\`. Rewrite the code to fix the error AND ensure it follows all the rules above. Your entire response must be ONLY the corrected, raw JSX code. Do not add any explanation.

---
**PERFECT RESPONSE EXAMPLE:**
const alphaRatio = processedData?.alpha_power_ratio || 0;
const circleSize = 50 + (alphaRatio * 150);

if (!processedData) {
  return <div style={{ color: '#888' }}>Waiting for EEG data...</div>;
}

return (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ width: circleSize, height: circleSize, backgroundColor: 'cyan', borderRadius: '50%' }} />
  </div>
);
---

Now, fix the faulty code based on the error and the original source material.`;

// FIX: Added missing GENERATE_EEG_PROCESSING_FUNCTION_SYSTEM_INSTRUCTION constant definition.
const GENERATE_EEG_PROCESSING_FUNCTION_SYSTEM_INSTRUCTION = `You are an expert in biomedical signal processing and JavaScript. Your task is to analyze a scientific abstract and generate the necessary artifacts for a neurofeedback protocol.

**CRITICAL REQUIREMENTS:**
1.  **Analyze Input:** From the abstract, determine:
    a.  The specific EEG channels required (e.g., ['Cz', 'Pz']). If not specified, use a single channel ['Cz'].
    b.  The key metrics that need to be calculated (e.g., ['alpha_theta_ratio', 'beta_power']).
2.  **Write Processing Function:** Write a single, self-contained JavaScript arrow function that processes the raw EEG signal.
    *   **Signature:** It MUST be \`(eegData, sampleRate) => { ... }\`.
    *   **Input \`eegData\`:** This is a JavaScript object where keys are the channel names you identified, and values are arrays of floats (e.g., \`{ "Cz": [0.1, ...], "Pz": [-0.2, ...] }\`).
    *   **Output:** It MUST return a single JSON object with the calculated metrics you identified as keys.
    *   **No Dependencies:** The function must be pure and self-contained. You must implement any necessary math (like power calculation) yourself. Use simplified simulations (e.g., Math.random()) where complex DSP/FFT would normally be required. The key is to produce the correctly named metrics.
3.  **Final Response Format:** Your ENTIRE response MUST be a single, valid JSON object and nothing else. Do not wrap it in markdown backticks. The JSON object must have two keys:
    *   \`"dataRequirements"\`: An object with keys \`"type"\` (always "eeg"), \`"channels"\` (an array of strings), and \`"metrics"\` (an array of strings).
    *   \`"processingCode"\`: A string containing the complete code for the arrow function you wrote.
4.  **NO TEMPLATE LITERALS:** In the processingCode string, DO NOT use backticks (\`). Use string concatenation with '+' instead.

**EXAMPLE RESPONSE:**
{
  "dataRequirements": {
    "type": "eeg",
    "channels": ["C3", "C4"],
    "metrics": ["smr_power", "smr_coherence"]
  },
  "processingCode": "(eegData, sampleRate) => {\\n    // eegData will be like { C3: [...], C4: [...] }\\n    const smrPowerC3 = Math.random() * 10;\\n    const smrPowerC4 = Math.random() * 10;\\n    const smrCoherence = Math.random() * 0.8 + 0.1;\\n\\n    return {\\n        smr_power: (smrPowerC3 + smrPowerC4) / 2,\\n        smr_coherence: smrCoherence\\n    };\\n}"
}`;


const GENERATE_EEG_PROCESSING_FUNCTION: ToolCreatorPayload = {
    name: 'Generate EEG Processing Function',
    description: 'Takes a scientific abstract and generates a self-contained JavaScript function to perform the required EEG signal processing, along with a data requirements manifest.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To generate the data processing logic and its required inputs for a neurofeedback protocol, which can then be executed locally in real-time.',
    parameters: [
        { name: 'sourceMaterial', type: 'string', description: 'The text (e.g., scientific abstract) detailing the metrics to be calculated.', required: true },
    ],
    implementationCode: `
        const { sourceMaterial } = args;
        const systemInstruction = ${JSON.stringify(GENERATE_EEG_PROCESSING_FUNCTION_SYSTEM_INSTRUCTION)};
        const prompt = '## Scientific Abstract ##\\n' + sourceMaterial + '\\n\\n## Processing Artifacts JSON ##';
        runtime.logEvent('[Generator] Generating EEG processing function and data manifest...');
        const responseText = await runtime.ai.generateText(prompt, systemInstruction);
        
        try {
            const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
            if (!jsonMatch) throw new Error("No JSON object found in the AI's response.");
            const artifacts = JSON.parse(jsonMatch[0]);

            if (!artifacts.processingCode || !artifacts.dataRequirements) {
                 throw new Error("The AI's JSON response was missing 'processingCode' or 'dataRequirements'.");
            }
            runtime.logEvent('[Generator] EEG processing artifacts generated successfully.');
            return { success: true, ...artifacts };
        } catch (e) {
            runtime.logEvent('[Generator] ❌ Error parsing processing artifacts from AI. Response was: ' + responseText);
            throw new Error('Failed to parse artifacts: ' + e.message);
        }
    `
};

const DEVELOP_TOOL_FROM_OBJECTIVE: ToolCreatorPayload = {
    name: 'Develop Tool from Objective',
    description: 'The primary self-development workflow. Takes a high-level objective and source material, then orchestrates the generation, correction, and creation of a new tool to meet that objective.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To provide a robust, generic, and self-healing mechanism for the framework to expand its own capabilities. This is the core of autonomous tool development.',
    parameters: [
         { name: 'objective', type: 'string', description: 'A clear, high-level goal for the new tool (e.g., "Create a UI component to visualize alpha waves").', required: true },
         { name: 'sourceMaterial', type: 'string', description: 'The source text (e.g., a scientific abstract, user story) providing the context and requirements for the new tool.', required: true },
    ],
    implementationCode: `
        const { objective, sourceMaterial } = args;
        runtime.logEvent('[Developer] Starting development for objective: "' + objective + '"');
        
        runtime.reportProgress({ text: 'Step 1/3: Generating tool name...', current: 1, total: 3 });
        const { name: newToolName } = await runtime.tools.run('Generate Tool Name from Objective', { objective });
        
        // --- SELF-HEALING GENERATION LOOP ---
        const maxAttempts = 3;
        let lastError = null;
        let newTool = null;
        let implementationCode = '';
        let processingCode = '';
        let dataRequirements = null;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            runtime.logEvent('[Developer] Code generation attempt ' + attempt + '/' + maxAttempts + '...');
            
            try {
                if (attempt === 1) {
                    // First attempt: generate both UI and processing code in parallel
                    runtime.reportProgress({ text: 'Step 2/3: Generating UI & Processing code (Attempt ' + attempt + '/' + maxAttempts + ')...', current: 2, total: 3 });
                    const [uiResult, processingResult] = await Promise.all([
                        runtime.tools.run('Generate UI Component Code', { sourceMaterial }),
                        runtime.tools.run('Generate EEG Processing Function', { sourceMaterial })
                    ]);
                    implementationCode = uiResult.implementationCode;
                    processingCode = processingResult.processingCode;
                    dataRequirements = processingResult.dataRequirements;
                } else {
                    // Subsequent attempts: try to correct only the UI code.
                    runtime.logEvent('[Developer] Calling corrector for faulty UI code. Error was: ' + lastError.message);
                     runtime.reportProgress({ text: 'Step 2/3: Correcting UI code (Attempt ' + attempt + '/' + maxAttempts + ')...', current: 2, total: 3 });
                    const result = await runtime.tools.run('Correct Invalid UI Component Code', {
                        sourceMaterial: sourceMaterial,
                        faultyCode: implementationCode,
                        errorMessage: lastError.message
                    });
                    implementationCode = result.correctedCode;
                }

                // TEST the generated code by trying to create the tool with it.
                // This will throw a compilation error if the code is invalid, which we catch.
                runtime.reportProgress({ text: 'Step 3/3: Testing and creating the new tool...', current: 3, total: 3 });
                const newToolPayload = {
                    name: newToolName,
                    description: sourceMaterial, // Use the source material as the description
                    category: 'UI Component', // Currently hardcoded for UI, could be a parameter
                    executionEnvironment: 'Client',
                    parameters: [
                        { name: 'processedData', type: 'object', description: 'Real-time processed data from a processor tool.', required: true },
                        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: false }
                    ],
                    implementationCode: implementationCode,
                    processingCode: processingCode,
                    dataRequirements: dataRequirements,
                    purpose: 'A dynamically generated visualizer for the objective: "' + objective + '"'
                };
                const creationResult = await runtime.tools.run('Tool Creator', newToolPayload);
                newTool = creationResult.tool;

                if (!newTool) {
                    throw new Error("The Tool Creator failed to return a new tool definition despite not throwing an error.");
                }
                
                runtime.logEvent('[Developer] ✅ Code validation successful on attempt ' + attempt + '.');
                break; // Success, exit the loop.

            } catch (e) {
                lastError = e;
                runtime.logEvent('[Developer] ❌ Attempt ' + attempt + ' failed: ' + e.message);
                if (attempt === maxAttempts) {
                    runtime.logEvent('[Developer] All ' + maxAttempts + ' attempts failed. Aborting development.');
                } else {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
        }

        if (!newTool) {
            // If the loop finished without creating a tool, throw the last error encountered.
            throw new Error('Failed to develop and validate new tool after ' + maxAttempts + ' attempts. Last error: ' + (lastError ? lastError.message : 'Unknown error'));
        }
        
        runtime.reportProgress(null);
        runtime.logEvent('[Developer] --> ✅ SUCCESS! New tool \\'' + newTool.name + '\\' developed.');

        return { success: true, newTool };
    `
};

const GENERATE_TOOL_NAME: ToolCreatorPayload = {
    name: 'Generate Tool Name from Objective',
    description: 'Takes a development objective and generates a short, descriptive name for the new tool.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To create clean, human-readable names for dynamically generated tools.',
    parameters: [
        { name: 'objective', type: 'string', description: 'The objective or title that the new tool is based on.', required: true },
    ],
    implementationCode: `
        const { objective } = args;
        const systemInstruction = 'You are a naming assistant. Your task is to create a short, catchy, and descriptive name for a software tool based on a development objective.\\nThe name should be 3-5 words long.\\nYou MUST call the \\'RecordToolName\\' tool with the generated name. Your response MUST be ONLY this single tool call.';
        const prompt = 'Generate a tool name for the objective: "' + objective + '" and submit it via the \\'RecordToolName\\' tool.';
        
        const recordTool = runtime.tools.list().find(t => t.name === 'RecordToolName');
        if (!recordTool) throw new Error("Core tool 'RecordToolName' not found.");

        try {
            const aiResponse = await runtime.ai.processRequest(prompt, systemInstruction, [recordTool]);
            if (aiResponse?.toolCalls?.length && aiResponse.toolCalls[0].name === 'RecordToolName') {
                const toolName = aiResponse.toolCalls[0].arguments.name;
                if (!toolName) throw new Error("Tool call did not contain a 'name' argument.");
                return { success: true, name: toolName };
            } else {
                throw new Error("AI did not call the 'RecordToolName' tool as instructed.");
            }
        } catch (e) {
            runtime.logEvent('[Namer] Failed to generate tool name via tool call, using fallback. Error: ' + e.message);
            const fallbackName = objective.split(' ').slice(0, 4).join(' ') + ' Tool';
            return { success: true, name: fallbackName };
        }
    `
};

const GENERATE_UI_CODE: ToolCreatorPayload = {
    name: 'Generate UI Component Code',
    description: 'Takes source material (e.g., an abstract) and uses an AI to write the JSX code for a React UI component that provides a data visualization.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To dynamically generate the visual implementation of a protocol or data display as a self-contained string of code.',
    parameters: [
        { name: 'sourceMaterial', type: 'string', description: 'The text (e.g., scientific abstract, user story) detailing the component requirements.', required: true },
    ],
    implementationCode: `
        const { sourceMaterial } = args;
        const systemInstruction = ${JSON.stringify(GENERATE_UI_CODE_SYSTEM_INSTRUCTION)};
        const prompt = '## Source Material ##\\n' + sourceMaterial + '\\n\\n## React Component Code ##';
        runtime.logEvent('[Generator] Generating UI component code...');
        const uiCode = await runtime.ai.generateText(prompt, systemInstruction);
        if (!uiCode || uiCode.length < 50) {
            throw new Error("AI failed to generate valid UI component code.");
        }
        runtime.logEvent('[Generator] UI code generated successfully.');
        return { success: true, implementationCode: uiCode };
    `
};

const CORRECT_UI_CODE: ToolCreatorPayload = {
    name: 'Correct Invalid UI Component Code',
    description: 'Analyzes faulty JSX code for a React component, reviews the compilation error, and provides a corrected version.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To enable self-healing during the dynamic generation process. When the AI generates invalid code, this tool is used to fix it.',
    parameters: [
        { name: 'sourceMaterial', type: 'string', description: 'The original source material for context.', required: true },
        { name: 'faultyCode', type: 'string', description: 'The string of JSX code that failed to compile.', required: true },
        { name: 'errorMessage', type: 'string', description: 'The error message from the compiler.', required: true },
    ],
    implementationCode: `
        const { sourceMaterial, faultyCode, errorMessage } = args;
        const systemInstruction = ${JSON.stringify(CORRECT_UI_CODE_SYSTEM_INSTRUCTION)};
        const prompt = '## Original Source Material (for context) ##\\n' +
            sourceMaterial + '\\n\\n' +
            '## Faulty Code ##\\n' +
            '\\\`\\\`\\\`javascript\\n' +
            faultyCode + '\\n' +
            '\\\`\\\`\\\`\\n\\n' +
            '## Compilation Error Message ##\\n' +
            errorMessage + '\\n\\n' +
            '## Corrected React Component Code ##';
        runtime.logEvent('[Corrector] Attempting to correct faulty UI code...');
        const correctedCode = await runtime.ai.generateText(prompt, systemInstruction);
        if (!correctedCode || correctedCode.length < 50) {
            throw new Error("AI failed to generate a corrected version of the UI code.");
        }
        runtime.logEvent('[Corrector] Generated a new version of the code.');
        return { success: true, correctedCode };
    `
};

// Renamed from RecordProtocolName to be more generic
const RECORD_TOOL_NAME: ToolCreatorPayload = {
    name: 'RecordToolName',
    description: 'A data recording tool that accepts a generated name for a tool.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To provide a structured endpoint for an AI to submit a generated tool name.',
    parameters: [
        { name: 'name', type: 'string', description: 'The generated tool name.', required: true },
    ],
    implementationCode: `
        return { success: true, name: args.name };
    `
};


// --- END: Core Self-Development Tools ---

const VIBECODE_ENVIRONMENT_OPTIMIZER: ToolCreatorPayload = {
    name: 'Vibecode Environment Optimizer',
    description: 'Automatically writes and refines a UI component, using real-time EEG feedback from the active player session as a loss function.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To create a hyper-personalized UI/UX by iteratively designing and validating visuals against a user neural state, achieving a target "vibe" like Focus or Relaxation.',
    parameters: [
        { name: 'target_vibe', type: 'string', description: 'The target mental state to optimize for (e.g., "deep focus", "calm relaxation").', required: true },
        { name: 'iterations', type: 'number', description: 'The number of optimization cycles to run.', required: false, defaultValue: 5 },
    ],
    implementationCode: `
        const { target_vibe, iterations = 5 } = args;
        
        if (!runtime.eeg.getGlobalEegData()) {
            throw new Error("Vibecoding requires an active EEG stream. Please start a session in the player before running this workflow.");
        }
        
        runtime.logEvent('[VibeCoder] Initializing... Searching for the optimal UI for a \\'' + target_vibe + '\\' state.');
        runtime.vibecoder.clearHistory();

        // 1. Generate initial UI code
        runtime.reportProgress({ text: 'Generating initial concept...', current: 0, total: iterations });
        let generationResult = await runtime.tools.run('Generate UI Component Code', {
            sourceMaterial: 'Create a minimalist, abstract UI visualization for inducing a state of ' + target_vibe + '. Use subtle colors, fluid motion, and avoid sharp edges or jarring text.'
        });
        let currentCode = generationResult.implementationCode;
        
        let bestVibeScore = -Infinity;
        let bestCode = currentCode;
        let lastVibeScore = -1;

        // 2. Start the Vibecoding optimization loop
        for (let i = 1; i <= iterations; i++) {
            runtime.logEvent('[VibeCoder] << Iteration ' + i + '/' + iterations + ' >>');
            runtime.reportProgress({ text: 'Testing Vibe (Iteration ' + i + '/' + iterations + ')...', current: i, total: iterations });

            // A. Create a temporary tool to render the current UI code
            const tempToolName = 'VibeTest_v' + i + '_' + Date.now();
            const { tool: tempTool } = await runtime.tools.run('Tool Creator', {
                name: tempToolName,
                category: 'UI Component',
                executionEnvironment: 'Client',
                parameters: [{ name: 'processedData', type: 'object', description: 'N/A', required: false }],
                implementationCode: currentCode,
                purpose: 'Temporary tool for vibe testing.',
                description: 'A temporary, dynamically generated UI component for vibecoding.'
            });

            // A.2. Launch the new tool onto the main screen for testing.
            runtime.os.launchApp(tempTool.id);
            
            // B. Get a "vibe score" from the live EEG data stream
            runtime.logEvent('[VibeCoder] Capturing live EEG data from player session (3s exposure)...');
            await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate a 3-second exposure time
            const eegData = runtime.eeg.getGlobalEegData();
            if (!eegData) {
                throw new Error("EEG data stream stopped unexpectedly during vibecoding.");
            }

            runtime.logEvent('[VibeCoder] Analyzing neural coherence...');
            const eegAnalysis = await runtime.tools.run('Calculate_Coherence_Matrix_Optimized', { 
                eegData: eegData,
                sampleRate: 250,
                freqRange: [8, 12] // Focus on Alpha for this example
            });
            const currentVibeScore = eegAnalysis.avg_coherence || 0;
            
            runtime.logEvent('[VibeCoder] Vibe Score (Alpha Coherence): ' + currentVibeScore.toFixed(4));
            runtime.vibecoder.recordIteration({ iteration: i, score: currentVibeScore, code: currentCode, toolName: tempToolName });


            // C. Vibe Check: Decide how to mutate the code
            let mutationPrompt;
            if (currentVibeScore > bestVibeScore) {
                bestVibeScore = currentVibeScore;
                bestCode = currentCode;
                runtime.logEvent('[VibeCoder] --> ✅ New best vibe found! Refining this design...');
                mutationPrompt = 'The user responded positively to this design (vibe score improved to ' + currentVibeScore.toFixed(2) + '). Refine it slightly. Make it 15% more immersive or engaging, but maintain the core aesthetic. For example, enhance the color depth, smooth out an animation, or add a subtle background effect. Do not make radical changes.';
            } else {
                runtime.logEvent('[VibeCoder] --> ❌ Vibe score dropped. Trying a different approach.');
                if (lastVibeScore > -1 && currentVibeScore < lastVibeScore * 0.9) {
                    mutationPrompt = 'The last change was a failure (vibe score dropped significantly). Revert the last change and try a completely different visual metaphor for \\'' + target_vibe + '\\'. Previous successful code is provided for context, but create something new. Avoid the style that led to the drop.';
                } else {
                    mutationPrompt = 'The user did not respond well to this design (vibe score: ' + currentVibeScore.toFixed(2) + '). Generate a completely different visual concept for \\'' + target_vibe + '\\'. Try a new color palette (e.g., warm tones instead of cool), or a different type of motion (e.g., geometric instead of organic).';
                }
            }

            // D. Generate the next version of the code
            if (i < iterations) {
                 runtime.reportProgress({ text: 'Mutating code based on feedback (Iteration ' + i + '/' + iterations + ')...', current: i, total: iterations });
                 generationResult = await runtime.tools.run('Correct Invalid UI Component Code', {
                    sourceMaterial: mutationPrompt,
                    faultyCode: currentCode, // Give it context of what it's changing
                    errorMessage: "No compilation error; this is a design mutation request based on user feedback."
                });
                currentCode = generationResult.correctedCode;
                lastVibeScore = currentVibeScore;
            }
        }

        runtime.reportProgress(null); // Clear progress bar
        runtime.logEvent('[VibeCoder] ✅ Optimization complete. Best vibe score achieved: ' + bestVibeScore.toFixed(4));
        
        // Final step: Create the permanent, optimized tool
        const finalToolName = target_vibe.replace(/\\s+/g, '_') + '_Vibe_Optimized_UI';
        const { tool: finalTool } = await runtime.tools.run('Tool Creator', {
            name: finalToolName,
            description: 'A UI environment optimized for \\'' + target_vibe + '\\' using ' + iterations + ' cycles of neurofeedback-driven design.',
            purpose: 'A hyper-personalized UI generated via Vibecoding.',
            category: 'UI Component',
            executionEnvironment: 'Client',
            parameters: [{ name: 'processedData', type: 'object', description: 'N/A', required: false }],
            implementationCode: bestCode
        });

        runtime.logEvent('[VibeCoder] --> Created final protocol: \\'' + finalToolName + '\\'. Launching it now.');
        runtime.os.launchApp(finalTool.id);

        return { success: true, optimalCode: bestCode, finalScore: bestVibeScore, finalToolName: finalToolName };
    `
};

export const AUTOMATION_TOOLS: ToolCreatorPayload[] = [
    ARCHITECTURAL_PRINCIPLE_RECORDER,
    WORKFLOW_CREATOR_TOOL,
    PROPOSE_SKILL_TOOL,
    DEVELOP_TOOL_FROM_OBJECTIVE,
    GENERATE_TOOL_NAME,
    GENERATE_UI_CODE,
    CORRECT_UI_CODE,
    RECORD_TOOL_NAME,
    GENERATE_EEG_PROCESSING_FUNCTION,
    VIBECODE_ENVIRONMENT_OPTIMIZER,
];