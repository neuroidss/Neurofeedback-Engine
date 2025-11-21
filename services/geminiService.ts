
// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import { GoogleGenAI, FunctionDeclaration, GenerateContentResponse, Type, Part, Modality } from "@google/genai";
import type { APIConfig, LLMTool, AIResponse, AIToolCall, ScoredTool } from "../types";

const geminiInstances: Map<string, GoogleGenAI> = new Map();

const getGeminiInstance = (apiKey: string): GoogleGenAI => {
    if (!apiKey) {
        throw new Error("Google Gemini API key is missing.");
    }
    if (!geminiInstances.has(apiKey)) {
        geminiInstances.set(apiKey, new GoogleGenAI({ apiKey }));
    }
    return geminiInstances.get(apiKey)!;
};

// Specific instance for experimental features like Lyria
const getExperimentalGeminiInstance = (apiKey: string): GoogleGenAI => {
    if (!apiKey) throw new Error("Google Gemini API key is missing.");
    // Lyria often requires v1alpha
    return new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
};

// Helper function to strip <think> blocks from model output
const stripThinking = (text: string | null | undefined): string => {
    if (!text) return "";
    // This regex removes any <think>...</think> blocks and trims whitespace.
    return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
};


// Helper function to identify Gemma models, which require a different approach for tool calling.
const isGemmaModel = (modelId: string): boolean => modelId.startsWith('gemma-');

const sanitizeToolName = (name: string): string => {
    // Replace invalid chars with underscores
    let sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    // Ensure it doesn't start with a number
    if (/^[0-9]/.test(sanitized)) {
        sanitized = '_' + sanitized;
    }
    // Enforce max length of 64 characters
    return sanitized.slice(0, 64);
}

const mapTypeToGemini = (type: LLMTool['parameters'][0]['type']): Type => {
    switch (type) {
        case 'string': return Type.STRING;
        case 'number': return Type.NUMBER;
        case 'boolean': return Type.BOOLEAN;
        case 'array': return Type.STRING;
        case 'object': return Type.STRING;
        default: return Type.STRING;
    }
}

const buildGeminiTools = (tools: LLMTool[]): FunctionDeclaration[] => {
    return tools.map(tool => ({
        // USE ID instead of NAME to ensure uniqueness and prevent "Duplicate function declaration" API errors
        name: sanitizeToolName(tool.id),
        description: tool.description,
        parameters: {
            type: Type.OBJECT,
            properties: tool.parameters.reduce((obj, param) => {
                const isComplexType = param.type === 'array' || param.type === 'object';
                obj[param.name] = {
                    type: mapTypeToGemini(param.type),
                    description: isComplexType 
                        ? `${param.description} (This argument must be a valid, JSON-formatted string.)`
                        : param.description,
                };
                return obj;
            }, {} as Record<string, any>),
            required: tool.parameters.filter(p => p.required).map(p => p.name),
        },
    }));
};

const buildParts = (userInput: string, files: { type: string; data: string }[]): Part[] => {
    const parts: Part[] = [{ text: userInput }];
    for (const file of files) {
        parts.push({
            inlineData: {
                mimeType: file.type,
                data: file.data,
            },
        });
    }
    return parts;
};

const parseToolCallFromText = (text: string, toolNameMap: Map<string, string>): AIToolCall[] | null => {
    if (!text) return null;

    // Regex to find a JSON block, optionally inside ```json ... ```
    const jsonRegex = /```json\s*([\s\S]*?)\s*```|({[\s\S]*}|\[[\s\S]*\])/m;
    const match = text.match(jsonRegex);
    if (!match) return null;

    const jsonString = match[1] || match[2];
    if (!jsonString) return null;

    try {
        let parsedJson = JSON.parse(jsonString);
        if (!Array.isArray(parsedJson)) {
            parsedJson = [parsedJson];
        }

        const toolCalls: AIToolCall[] = [];
        for (const call of parsedJson) {
            if (typeof call !== 'object' || call === null) continue;

            const nameKey = Object.keys(call).find(k => k.toLowerCase().includes('name'));
            const argsKey = Object.keys(call).find(k => k.toLowerCase().includes('arguments'));

            if (nameKey && argsKey && typeof call[nameKey] === 'string' && typeof call[argsKey] === 'object') {
                const rawName = call[nameKey];
                const originalName = toolNameMap.get(sanitizeToolName(rawName)) || toolNameMap.get(rawName) || rawName;
                toolCalls.push({ name: originalName, arguments: call[argsKey] });
            }
        }
        return toolCalls.length > 0 ? toolCalls : null;
    } catch (e) {
        console.warn(`[Gemini Service] Fallback tool call parsing failed for JSON string: "${jsonString}"`, e);
        return null;
    }
};

