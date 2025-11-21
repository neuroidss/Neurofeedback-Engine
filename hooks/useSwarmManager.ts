// hooks/useSwarmManager.ts
import React, { useState, useCallback, useRef, useEffect } from 'react';
import { SWARM_AGENT_SYSTEM_PROMPT, CORE_TOOLS } from '../constants';
import { contextualizeWithSearch, filterToolsWithLLM } from '../services/aiService';
import type { AgentWorker, EnrichedAIResponse, AgentStatus, AIToolCall, LLMTool, ExecuteActionFunction, ScoredTool, MainView, ToolRelevanceMode, AIModel, APIConfig, AIResponse, ScriptExecutionState, StepStatus, SubStepProgress } from '../types';

// ... (rest of imports)

// INCREASED LIMIT HERE
const MAX_ITERATIONS = 150; 

type UseSwarmManagerProps = {
    // ... (same props)
    logEvent: (message: string) => void;
    setUserInput: (input: string) => void;
    setEventLog: (callback: (prev: string[]) => string[]) => void;
    setApiCallCount: React.Dispatch<React.SetStateAction<Record<string, number>>>;
    setSubStepProgress: React.Dispatch<React.SetStateAction<SubStepProgress>>;
    findRelevantTools: (userRequestText: string, allTools: LLMTool[], topK: number, threshold: number, systemPromptForContext: string | null, mainView?: MainView | null) => Promise<ScoredTool[]>;
    mainView: MainView;
    processRequest: (prompt: { text: string; files: any[] }, systemInstruction: string, agentId: string, relevantTools: LLMTool[]) => Promise<AIResponse>;
    executeActionRef: React.MutableRefObject<ExecuteActionFunction | null>;
    allTools: LLMTool[];
    selectedModel: AIModel;
    apiConfig: APIConfig;
};

// ... (Result serializer helper remains same)
const resultToString = (result: any): string => {
    if (result === undefined || result === null) return 'No result.';
    try {
        const replacer = (key: string, value: any) => {
            if (key === 'implementationCode') return '[...code...]';
            if ((key === 'summary' || key === 'snippet') && typeof value === 'string' && value.length > 150) {
                return value.substring(0, 150) + '...';
            }
            return value;
        };
        const sanitizedResult = JSON.parse(JSON.stringify(result, replacer));
        let str = JSON.stringify(sanitizedResult);
        if (str.length > 2500) {
            if (sanitizedResult && Array.isArray(sanitizedResult.searchResults)) {
                return JSON.stringify({
                    success: sanitizedResult.success,
                    message: `Found ${sanitizedResult.searchResults.length} articles. The full list is available to be passed to the next tool, but was omitted from history for brevity.`,
                });
            }
            return `Tool executed successfully, but its output is too large to display in this context.`;
        }
        return str;
    } catch (e) {
        return `[Error: Could not serialize the tool's result for display in history.]`;
    }
};

