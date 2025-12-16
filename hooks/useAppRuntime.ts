
// hooks/useAppRuntime.ts
import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { useAppStateManager } from './useAppStateManager';
import { useToolManager } from './useToolManager';
import { useToolRelevance } from './useToolRelevance';
import { useSwarmManager } from './useSwarmManager';
import * as aiService from '../services/aiService';
import * as searchService from '../services/searchService';
import * as embeddingService from '../services/embeddingService';
// IMPORT THIS:
import * as ollamaService from '../services/ollamaService';
import * as openAIService from '../services/openAIService'; 
import { localWhisper } from '../services/localWhisperService';
import { localTts } from '../services/localTtsService';
import { neuroBus } from '../services/neuroBus';
import { streamEngine } from '../services/streamEngine';
import { ModelProvider } from '../types';
import type { AIToolCall, EnrichedAIResponse, LLMTool, MainView, ToolCreatorPayload, ExecuteActionFunction, SearchResult, AIModel, SubStepProgress } from '../types';
import UniversalGraphRenderer from '../components/UniversalGraphRenderer';

// Tools that run frequently (e.g., in DSP loops) and should not spam the log.
const NOISY_TOOLS = new Set([
    'Calculate_Coherence_Matrix_Optimized',
    'Calculate_Coherence_Matrix_Quantum_Mock',
    'Solve_QUBO_SimulatedAnnealing',
    'MultiSourceEEGStreamAggregator',
    'findHypergraphDissonanceQuantum',
    'findGraphDissonanceQuantum',
    'Create_Vision_Source', // Vision source runs frequently
    'List Managed Processes', // Polling tool for server management
    'Create_EEG_Source', // Stream source
    'Create_Standard_Node',
    'Bind_To_Visuals'
]);