// Helper to extract text and tools manually to avoid SDK warnings about non-text parts
const extractResponseData = (response: GenerateContentResponse, toolNameMap: Map<string, string>, tools: LLMTool[]): { text: string, toolCalls: AIToolCall[] | null } => {
    let text = "";
    const toolCalls: AIToolCall[] = [];
    
    const candidate = response.candidates?.[0];
    if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
            if (part.text) {
                text += part.text;
            }
            if (part.functionCall) {
                const fc = part.functionCall;
                // Map the sanitized ID back to the original Name
                const originalName = toolNameMap.get(fc.name) || fc.name;
                
                const toolDefinition = tools.find(t => t.name === originalName);
                const parsedArgs = { ...fc.args };

                // Handle complex types encoded as strings
                if (toolDefinition) {
                    for (const param of toolDefinition.parameters) {
                        const argValue = parsedArgs[param.name];
                        if ((param.type === 'array' || param.type === 'object') && typeof argValue === 'string') {
                            try {
                                parsedArgs[param.name] = JSON.parse(argValue);
                            } catch (e) {
                                console.warn(`[Gemini Service] Failed to parse JSON string for argument '${param.name}' in tool '${originalName}'. Error: ${e}`);
                            }
                        }
                    }
                }

                toolCalls.push({
                    name: originalName,
                    arguments: parsedArgs as Record<string, any>
                });
            }
            // Note: We intentionally ignore 'thought' parts here to prevent them from polluting the text output 
            // and to avoid the SDK warning about non-text parts.
        }
    }
    
    return { text: stripThinking(text), toolCalls: toolCalls.length > 0 ? toolCalls : null };
};


export const generateWithTools = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiKey: string,
    tools: LLMTool[],
    files: { type: string, data: string }[] = []
): Promise<AIResponse> => {
    const ai = getGeminiInstance(apiKey);
    
    // Map sanitized IDs to original names so we can resolve API responses back to valid runtime tool names
    // CRITICAL FIX: We map from ID because that is what we send to the API as the function name.
    const toolNameMap = new Map(tools.map(t => [sanitizeToolName(t.id), t.name]));
    
    // Also allow mapping by original name for robustness (in case of fallbacks)
    tools.forEach(tool => toolNameMap.set(tool.name, tool.name));

    // --- GEMMA-SPECIFIC PATH (PROMPT-BASED TOOLING) ---
    // This path is used for models like Gemma that don't support native function calling.
    if (isGemmaModel(modelId)) {
        console.log(`[Gemini Service] Using prompt-based tool emulation for Gemma model: ${modelId}`);
        
        const toolDescriptions = tools.map(tool => {
            const params = tool.parameters.map(p => `  - ${p.name} (${p.type}): ${p.description}${p.required ? ' (required)' : ''}`).join('\n');
            return `Tool: "${tool.name}"\nDescription: ${tool.description}\nParameters:\n${params}`;
        }).join('\n\n');

        const toolInstruction = `You are a helpful assistant that has access to the following tools. To use a tool, you MUST respond with ONLY a single JSON object (or an array of objects for multiple calls) in a \`\`\`json block. Do not add any other text or explanation.
Your response format for a tool call MUST be:
\`\`\`json
[
  {
    "name": "tool_name_to_call",
    "arguments": { "arg1": "value1", "arg2": "value2" }
  }
]
\`\`\`

AVAILABLE TOOLS:
${toolDescriptions}`;

        const fullPrompt = `${systemInstruction}\n\n${toolInstruction}\n\nUSER'S TASK:\n${userInput}`;
        
        // Gemma models do not support the 'config' object with 'systemInstruction' or 'tools'.
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: modelId,
            contents: { parts: buildParts(fullPrompt, files), role: 'user' },
        });

        // For Gemma, we can only rely on parsing the text response.
        const { text: responseText } = extractResponseData(response, toolNameMap, tools);
        const toolCalls = parseToolCallFromText(responseText, toolNameMap);
        
        return { toolCalls, text: responseText };
    }

    // --- GEMINI-SPECIFIC PATH (NATIVE TOOLING) ---
    const geminiTools = buildGeminiTools(tools);
    const fallbackInstruction = `\n\nIf you cannot use the provided functions, you MUST respond with ONLY a JSON object (or an array of objects) in a \`\`\`json block, with the format: [{"name": "tool_name", "arguments": {"arg1": "value1"}}]`;
    const fullSystemInstruction = systemInstruction + fallbackInstruction;

    const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelId,
        contents: { parts: buildParts(userInput, files), role: 'user' },
        config: {
            systemInstruction: fullSystemInstruction,
            tools: [{ functionDeclarations: geminiTools }],
        }
    });
    
    // EXTRACT DATA MANUALLY to avoid "non-text parts" warnings from SDK
    let { text: responseText, toolCalls } = extractResponseData(response, toolNameMap, tools);

    // --- FAULT TOLERANCE: FALLBACK LOGIC ---
    if ((!toolCalls || toolCalls.length === 0) && responseText) {
        console.log("[Gemini Service] No native function call found. Attempting to parse from text content as a fallback.");
        const parsedToolCalls = parseToolCallFromText(responseText, toolNameMap);
        if (parsedToolCalls) {
            console.log("[Gemini Service] ✅ Successfully parsed tool call from text via fallback.", parsedToolCalls);
            toolCalls = parsedToolCalls;
        }
    }

    return { toolCalls, text: responseText };
};

