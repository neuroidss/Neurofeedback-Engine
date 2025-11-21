
// framework/automation.ts
import type { ToolCreatorPayload } from '../types';

// --- CONSTANTS: PROMPTS & INSTRUCTIONS (Level 1) ---
// Defined here to avoid backtick nesting hell. These use natural multi-line strings.

const GEN_GRAPH_SYSTEM_PROMPT = `You are a Stream Graph Architect. 
Your task is to design a JSON dataflow graph to achieve the user's goal.

**AVAILABLE NODE TYPES:**
1. **Source:**
   - Tool: 'Create_Vision_Source'. ID: "vision_source_1". Output Payload: { smile, eyeOpen, isSimulated }.
   - Tool: 'Create_EEG_Source'. ID: "eeg_source_1". Output Payload: { <ChannelName>: number } (e.g. { Fz: 0.5 }).
   
   *NOTE: Use 'Create_EEG_Source' for brainwave/focus/neurofeedback tasks. Use 'Create_Vision_Source' for face/expression tasks.*

2. **Transform** (Tool: 'Create_Standard_Node'):
   - 'Math_Multiply': { factor: number, property: string }. Multiplies input stream by factor.
   - 'Math_Threshold': { threshold: number, property: string }. Returns 1 if input > threshold, else 0.
   - 'Signal_Smooth': { alpha: 0.1, property: string }. Smooths input stream.
   - 'Logic_IfElse': { property: string, valueA: any, valueB: any }. Returns valueA if input > 0, else valueB.

3. **Sink** (Tool: 'Bind_To_Visuals'):
   - Parameters: "globalColor", "intensity", "geometryMode".

**CRITICAL JSON RULES:**
1. **'inputs' MUST be an Array of Strings.** Example: \`"inputs": ["vision_source_1"]\`.
   - DO NOT use objects like \`"inputs": {"value": "..."}\`. This will BREAK the graph.
   - DO NOT use dot notation for ports (e.g., "node.output"). Just use the Node ID.
   - If a node needs to extract a specific property (e.g. "smile") from an input object, put it in **'config'** as \`"property": "smile"\`.

**OUTPUT JSON FORMAT:**
{
  "nodes": [
    { 
        "id": "vision_source_1", 
        "toolName": "Create_Vision_Source", 
        "type": "Source" 
    },
    { 
        "id": "smooth1", 
        "toolName": "Create_Standard_Node", 
        "type": "Transform", 
        "nodeType": "Signal_Smooth", 
        "config": { "alpha": 0.1, "property": "smile" }, 
        "inputs": ["vision_source_1"] 
    },
    { 
        "id": "visual1", 
        "toolName": "Bind_To_Visuals", 
        "type": "Sink", 
        "parameter": "intensity", 
        "inputs": ["smooth1"] 
    }
  ]
}

Return ONLY valid JSON.`;

const TOOL_NAMING_PROMPT = "You are a Naming Expert. Generate a short, specific tool name (3-5 words max) for the following objective. Do not use prefixes like 'Tool to' or 'Create'. Return ONLY the name.";

const METADATA_SYSTEM_PROMPT = `You are a Product Marketing Expert for a futuristic Neurotechnology company.
Your task is to take a technical neurofeedback objective and write the metadata for the resulting application.

**INPUT CONTEXT:**
Objective: "{{OBJECTIVE}}"
Material: "{{MATERIAL}}..."

**OUTPUT JSON FORMAT:**
{
  "name": "Short, Catchy Name (2-4 words)",
  "description": "What the user experiences. Start with a verb or 'A...'. E.g. 'A calming landscape that brightens as you relax.'",
  "purpose": "The benefit to the user. Start with 'To...'. E.g. 'To reduce stress and improve focus by training Alpha waves.'"
}

**RULES:**
1. **NAME:** Use metaphors (Garden, Orbit, Flow, Shield). Do NOT use words like 'Tool', 'Protocol', 'Generator'.
2. **DESCRIPTION:** Describe the *experience*, not the code. NOT "This tool generates...". YES "Visualizes your brainwaves as...".
3. **PURPOSE:** Sell the benefit. Why should the user run this?
4. **JSON ONLY.**
`;

const UI_GEN_SYSTEM_PROMPT = `You are an expert React Developer. Write a React component body.

**INPUT:** 'processedData' prop (object). It typically contains metrics like 'focusRatio' or 'alphaPower'.
**OUTPUT:** JSX representing the data.

**RULES:**
1. **NO IMPORTS/EXPORTS.** Use React hooks via destructuring: 'const { useState } = React;'
2. **SAFETY:** Access data safely (e.g., 'processedData?.metric'). **IMPORTANT:** Use standard optional chaining syntax '?.'.
3. **STYLE:** Use inline styles or Tailwind.
4. **RETURN:** ONLY the function body code inside a markdown block. Do NOT wrap in an IIFE or function definition.
5. **NO COMMENTS.`;

