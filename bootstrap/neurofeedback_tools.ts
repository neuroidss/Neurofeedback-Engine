import type { ToolCreatorPayload } from '../types';

export const NEUROFEEDBACK_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Generate Protocol Name from Title',
        description: 'Takes a scientific paper title and generates a short, descriptive name for a neurofeedback protocol.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To create clean, human-readable names for dynamically generated neurofeedback tools.',
        parameters: [
            { name: 'paperTitle', type: 'string', description: 'The full title of the scientific paper.', required: true },
        ],
        implementationCode: `
            const { paperTitle } = args;
            const systemInstruction = \`You are a naming assistant. Your task is to create a short, catchy, and descriptive name for a neurofeedback protocol based on a scientific paper title.
The name should be 3-5 words long.
You MUST respond with ONLY a single, valid JSON object in the format:
{
  "protocolName": "Your Generated Name"
}\`;
            const prompt = \`Generate a protocol name for a paper titled: "\${paperTitle}"\`;
            
            const responseText = await runtime.ai.generateText(prompt, systemInstruction);
            try {
                const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) throw new Error("No valid JSON found in AI response.");
                const parsed = JSON.parse(jsonMatch[0]);
                if (!parsed.protocolName) throw new Error("JSON response did not contain 'protocolName' field.");
                return { success: true, protocolName: parsed.protocolName };
            } catch (e) {
                runtime.logEvent('[Namer] Failed to parse protocol name, using fallback. Error: ' + e.message);
                // Fallback to a simple name
                const fallbackName = paperTitle.split(' ').slice(0, 4).join(' ') + ' Protocol';
                return { success: true, protocolName: fallbackName };
            }
        `
    },
    {
        name: 'Generate Neurofeedback UI Tool',
        description: 'The core of the engine. Takes a scientific paper abstract, uses an AI to write a React component for neurofeedback visualization, and then creates a new, executable UI tool from that code.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To dynamically create new, runnable neurofeedback protocols as self-contained software tools.',
        parameters: [
            { name: 'paperAbstract', type: 'string', description: 'The abstract of the scientific paper detailing the neurofeedback method.', required: true },
            { name: 'protocolName', type: 'string', description: 'The desired name for the new neurofeedback tool.', required: true },
        ],
        implementationCode: `
            const { paperAbstract, protocolName } = args;

            const systemInstruction = \`You are an expert React developer creating a single, self-contained neurofeedback visualization component using JSX.

**RULES:**
1.  **Input Prop:** The component will receive a single prop: \`props.processedData\`. This is a JavaScript object containing the real-time, processed EEG metrics (e.g., \`{ "alpha_theta_ratio": 1.5, "beta_power": 0.8 }\`). The keys in this object are derived directly from the paper's abstract.
2.  **Visualization:** Create a simple, clear visualization using basic HTML elements (div, span) with inline styles or simple inline SVG. DO NOT use complex libraries. The visualization should react dynamically to the values in \`props.processedData\`.
3.  **Code Format:**
    *   The entire output MUST be only the JavaScript/JSX code for the React functional component.
    *   DO NOT include \`import React from 'react';\`.
    *   DO NOT include \`export default ...;\`.
    *   DO NOT wrap the code in markdown backticks (\`\`\`).
    *   Provide a fallback display for when data is not yet available (e.g., when \`props.processedData\` is null or empty).
4.  **Example Logic:** If the paper says "increased alpha power is rewarded", your component might change a div's color or size based on \`props.processedData.alpha_power\`.
5.  **Icons:** You have access to pre-defined icon components like <PlayIcon />, <BeakerIcon />, etc. You can use them if it makes sense.

**YOUR TASK:**
Based on the provided paper abstract, write the React component code.\`;

            const prompt = \`## Paper Abstract ##
\${paperAbstract}

## React Component Code ##\`;

            runtime.logEvent('[Generator] Generating UI component code for: ' + protocolName);
            const uiCode = await runtime.ai.generateText(prompt, systemInstruction);

            if (!uiCode || uiCode.length < 50) {
                throw new Error("AI failed to generate valid UI component code.");
            }
            
            runtime.logEvent('[Generator] UI code generated. Creating new tool...');

            // The 'description' of the new tool IS the paper abstract.
            // This is critical, as it allows the EEG processor to read it at runtime.
            const newToolPayload = {
                name: protocolName,
                description: paperAbstract,
                category: 'UI Component',
                executionEnvironment: 'Client',
                parameters: [
                    { name: 'processedData', type: 'object', description: 'Real-time processed EEG data from the processor tool.', required: true },
                    { name: 'runtime', type: 'object', description: 'The application runtime API.', required: false }
                ],
                implementationCode: uiCode,
                purpose: \\\`A dynamically generated neurofeedback visualizer based on the paper titled: "\${protocolName}"\\\`
            };

            const result = await runtime.tools.run('Tool Creator', newToolPayload);

            return { 
                success: true, 
                message: \\\`New neurofeedback tool '\${protocolName}' created successfully.\\\`, 
                newTool: result.tool 
            };
        `
    },
    {
        name: 'Process Raw EEG Data Based On Paper',
        description: 'Takes a raw EEG signal and a scientific paper abstract, then uses a powerful AI to write and execute Python code to process the signal according to the methods described in the paper.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To enable dynamic, science-driven EEG signal processing where the logic is not hardcoded but derived directly from the source research.',
        parameters: [
            { name: 'rawEegSignal', type: 'array', description: 'An array of numbers representing the raw EEG signal for a short time window.', required: true },
            { name: 'paperAbstract', type: 'string', description: 'The abstract of the paper, which describes the metrics to be calculated.', required: true },
        ],
        implementationCode: `
            const { rawEegSignal, paperAbstract } = args;

            // This tool now uses a client-side AI call. It no longer requires a separate Python service.
            const systemInstruction = \`You are an expert in biomedical signal processing. Your task is to write and execute Python code to analyze a raw EEG signal based on instructions from a scientific paper abstract.

**CONTEXT:**
- You will be given a raw EEG signal as a Python list of floats.
- You will be given the abstract of a scientific paper.
- The sample rate is 256 Hz.

**INSTRUCTIONS:**
1.  Analyze the abstract to identify the key EEG metrics or features used for the neurofeedback (e.g., "alpha/theta ratio", "power in the beta band (13-30Hz)", "gamma power").
2.  Write a Python script that takes the raw signal and calculates these metrics. Use libraries like \`numpy\` and \`scipy.signal\`.
3.  Your script must print the final calculated metrics as a single line of valid JSON to stdout. The keys in the JSON should be descriptive (e.g., \`{"alpha_theta_ratio": 1.5, "beta_power": 12.3}\`).
4.  You MUST respond with ONLY the final JSON output. Do not include any other text, explanations, or python code in your final response.

**EXAMPLE:**
If the abstract mentions rewarding "the ratio of beta to alpha power", your Python script should calculate these powers and print something like \`{"beta_alpha_ratio": 1.25}\`. Your final output for this tool call would be just that JSON object.
\`;
            
            const prompt = \`## Scientific Abstract ##
\${paperAbstract}

## Raw EEG Signal (as Python list) ##
\${JSON.stringify(rawEegSignal)}

## Final JSON Output ##
\`;
            
            // We expect the AI to return a JSON string directly.
            const jsonResponse = await runtime.ai.generateText(prompt, systemInstruction);

            try {
                // Find the JSON object within the response, as the model might add extra text.
                const jsonMatch = jsonResponse.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) {
                    throw new Error("AI did not return a valid JSON object. Response: " + jsonResponse);
                }
                const processedData = JSON.parse(jsonMatch[0]);
                return { success: true, processedData: processedData };
            } catch (e) {
                throw new Error(\`Failed to process EEG data. The AI response was not valid JSON. Error: \${e.message}. Response: \${jsonResponse}\`);
            }
        `
    }
];

export {};