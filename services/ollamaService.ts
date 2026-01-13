
// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import type { APIConfig, LLMTool, AIResponse, AIToolCall, AIModel, ModelCapability } from "../types";
import { ModelProvider } from '../types';

const KERNEL_PROXY_URL = 'http://localhost:3001/mcp/external_ai_bridge';

// Helper to get timeout from config (default 1 hour = 3600000ms)
const getTimeout = (config: APIConfig) => (config.aiBridgeTimeout || 3600) * 1000;

// Helper function to strip <think> blocks from model output
const stripThinking = (text: string | null | undefined): string => {
    if (!text) return "";
    // This regex removes any <think>...</think> blocks and trims whitespace.
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};

// Helper: Deeply parse arguments based on tool definition
const parseComplexArgs = (args: Record<string, any>, toolName: string, tools: LLMTool[]): Record<string, any> => {
    const toolDef = tools.find(t => t.name === toolName);
    if (!toolDef) return args;

    const newArgs = { ...args };
    for (const param of toolDef.parameters) {
        const val = newArgs[param.name];
        if ((param.type === 'array' || param.type === 'object') && typeof val === 'string') {
            try {
                // Remove potential markdown wrappers if present
                const cleanVal = val.replace(/```json\s*|\s*```/g, '').trim();
                newArgs[param.name] = JSON.parse(cleanVal);
            } catch (e) {
                console.warn(`[Ollama Service] Failed to parse complex arg '${param.name}' for tool '${toolName}'. Value:`, val);
            }
        }
    }
    return newArgs;
};

// --- ROBUST FETCH WITH AUTO-PROXY FALLBACK ---
const robustFetch = async (baseUrl: string, endpoint: string, options: RequestInit, timeout: number): Promise<Response> => {
    const directUrl = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
    
    // Helper to perform fetch with timeout
    const doFetch = async (url: string, fetchOptions: RequestInit) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
            const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
            clearTimeout(id);
            return res;
        } catch (e) {
            clearTimeout(id);
            throw e;
        }
    };

    try {
        // Attempt 1: Direct Connection
        const response = await doFetch(directUrl, options);
        if (response.ok) return response;
        
        // If direct failed but not network error (e.g., 404), throw error unless it might be a CORS/Mixed Content issue masquerading
        if (response.status !== 0) return response; 
        throw new Error("Direct fetch status 0"); 

    } catch (e: any) {
        // Check if we should try proxy
        const isLocal = directUrl.includes('localhost') || directUrl.includes('127.0.0.1');
        const isAlreadyProxy = directUrl.includes(KERNEL_PROXY_URL);
        
        if (isLocal && !isAlreadyProxy) {
            // Extract origin for override
            let origin = baseUrl;
            try {
                if (baseUrl.startsWith('http')) {
                    const u = new URL(baseUrl);
                    origin = u.origin;
                }
            } catch(e) {}

            const proxyUrl = `${KERNEL_PROXY_URL.replace(/\/+$/, '')}${endpoint}`;
            console.log(`[Ollama Service] ⚠️ Direct fetch failed (${e.message}). Failing over to Kernel Proxy: ${proxyUrl} (Override: ${origin})`);
            
            // ATTACH OVERRIDE HEADER SO PROXY KNOWS WHERE TO GO
            const proxyOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'X-Target-Override': origin
                }
            };

            try {
                return await doFetch(proxyUrl, proxyOptions);
            } catch (proxyError: any) {
                throw new Error(`Connection failed. Direct: ${e.message}. Proxy (${proxyUrl}): ${proxyError.message}`);
            }
        }
        
        if (e.name === 'AbortError') {
            throw new Error(`Request timed out after ${timeout / 1000} seconds.`);
        }
        throw e;
    }
};

const handleAPIError = async (response: Response) => {
    try {
        const errorBody = await response.text();
        console.error('Error from Ollama API:', response.status, errorBody);
        
        let detail = "";
        try {
            const json = JSON.parse(errorBody);
            detail = json.error || json.message || "";
        } catch(e) {
            detail = errorBody.substring(0, 300); // Truncate if HTML or long
        }
        
        throw new Error(`[Ollama Error ${response.status}]: ${detail || response.statusText}`);
    } catch (e: any) {
         if (e.message.startsWith('[Ollama Error')) throw e;
         throw new Error(`[Ollama Error ${response.status}]: Could not parse error response.`);
    }
};