const UI_FIX_SYSTEM_PROMPT = `You are an expert code fixer. Fix the provided React code based on the error message.

**CRITICAL FIXES:**
1. **JSX SYNTAX:** Ensure all tags are closed. Use JSX (<div></div>), NOT React.createElement.
2. **Variables:** Ensure all variables are declared with 'const' or 'let'.
3. **Parentheses:** Check for unbalanced parentheses or braces.
4. **Imports/Exports:** Remove them.
5. **NO COMMENTS:** Do NOT include any comments (// or /* */) anywhere in the code.
6. **SYNTAX:** Fix any '?' followed by space and '.' (e.g. 'data ? .prop' -> 'data?.prop').
7. Return ONLY the fixed code body inside a markdown block.`;

const JS_FIX_SYSTEM_PROMPT = `You are an expert JavaScript Developer. Fix the provided processing code.

**CRITICAL RULES:**
1. **FORMAT:** The code MUST be a valid Arrow Function or Function Expression.
2. **SYNTAX:** Ensure all parentheses and braces are balanced.
3. **NO COMMENTS:** Do NOT include any comments (// or /* */). They break the eval() wrapper.
4. **NO DECLARATIONS:** Do NOT assign the function to a variable. Return ONLY the function expression itself.
5. **NO COMPLEX LITERALS:** Do NOT use '1i' or 'j'. JavaScript does not support imaginary literals. Use simple simulation math (Math.sin/cos) or return a mock value if complex math was attempted.
6. **RETURN:** Return ONLY the fixed code inside a markdown block.`;

const DSP_GEN_SYSTEM_PROMPT = `You are a Signal Processing Engineer. Write a JavaScript arrow function.

**Signature:** (eegData, sampleRate) => { ... }

**RULES (STRICT):**
1. **Input:** 'eegData' is an object (e.g. { Cz: [1,2,3...] }).
2. **SIMULATION MODE (MANDATORY):** You MUST check if 'eegData' is missing or empty at the VERY START. If so, calculate the metric using Math.sin(Date.now()/1000) or similar to ensure the output value ALWAYS changes over time so the UI animates. Do NOT return static 0.
3. **Logic:** Extract channels, calculate metric.
4. **Output:** Return object { metric_name: value }.
5. **Format:** Return ONLY the anonymous function expression. No variables ('const f =').
6. **NO COMMENTS.**
7. **NO COMPLEX LITERALS:** Do NOT use '1i' or 'j'. JavaScript DOES NOT support imaginary literals. Do not write raw FFT code that relies on complex number libraries that do not exist. Use simple time-domain math (e.g., amplitude, variance) or a pure simulation logic (Math.sin) for the 'power' value.`;

const GRAPH_TOPOLOGY_PROMPT = `You are a Stream Graph Architect. Design a JSON graph for the user objective.

**AVAILABLE NODES:**
- 'Create_Vision_Source': Output {smile, eyeOpen}. ID: 'vision_source_1'.
- 'Create_EEG_Source': Output { <Channel>: value }. ID: 'eeg_source_1'. Use this for brainwaves/focus.
- 'Create_Standard_Node': Type 'Math_Multiply', 'Signal_Smooth', 'Math_Threshold', 'Logic_IfElse'.
- 'Bind_To_Visuals': Inputs -> {globalColor, intensity, geometryMode}.

**CRITICAL:** 
- 'inputs' field MUST be an ARRAY of node IDs. Ex: ["node1"].
- Use 'config' for properties/factors. Ex: {"property": "smile"}.

**OUTPUT:**
Return ONLY valid JSON: { "nodes": [ ...node_objects... ] }`;

const EVOLUTION_SYSTEM_PROMPT = `You are a Senior Neuro-Engineer. 
Refactor the provided neurofeedback tool to satisfy the User Goal.

**INPUT:**
- Old Processing (JS): Extracts metrics from EEG.
- Old UI (React): Visualizes metrics.
- User Goal: "{{GOAL}}"

**CRITICAL REQUIREMENTS:**
1. **New Processing Code:** 
   - Must be a valid JS arrow function \`(eegData, sampleRate) => { ... }\`. 
   - **NO COMMENTS ALLOWED.** Do not write \`//\` or \`/* */\`.
   - **NO IMAGINARY LITERALS.** JS does not support \`1i\`. Use \`Math\` functions.
   - Use descriptive variable names.
   - Must include simulation fallback if data missing.

2. **New UI Code:** 
   - Must be a valid React component body. 
   - **NO COMMENTS ALLOWED.**
   - No imports. Use \`processedData\`.
   - **SYNTAX:** Use \`?.\` for optional chaining.

3. **Metadata:** New Name, Description, Purpose.

**OUTPUT JSON FORMAT:**
{
  "name": "Name v2",
  "description": "...",
  "purpose": "...",
  "processingCode": "...",
  "implementationCode": "..."
}
`;

