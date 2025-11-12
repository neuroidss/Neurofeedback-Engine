// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React, { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { useAppStateManager } from './useAppStateManager';
import { useToolManager } from './useToolManager';
import { useToolRelevance } from './useToolRelevance';
import { useSwarmManager } from './useSwarmManager';
import * as aiService from '../services/aiService';
import * as searchService from '../services/searchService';
import * as embeddingService from '../services/embeddingService';
import { ModelProvider } from '../types';
import type { AIToolCall, EnrichedAIResponse, LLMTool, MainView, ToolCreatorPayload, ExecuteActionFunction, SearchResult, AIModel, SubStepProgress } from '../types';

// --- NEW: Budgetary Guardian Configuration ---
const VELOCITY_LIMIT = 15; // Max calls
const VELOCITY_WINDOW_SECONDS = 10; // Per X seconds

// FIX: Changed from a const arrow function to a function declaration.
// This helps TypeScript's type inference by hoisting the function, which can
// resolve module dependency cycles that cause the hook's return type to be
// incorrectly inferred as `void`.
export function useAppRuntime() {
    const stateManager = useAppStateManager();
    const toolManager = useToolManager({ logEvent: stateManager.logEvent });
    const { findRelevantTools } = useToolRelevance({ allTools: toolManager.allTools, logEvent: stateManager.logEvent });

    const executeActionRef = useRef<ExecuteActionFunction | null>(null);

    // --- NEW: Sub-step progress state ---
    const [subStepProgress, setSubStepProgress] = useState<SubStepProgress>(null);

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

    // Create a ref to hold the latest isSwarmRunning value. This solves stale closure
    // issues where a long-running tool holds a reference to an old runtimeApi object.
    // The ref ensures that getState() always returns the current running status.
    const isSwarmRunningRef = useRef(swarmManager.isSwarmRunning);
    useEffect(() => {
        isSwarmRunningRef.current = swarmManager.isSwarmRunning;
    }, [swarmManager.isSwarmRunning]);
    
    // --- NEW: Budgetary Guardian Velocity Check ---
    const checkApiCallVelocity = () => {
        if (stateManager.isBudgetGuardTripped) {
            throw new Error("Budgetary Guardian is active. All API calls are blocked.");
        }
        const now = Date.now();
        const windowStart = now - (VELOCITY_WINDOW_SECONDS * 1000);
        
        const recentTimestamps = [...stateManager.apiCallTimestamps, now].filter(ts => ts > windowStart);
        stateManager.setApiCallTimestamps(recentTimestamps);

        if (recentTimestamps.length > VELOCITY_LIMIT) {
            stateManager.logEvent(`[!!! BUDGET GUARDIAN !!!] 🛡️ High velocity detected: ${recentTimestamps.length} API calls in the last ${VELOCITY_WINDOW_SECONDS} seconds. Halting task to prevent runaway spending.`);
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
            ModelProvider, // Expose the enum
            isSwarmRunning: isSwarmRunningRef.current, // Use the ref to get the live value
        }),
        tools: {
            run: async (toolName: string, args: Record<string, any>): Promise<any> => {
                if (!executeActionRef.current) {
                    throw new Error("Execution context not initialized.");
                }
                const toolCall: AIToolCall = { name: toolName, arguments: args };
                const result = await executeActionRef.current(toolCall, 'user-manual');
                
                // Add the result of this manual run to the main swarm history.
                // This ensures that tools called by other tools (e.g., in a workflow) are recorded.
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
            search: (text: string) => {
                 checkApiCallVelocity(); // Guardian check
                 stateManager.setApiCallCount(prev => ({ ...prev, [stateManager.selectedModel.id]: (prev[stateManager.selectedModel.id] || 0) + 1 }));
                 return aiService.contextualizeWithSearch({text, files: []}, stateManager.apiConfig, stateManager.selectedModel);
            },
            generateEmbeddings: (texts: string[]) => embeddingService.generateEmbeddings(texts, stateManager.logEvent),
        },
        getObservationHistory: () => [], // Placeholder for a more advanced feature
        clearObservationHistory: () => {}, // Placeholder
    }), [stateManager, toolManager, swarmManager, setSubStepProgress]);

    const executeAction = useMemo<ExecuteActionFunction>(() => {
        const fn = async (
            toolCall: AIToolCall,
            agentId: string,
            context?: MainView
        ): Promise<EnrichedAIResponse> => {
            const tool = getTool(toolCall.name);
            const log = (msg: string) => stateManager.logEvent(`[${agentId}] ${msg}`);
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
                // This `catch` block handles two types of errors:
                // 1. SyntaxError: If the tool's `implementationCode` is invalid JavaScript. This happens during `new Function()`.
                // 2. RuntimeError: If the code compiles but throws an error during execution (inside `func()`).
                
                let detailedError;
                if (e instanceof SyntaxError) {
                    // This is a compilation error.
                    detailedError = `[COMPILATION ERROR] in tool '${tool.name}'. The tool's code could not be parsed. This is likely due to a syntax error, such as an unescaped character in the 'implementationCode' string. Original error: ${e.message}. See developer console for the full code.`;
                    // For developers, log the exact code that failed to compile.
                    console.error(`--- Offending Code for tool '${tool.name}' ---`);
                    console.error(tool.implementationCode);
                    console.error(`--- End of Offending Code ---`);
                } else {
                    // This is a runtime error.
                    detailedError = `[RUNTIME ERROR] in tool '${tool.name}'. The tool's code executed but threw an exception. Original error: ${e.message}. See developer console for stack trace.`;
                    // For developers, log the full error with stack trace.
                    console.error(`Runtime error in '${tool.name}':`, e);
                }
                
                log(`[ERROR] ${detailedError}`);
                // Return the more descriptive error message to the swarm manager.
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
    };
};