export const generateText = async (
    userInput: string,
    systemInstruction: string,
    modelId: string,
    apiKey: string,
    files: { type: string, data: string }[] = []
): Promise<string> => {
    const ai = getGeminiInstance(apiKey);
    
    // --- GEMMA-SPECIFIC PATH ---
    if (isGemmaModel(modelId)) {
        console.log(`[Gemini Service] Using prompt concatenation for Gemma model text generation: ${modelId}`);
        const fullPrompt = `${systemInstruction}\n\n${userInput}`;
        const response = await ai.models.generateContent({
            model: modelId,
            contents: { parts: buildParts(fullPrompt, files), role: 'user' },
        });
        const { text } = extractResponseData(response, new Map(), []);
        return text;
    }
    
    // --- GEMINI-SPECIFIC PATH ---
    const response = await ai.models.generateContent({
        model: modelId,
        contents: { parts: buildParts(userInput, files), role: 'user' },
        config: { systemInstruction }
    });

    const { text } = extractResponseData(response, new Map(), []);
    return text;
};

export const generateImage = async (
    prompt: string,
    apiKey: string,
    modelId: string = 'imagen-4.0-generate-001'
): Promise<string | null> => {
    const ai = getGeminiInstance(apiKey);
    try {
        // Strategy 1: High-Quality Imagen (Default)
        if (modelId.includes('imagen')) {
            const response = await ai.models.generateImages({
                model: modelId,
                prompt: prompt,
                config: {
                    numberOfImages: 1,
                    outputMimeType: 'image/jpeg',
                    aspectRatio: '16:9',
                },
            });
            const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
            if (base64Image) {
                return `data:image/jpeg;base64,${base64Image}`;
            }
        } 
        // Strategy 2: Fast "Flash Image" (Nano Banana) - treats generation as multimodal text response with image modality
        else {
             const response = await ai.models.generateContent({
                model: modelId, // e.g., 'gemini-2.5-flash-image'
                contents: { parts: [{ text: prompt }] },
                config: {
                    responseModalities: [Modality.IMAGE],
                },
            });
            
            // Iterate through parts to find the inline image data
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        
        return null;
    } catch (e) {
        console.error("Gemini/Imagen Generation Error:", e);
        return null;
    }
};

export const generateSpeech = async (
    text: string,
    voiceName: string,
    apiKey: string
): Promise<string | null> => {
    const ai = getGeminiInstance(apiKey);
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-tts",
            contents: [{ parts: [{ text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: voiceName },
                    },
                },
            },
        });
        
        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            // Returns raw PCM base64 data. Must be decoded on client.
            return base64Audio;
        }
        return null;
    } catch (e) {
        console.error("TTS Generation Error:", e);
        return null;
    }
};

// --- NEW: Music Generation (Lyria) ---
export const createMusicSession = async (
    apiKey: string,
    callbacks: { onAudioData: (base64: string) => void; onError?: (err: any) => void }
) => {
    try {
        const ai = getExperimentalGeminiInstance(apiKey);
        
        const session = await ai.live.music.connect({
            model: "models/lyria-realtime-exp",
            callbacks: {
                onmessage: (message: any) => {
                    if (message.serverContent?.audioChunks) {
                        for (const chunk of message.serverContent.audioChunks) {
                            if (chunk.data) {
                                callbacks.onAudioData(chunk.data);
                            }
                        }
                    }
                },
                onerror: (error: any) => {
                    console.error("Lyria session error:", error);
                    if (callbacks.onError) callbacks.onError(error);
                },
                onclose: () => console.log("Lyria stream closed."),
            },
        });

        // Configure audio format
        await session.setMusicGenerationConfig({
            musicGenerationConfig: {
                bpm: 90,
                temperature: 1.0,
            },
        });
        
        await session.play();

        return session;
    } catch (e) {
        console.error("Failed to connect to Lyria:", e);
        throw e;
    }
};

export const contextualizeWithSearch = async (
    prompt: { text: string; files: any[] },
    apiKey: string,
    modelId: string
): Promise<{ summary: string; sources: { title: string; uri: string }[] }> => {
    const ai = getGeminiInstance(apiKey);
    const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt.text,
        config: {
            tools: [{ googleSearch: {} }],
        },
    });

    const { text: responseText } = extractResponseData(response, new Map(), []);
    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    
    if (!groundingMetadata?.groundingChunks) {
        return { summary: responseText, sources: [] };
    }
    
    const sources = groundingMetadata.groundingChunks
        .map((chunk: any) => chunk.web)
        .filter(Boolean)
        .map((web: any) => ({ title: web.title || "Untitled", uri: web.uri }))
        .filter((source, index, self) => index === self.findIndex(s => s.uri === source.uri)); // Unique sources

    return { summary: responseText, sources };
};