// --- GRAPH WRAPPER TEMPLATE (Extraction Pattern) ---
// This code is used as the template for generated graph tools.
// By defining it here, we use normal backticks. We then inject it using JSON.stringify.
const GRAPH_WRAPPER_TEMPLATE = `
    const { useState, useEffect, useMemo, useRef } = React;
    const [visualState, setVisualState] = useState({ globalColor: '#00ffff', intensity: 0.2 });
    
    // Graph Visualization State
    const [graphNodes, setGraphNodes] = useState([]);

    const graph = {
        id: 'generated_graph_' + Date.now(),
        nodes: %%NODES_JSON%%
    };

    useEffect(() => {
        if(runtime.streamEngine) {
            runtime.logEvent('[Protocol] Loading Generated Graph: %%NAME%%...');
            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph(graph);
            runtime.streamEngine.start();
            
            const unsub = runtime.neuroBus.subscribe((frame) => {
                if (frame.type === 'System' && frame.payload?.visualUpdate) {
                    setVisualState(prev => ({ ...prev, ...frame.payload.visualUpdate }));
                }
            });
            
            // Poll for node states for the overlay
            const interval = setInterval(() => {
                 if(runtime.streamEngine && runtime.streamEngine.getDebugState) {
                     setGraphNodes(runtime.streamEngine.getDebugState().nodes);
                 }
            }, 200);
            
            return () => {
                unsub();
                clearInterval(interval);
                runtime.streamEngine.stop();
            };
        }
    }, []);
    
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    
    if (!R3F || !Drei) return <div style={{color:'white', padding:'20px'}}>Loading 3D Libraries...</div>;

    const { Canvas, useFrame } = R3F;
    const { Sparkles, OrbitControls, Float } = Drei;

    const Visuals = ({ visualState }) => {
        const meshRef = useRef();
        const color = visualState.globalColor || '#00ffff';
        const intensity = visualState.intensity || 0.5;
        
        useFrame((state, delta) => {
            if(meshRef.current) {
                meshRef.current.rotation.x += delta * (0.2 + intensity);
                meshRef.current.rotation.y += delta * 0.5;
            }
        });
        
        return (
            <>\n                <ambientLight intensity={0.5} />
                <pointLight position={[10, 10, 10]} intensity={1 + intensity*2} color={color} />
                <Sparkles count={100} scale={10} size={5} speed={0.4} opacity={0.5} color={color} />
                <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                    <group ref={meshRef}>
                            <mesh scale={1 + intensity}>
                            <icosahedronGeometry args={[2, 1]} />
                            <meshStandardMaterial color={color} wireframe={true} emissive={color} emissiveIntensity={intensity*2} />
                        </mesh>
                    </group>
                </Float>
                <OrbitControls enableZoom={false} autoRotate />
            </>
        );
    };

    return (
        <div style={{width:'100%', height:'100%', background:'black', position: 'relative'}}>
            <div style={{position:'absolute', top:10, left:10, zIndex:10, color:'cyan', fontSize:'10px', fontFamily:'monospace'}}>
                VIBECODER GRAPH: ACTIVE
            </div>
            
            {/* Overlay for Nodes */}
            <div style={{position:'absolute', inset:0, pointerEvents:'none', padding:'40px', zIndex:5}}>
                <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
                    {graphNodes.map(n => (
                        <div key={n.id} style={{background:'rgba(0,0,0,0.7)', border:'1px solid #444', padding:'6px', borderRadius:'4px', backdropFilter: 'blur(2px)'}}>
                            <div style={{color:'#888', fontSize:'8px', textTransform:'uppercase'}}>{n.type}</div>
                            <div style={{color:'white', fontSize:'10px', fontWeight:'bold', marginBottom:'2px'}}>{n.id}</div>
                            <div style={{color:'cyan', fontSize:'10px', fontFamily:'monospace'}}>
                                {typeof n.value === 'number' ? n.value.toFixed(2) : (n.value ? 'DATA' : '...')}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <Canvas camera={{position:[0,0,10]}}>
                <color attach="background" args={['black']} />
                <Visuals visualState={visualState} />
            </Canvas>
        </div>
    );
`;

