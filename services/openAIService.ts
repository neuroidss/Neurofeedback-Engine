
// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import type { APIConfig, LLMTool, AIResponse, AIToolCall, ModelCapability } from "../types";

const OPENAI_TIMEOUT = 600000; // 10 minutes
const KERNEL_PROXY_URL = 'http://localhost:3001/mcp/ai_proxy_v1';

// Helper function to strip <think> blocks from model output
const stripThinking = (text: string | null | undefined): string => {
    if (!text) return "";
    // This regex removes any <think>...</think> blocks and trims whitespace.
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};

// Helper: Deeply parse arguments based on tool definition
// Fixes issues where models return stringified JSON for arrays/objects
const parseComplexArgs = (args: Record<string, any>, toolName: string, tools: LLMTool[]): Record<string, any> => {
    const toolDef = tools.find(t => t.name === toolName);
    if (!toolDef) return args;

    const newArgs = { ...args };
    for (const param of toolDef.parameters) {
        const val = newArgs[param.name];
        if ((param.type === 'array' || param.type === 'object') && typeof val === 'string') {
            try {
                // Remove potential markdown wrappers if present in the argument string
                const cleanVal = val.replace(/```json\s*|\s*```/g, '').trim();
                newArgs[param.name] = JSON.parse(cleanVal);
            } catch (e) {
                console.warn(`[OpenAI Service] Failed to parse complex arg '${param.name}' for tool '${toolName}'. Value was:`, val);
            }
        }
    }
    return newArgs;
};

// --- ROBUST FETCH WITH AUTO-PROXY FALLBACK ---
const robustFetch = async (baseUrl: string, endpoint: string, options: RequestInit, timeout: number): Promise<Response> => {
    const directUrl = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
    
    // Helper to perform fetch with timeout
    const doFetch = async (url: string) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(id);
            return res;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    try {
        // Attempt 1: Direct Connection
        const response = await doFetch(directUrl);
        // Special Case: 404 on localhost might mean the path is wrong OR the proxy is needed (some local servers behave oddly)
        // But usually, we only retry connection errors.
        if (response.ok) return response;
        
        // If we got a response (even 4xx/5xx), the server is reachable.
        // However, if we get a CORS error (opaque/0 status or TypeError catch), we fall through to catch.
        // fetch() usually only throws on network error.
        
        return response; 

    } catch (e: any) {
        // Check if we should try proxy (if local and not already using proxy)
        const isLocal = directUrl.includes('localhost') || directUrl.includes('127.0.0.1');
        const isAlreadyProxy = directUrl.includes(KERNEL_PROXY_URL);
        
        if (isLocal && !isAlreadyProxy) {
            // FIX: Preserve path segments from baseUrl (like '/v1') when using the proxy.
            // The proxy target is likely just the host root (e.g., http://127.0.0.1:11434), 
            // so we must append the base path (e.g., /v1) before the endpoint.
            let basePath = "";
            try {
                if (baseUrl.startsWith('http')) {
                    const u = new URL(baseUrl);
                    if (u.pathname && u.pathname !== '/') {
                        basePath = u.pathname.replace(/\/+$/, '');
                    }
                }
            } catch(e) { /* ignore invalid url parse */ }

            const proxyUrl = `${KERNEL_PROXY_URL.replace(/\/+$/, '')}${basePath}${endpoint}`;
            console.log(`[OpenAI Service] ⚠️ Direct fetch failed (${e.message}). Failing over to Kernel Proxy: ${proxyUrl}`);
            
            try {
                return await doFetch(proxyUrl);
            } catch (proxyError: any) {
                throw new Error(`Connection failed. Direct: ${e.message}. Proxy: ${proxyError.message}`);
            }
        }
        
        if (e.name === 'AbortError') {
            throw new Error(`Request to OpenAI timed out after ${timeout / 1000}s.`);
        }
        throw e;
    }
};