export const useSwarmManager = (props: UseSwarmManagerProps) => {
    // ... (destructuring props)
    const { 
        logEvent, setUserInput, setEventLog, setApiCallCount, setSubStepProgress, findRelevantTools, mainView,
        processRequest, executeActionRef, allTools, selectedModel, apiConfig 
    } = props;

    // ... (state definitions)
    const [agentSwarm, setAgentSwarm] = useState<AgentWorker[]>([]);
    const [isSwarmRunning, setIsSwarmRunning] = useState(false);
    const [currentUserTask, setCurrentUserTask] = useState<any>(null);
    const [currentSystemPrompt, setCurrentSystemPrompt] = useState<string>(SWARM_AGENT_SYSTEM_PROMPT);
    const [pauseState, setPauseState] = useState<null>(null);
    const [lastSwarmRunHistory, setLastSwarmRunHistory] = useState<EnrichedAIResponse[] | null>(null);
    const [liveSwarmHistory, setLiveSwarmHistory] = useState<EnrichedAIResponse[]>([]);
    const [isSequential, setIsSequential] = useState(false);
    const [activeToolsForTask, setActiveToolsForTask] = useState<ScoredTool[]>([]);
    const [relevanceTopK, setRelevanceTopK] = useState<number>(25);
    const [relevanceThreshold, setRelevanceThreshold] = useState<number>(0.1);
    const [relevanceMode, setRelevanceMode] = useState<ToolRelevanceMode>('All');
    
    const [scriptExecutionState, setScriptExecutionState] = useState<ScriptExecutionState>('idle');
    const [stepStatuses, setStepStatuses] = useState<StepStatus[]>([]);
    const [currentScriptStepIndex, setCurrentScriptStepIndex] = useState(0);
    
    const swarmIterationCounter = useRef(0);
    const swarmHistoryRef = useRef<EnrichedAIResponse[]>([]);
    const isRunningRef = useRef(isSwarmRunning);
    const agentSwarmRef = useRef(agentSwarm);
    const isCycleInProgress = useRef(false);
    
    useEffect(() => { isRunningRef.current = isSwarmRunning; }, [isSwarmRunning]);
    useEffect(() => { agentSwarmRef.current = agentSwarm; }, [agentSwarm]);

    useEffect(() => {
        if (isSwarmRunning && !isCycleInProgress.current) {
            requestAnimationFrame(() => (window as any).__runSwarmCycle());
        }
    }, [isSwarmRunning]);

    const handleStopSwarm = useCallback((reason?: string, isPause: boolean = false) => {
        if (isRunningRef.current) {
            isRunningRef.current = false;
            setIsSwarmRunning(false);
            setScriptExecutionState(prev => (prev === 'running' || prev === 'paused') ? 'idle' : prev);
            setActiveToolsForTask([]);
            setSubStepProgress(null);
            const reasonText = reason ? `: ${reason}` : ' by user.';
            logEvent(`[INFO] 🛑 Task ${isPause ? 'paused' : 'stopped'}${reasonText}`);
            if (!isPause && swarmHistoryRef.current.length > 0) {
                setLastSwarmRunHistory([...swarmHistoryRef.current]);
            }
        }
    }, [logEvent, setSubStepProgress]);

    // ... (helper functions: clearPauseState, appendToSwarmHistory, script controls...)
    const clearPauseState = useCallback(() => setPauseState(null), []);
    const clearLastSwarmRunHistory = useCallback(() => setLastSwarmRunHistory(null), []);
    const appendToSwarmHistory = useCallback((item: EnrichedAIResponse) => { 
        swarmHistoryRef.current.push(item);
        setLiveSwarmHistory([...swarmHistoryRef.current]);
     }, []);

    const toggleScriptPause = useCallback(() => {
        setScriptExecutionState(prev => {
            if (prev === 'running') {
                logEvent('[SCRIPT] Paused.');
                return 'paused';
            }
            if (prev === 'paused' || prev === 'error') {
                logEvent('[SCRIPT] Resumed.');
                return 'running';
            }
            return prev;
        });
    }, [logEvent]);

    const stepForward = useCallback(() => {
        if (scriptExecutionState === 'paused' && isRunningRef.current) {
            queueMicrotask(() => (window as any).__runSwarmCycle(true));
        }
    }, [scriptExecutionState]);
    
    const stepBackward = useCallback(() => {
         if ((scriptExecutionState === 'paused' || scriptExecutionState === 'error') && currentScriptStepIndex > 0) {
            const newIndex = currentScriptStepIndex - 1;
            setCurrentScriptStepIndex(newIndex);
            setScriptExecutionState('paused'); 
            setSubStepProgress(null); 
            setStepStatuses(prev => {
                const newStatuses = [...prev];
                if(newStatuses[newIndex]) newStatuses[newIndex] = { status: 'pending' };
                if(newStatuses[currentScriptStepIndex]) newStatuses[currentScriptStepIndex] = { status: 'pending' };
                return newStatuses;
            });
            logEvent(`[SCRIPT] Stepped back to step ${newIndex + 1}.`);
        }
    }, [scriptExecutionState, currentScriptStepIndex, logEvent, setSubStepProgress]);
    
    const runFromStep = useCallback((index: number) => {
        setCurrentScriptStepIndex(index);
        setSubStepProgress(null); 
        setStepStatuses(prev => prev.map((s, i) => i >= index ? { status: 'pending' } : s));
        setScriptExecutionState('running');
        logEvent(`[SCRIPT] Running from step ${index + 1}...`);
    }, [logEvent, setSubStepProgress]);

    // ... (handleExecutionFailure)
    const handleExecutionFailure = useCallback(async (
        errorContext: { failedAction: AIToolCall | string; errorMessage: string; failedTool?: LLMTool; }
    ) => {
        logEvent(`[SUPERVISOR] Anomaly detected. Initiating diagnostic protocol for error: ${errorContext.errorMessage}`);
        const diagnosticTool = allTools.find(t => t.name === 'Diagnose Tool Execution Error');
        if (!diagnosticTool || !executeActionRef.current) {
            logEvent('[SUPERVISOR] FATAL: Diagnostic tool not found.');
            return;
        }
        try {
            const simplifiedHistory = swarmHistoryRef.current.map(h => 
                `Tool: ${h.toolCall?.name || 'N/A'}, Args: ${JSON.stringify(h.toolCall?.arguments)}, Result: ` + (h.executionError ? `ERROR: ${h.executionError}` : 'OK')
            ).join('\n');
            const availableToolsSummary = allTools.map(t => ({ name: t.name, description: t.description }));
            const diagnosticArgs = {
                researchObjective: typeof currentUserTask.userRequest === 'string' ? currentUserTask.userRequest : currentUserTask.userRequest?.text || 'N/A',
                executionHistory: simplifiedHistory,
                failedAction: typeof errorContext.failedAction === 'string' 
                    ? `AI Generation Step with prompt: "${errorContext.failedAction}"` 
                    : `Tool Call: "${errorContext.failedAction.name}" with args: ${JSON.stringify(errorContext.failedAction.arguments)}`,
                errorMessage: errorContext.errorMessage,
                availableTools: JSON.stringify(availableToolsSummary),
                failedToolSourceCode: errorContext.failedTool?.implementationCode || 'N/A',
                modelUsed: selectedModel.id,
            };
            const diagnosticResult = await executeActionRef.current({ name: 'Diagnose Tool Execution Error', arguments: diagnosticArgs }, 'supervisor');
            if (diagnosticResult.executionResult?.analysis) {
                 logEvent(`[SUPERVISOR] Diagnostic complete. Analysis: ${JSON.stringify(diagnosticResult.executionResult.analysis, null, 2)}`);
            }
        } catch (diagnosticError) {
            logEvent(`[SUPERVISOR] FATAL: The diagnostic agent itself failed.`);
        }
    }, [allTools, currentUserTask, executeActionRef, logEvent, selectedModel]);

    const runSwarmCycle = useCallback(async (isManualStep = false) => {
        if ((isCycleInProgress.current && !isManualStep) || !isRunningRef.current) return;
        isCycleInProgress.current = true;

        try {
            if (currentUserTask?.isScripted) {
                 // ... (Script handling logic remains same)
                 if (scriptExecutionState !== 'running' && !isManualStep) return;
                 const script = currentUserTask.script || [];
                 if (currentScriptStepIndex >= script.length) {
                    logEvent('[INFO] ✅ Script finished.');
                    setScriptExecutionState('finished');
                    handleStopSwarm('Script completed successfully.');
                    return;
                 }
                 // ... (Execute script step logic)
                 const agent = agentSwarmRef.current[0];
                 const toolCallFromScript = script[currentScriptStepIndex];
                 const toolCall = { ...toolCallFromScript, arguments: { ...toolCallFromScript.arguments, projectName: currentUserTask.projectName, }, };
                 logEvent(`[SCRIPT] Step ${currentScriptStepIndex + 1}/${script.length}: Executing '${toolCall.name}'`);
                 const result = await executeActionRef.current!(toolCall, agent.id, currentUserTask.context);
                 swarmHistoryRef.current.push(result);
                 setLiveSwarmHistory([...swarmHistoryRef.current]);
                 if (result.executionError) {
                    // ... handle error
                    setStepStatuses(prev => { const n = [...prev]; n[currentScriptStepIndex] = { status: 'error', error: result.executionError }; return n; });
                    logEvent(`[ERROR] 🛑 Halting script due to error in '${toolCall.name}'.`);
                    setScriptExecutionState('error');
                    setSubStepProgress(null);
                    await handleExecutionFailure({ failedAction: toolCall, errorMessage: result.executionError, failedTool: result.tool });
                    handleStopSwarm("Error during script execution.");
                    return;
                 }
                 setStepStatuses(prev => { const n = [...prev]; n[currentScriptStepIndex] = { status: 'completed', result: result.executionResult }; return n; });
                 setCurrentScriptStepIndex(prev => prev + 1);
                 setSubStepProgress(null);
                 if (result.toolCall?.name === 'Task Complete') {
                    logEvent(`[SUCCESS] ✅ Script reached 'Task Complete'.`);
                    setScriptExecutionState('finished');
                    handleStopSwarm("Script completed successfully.");
                    return;
                 }
            } else { // LLM-driven path...
                // CHECK ITERATION LIMIT
                if (swarmIterationCounter.current >= MAX_ITERATIONS) { 
                    handleStopSwarm(`Max iterations reached (${MAX_ITERATIONS})`); 
                    return; 
                }

                const agent = agentSwarmRef.current[0]; if (!agent) return;
                swarmIterationCounter.current++;
                setAgentSwarm(prev => prev.map(a => a.id === agent.id ? { ...a, status: 'working', lastAction: 'Thinking...', error: null } : a));
                
                // ... (Prompt construction and AI call logic)
                let finalUserRequestText = currentUserTask.userRequest.text;
                // ... (Search context logic)
                if (currentUserTask.useSearch && swarmHistoryRef.current.length === 0) {
                    // ...
                }

                // ... (Contextual Data String)
                
                const historyString = swarmHistoryRef.current.length > 0
                    ? `Actions performed so far:\n${swarmHistoryRef.current.map(r =>
                        `Action: ${r.toolCall?.name || 'Unknown'} - Result: ${r.executionError ? `FAILED (${r.executionError})` : `SUCCEEDED. Output: ${resultToString(r.executionResult)}`}`
                    ).join('\n')}`
                    : "No actions have been performed yet.";

                const promptForAgent = `CURRENT GOAL: "${finalUserRequestText}"\n\n${historyString}\n\nBased on the provided BACKGROUND information, your CURRENT GOAL, and the actions performed so far, what is the next single action to perform? If the goal is complete, you must call "Task Complete".`;
                
                let toolsForAgent: LLMTool[] = [];
                if (relevanceMode === 'All') { toolsForAgent = allTools; } 
                else {
                    const relevantScoredTools = await findRelevantTools(finalUserRequestText, allTools, relevanceTopK, relevanceThreshold, currentSystemPrompt, mainView);
                    setActiveToolsForTask(relevantScoredTools);
                    toolsForAgent = relevantScoredTools.map(st => st.tool);
                }
                
                const promptPayload = { text: promptForAgent, files: currentUserTask.userRequest.files || [] };
                if (!executeActionRef.current) throw new Error("Execution context is not available.");
                const toolCallsResponse = await processRequest(promptPayload, currentSystemPrompt, agent.id, toolsForAgent);
                const toolCalls = toolCallsResponse.toolCalls;

                if (!isRunningRef.current) return;
                
                if (toolCalls && toolCalls.length > 0) {
                    let hasError = false;
                    const executionPromises = toolCalls.map(async (toolCall) => {
                        const result = await executeActionRef.current!(toolCall, agent.id, currentUserTask.context);
                        if (result.executionError) {
                            hasError = true;
                            await handleExecutionFailure({ failedAction: toolCall, errorMessage: result.executionError, failedTool: result.tool });
                        }
                        return result;
                    });

                    const results = await Promise.all(executionPromises);
                    swarmHistoryRef.current.push(...results);
                    setLiveSwarmHistory([...swarmHistoryRef.current]);

                    if (!isRunningRef.current) return;
                    
                    const taskComplete = results.find(r => r.toolCall?.name === 'Task Complete' && !r.executionError);
                    if (taskComplete) { handleStopSwarm("Task completed successfully"); return; }
                    
                    if (hasError) {
                        // Don't stop immediately on ALL errors, try to let the agent self-correct if possible?
                        // For now, we stop to prevent runaway bills.
                        logEvent('[SUPERVISOR] One or more tool calls failed. Halting task after diagnosis.');
                        handleStopSwarm("Unrecoverable error during tool execution.");
                        return;
                    }
                } else {
                    const errorMessage = "The agent did not return a tool call.";
                    let detailedErrorMessage = errorMessage;
                    if (toolCallsResponse.text && toolCallsResponse.text.trim()) {
                        detailedErrorMessage += ` The agent's response was: "${toolCallsResponse.text.trim()}"`;
                    }
                    logEvent(`[SUPERVISOR] ${detailedErrorMessage}`);
                    await handleExecutionFailure({ failedAction: promptForAgent, errorMessage: detailedErrorMessage });
                    handleStopSwarm("Agent did not provide a next action.");
                    return;
                }
            }
        } catch (err) {
            // ... (Catch block)
            const errorMessage = err instanceof Error ? err.message : "Unknown error.";
            logEvent(`[ERROR] 🛑 Agent task failed: ${errorMessage}`);
            setScriptExecutionState('error');
            setSubStepProgress(null);
            await handleExecutionFailure({ failedAction: "Main swarm cycle execution", errorMessage: errorMessage });
            handleStopSwarm("Critical agent error");
        } finally {
            if (isRunningRef.current) {
                if (currentUserTask?.isScripted && isManualStep) { setScriptExecutionState('paused'); } 
                else { requestAnimationFrame(() => (window as any).__runSwarmCycle()); }
            }
            isCycleInProgress.current = false;
        }
    }, [
        currentUserTask, logEvent, scriptExecutionState, currentScriptStepIndex, handleStopSwarm, handleExecutionFailure,
        findRelevantTools, relevanceMode, relevanceTopK, relevanceThreshold, 
        mainView, currentSystemPrompt, isSequential, setApiCallCount, setSubStepProgress,
        setActiveToolsForTask, processRequest, executeActionRef, allTools,
        selectedModel, apiConfig, pauseState
    ]);
    
    useEffect(() => { (window as any).__runSwarmCycle = runSwarmCycle; }, [runSwarmCycle]);

    const startSwarmTask = useCallback(async (options: any) => {
        // ... (startSwarmTask implementation)
         const { task, systemPrompt, sequential = false, resume = false, historyEventToInject = null } = options;
        if (!resume) {
            setLastSwarmRunHistory(null);
            swarmHistoryRef.current = [];
            setLiveSwarmHistory([]);
            swarmIterationCounter.current = 0;
            setCurrentScriptStepIndex(0);
            setStepStatuses(task.script ? Array(task.script.length).fill({ status: 'pending' }) : []);
            setEventLog(() => [`[${new Date().toLocaleTimeString()}] [INFO] 🚀 Starting task...`]);
            setActiveToolsForTask([]);
            setSubStepProgress(null);
        } else {
             logEvent(`[INFO] ▶️ Resuming task...`);
            if (historyEventToInject) {
                swarmHistoryRef.current.push(historyEventToInject);
                setLiveSwarmHistory([...swarmHistoryRef.current]);
            }
        }
        let finalTask = typeof task === 'string' ? { userRequest: { text: task, files: [] } } : task;
        finalTask.context = mainView;
        if (finalTask.isScripted) { setScriptExecutionState('running'); } else { setScriptExecutionState('idle'); }
        setCurrentUserTask(finalTask);
        setCurrentSystemPrompt(systemPrompt || SWARM_AGENT_SYSTEM_PROMPT);
        setIsSequential(sequential);
        setAgentSwarm([{ id: 'agent-1', status: 'idle', lastAction: 'Awaiting instructions', error: null, result: null }]);
        if(!resume) setUserInput('');
        setIsSwarmRunning(true);
    }, [setUserInput, setEventLog, logEvent, mainView, setSubStepProgress]);

    const state = {
        agentSwarm, isSwarmRunning, currentUserTask, currentSystemPrompt, pauseState,
        lastSwarmRunHistory, liveSwarmHistory, activeToolsForTask, relevanceTopK, relevanceThreshold,
        relevanceMode, scriptExecutionState, currentScriptStepIndex, stepStatuses,
    };

    const handlers = {
        startSwarmTask, handleStopSwarm, clearPauseState, clearLastSwarmRunHistory,
        runSwarmCycle, setRelevanceTopK, setRelevanceThreshold, setRelevanceMode,
        appendToSwarmHistory, toggleScriptPause,
        stepForward, stepBackward, runFromStep,
    };

    return { ...state, ...handlers };
};