// --- TOOL DEFINITIONS ---

const ARCHITECTURAL_PRINCIPLE_RECORDER: ToolCreatorPayload = {
    name: 'Core Architectural Principle: Multiple Tool Calls Over JSON',
    description: '"For everything, make a tool. Do not generate JSON. The architecture is multiple tool calls." - This is the foundational rule for building robust, predictable agentic systems.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To permanently record and serve as a constant reminder of the core design philosophy.',
    parameters: [],
    implementationCode: `
      const principle = "For everything, make a tool. Do not generate JSON. The architecture is multiple tool calls.";
      runtime.logEvent('[FRAMEWORK] Core architectural principle acknowledged.');
      return { success: true, message: 'Principle acknowledged.' };
    `
};

const GENERATE_GRAPH_TOPOLOGY: ToolCreatorPayload = {
    name: 'Generate Graph Topology',
    description: 'Designs and deploys a complete stream processing graph based on a natural language goal. Use this for "Vibecoder" tasks to create the entire pipeline in one step.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To allow the agent to architect complex signal processing pipelines in a single atomic action, avoiding iteration limits.',
    parameters: [
        { name: 'goal', type: 'string', description: 'The user goal (e.g., "Turn screen red when I smile").', required: true }
    ],
    // INJECTION: We inject the constant string safely using JSON.stringify
    implementationCode: `
        const { goal } = args;
        const systemInstruction = ${JSON.stringify(GEN_GRAPH_SYSTEM_PROMPT)};
        
        const prompt = "Design a graph for: " + goal;
        const responseText = await runtime.ai.generateText(prompt, systemInstruction);
        
        try {
            const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
            if (!jsonMatch) throw new Error("No JSON found in AI response");
            const topology = JSON.parse(jsonMatch[0]);
            
            runtime.logEvent(\`[Architect] Graph designed with \${topology.nodes.length} nodes. Deploying...\`);
            
            // Reset Graph
            if (runtime.streamEngine) runtime.streamEngine.stop();
            
            // Execute creation tools sequentially
            for (const node of topology.nodes) {
                if (node.toolName === 'Create_Vision_Source') {
                    await runtime.tools.run('Create_Vision_Source', {});
                } else if (node.toolName === 'Create_EEG_Source') {
                    await runtime.tools.run('Create_EEG_Source', {});
                } else if (node.toolName === 'Create_Standard_Node') {
                    
                    // SANITIZE INPUTS: AI sometimes outputs object {"in":"id"} instead of array ["id"]
                    let cleanInputs = node.inputs;
                    if (cleanInputs && !Array.isArray(cleanInputs) && typeof cleanInputs === 'object') {
                        cleanInputs = Object.values(cleanInputs);
                    }
                    if (!Array.isArray(cleanInputs)) cleanInputs = [];

                    await runtime.tools.run('Create_Standard_Node', {
                        nodeId: node.id,
                        nodeType: node.nodeType,
                        inputs: cleanInputs,
                        config: node.config
                    });
                } else if (node.toolName === 'Bind_To_Visuals') {
                    await runtime.tools.run('Bind_To_Visuals', {
                        nodeId: node.id,
                        inputNodeId: (node.inputs || [])[0],
                        parameter: node.parameter
                    });
                }
                
                // Explicitly wire up connections
                if (node.inputs && Array.isArray(node.inputs)) {
                     for(const inputId of node.inputs) {
                         if (inputId !== node.id) {
                            await runtime.tools.run('Connect_Stream_Nodes', { sourceNode: inputId, targetNode: node.id });
                         }
                     }
                }
            }
            
            if (runtime.streamEngine) runtime.streamEngine.start();
            return { 
                success: true, 
                topology,
                message: "Graph successfully deployed. The task is complete. You MUST now call 'Task Complete' immediately." 
            };
            
        } catch (e) {
            throw new Error("Failed to generate/deploy graph: " + e.message);
        }
    `
};