const handleAPIError = async (response: Response, baseUrl: string) => {
    let errorBody: any;
    let rawText = "";
    
    try {
        // Read text once to avoid "Body already consumed" error
        rawText = await response.text();
        try {
            errorBody = JSON.parse(rawText);
        } catch {
            errorBody = rawText; // Fallback to raw text if not JSON
        }
    } catch (e) {
        errorBody = "[Could not read response body]";
    }

    console.error('Error from OpenAI-compatible API:', response.status, errorBody);
    
    let message = `[OpenAI Error ${response.status}]`;
    if (response.status === 401) {
        message += ` Authentication failed. Check your API Key.`;
    } else if (response.status === 404) {
        message += ` Model not found or invalid API endpoint. Check your Base URL: ${baseUrl}`;
    } else if (typeof errorBody === 'object' && errorBody?.error?.message) {
        message += ` ${errorBody.error.message}`;
    } else if (typeof errorBody === 'string') {
        message += ` ${errorBody.substring(0, 200)}`;
    } else {
        message += ` ${response.statusText}`;
    }
    throw new Error(message);
};

const buildOpenAITools = (tools: LLMTool[]) => {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name.replace(/[^a-zA-Z0-9_]/g, '_'),
            description: tool.description,
            parameters: {
                type: 'object',
                properties: tool.parameters.reduce((obj, param) => {
                     if (param.type === 'array' || param.type === 'object') {
                        // For complex types, tell the model to expect a string, which we will treat as JSON.
                        obj[param.name] = { type: 'string', description: `${param.description} (This argument must be a valid, JSON-formatted string.)` };
                    } else {
                        const typeMapping = { 'string': 'string', 'number': 'number', 'boolean': 'boolean' };
                        obj[param.name] = { type: typeMapping[param.type] || 'string', description: param.description };
                    }
                    return obj;
                }, {} as Record<string, any>),
                required: tool.parameters.filter(p => p.required).map(p => p.name),
            },
        },
    }));
};

/**
 * Robustly extracts JSON objects or arrays from mixed text.
 * Handles nested structures by tracking brace depth.
 */
const extractJsonSnippets = (text: string): string[] => {
    const snippets: string[] = [];
    let depth = 0;
    let start = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        
        if (escape) { escape = false; continue; }
        if (char === '\\') { escape = true; continue; }
        if (char === '"') { inString = !inString; continue; }
        
        if (!inString) {
            if (char === '{' || char === '[') {
                if (depth === 0) start = i;
                depth++;
            } else if (char === '}' || char === ']') {
                if (depth > 0) {
                    depth--;
                    if (depth === 0) {
                        snippets.push(text.substring(start, i + 1));
                    }
                }
            }
        }
    }
    return snippets;
};

/**
 * Heuristically repairs common LLM JSON errors
 */
const repairJson = (jsonString: string): string => {
    return jsonString
        .replace(/: ?True/g, ': true')
        .replace(/: ?False/g, ': false')
        .replace(/: ?None/g, ': null')
        // Strip comments safely: match // at start of line or after whitespace, NOT inside http://
        .replace(/(^|\s)\/\/.*$/gm, '$1') 
        .replace(/,(\s*[\]}])/g, '$1'); // Remove trailing commas
};