const generateDetailedError = (error: unknown, host: string): Error => {
    let finalMessage: string;
    if (error instanceof Error) {
        const lowerCaseMessage = error.message.toLowerCase();
        if (lowerCaseMessage.includes('failed to fetch') || lowerCaseMessage.includes('networkerror') || lowerCaseMessage.includes('could not connect')) {
            finalMessage = `Network Error: Failed to connect to Ollama server at ${host}. Please ensure the server is running.`;
        } else {
             finalMessage = `[Ollama Service Error] ${error.message}`;
        }
    } else {
        finalMessage = "An unknown error occurred while communicating with Ollama.";
    }
    const processingError = new Error(finalMessage) as any;
    processingError.rawAIResponse = "Could not get raw response due to an error.";
    return processingError;
};

export const getModels = async (apiConfig: APIConfig): Promise<AIModel[]> => {
    const { ollamaHost } = apiConfig;
    const baseUrl = ollamaHost || 'http://localhost:11434';
    
    try {
        const response = await robustFetch(baseUrl, '/api/tags', {
            method: 'GET'
        }, 5000);

        if (!response.ok) {
            await handleAPIError(response);
            return [];
        }

        const data = await response.json();
        const models: AIModel[] = data.models.map((model: any) => ({
            id: model.name,
            name: model.name,
            provider: ModelProvider.Ollama,
        }));
        return models;
    } catch (e) {
        throw generateDetailedError(e, baseUrl);
    }
};

