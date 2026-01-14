
import type { ToolCreatorPayload } from '../../../types';

const RLM_SYSTEM_PROMPT = `You are a Recursive Context Engineer using Qwen-Coder.
Your goal is to answer the user's query by analyzing the provided 'context_data'.
However, 'context_data' is massive. You cannot read it all at once linearly.

**YOUR ENVIRONMENT:**
You are writing a JavaScript function that runs in a sandbox.
The variable \`context_data\` (string) is available in scope.

**AVAILABLE TOOLS (In Sandbox):**
1. \`console.log(msg)\`: Debug output.
2. \`await llm_query(prompt, context_chunk)\`: Calls the LLM to analyze a specific string chunk. CACHED automatically.
3. \`split_smart(text, max_chars)\`: Helper to split text by newlines/paragraphs.

**YOUR TASK:**
Write a JavaScript function (async) that:
1. Splits \`context_data\` into manageable chunks (e.g. 3000 chars).
2. Recursively or iteratively calls \`llm_query\` on these chunks to find relevant information.
3. Aggregates the results.
4. Returns a final string summary or answer.

**OUTPUT FORMAT:**
Return ONLY the JavaScript code block. The code must end with \`return final_result;\`.
`;

export const RECURSIVE_HISTORY_ANALYZER: ToolCreatorPayload = {
    name: 'Recursive_History_Analyzer',
    description: 'A Recursive Language Model (RLM) tool. It uses code generation to perform infinite-context analysis over the session history by chunking, recursive summarization, and cached LLM calls.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To allow the Genesis Driver to maintain narrative coherence over infinite turns without running out of context window.',
    parameters: [
        { name: 'query', type: 'string', description: 'What to find out from the history.', required: true },
        { name: 'context_data', type: 'string', description: 'The massive string of world history.', required: true }
    ],
    implementationCode: `
        const { query, context_data } = args;
        
        // 1. Ask Qwen to write the analyzer script
        const codePrompt = "Write a JS script to answer: '" + query + "' by analyzing 'context_data'. Use 'await llm_query(prompt, chunk)' to process chunks. Return the final string.";
        const generatedCode = await runtime.ai.generateText(codePrompt, ${JSON.stringify(RLM_SYSTEM_PROMPT)});
        
        // Sanitize Markdown blocks without using literal backticks to avoid confusing the tool runner
        const ticks = String.fromCharCode(96).repeat(3);
        const startBlock = new RegExp(ticks + "(javascript|js)?", "g");
        const endBlock = new RegExp(ticks, "g");
        
        let cleanCode = generatedCode.replace(startBlock, '').replace(endBlock, '').trim();

        // Wrap in async IIFE body pattern if not present
        if (!cleanCode.includes('return')) cleanCode += "\\nreturn 'Analysis complete.';";

        // 2. Setup Sandbox Environment
        if (!window._rlm_cache) window._rlm_cache = {}; // Persistent session cache
        
        const llm_query = async (prompt, chunk) => {
            if (!chunk) return "";
            // Simple hash for cache key
            const key = prompt + "_" + chunk.length + "_" + chunk.slice(0, 20);
            if (window._rlm_cache[key]) return window._rlm_cache[key];
            
            // Optimization: Use the currently selected model via runtime
            const res = await runtime.ai.generateText("Context: " + chunk + "\\n\\nTask: " + prompt, "You are a sub-processor. Be concise.");
            window._rlm_cache[key] = res;
            return res;
        };
        
        const split_smart = (text, size) => {
            const chunks = [];
            for (let i = 0; i < text.length; i += size) {
                chunks.push(text.slice(i, i + size));
            }
            return chunks;
        };
        
        // 3. Execute the Generated Code
        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const func = new AsyncFunction('context_data', 'llm_query', 'split_smart', 'console', cleanCode);
            
            const result = await func(context_data, llm_query, split_smart, console);
            return { success: true, analysis: result, code_used: cleanCode };
            
        } catch (e) {
            return { success: false, error: e.message, code_used: cleanCode };
        }
    `
};