export function useAppRuntime() {
    const stateManager = useAppStateManager();
    const toolManager = useToolManager({ 
        logEvent: stateManager.logEvent,
        disablePersistence: stateManager.apiConfig.disablePersistence 
    });
    const { findRelevantTools } = useToolRelevance({ allTools: toolManager.allTools, logEvent: stateManager.logEvent });

    const executeActionRef = useRef<ExecuteActionFunction | null>(null);

    // --- Sub-step progress state ---
    const [subStepProgress, setSubStepProgress] = useState<SubStepProgress>(null);
    const [activeAppId, setActiveAppId] = useState<string | null>(null);


    const swarmManager = useSwarmManager({
        logEvent: stateManager.logEvent,
        setUserInput: () => {}, // Assuming direct task creation, not from a user input field
        setEventLog: stateManager.setEventLog,
        setApiCallCount: stateManager.setApiCallCount,
        setSubStepProgress: setSubStepProgress, // Pass the setter down
        findRelevantTools,
        mainView: 'SYNERGY_FORGE',
        processRequest: (prompt, systemInstruction, agentId, relevantTools) => {
            checkApiCallVelocity(); // Guardian check
            stateManager.setApiCallCount(prev => ({ ...prev, [stateManager.selectedModel.id]: (prev[stateManager.selectedModel.id] || 0) + 1 }));
            return aiService.processRequest(prompt, systemInstruction, agentId, relevantTools, stateManager.selectedModel, stateManager.apiConfig);
        },
        executeActionRef: executeActionRef,
        allTools: toolManager.allTools,
        selectedModel: stateManager.selectedModel,
        apiConfig: stateManager.apiConfig,
    });

    const isSwarmRunningRef = useRef(swarmManager.isSwarmRunning);
    useEffect(() => {
        isSwarmRunningRef.current = swarmManager.isSwarmRunning;
    }, [swarmManager.isSwarmRunning]);
    
    // --- Budgetary Guardian Velocity Check ---
    const checkApiCallVelocity = () => {
        if (stateManager.isBudgetGuardTripped) {
            throw new Error("Budgetary Guardian is active. All API calls are blocked.");
        }
        
        // READ FROM CONFIG
        const limit = stateManager.apiConfig.velocityLimit || 15;
        const windowSeconds = stateManager.apiConfig.velocityWindow || 10;
        
        const now = Date.now();
        const windowStart = now - (windowSeconds * 1000);
        
        const recentTimestamps = [...stateManager.apiCallTimestamps, now].filter(ts => ts > windowStart);
        stateManager.setApiCallTimestamps(recentTimestamps);

        if (recentTimestamps.length > limit) {
            const msg = `[!!! BUDGET GUARDIAN !!!] 🛡️ High velocity detected: ${recentTimestamps.length} API calls in the last ${windowSeconds} seconds. Halting task to prevent runaway spending. Increase the limit in Settings if this is intentional.`;
            stateManager.logEvent(msg);
            stateManager.setIsBudgetGuardTripped(true);
            swarmManager.handleStopSwarm("Budgetary Guardian triggered by high API call velocity.", false);
            throw new Error(`Budgetary Guardian triggered: High API call velocity detected.`);
        }
    };


    const getTool = useCallback((name: string): LLMTool | undefined => {
        return toolManager.allTools.find(t => t.name === name);
    }, [toolManager.allTools]);

    const runtimeApi = useMemo(() => ({
        logEvent: stateManager.logEvent,
        isServerConnected: () => toolManager.isServerConnected,
        forceRefreshServerTools: toolManager.forceRefreshServerTools,
        reportProgress: setSubStepProgress, // Expose the progress setter to tools
        startSwarmTask: swarmManager.startSwarmTask,
        handleStopSwarm: swarmManager.handleStopSwarm,
        // --- NEW HELPER ---
        renderGraphProtocol: (args: any, visualComponent: string, nodes: any[]) => {
             // This helper allows tools to return a pre-configured Graph Renderer
             // minimizing the code string stored in the tool definition.
             return React.createElement(UniversalGraphRenderer, { 
                 runtime: runtimeApi, // Pass self
                 nodes: nodes, 
                 visualComponent: visualComponent 
             });
        },
        os: {
          launchApp: (appId: string) => setActiveAppId(appId),
        },
        // Services exposed for tools (specifically stream tools)
        neuroBus,
        streamEngine,
        // This is a new addition to expose read-only state to tools that need it.
        // It's a function to prevent stale closures.
        getState: () => ({
            selectedModel: stateManager.selectedModel,
            apiConfig: stateManager.apiConfig,
            allSources: stateManager.allSources,
            validatedSources: stateManager.validatedSources,
            setValidatedSources: stateManager.setValidatedSources,
            liveFeed: stateManager.liveFeed,
            eventLog: stateManager.eventLog,
            apiCallCount: stateManager.apiCallCount, // Expose for UI counters
            ModelProvider, // Expose the enum
            isSwarmRunning: isSwarmRunningRef.current, // Use the ref to get the live value
            globalEegData: stateManager.globalEegData, // Expose raw EEG data
            subStepProgress: subStepProgress,
            activeAppId: activeAppId,
        }),
        eeg: {
            setGlobalEegData: stateManager.setGlobalEegData,
            getGlobalEegData: () => stateManager.globalEegData,
        },
        vibecoder: {
            getHistory: () => stateManager.vibecoderHistory,
            recordIteration: (iterationData: any) => {
                stateManager.setVibecoderHistory(prev => [...prev, iterationData]);
            },
            clearHistory: () => stateManager.setVibecoderHistory([]),
        },
        tools: {
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                if (!executeActionRef.current) {
                    throw new Error("Execution context not initialized.");
                }
                const toolCall: AIToolCall = { name: toolName, arguments: args };
                const result = await executeActionRef.current(toolCall, 'user-manual');
                
                // Add the result of this manual run to the main swarm history.
                swarmManager.appendToSwarmHistory(result);

                if (result.executionError) {
                    throw new Error(result.executionError);
                }
                return result.executionResult;
            },
            add: (payload: ToolCreatorPayload): LLMTool => {
                const newTool = {
                    ...payload,
                    id: toolManager.generateMachineReadableId(payload.name, toolManager.tools),
                    version: 1,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                };
                toolManager.setTools(prev => [...prev, newTool]);
                stateManager.logEvent(`[SYSTEM] Created new tool: '${newTool.name}'`);
                return newTool;
            },
            list: () => toolManager.allTools,
        },
        search: {
            pubmed: (query: string, limit: number, sinceYear?: number, proxyUrl?: string) => searchService.searchPubMed(query, stateManager.logEvent, limit, sinceYear, proxyUrl),
            biorxiv: (query: string, limit: number, sinceYear?: number, proxyUrl?: string) => searchService.searchBioRxivPmcArchive(query, stateManager.logEvent, limit, sinceYear, proxyUrl),
            patents: (query: string, limit: number, proxyUrl?: string) => searchService.searchGooglePatents(query, stateManager.logEvent, limit, proxyUrl),
            web: (query: string, limit: number, proxyUrl?: string) => searchService.searchWeb(query, stateManager.logEvent, limit, proxyUrl),
            enrichSource: (source: SearchResult, proxyUrl?: string) => searchService.enrichSource(source, stateManager.logEvent, proxyUrl),
            updateProxyList: (newBuilderStrings: string[]) => searchService.updateProxyList(newBuilderStrings),
            getProxyList: () => searchService.getProxyList(),
            buildCanonicalUrl: searchService.buildCanonicalUrl,
        },
        ai: {
            generateText: (text: string, systemInstruction: string, files: { type: string, data: string }[] = []) => {
                checkApiCallVelocity(); // Guardian check
                stateManager.setApiCallCount(prev => ({ ...prev, [stateManager.selectedModel.id]: (prev[stateManager.selectedModel.id] || 0) + 1 }));
                return aiService.generateTextFromModel({ text, files }, systemInstruction, stateManager.selectedModel, stateManager.apiConfig, stateManager.logEvent);
            },
            processRequest: (text: string, systemInstruction: string, tools: LLMTool[], files: { type: string, data: string }[] = [], modelOverride?: AIModel) => {
                checkApiCallVelocity(); // Guardian check
                const modelToUse = modelOverride || stateManager.selectedModel;
                stateManager.setApiCallCount(prev => ({ ...prev, [modelToUse.id]: (prev[modelToUse.id] || 0) + 1 }));
                return aiService.processRequest({ text, files }, systemInstruction, 'tool-runtime', tools, modelToUse, stateManager.apiConfig);
            },
            // --- NEW: Multimedia Methods ---
            generateImage: (prompt: string) => {
                checkApiCallVelocity();
                stateManager.setApiCallCount(prev => ({ ...prev, [stateManager.selectedModel.id]: (prev[stateManager.selectedModel.id] || 0) + 1 }));
                return aiService.generateImage(prompt, stateManager.selectedModel, stateManager.apiConfig);
            },
            generateSpeech: (text: string, voiceName: string = 'Puck') => {
                 checkApiCallVelocity();
                 stateManager.setApiCallCount(prev => ({ ...prev, [stateManager.selectedModel.id]: (prev[stateManager.selectedModel.id] || 0) + 1 }));
                 return aiService.generateSpeech(text, voiceName, stateManager.selectedModel, stateManager.apiConfig);
            },
            createMusicSession: (callbacks: { onAudioData: (base64: string) => void; onError?: (err: any) => void }) => {
                 // Do NOT check velocity here as it is a persistent session, not a one-off call.
                 return aiService.createMusicSession(callbacks, stateManager.apiConfig);
            },
            transcribeAudioLocal: async (blob: Blob, onProgress: (msg: string) => void) => {
                await localWhisper.loadModel(onProgress);
                return await localWhisper.transcribe(blob);
            },
            synthesizeSpeechLocal: async (text: string, onProgress: (msg: string) => void) => {
                await localTts.loadModel(onProgress);
                return await localTts.speak(text);
            },
            // --- End Multimedia ---
            search: (text: string) => {
                 checkApiCallVelocity(); // Guardian check
                 stateManager.setApiCallCount(prev => ({ ...prev, [stateManager.selectedModel.id]: (prev[stateManager.selectedModel.id] || 0) + 1 }));
                 return aiService.contextualizeWithSearch({text, files: []}, stateManager.apiConfig, stateManager.selectedModel);
            },
            generateEmbeddings: (texts: string[]) => embeddingService.generateEmbeddings(texts, stateManager.logEvent),
            // NEW: Expose raw feature extractor getter for robust loading
            getFeatureExtractor: (modelId: string, onProgress?: (msg: string) => void) => embeddingService.getFeatureExtractor(modelId, onProgress || stateManager.logEvent),
            // NEW: Expose Capability Tests
            testOllamaCapabilities: (modelId: string) => ollamaService.testModelCapabilities(modelId, stateManager.apiConfig),
            testOpenAICapabilities: (modelId: string) => openAIService.testModelCapabilities(modelId, stateManager.apiConfig),
        },
        getObservationHistory: () => [], // Placeholder for a more advanced feature
        clearObservationHistory: () => {}, // Placeholder
    }), [stateManager, toolManager, swarmManager, setSubStepProgress, subStepProgress, activeAppId, setActiveAppId]);

    // --- GLOBAL RUNTIME INJECTION ---
    // Expose the runtime API to the global scope so StreamEngine nodes can access it via window.runtime
    useEffect(() => {
        (window as any).runtime = runtimeApi;
    }, [runtimeApi]);

    const executeAction = useMemo<ExecuteActionFunction>(() => {
        const fn = async (
            toolCall: AIToolCall,
            agentId: string,
            context?: MainView
        ): Promise<EnrichedAIResponse> => {
            const tool = getTool(toolCall.name);
            const isNoisy = NOISY_TOOLS.has(toolCall.name);
            const log = (msg: string) => {
                if (!isNoisy) stateManager.logEvent(`[${agentId}] ${msg}`);
            };
            
            log(`Executing tool: ${toolCall.name}`);

            if (!tool) {
                const error = `Tool "${toolCall.name}" not found.`;
                log(`[ERROR] ${error}`);
                return { toolCall, executionError: error };
            }

            if (tool.executionEnvironment === 'Server') {
                if (!toolManager.isServerConnected) {
                    const error = `Server tool '${tool.name}' cannot be executed: Server is not connected.`;
                    log(`[ERROR] ${error}`);
                    return { toolCall, tool, executionError: error };
                }
                try {
                    const response = await fetch('http://localhost:3001/api/execute', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(toolCall),
                    });
                    
                    const responseText = await response.text();
                    let result;
                    try {
                        result = JSON.parse(responseText);
                    } catch (parseError) {
                        const error = `Failed to parse JSON response from server. Status: ${response.status}. Response body: ${responseText.substring(0, 500)}`;
                        log(`[ERROR] ${error}`);
                        return { toolCall, tool, executionError: error };
                    }
                    
                    if (!response.ok) {
                        throw new Error(result.error || `Server responded with status ${response.status}`);
                    }
                    log(`Tool '${tool.name}' executed successfully on the server.`);
                    return { toolCall, tool, executionResult: result };
                } catch (e: any) {
                    const error = `Error executing server tool '${tool.name}': ${e.message}`;
                    log(`[ERROR] ${error}`);
                    return { toolCall, tool, executionError: e.message };
                }
            }

            try {
                const code = tool.implementationCode;
                const func = new Function('args', 'runtime', `return (async () => { ${code} })()`);
                const result = await func(toolCall.arguments, runtimeApi);
                log(`Tool '${tool.name}' executed successfully.`);
                return { toolCall, tool, executionResult: result };
            } catch (e: any) {
                let detailedError;
                if (e instanceof SyntaxError) {
                    detailedError = `[COMPILATION ERROR] in tool '${tool.name}'. The tool's code could not be parsed. This is likely due to a syntax error, such as an unescaped character in the 'implementationCode' string. Original error: ${e.message}. See developer console for the full code.`;
                    console.error(`--- Offending Code for tool '${tool.name}' ---`);
                    console.error(tool.implementationCode);
                    console.error(`--- End of Offending Code ---`);
                } else {
                    detailedError = `[RUNTIME ERROR] in tool '${tool.name}'. The tool's code executed but threw an exception. Original error: ${e.message}. See developer console for stack trace.`;
                    console.error(`Runtime error in '${tool.name}':`, e);
                }
                
                stateManager.logEvent(`[${agentId}] [ERROR] ${detailedError}`);
                return { toolCall, tool, executionError: detailedError };
            }
        };

        fn.getRuntimeApiForAgent = (agentId: string) => runtimeApi;

        return fn;
    }, [getTool, stateManager.logEvent, runtimeApi, toolManager.isServerConnected]);

    executeActionRef.current = executeAction;
    
    return {
        ...stateManager,
        ...toolManager,
        ...swarmManager,
        subStepProgress, // Expose the progress state
        runtimeApi,
        getTool,
        activeAppId,
        setActiveAppId,
    };
}
