
import React, { useEffect, useState } from 'react';
import { useAppRuntime } from './hooks/useAppRuntime';
import UIToolRunner from './components/UIToolRunner';
import type { LLMTool } from './types';
import { AI_MODELS, IMAGE_MODELS, TTS_MODELS, AUDIO_INPUT_MODES } from './constants';

const App: React.FC = () => {
    const appRuntime = useAppRuntime();
    const { getTool, eventLog, apiCallCount, agentSwarm, isServerConnected, runtimeApi } = appRuntime;
    const [proxyBootstrapped, setProxyBootstrapped] = useState(false);

    const mainUiTool = getTool('Neurofeedback Engine Main UI') as LLMTool | undefined;
    const debugLogTool = getTool('Debug Log View') as LLMTool | undefined;

    useEffect(() => {
        const bootstrapAndTestProxy = async () => {
            if (isServerConnected && !proxyBootstrapped) {
                setProxyBootstrapped(true);
                try {
                    // 1. Bootstrap General Web Proxy
                    await runtimeApi.tools.run('Test Web Proxy Service', {});
                    
                    // 2. Bootstrap AI Proxy (For local Ollama via HTTPS)
                    // We fire and forget this one to not block the UI, but it ensures the service exists.
                    // Updated to use the new 'Bootstrap Universal AI Bridge' tool.
                    // FORCE RESTART is enabled here to ensure any timeout config changes are applied on reload.
                    runtimeApi.tools.run('Bootstrap Universal AI Bridge', { 
                        targetUrl: 'http://127.0.0.1:11434', 
                        bridgeId: 'external_ai_bridge',
                        timeout: appRuntime.apiConfig.aiBridgeTimeout || 3600, // Use configured timeout or 1 hour default
                        forceRestart: true // CRITICAL: Restart process to apply new timeout settings
                    })
                        .catch(e => console.warn("Auto-bootstrap of AI Bridge failed (non-critical):", e));

                } catch (error) {
                    console.error("Failed to auto-bootstrap and test web proxy on startup:", error);
                    runtimeApi.logEvent(`[SYSTEM] WARN: Automatic startup/test of web proxy service failed. Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };

        bootstrapAndTestProxy();
    }, [isServerConnected, proxyBootstrapped, runtimeApi]);

    const handleReset = () => {
        if (window.confirm("Are you sure you want to factory reset? This will clear all created tools and data.")) {
            localStorage.clear();
            window.location.reload();
        }
    };
    
    return (
        <main className="h-screen w-screen bg-gray-800 font-sans text-gray-200">
            {mainUiTool ? (
                <UIToolRunner 
                    tool={mainUiTool} 
                    props={{ 
                        runtime: appRuntime.runtimeApi, 
                        isSwarmRunning: appRuntime.isSwarmRunning,
                        startSwarmTask: appRuntime.startSwarmTask,
                        handleStopSwarm: appRuntime.handleStopSwarm,
                        models: AI_MODELS,
                        ollamaModels: appRuntime.ollamaModels,
                        ollamaState: appRuntime.ollamaState,
                        fetchOllamaModels: appRuntime.fetchOllamaModels,
                        selectedModel: appRuntime.selectedModel,
                        setSelectedModel: appRuntime.setSelectedModel,
                        validatedSources: appRuntime.validatedSources,
                        setValidatedSources: appRuntime.setValidatedSources,
                        apiConfig: appRuntime.apiConfig,
                        setApiConfig: appRuntime.setApiConfig,
                        setGlobalEegData: appRuntime.setGlobalEegData,
                        scriptExecutionState: appRuntime.scriptExecutionState,
                        currentScriptStepIndex: appRuntime.currentScriptStepIndex,
                        stepStatuses: appRuntime.stepStatuses,
                        currentUserTask: appRuntime.currentUserTask,
                        toggleScriptPause: appRuntime.toggleScriptPause,
                        stepForward: appRuntime.stepForward,
                        stepBackward: appRuntime.stepBackward,
                        runFromStep: appRuntime.runFromStep,
                        subStepProgress: appRuntime.subStepProgress,
                        vibecoderHistory: appRuntime.vibecoderHistory,
                        activeAppId: appRuntime.activeAppId,
                        setActiveAppId: appRuntime.setActiveAppId,
                        imageModels: IMAGE_MODELS,
                        ttsModels: TTS_MODELS,
                        audioInputModes: AUDIO_INPUT_MODES,
                    }} 
                />
            ) : (
                <div className="flex items-center justify-center h-full">
                    <p>Loading Main UI...</p>
                </div>
            )}
            
            {/* The DebugLogView is now launched via the dock in the new Main UI */}
            
            {appRuntime.isBudgetGuardTripped && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[999] animate-fade-in">
                    <div className="bg-slate-800 border-2 border-red-500 rounded-lg shadow-2xl w-full max-w-lg p-6 text-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h2 className="text-2xl font-bold text-red-300">Budgetary Guardian Tripped</h2>
                        <p className="text-slate-300 mt-2">
                            A dangerously high rate of API calls was detected, likely due to a runaway loop. The current task has been automatically terminated to protect your budget.
                        </p>
                        <button 
                            onClick={() => appRuntime.setIsBudgetGuardTripped(false)} 
                            className="mt-6 px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg"
                        >
                            Acknowledge & Reset
                        </button>
                    </div>
                </div>
            )}
        </main>
    );
};

export default App;