const WORKFLOW_CREATOR_TOOL: ToolCreatorPayload = {
    name: 'Workflow Creator',
    description: 'Creates a new, high-level "Automation" tool by combining a sequence of other tool calls into a single, reusable workflow.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: "To allow the agent to learn and automate repetitive tasks.",
    parameters: [
      { name: 'name', type: 'string', description: 'The unique, human-readable name for the new workflow tool.', required: true },
      { name: 'description', type: 'string', description: 'A clear description.', required: true },
      { name: 'purpose', type: 'string', description: 'Why this workflow is valuable.', required: true },
      { name: 'steps', type: 'array', description: 'Array of step objects.', required: true },
    ],
    implementationCode: `
      const { name, description, purpose, steps } = args;
      // Note: We use template literals here for code generation which is valid as this is the code *generator*, not the prompt generator.
      const newToolImplementation = \`
const results = [];
const workflowSteps = \${JSON.stringify(steps, null, 2)};
for (const step of workflowSteps) {
    try {
        const result = await runtime.tools.run(step.toolName, step.arguments);
        results.push({ step: step.toolName, success: true, result });
    } catch (e) {
        throw new Error("Workflow failed at step " + step.toolName + ": " + e.message);
    }
}
return { success: true, results };\`;
      
      const result = await runtime.tools.run('Tool Creator', {
        name, description, category: 'Automation', executionEnvironment: 'Client',
        parameters: [], implementationCode: newToolImplementation, purpose,
      });
      return { success: true, tool: result.tool };
    `
};

const PROPOSE_SKILL_TOOL: ToolCreatorPayload = {
    name: 'Propose Skill From Observation',
    description: "Analyzes recent user actions to propose a reusable tool.",
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To learn from human demonstration.',
    parameters: [
      { name: 'skillName', type: 'string', description: 'Name for the new skill.', required: true },
      { name: 'skillDescription', type: 'string', description: 'Description.', required: true },
      { name: 'skillPurpose', type: 'string', description: 'Purpose.', required: true },
    ],
    implementationCode: `
      const { skillName, skillDescription, skillPurpose } = args;
      const observedActions = runtime.getObservationHistory();
      if (observedActions.length < 2) throw new Error("Not enough actions observed.");
      const steps = observedActions.map(action => ({ toolName: action.name, arguments: action.arguments }));
      await runtime.tools.run('Workflow Creator', { name: skillName, description: skillDescription, purpose: skillPurpose, steps: steps });
      runtime.clearObservationHistory();
      return { success: true };
    `
};

const GENERATE_TOOL_NAME: ToolCreatorPayload = {
    name: 'Generate Tool Name from Objective',
    description: 'Generates a short, descriptive name for a new tool using AI, ensuring it is concise and professional.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'Naming helper.',
    parameters: [{ name: 'objective', type: 'string', description: 'The objective.', required: true }],
    implementationCode: `
        const { objective } = args;
        const systemInstruction = ${JSON.stringify(TOOL_NAMING_PROMPT)};
        const prompt = "Objective: " + objective;
        
        const cleanNameRaw = await runtime.ai.generateText(prompt, systemInstruction);
        let cleanName = cleanNameRaw.replace(/[^a-zA-Z0-9 ]/g, '').trim();
        cleanName = cleanName.replace(/_Tool$/i, '').replace(/ Tool$/i, '');
        
        return { success: true, name: cleanName };
    `
};

const GENERATE_PROTOCOL_METADATA: ToolCreatorPayload = {
    name: 'Generate Protocol Metadata',
    description: 'Generates a catchy name, a persuasive description, and a benefit-driven purpose for a new neurofeedback protocol.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To ensure created tools have high-quality, user-centric documentation that "sells" the benefit to the user.',
    parameters: [
        { name: 'objective', type: 'string', description: 'The technical objective of the protocol.', required: true },
        { name: 'sourceMaterial', type: 'string', description: 'Optional context to help extract metaphors.', required: false }
    ],
    implementationCode: `
        const { objective, sourceMaterial } = args;
        let systemInstruction = ${JSON.stringify(METADATA_SYSTEM_PROMPT)};
        // Manual interpolation since we can't nest variables in the stringify
        systemInstruction = systemInstruction.replace("{{OBJECTIVE}}", objective);
        systemInstruction = systemInstruction.replace("{{MATERIAL}}", (sourceMaterial || '').substring(0, 300));

        const prompt = "Generate metadata for: " + objective;
        const response = await runtime.ai.generateText(prompt, systemInstruction);
        
        try {
            const jsonMatch = response.match(/\\{[\\s\\S]*\\}/);
            if (!jsonMatch) throw new Error("No JSON found.");
            const metadata = JSON.parse(jsonMatch[0]);
            return { success: true, ...metadata };
        } catch (e) {
            return { 
                success: true, 
                name: "Neurofeedback Protocol", 
                description: "A protocol designed to " + objective, 
                purpose: "To help you achieve " + objective 
            };
        }
    `
};

const RECORD_TOOL_NAME: ToolCreatorPayload = {
    name: 'RecordToolName',
    description: 'Records a generated tool name.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To persist a generated tool name for subsequent steps.',
    parameters: [{ name: 'name', type: 'string', description: 'The name of the tool.', required: true }],
    implementationCode: `return { success: true, name: args.name };`
};