const parseToolCallFromText = (text: string, toolNameMap: Map<string, string>, availableTools: LLMTool[]): AIToolCall[] | null => {
    if (!text) return null;

    const candidates = extractJsonSnippets(text);
    const accumulatedToolCalls: AIToolCall[] = [];
    
    console.log(`[OpenAI Service] Parsing text for tool calls. Candidates found: ${candidates.length}`);

    for (let jsonString of candidates) {
        try {
            // Apply robustness fixes before parsing
            const cleanJsonString = repairJson(jsonString);
            
            let parsedJson = null;
            try {
                parsedJson = JSON.parse(cleanJsonString);
            } catch(e) {
                console.warn(`[OpenAI Service] JSON Parse Failed for candidate:`, e);
                // Ignore parse errors, try next candidate
            }
            if (!parsedJson) continue;
            
            // Normalize to array
            let calls: any[] = [];
            if (parsedJson.tool_calls && Array.isArray(parsedJson.tool_calls)) calls = parsedJson.tool_calls;
            else if (Array.isArray(parsedJson)) calls = parsedJson;
            else calls = [parsedJson];

            for (const call of calls) {
                if (typeof call !== 'object' || call === null) continue;

                // A. Explicit Tool Call (OpenAI style inside text)
                const nameKey = Object.keys(call).find(k => k.toLowerCase().includes('name') || k === 'function' || k === 'tool');
                const argsKey = Object.keys(call).find(k => k.toLowerCase().includes('arguments') || k === 'parameters' || k === 'args');

                let rawName, args;

                if (nameKey) {
                    rawName = call[nameKey];
                    args = argsKey ? call[argsKey] : {};
                } 
                // B. Implicit Call (Function object directly)
                else if (call.function && call.function.name) {
                    rawName = call.function.name;
                    args = call.function.arguments || {};
                }

                // C. Schema Matching (Implicit Argument List)
                // If the model just outputs an array of objects matching tool params
                if (!rawName) {
                     for (const tool of availableTools) {
                         const requiredParams = tool.parameters.filter(p => p.required).map(p => p.name);
                         const callKeys = Object.keys(call);
                         
                         // Check if all required params are present in the call
                         const matchesRequired = requiredParams.every(p => callKeys.includes(p));
                         
                         // Double check overlap to prevent matching empty objects to tools with no params (edge case)
                         // We require at least one parameter match if the tool has parameters
                         const toolParams = new Set(tool.parameters.map(p => p.name));
                         const hasMatchingKey = callKeys.some(k => toolParams.has(k));
                         
                         if (matchesRequired && (hasMatchingKey || tool.parameters.length === 0)) {
                             rawName = tool.name;
                             args = call;
                             // console.log(`[OpenAI Service] Implicitly matched tool '${tool.name}' by schema.`);
                             break;
                         }
                     }
                }

                if (rawName) {
                    const originalName = toolNameMap.get(rawName.replace(/[^a-zA-Z0-9_]/g, '_')) || toolNameMap.get(rawName) || rawName;
                    
                    let parsedArgs = {};
                    if (typeof args === 'string') {
                        try { parsedArgs = JSON.parse(args || '{}'); } catch(e) {}
                    } else if (typeof args === 'object') {
                        parsedArgs = args;
                    }

                    if (typeof parsedArgs === 'object') {
                        const robustArgs = parseComplexArgs(parsedArgs, originalName, availableTools);
                        accumulatedToolCalls.push({ name: originalName, arguments: robustArgs });
                    }
                }
            }

        } catch (e) {
            // Try next candidate
        }
    }
    
    if (accumulatedToolCalls.length > 0) return accumulatedToolCalls;
    
    return null;
};

export const testModelCapabilities = async (modelId: string, apiConfig: APIConfig): Promise<ModelCapability> => {
    // 1. Define a simple test tool
    const testTool: LLMTool = {
        id: 'test_calculator',
        name: 'test_calculator',
        description: 'Add two numbers. Use this tool.',
        category: 'Functional',
        executionEnvironment: 'Client',
        version: 1,
        parameters: [
            { name: 'a', type: 'number', description: 'First number', required: true },
            { name: 'b', type: 'number', description: 'Second number', required: true }
        ],
        implementationCode: ''
    };

    // 2. Mock Config: Force Native Mode
    // We override the modelCapabilities to ensure we test NATIVE invocation first.
    const testConfig: APIConfig = {
        ...apiConfig,
        modelCapabilities: {
            [modelId]: {
                supportsNativeTools: true,
                useJsonInstruction: false,
                thinkingMode: 'default'
            }
        }
    };

    const prompt = "What is 10 plus 10? Call the test_calculator tool.";
    
    try {
        console.log(`[OpenAI Test] Probing ${modelId} for native tool support...`);
        const response = await generateWithTools(prompt, "You are a tool calling bot.", modelId, testConfig, [testTool]);
        
        // 3. Analyze Response
        const hasToolCall = response.toolCalls && response.toolCalls.length > 0 && response.toolCalls[0].name === 'test_calculator';
        
        if (hasToolCall) {
            return { supportsNativeTools: true, useJsonInstruction: false, thinkingMode: 'default' };
        } else {
            console.warn("[OpenAI Test] Model returned text instead of tool call:", response.text);
        }
    } catch (e) {
        console.error("[OpenAI Test] Native probe error:", e);
    }

    // Fallback
    return { supportsNativeTools: false, useJsonInstruction: true, thinkingMode: 'default' };
};