const buildOllamaTools = (tools: LLMTool[]) => {
    return tools.map(tool => ({
        type: 'function',
        function: {
            name: tool.name.replace(/[^a-zA-Z0-9_]/g, '_'),
            description: tool.description,
            parameters: {
                type: 'object',
                properties: tool.parameters.reduce((obj, param) => {
                    if (param.type === 'array' || param.type === 'object') {
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

    // Use robust scanner to find all JSON-like structures
    const candidates = extractJsonSnippets(text);
    const accumulatedToolCalls: AIToolCall[] = [];

    console.log(`[Ollama Service] Parsing Tool Calls. Found ${candidates.length} candidates from text.`);

    for (let jsonString of candidates) {
        try {
            // Apply robustness fixes before parsing
            const cleanJsonString = repairJson(jsonString);
            
            let parsedJson = null;
            try {
                parsedJson = JSON.parse(cleanJsonString);
            } catch (e) {
                // If clean parse fails, ignore this candidate
                continue;
            }

            if (!parsedJson) continue;
            
            // Normalize to array for processing
            let calls: any[] = [];
            
            // Strategy 1: OpenAI "tool_calls" wrapper
            if (parsedJson.tool_calls && Array.isArray(parsedJson.tool_calls)) {
                calls = parsedJson.tool_calls;
            } 
            // Strategy 2: Direct Array of calls
            else if (Array.isArray(parsedJson)) {
                calls = parsedJson;
            } 
            // Strategy 3: Single Object (Implicit call)
            else {
                calls = [parsedJson];
            }

            for (const call of calls) {
                if (typeof call !== 'object' || call === null) continue;

                let rawName, args;

                // A. OpenAI "function" wrapper check
                if (call.function && call.function.name) {
                    rawName = call.function.name;
                    args = call.function.arguments || {};
                } 
                // B. Flat Explicit Tool Call Structure check (name/arguments)
                else {
                    const nameKey = Object.keys(call).find(k => k.toLowerCase().includes('name') || k === 'function' || k === 'tool');
                    const argsKey = Object.keys(call).find(k => k.toLowerCase().includes('arguments') || k === 'parameters' || k === 'args');
                    
                    if (nameKey) {
                        rawName = call[nameKey];
                        args = argsKey ? call[argsKey] : {};
                    }
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
                             // console.log(`[Ollama Service] Implicitly matched tool '${tool.name}' by schema.`);
                             break;
                         }
                     }
                }

                if (rawName) {
                    const originalName = toolNameMap.get(rawName.replace(/[^a-zA-Z0-9_]/g, '_')) || toolNameMap.get(rawName) || rawName;
                    
                    let parsedArgs = {};
                    if (typeof args === 'object' && args !== null) {
                        parsedArgs = args;
                    } else if (typeof args === 'string') {
                        try {
                            parsedArgs = JSON.parse(args || '{}');
                        } catch (e) {
                            console.error(`[Ollama Service] Failed to parse arguments string for tool ${originalName}:`, e);
                        }
                    }
                    
                    const robustArgs = parseComplexArgs(parsedArgs, originalName, availableTools);
                    console.log(`[Ollama Service] Found explicit tool call in text: ${originalName}`);
                    accumulatedToolCalls.push({ name: originalName, arguments: robustArgs });
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
    // A simple test to check if the model supports native tools
    const testTool: LLMTool = {
        id: 'calculator', name: 'calculator', description: 'Add two numbers', category: 'Functional', executionEnvironment: 'Client', version: 1,
        parameters: [{name: 'a', type: 'number', description: 'First number', required: true}, {name: 'b', type: 'number', description: 'Second number', required: true}],
        implementationCode: ''
    };
    
    const prompt = "What is 50 plus 25? Use the calculator tool.";
    // Try WITHOUT Json Instruction first (Native Test)
    const cap: ModelCapability = { supportsNativeTools: false, useJsonInstruction: false, thinkingMode: 'default' };
    
    try {
        // Temporarily disable capabilities to force a raw test
        const response = await generateWithTools(prompt, "You are a calculator.", modelId, { ...apiConfig, modelCapabilities: {} }, [testTool]);
        if (response.toolCalls && response.toolCalls.length > 0 && response.toolCalls[0].name === 'calculator') {
            cap.supportsNativeTools = true;
            cap.useJsonInstruction = false; // Prefer native if it works
            console.log(`[Ollama Test] ${modelId} supports native tools!`);
            return cap;
        }
    } catch(e) {
        console.warn(`[Ollama Test] Native tool check failed for ${modelId}:`, e);
    }

    // If native failed, we assume we might need JSON instruction.
    // We default 'useJsonInstruction' to true for safety on models that failed native test.
    cap.useJsonInstruction = true; 
    console.log(`[Ollama Test] ${modelId} failed native test. Defaulting to JSON instruction.`);
    return cap;
}

export const generateWithTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    tools: LLMTool[],
    files: { type: string, data: string }[] = []
): Promise<AIResponse> => {
    const { ollamaHost } = apiConfig;
    if (!ollamaHost) {
        throw new Error("Ollama Host URL is not configured. Please set it in the API Configuration.");
    }
    
    const ollamaTools = buildOllamaTools(tools);
    const toolNameMap = new Map(tools.map(t => [t.name.replace(/[^a-zA-Z0-9_]/g, '_'), t.name]));
    tools.forEach(tool => {
        toolNameMap.set(tool.name, tool.name);
    });

    // --- CONFIG-DRIVEN STRATEGY ---
    const capabilities = apiConfig.modelCapabilities?.[modelId];
    // Default: If unknown, assume NO native support (safest for small models) unless it's a known big model
    // But since the user wants tools RESTORED, we default 'useJsonInstruction' to true if unknown, 
    // AND we send native tools just in case.
    const useJsonFallback = capabilities ? capabilities.useJsonInstruction : true;
    const minimizeThinking = capabilities?.thinkingMode === 'minimize';

    // --- HYBRID PROMPT STRATEGY ---
    // 1. Generate explicit tool definitions for the text prompt (Robustness for local models)
    let toolDesc = "";
    if (useJsonFallback) {
        toolDesc = tools.map(t => {
            const params = t.parameters.map(p => `- ${p.name} (${p.type}): ${p.description}`).join('\n');
            return `Tool "${t.name}":\n${t.description}\nParameters:\n${params}`;
        }).join('\n\n');
    }

    const fallbackInstruction = useJsonFallback ? `
### TOOL USE
You have access to the following tools:

${toolDesc}

REQUIRED FORMAT:
If you need to use a tool, you MUST return a JSON object following the OpenAI API tool format.
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
Do not output plain text or markdown outside the JSON block.
` : "";

    const isVisionModel = modelId.toLowerCase().includes('vl') || modelId.toLowerCase().includes('vision') || modelId.toLowerCase().includes('llava');
    let messages = [];

    // Prepend command to user input if minimizing thinking
    let combinedUserPrompt = `${userInput}`;
    if (minimizeThinking) {
        combinedUserPrompt = `/no_think\n${combinedUserPrompt}`;
    }

    if (isVisionModel) {
        // For Vision models, we are careful not to overload the context before the image.
        const combinedContent = useJsonFallback ? `${combinedUserPrompt}\n\n${fallbackInstruction}` : combinedUserPrompt;
        const msg: any = { role: 'user', content: combinedContent };
        if (files && files.length > 0) {
            msg.images = files.map(f => f.data);
        }
        messages.push(msg);
        
        // Some Vision models support system prompt, some don't. We put it first if possible.
        // Qwen-VL supports 'system' role.
        messages.unshift({ role: 'system', content: systemInstruction });
    } else {
        const userMsg: any = { role: 'user', content: combinedUserPrompt };
        if (files && files.length > 0) {
            userMsg.images = files.map(f => f.data);
        }
        messages = [
            { role: 'system', content: systemInstruction + fallbackInstruction },
            userMsg
        ];
    }

    const body: any = {
        model: modelId,
        messages: messages,
        stream: false,
        options: {
            temperature: 0.1,
            num_predict: 4096,
        },
    };
    
    // Always attach native tools if available.
    if (ollamaTools.length > 0) {
        body.tools = ollamaTools;
    }

    console.log(`[Ollama Service] Request Payload for ${modelId}:`, JSON.stringify(body, null, 2));

    try {
        const response = await robustFetch(ollamaHost, '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, getTimeout(apiConfig));

        if (!response.ok) {
            await handleAPIError(response);
            return { toolCalls: null };
        }

        const data = await response.json();
        console.log(`[Ollama Service] Raw Response from ${modelId}:`, JSON.stringify(data, null, 2));

        const toolCallsData = data.message?.tool_calls;
        let responseContent = data.message?.content || "";
        
        // Handle 'thinking' field from some models (e.g., DeepSeek R1 via Ollama)
        if (!responseContent && data.message?.thinking) {
             console.log("[Ollama Service] Model returned only 'thinking' trace.");
        }
        
        responseContent = stripThinking(responseContent);
        
        // 1. CHECK FOR NATIVE TOOLS (Priority)
        if (toolCallsData && Array.isArray(toolCallsData) && toolCallsData.length > 0) {
            console.log(`[Ollama Service] Native tool calls detected: ${toolCallsData.length}`);
            const toolCalls: AIToolCall[] = toolCallsData.map(tc => {
                const toolCall = tc.function;
                const originalName = toolNameMap.get(toolCall.name) || toolCall.name;
                
                const args = toolCall.arguments;
                let parsedArgs = {};
                 if (typeof args === 'object' && args !== null) {
                    parsedArgs = args;
                } else if (typeof args === 'string') {
                    try {
                        parsedArgs = JSON.parse(args || '{}');
                    } catch (e) {
                        console.error(`[Ollama Service] Failed to parse arguments string for tool ${originalName}:`, e);
                    }
                }

                // Apply robust parsing for complex arguments
                const robustArgs = parseComplexArgs(parsedArgs, originalName, tools);

                return {
                    name: originalName,
                    arguments: robustArgs
                };
            }).filter(Boolean);
            return { toolCalls, text: responseContent };
        }
        
        // 2. FALLBACK: PARSE TEXT CONTENT (Custom Tools)
        // Only if we enabled the fallback instruction or if the model did it spontaneously
        if (responseContent) {
            console.log("[Ollama Service] No native tool calls. Checking text content for fallback JSON...");
            const parsedToolCalls = parseToolCallFromText(responseContent, toolNameMap, tools);
            if (parsedToolCalls) {
                console.log("[Ollama Service] ✅ Successfully parsed tool calls from text fallback.", parsedToolCalls);
                return { toolCalls: parsedToolCalls, text: responseContent };
            }
        }
        
        return { toolCalls: null, text: responseContent };

    } catch (e) {
        throw generateDetailedError(e, ollamaHost);
    }
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiConfig: APIConfig,
    files: { type: string, data: string }[] = []
): Promise<string> => {
    const { ollamaHost } = apiConfig;
    if (!ollamaHost) {
        throw new Error("Ollama Host URL is not configured. Please set it in the API Configuration.");
    }

    // --- CAPABILITIES CONFIG ---
    const capabilities = apiConfig.modelCapabilities?.[modelId];
    const minimizeThinking = capabilities?.thinkingMode === 'minimize';

    // Prepend command to user input
    let combinedUserPrompt = `${userInput}`;
    if (minimizeThinking) {
        combinedUserPrompt = `/no_think\n${combinedUserPrompt}`;
    }

    const body = {
        model: modelId,
        messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: combinedUserPrompt, images: files.map(f => f.data) }
        ],
        stream: false,
        options: {
            temperature: 0.0,
            num_predict: 4096,
        },
    };

    try {
        const response = await robustFetch(ollamaHost, '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        }, getTimeout(apiConfig));

        if (!response.ok) {
            await handleAPIError(response);
            return "";
        }

        const data = await response.json();
        return stripThinking(data.message?.content);
    } catch (e) {
        throw generateDetailedError(e, ollamaHost);
    }
};