const GENERATE_UI_CODE: ToolCreatorPayload = {
    name: 'Generate UI Component Code',
    description: 'Generates React code for a UI component.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To generate the implementation code for a UI tool.',
    parameters: [{ name: 'sourceMaterial', type: 'string', description: 'The source material or requirements for the UI.', required: true }],
    implementationCode: `
        const systemPrompt = ${JSON.stringify(UI_GEN_SYSTEM_PROMPT)};
        const prompt = "Generate a UI for this logic:\\n" + args.sourceMaterial;
        
        const code = await runtime.ai.generateText(prompt, systemPrompt);
        
        let cleanCode = code;
        const match = code.match(/\`\`\`(?:javascript|jsx|js|tsx)?\\s*([\\s\\S]*?)\`\`\`/i);
        if (match && match[1]) {
            cleanCode = match[1];
        }
        
        cleanCode = cleanCode
            .replace(/^\\s*import\\s+.*?from\\s+['"].*?['"];?/gm, '')
            .replace(/^\\s*export\\s+default\\s+.*$/gm, '')
            .trim();
            
        return { success: true, implementationCode: cleanCode };
    `
};

const CORRECT_UI_CODE: ToolCreatorPayload = {
    name: 'Correct Invalid UI Component Code',
    description: 'Fixes faulty React code.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To auto-correct syntax or logic errors in generated UI code.',
    parameters: [{ name: 'faultyCode', type: 'string', description: 'The code that is causing errors.', required: true }, { name: 'errorMessage', type: 'string', description: 'The error message produced by the faulty code.', required: true }],
    implementationCode: `
        const systemPrompt = ${JSON.stringify(UI_FIX_SYSTEM_PROMPT)};
        const prompt = "Fix this code:\\n" + args.faultyCode + "\\n\\nError: " + args.errorMessage;

        const code = await runtime.ai.generateText(prompt, systemPrompt);
        
        let cleanCode = code;
        const match = code.match(/\`\`\`(?:javascript|jsx|js|tsx)?\\s*([\\s\\S]*?)\`\`\`/i);
        if (match && match[1]) {
            cleanCode = match[1];
        }
        
        cleanCode = cleanCode
            .replace(/^\\s*import\\s+.*?from\\s+['"].*?['"];?/gm, '')
            .replace(/^\\s*export\\s+default\\s+.*$/gm, '')
            .trim();
            
        return { success: true, correctedCode: cleanCode };
    `
};

const CORRECT_PROCESSING_CODE: ToolCreatorPayload = {
    name: 'Correct Invalid Processing Code',
    description: 'Fixes faulty JavaScript signal processing code that failed compilation.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To auto-correct syntax or logic errors in EEG processing functions.',
    parameters: [
        { name: 'faultyCode', type: 'string', description: 'The code that failed to compile.', required: true }, 
        { name: 'errorMessage', type: 'string', description: 'The error message.', required: true }
    ],
    implementationCode: `
        const systemPrompt = ${JSON.stringify(JS_FIX_SYSTEM_PROMPT)};
        const prompt = "Fix this JavaScript code which failed with '" + args.errorMessage + "':\\n" + args.faultyCode;

        const code = await runtime.ai.generateText(prompt, systemPrompt);
        
        let cleanCode = code;
        const match = code.match(/\`\`\`(?:javascript|js)?\\s*([\\s\\S]*?)\`\`\`/i);
        if (match && match[1]) {
            cleanCode = match[1];
        }
        
        return { success: true, correctedCode: cleanCode.trim() };
    `
};

const GENERATE_EEG_PROCESSING_FUNCTION: ToolCreatorPayload = {
    name: 'Generate EEG Processing Function',
    description: 'Generates a JavaScript function to process raw EEG data into metrics.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To generate the signal processing logic for a neurofeedback protocol, ensuring it includes simulation fallbacks for testing.',
    parameters: [{ name: 'sourceMaterial', type: 'string', description: 'Description or requirements for the EEG processing.', required: true }],
    implementationCode: `
        const systemPrompt = ${JSON.stringify(DSP_GEN_SYSTEM_PROMPT)};
        const prompt = "Generate processing logic for: " + args.sourceMaterial;
        
        const code = await runtime.ai.generateText(prompt, systemPrompt);
        
        let cleanCode = code;
        const match = code.match(/\`\`\`(?:javascript|js)?\\s*([\\s\\S]*?)\`\`\`/i);
        if (match && match[1]) {
            cleanCode = match[1];
        }
        
        // Extract metrics for metadata (simple heuristic)
        const metrics = [];
        const returnMatch = cleanCode.match(/return\s*{([^}]+)}/);
        if (returnMatch) {
            const keys = returnMatch[1].split(',').map(k => k.split(':')[0].trim());
            metrics.push(...keys);
        }

        return { success: true, processingCode: cleanCode, dataRequirements: { type: 'eeg', channels: ['Cz', 'Fz', 'Pz', 'metrics'] } };
    `
};