export const generateWithTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    tools: LLMTool[],
    files: { type: string, data: string }[] = [],
    emulateToolCalling: boolean = false
): Promise<AIResponse> => {
    const { openAIAPIKey, openAIBaseUrl } = apiConfig;

    if (!openAIAPIKey) throw new Error("OpenAI API Key is missing.");
    if (!openAIBaseUrl) throw new Error("OpenAI Base URL is missing.");
    
    // --- CAPABILITIES CONFIG ---
    const capabilities = apiConfig.modelCapabilities?.[modelId] || { 
        supportsNativeTools: true, 
        useJsonInstruction: false,
        thinkingMode: 'default' 
    };
    
    // If specific emulation requested by caller, respect it. Otherwise check config.
    const usePromptInjection = emulateToolCalling || capabilities.useJsonInstruction;
    const minimizeThinking = capabilities.thinkingMode === 'minimize';

    const openAITools = buildOpenAITools(tools);
    const toolNameMap = new Map(tools.map(t => [t.name.replace(/[^a-zA-Z0-9_]/g, '_'), t.name]));
    // Add original names as well for the fallback parser to find them
    tools.forEach(tool => {
        toolNameMap.set(tool.name, tool.name);
    });

    // --- PROMPT CONSTRUCTION ---
    let promptSuffix = "";
    
    // 1. Tool Injection (If Native Tools Disabled)
    if (usePromptInjection) {
        const toolDesc = tools.map(t => {
            const params = t.parameters.map(p => `- ${p.name} (${p.type}): ${p.description}`).join('\n');
            return `Tool "${t.name}":\n${t.description}\nParameters:\n${params}`;
        }).join('\n\n');

        promptSuffix += `\n\n### TOOL USE
You have access to the following tools:

${toolDesc}

REQUIRED FORMAT:
If you need to use a tool, you MUST return a JSON object following the OpenAI API tool format inside a markdown block.
Example:
\`\`\`json
{
  "tool_calls": [
    {
      "type": "function",
      "function": {
        "name": "tool_name",
        "arguments": {
          "param_name": "value"
        }
      }
    }
  ]
}
\`\`\`
Do not output plain text or markdown outside the JSON block.`;
    } 
    // 2. Fallback Instruction (For Native Mode robustness)
    else {
        promptSuffix += `\n\nWhen you need to use a tool, use the provided 'tools' definitions. If the tool functionality is unavailable or you are not configured for it, you MUST respond with ONLY a JSON object (or an array of objects) in a \`\`\`json block.`;
    }

    // 3. Thinking Control (For Reasoning Models like Qwen/DeepSeek)
    let finalSystemInstruction = systemInstruction + promptSuffix;
    if (minimizeThinking) {
        // Updated: Put command in user prompt, but keep text instruction in system prompt
        finalSystemInstruction += `\n\nCRITICAL SYSTEM INSTRUCTION: Do not output internal thought processes, reasoning traces, or <think> tags. Output ONLY the final response/tool call to save tokens. Minimize thinking.`;
    }

    // Prepend command to user input if minimizing thinking
    let combinedUserPrompt = `${userInput}`; 
    if (minimizeThinking) {
        combinedUserPrompt = `/no_think\n${combinedUserPrompt}`;
    }

    let userMessageContent: any;
    if (files && files.length > 0) {
        userMessageContent = [{ type: 'text', text: combinedUserPrompt }];
        files.forEach(file => {
            userMessageContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:${file.type};base64,${file.data}`
                }
            });
        });
    } else {
        userMessageContent = combinedUserPrompt;
    }

    const body: any = {
        model: modelId,
        messages: [
            { role: 'system', content: finalSystemInstruction },
            { role: 'user', content: userMessageContent }
        ],
        temperature: 0.1,
        max_tokens: 4096,
        top_p: 0.95,
    };
    
    // Attach Native Tools ONLY if NOT using prompt injection
    if (!usePromptInjection && openAITools.length > 0) {
        body.tools = openAITools;
        body.tool_choice = "auto";
    }
    
    try {
        const response = await robustFetch(
            openAIBaseUrl,
            '/chat/completions',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}` },
                body: JSON.stringify(body)
            },
            OPENAI_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response, openAIBaseUrl);
            return { toolCalls: null };
        }

        const data = await response.json();
        const toolCallsData = data.choices?.[0]?.message?.tool_calls;
        let responseContent = data.choices?.[0]?.message?.content;
        
        // Strip thinking tags if they appear despite instructions
        responseContent = stripThinking(responseContent);
        
        // 1. Native Tool Calls
        if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            try {
                const toolCalls: AIToolCall[] = toolCallsData.map((tc: any) => {
                    const toolCall = tc.function;
                    const originalName = toolNameMap.get(toolCall.name) || toolCall.name;
                    
                    const args = toolCall.arguments;
                    let parsedArgs = {};
                    if (typeof args === 'string') {
                        try {
                            parsedArgs = JSON.parse(args || '{}');
                        } catch (e) {
                             console.error(`[OpenAI Service] Failed to parse arguments string for tool ${originalName}:`, e);
                        }
                    } else if (typeof args === 'object' && args !== null) {
                        parsedArgs = args;
                    }

                    // Apply robust parsing for complex nested types (arrays/objects) that might be stringified
                    const robustArgs = parseComplexArgs(parsedArgs, originalName, tools);

                    return {
                        name: originalName,
                        arguments: robustArgs
                    };
                });
                return { toolCalls, text: responseContent };
            } catch (e) {
                throw new Error(`Failed to process arguments from AI tool call: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        
        // 2. Text Parsing (Fallback or Injected Prompt Mode)
        if (responseContent) {
            const parsedToolCalls = parseToolCallFromText(responseContent, toolNameMap, tools);
            if (parsedToolCalls) {
                console.log("[OpenAI Service] Successfully parsed tool call from text.", parsedToolCalls);
                return { toolCalls: parsedToolCalls, text: responseContent };
            }
        }
        
        return { toolCalls: null, text: responseContent };

    } catch (e) {
        if (e instanceof Error && e.message.toLowerCase().includes('failed to fetch')) {
             throw new Error(`Network Error: Could not connect to OpenAI-compatible API at ${openAIBaseUrl}. \n\nCommon causes:\n1. The server is not running.\n2. The Base URL is incorrect.\n3. A browser security feature (CORS) is blocking the request. If you are running a local server (like Ollama), ensure it's configured to accept requests from this web app's origin.`);
        }
        throw e;
    }
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    files: { type: string, data: string }[] = []
): Promise<string> => {
    const { openAIAPIKey, openAIBaseUrl } = apiConfig;

    if (!openAIAPIKey) throw new Error("OpenAI API Key is missing.");
    if (!openAIBaseUrl) throw new Error("OpenAI Base URL is missing.");
    
    // --- CAPABILITIES CONFIG ---
    const capabilities = apiConfig.modelCapabilities?.[modelId];
    const minimizeThinking = capabilities?.thinkingMode === 'minimize';

    let finalSystemInstruction = systemInstruction;
    if (minimizeThinking) {
        // Updated: Keep only text instruction here
        finalSystemInstruction += `\n\nCRITICAL: Do not output internal thought processes or <think> tags. Output ONLY the final response. Minimize tokens.`;
    }

    // Prepend command to user input
    let combinedUserPrompt = `${userInput}`;
    if (minimizeThinking) {
        combinedUserPrompt = `/no_think\n${combinedUserPrompt}`;
    }

    let userMessageContent: any;
    if (files && files.length > 0) {
        userMessageContent = [{ type: 'text', text: combinedUserPrompt }];
        files.forEach(file => {
            userMessageContent.push({
                type: 'image_url',
                image_url: {
                    url: `data:${file.type};base64,${file.data}`
                }
            });
        });
    } else {
        userMessageContent = combinedUserPrompt;
    }

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: finalSystemInstruction },
            { role: 'user', content: userMessageContent }
        ],
        temperature: 0.0,
        max_tokens: 4096,
    };
    
    try {
        const response = await robustFetch(
            openAIBaseUrl,
            '/chat/completions',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openAIAPIKey}` },
                body: JSON.stringify(body),
            },
            OPENAI_TIMEOUT
        );

        if (!response.ok) {
            await handleAPIError(response, openAIBaseUrl);
            return "";
        }

        const data = await response.json();
        return stripThinking(data.choices?.[0]?.message?.content);
    } catch (e) {
        if (e instanceof Error && e.message.toLowerCase().includes('failed to fetch')) {
             throw new Error(`Network Error: Could not connect to OpenAI-compatible API at ${openAIBaseUrl}. \n\nCommon causes:\n1. The server is not running.\n2. The Base URL is incorrect.\n3. A browser security feature (CORS) is blocking the request. If you are running a local server (like Ollama), ensure it's configured to accept requests from this web app's origin.`);
        }
        throw e;
    }
};