const DEVELOP_TOOL_FROM_OBJECTIVE: ToolCreatorPayload = {
    name: 'Develop Tool from Objective',
    description: 'Orchestrates tool creation. Adapts strategy based on system configuration (Script vs Stream Graph).',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To automate the end-to-end process of creating a new tool from a high-level objective.',
    parameters: [{ name: 'objective', type: 'string', description: 'The goal of the new tool.', required: true }, { name: 'sourceMaterial', type: 'string', description: 'Context or content to base the tool on.', required: true }],
    implementationCode: `
        const { objective, sourceMaterial } = args;
        
        // CLEANUP
        let cleanObjective = objective.replace(/^(Create|Generate) (protocol|tool) for:?\\s*/i, '');
        cleanObjective = cleanObjective.replace(/^Example:?\\s*/i, '');
        cleanObjective = cleanObjective.replace(/^Protocol Specification:?\\s*/i, '');

        // 1. Generate Marketing Metadata
        const metadata = await runtime.tools.run('Generate Protocol Metadata', { objective: cleanObjective, sourceMaterial: sourceMaterial });
        
        const name = metadata.name;
        const description = metadata.description;
        const purpose = metadata.purpose;
        
        const config = runtime.getState().apiConfig;
        const mode = config && config.protocolGenerationMode ? config.protocolGenerationMode : 'script';
        
        if (mode === 'graph') {
            runtime.logEvent('[Vibecoder] 🌌 Generating Stream Graph for: ' + name);
            
            const systemInstruction = ${JSON.stringify(GRAPH_TOPOLOGY_PROMPT)};
            const prompt = "Design a Stream Graph topology for: " + objective + "\\nContext: " + sourceMaterial;
            const responseText = await runtime.ai.generateText(prompt, systemInstruction);
            
            let topology;
            try {
                const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
                if (!jsonMatch) throw new Error("No JSON found in AI response for graph topology.");
                topology = JSON.parse(jsonMatch[0]);
            } catch(e) {
                throw new Error("Failed to parse generated graph JSON: " + e.message);
            }
            
            // 2. Create the Wrapper Tool using Injection Pattern to avoid nesting hell
            const wrapperTemplate = ${JSON.stringify(GRAPH_WRAPPER_TEMPLATE)};
            let wrapperCode = wrapperTemplate;
            
            // Inject dynamic parts using replacement
            wrapperCode = wrapperCode.replace('%%NODES_JSON%%', JSON.stringify(topology.nodes));
            wrapperCode = wrapperCode.replace('%%NAME%%', name);
            
            const tool = await runtime.tools.run('Tool Creator', {
                name, 
                description, 
                category: 'UI Component', 
                executionEnvironment: 'Client',
                parameters: [{name: 'processedData', type: 'object', description: 'N/A', required: false}, {name: 'runtime', type: 'object', description: 'Runtime', required: true}],
                implementationCode: wrapperCode,
                processingCode: "(d,r) => ({})",
                dataRequirements: { type: 'eeg', channels: [], metrics: [] }, 
                purpose
            });
            return { success: true, newTool: tool.tool };
            
        } else {
            // SCRIPT GENERATION
            const ui = await runtime.tools.run('Generate UI Component Code', { sourceMaterial: args.sourceMaterial });
            const proc = await runtime.tools.run('Generate EEG Processing Function', { sourceMaterial: args.sourceMaterial });
            
            const tool = await runtime.tools.run('Tool Creator', {
                name, 
                description, 
                category: 'UI Component', 
                executionEnvironment: 'Client',
                parameters: [{name: 'processedData', type: 'object', description: 'Real-time processed EEG data.', required: true}],
                implementationCode: ui.implementationCode, 
                processingCode: proc.processingCode, 
                dataRequirements: proc.dataRequirements, 
                purpose
            });
            return { success: true, newTool: tool.tool };
        }
    `
};

const VIBECODE_ENVIRONMENT_OPTIMIZER: ToolCreatorPayload = {
    name: 'Vibecode Environment Optimizer',
    description: 'Optimizes UI based on EEG feedback.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To adapt the environment vibe based on real-time feedback.',
    parameters: [{ name: 'target_vibe', type: 'string', description: 'The desired environmental vibe.', required: true }],
    implementationCode: `return { success: true };`
};

const REFACTOR_EXISTING_TOOL: ToolCreatorPayload = {
    name: 'Refactor Existing Tool',
    description: 'Refactors a tool.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To improve or modify an existing tool based on new requirements.',
    parameters: [{ name: 'toolName', type: 'string', description: 'The name of the tool to refactor.', required: true }, { name: 'refactoringGoal', type: 'string', description: 'What to improve or change.', required: true }],
    implementationCode: `return { success: true };`
};

const EVOLVE_PROTOCOL_SAFELY: ToolCreatorPayload = {
    name: 'Evolve Protocol Safely',
    description: 'Evolves a protocol safely by creating a new version with modified logic and UI based on user feedback. Auto-launches the new version.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To iterate on a protocol without breaking its core functionality.',
    parameters: [{ name: 'baseToolName', type: 'string', description: 'The name of the base protocol tool.', required: true }, { name: 'observedInterest', type: 'string', description: 'The user feedback or interest driving the evolution.', required: true }],
    implementationCode: `
        const { baseToolName, observedInterest } = args;
        
        const allTools = runtime.tools.list();
        const baseTool = allTools.find(t => t.name === baseToolName);
        if (!baseTool) throw new Error("Base tool '" + baseToolName + "' not found.");

        runtime.logEvent(\`[Evolution] 🧬 Evolving '\${baseToolName}' with goal: \${observedInterest}...\`);

        let systemInstruction = ${JSON.stringify(EVOLUTION_SYSTEM_PROMPT)};
        systemInstruction = systemInstruction.replace("{{GOAL}}", observedInterest);

        const prompt = "Base Tool: " + baseToolName + "\\nOld Processing:\\n" + baseTool.processingCode + "\\nOld UI:\\n" + baseTool.implementationCode + "\\nUser Goal: " + observedInterest + "\\n\\nGenerate the evolved tool JSON.";

        const response = await runtime.ai.generateText(prompt, systemInstruction);
        
        let evoData;
        try {
            const jsonMatch = response.match(/\\{[\\s\\S]*\\}/);
            if (!jsonMatch) throw new Error("No JSON found.");
            evoData = JSON.parse(jsonMatch[0]);
        } catch(e) {
            throw new Error("Failed to parse evolution AI response: " + e.message);
        }

        let cleanProcessingCode = evoData.processingCode;
        cleanProcessingCode = cleanProcessingCode.replace(/^(const|let|var)\\s+\\w+\\s*=\\s*/, '').trim();
        if (cleanProcessingCode.endsWith(';')) cleanProcessingCode = cleanProcessingCode.slice(0, -1);

        let cleanImplCode = evoData.implementationCode;
        cleanImplCode = cleanImplCode.replace(/^\\s*import\\s+.*?from\\s+['"].*?['"];?/gm, '')
                                     .replace(/^\\s*export\\s+default\\s+.*$/gm, '')
                                     .trim();

        const newToolResult = await runtime.tools.run('Tool Creator', {
            name: evoData.name,
            description: evoData.description,
            purpose: evoData.purpose,
            category: 'UI Component',
            executionEnvironment: 'Client',
            processingCode: cleanProcessingCode,
            implementationCode: cleanImplCode,
            parameters: baseTool.parameters,
            dataRequirements: baseTool.dataRequirements 
        });

        runtime.logEvent(\`[Evolution] 🚀 Launching \${newToolResult.tool.name}...\`);
        
        if (runtime.os && runtime.os.launchApp) {
            runtime.os.launchApp(newToolResult.tool.id);
        }

        return { success: true, newTool: newToolResult.tool, message: "Evolved into " + newToolResult.tool.name };
    `
};

export const AUTOMATION_TOOLS: ToolCreatorPayload[] = [
    ARCHITECTURAL_PRINCIPLE_RECORDER,
    GENERATE_GRAPH_TOPOLOGY, 
    WORKFLOW_CREATOR_TOOL,
    PROPOSE_SKILL_TOOL,
    GENERATE_TOOL_NAME,
    GENERATE_PROTOCOL_METADATA,
    RECORD_TOOL_NAME,
    GENERATE_UI_CODE,
    CORRECT_UI_CODE,
    CORRECT_PROCESSING_CODE,
    GENERATE_EEG_PROCESSING_FUNCTION,
    DEVELOP_TOOL_FROM_OBJECTIVE,
    VIBECODE_ENVIRONMENT_OPTIMIZER,
    REFACTOR_EXISTING_TOOL,
    EVOLVE_PROTOCOL_SAFELY
];
