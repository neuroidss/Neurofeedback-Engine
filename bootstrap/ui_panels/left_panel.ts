export const LEFT_PANEL_CODE = `
  const allModels = useMemo(() => {
    const grouped = [...models, ...ollamaModels].reduce((acc, model) => {
        if (model.provider) {
            acc[model.provider] = acc[model.provider] || [];
            acc[model.provider].push(model);
        }
        return acc;
    }, {});
    return grouped;
  }, [models, ollamaModels]);

  const renderModelSelection = () => {
    const handleModelChange = (e) => {
        const modelId = e.target.value;
        const all = [...models, ...ollamaModels];
        const model = all.find(m => m.id === modelId);
        if (model) {
            setSelectedModel(model);
        }
    };

    return (
        <div className="mt-4">
            <label htmlFor="model-select" className="block text-sm font-medium text-slate-400 mb-1">
                Select AI Model (for Generation)
            </label>
            <div className="flex items-center gap-2">
                <select
                    id="model-select"
                    value={selectedModel.id}
                    onChange={handleModelChange}
                    disabled={isSwarmRunning || generatingFromSourceId}
                    className="w-full bg-slate-900/70 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                >
                    {Object.entries(allModels).map(([provider, modelGroup]) => (
                        <optgroup label={provider} key={provider}>
                            {modelGroup.map(model => (
                                <option key={model.id} value={model.id}>{model.name}</option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <button
                    onClick={fetchOllamaModels}
                    disabled={ollamaState.loading || isSwarmRunning || generatingFromSourceId}
                    className="p-2 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-md disabled:opacity-50"
                    title="Refresh Ollama Models"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className={\`h-5 w-5 \${ollamaState.loading ? 'animate-spin' : ''}\`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0011.667 0l3.182-3.182m0-11.667a8.25 8.25 0 00-11.667 0L2.985 7.985" /></svg>
                </button>
            </div>
            {ollamaState.error && (
                <p className="text-xs text-red-400 mt-1">{ollamaState.error}</p>
            )}
        </div>
    );
  };
  
  const renderWorkflowControls = () => {
    if (!isWorkflowActive) return null;

    return (
      <div className="mt-4 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
        <h3 className="text-md font-bold text-slate-300 mb-2">Workflow Execution</h3>
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={stepBackward}
            disabled={scriptExecutionState === 'running' || currentScriptStepIndex === 0}
            className="p-2 rounded-md bg-slate-700/80 hover:bg-slate-600/80 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Step Backward"
          >
            <StepBackwardIcon className="h-5 w-5 text-slate-300" />
          </button>
          <button
            onClick={toggleScriptPause}
            className="p-3 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg"
            title={scriptExecutionState === 'running' ? 'Pause Workflow' : 'Resume Workflow'}
          >
            {scriptExecutionState === 'running' ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          <button
            onClick={stepForward}
            disabled={scriptExecutionState !== 'paused'}
            className="p-2 rounded-md bg-slate-700/80 hover:bg-slate-600/80 disabled:opacity-50 disabled:cursor-not-allowed"
            title="Step Forward"
          >
            <StepForwardIcon className="h-5 w-5 text-slate-300" />
          </button>
        </div>
      </div>
    );
  };
  
  const renderWorkflowSteps = () => {
     if (!isWorkflowActive || !currentUserTask?.script) return null;
     
     const getStatusColor = (status) => {
        switch (status) {
            case 'completed': return 'text-green-400 border-green-700/50';
            case 'error': return 'text-red-400 border-red-700/50';
            default: return 'text-slate-400 border-slate-700/50';
        }
     }
     
     return (
        <div className="mt-2 p-3 bg-black/30 rounded-lg">
            <h4 className="text-sm font-semibold text-slate-400 mb-2">Steps</h4>
            <div className="space-y-2">
            {currentUserTask.script.map((step, index) => {
                const statusInfo = stepStatuses[index] || { status: 'pending' };
                const isActive = index === currentScriptStepIndex && scriptExecutionState === 'running';
                
                return (
                    <div key={index} className={\`p-2 border rounded-md \${getStatusColor(statusInfo.status)} \${isActive ? 'bg-cyan-900/50' : 'bg-slate-800/40'} transition-colors\`}>
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-xs truncate">
                                {isActive && '▶️ '}
                                {index + 1}. {step.name}
                            </span>
                             <button 
                                onClick={() => runFromStep(index)} 
                                disabled={scriptExecutionState === 'running'}
                                className="text-xs px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded disabled:opacity-50"
                                title="Run from this step"
                            >
                                Run from here
                            </button>
                        </div>
                        {isActive && subStepProgress && (
                          <div className="mt-2 pt-2 border-t border-cyan-800/50">
                            <div className="text-xs text-cyan-300 font-mono">{subStepProgress.text}</div>
                            <div className="w-full bg-cyan-900/50 rounded-full h-1.5 mt-1">
                                <div className="bg-cyan-400 h-1.5 rounded-full" style={{ width: (subStepProgress.current / subStepProgress.total) * 100 + '%' }}></div>
                            </div>
                          </div>
                        )}
                        {statusInfo.status === 'error' && (
                            <div className="mt-1 p-1.5 bg-red-900/50 rounded-sm text-xs font-mono whitespace-pre-wrap">
                                Error: {statusInfo.error}
                            </div>
                        )}
                    </div>
                );
            })}
            </div>
        </div>
     );
  };
  
  const renderResearchDossier = () => {
    return (
        <div className="bg-slate-800/50 p-4 rounded-lg mt-4 flex-grow flex flex-col min-h-0">
            <h2 className="text-xl font-bold text-amber-300 mb-3">Research Dossier</h2>
            <div className="overflow-y-auto pr-2 flex-grow">
                {validatedSources.length === 0 ? (
                    <p className="text-slate-400 text-center py-8">No validated sources yet. Run the research workflow to find relevant papers.</p>
                ) : (
                    validatedSources.map(source => (
                        <div key={source.uri} className="p-3 mb-2 rounded-md bg-slate-700/50 border border-slate-600/50">
                            <div className="flex justify-between items-start">
                                <h3 className="font-semibold text-amber-200 text-sm flex-grow pr-2">{source.title}</h3>
                                <span className="text-xs font-bold text-amber-200 bg-amber-800/50 px-2 py-1 rounded-md">
                                    Score: {source.reliabilityScore.toFixed(2)}
                                </span>
                            </div>
                            <p className="text-xs text-slate-300 mt-2 border-l-2 border-slate-600 pl-2">{source.summary}</p>
                            <div className="mt-3 flex items-center justify-end gap-2">
                                <button onClick={() => handleExportSource(source)} className="text-xs px-2 py-1 bg-slate-600 hover:bg-slate-500 rounded-md">Export</button>
                                <button onClick={() => handleRemoveSource(source.uri)} className="text-xs px-2 py-1 bg-red-900/70 hover:bg-red-800/70 text-red-300 rounded-md">Remove</button>
                                <button 
                                    onClick={() => handleGenerateFromSource(source)} 
                                    disabled={generatingFromSourceId !== null}
                                    className="text-sm px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-md flex items-center gap-1 disabled:bg-slate-500 disabled:cursor-wait"
                                >
                                    {generatingFromSourceId === source.uri ? (
                                       <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    ) : <BeakerIcon className="h-4 w-4"/>}
                                    Generate Protocol
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
  };
  
  const renderFirmwarePanel = () => (
    <div className="h-full flex flex-col p-4">
        <h2 className="text-xl font-bold text-indigo-300 mb-3">Firmware Management</h2>
        <div className="flex gap-2 mb-3">
             <button onClick={handleLoadFirmware} className="flex-1 px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded-md">Load Alpha Firmware</button>
        </div>
        <textarea
            value={firmwareCode}
            onChange={(e) => setFirmwareCode(e.target.value)}
            placeholder="Firmware code (.ino.txt) will appear here."
            className="w-full flex-grow bg-slate-900/70 border border-slate-600 rounded-md p-2 text-xs font-mono text-slate-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        />
        <div className="mt-3">
            <label className="block text-sm font-medium text-slate-400 mb-1">Device IP Address (for OTA)</label>
            <input 
                type="text" 
                value={deviceIp} 
                onChange={(e) => setDeviceIp(e.target.value)}
                className="w-full bg-slate-900/70 border border-slate-600 rounded-md p-2 text-slate-200"
            />
        </div>
        <div className="flex gap-2 mt-3">
            <button 
                onClick={handleCompile} 
                disabled={isCompiling || isFlashing}
                className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:bg-slate-500"
            >
                {isCompiling && <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                Compile
            </button>
            <button 
                onClick={handleFlash}
                disabled={isCompiling || isFlashing || !lastCompiledPath}
                className="flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:bg-slate-500"
                title={!lastCompiledPath ? "You must compile successfully before flashing." : ""}
            >
                 {isFlashing && <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                Flash (OTA)
            </button>
        </div>
        <pre 
            className="w-full flex-grow mt-3 bg-black/50 border border-slate-700 rounded-md p-2 text-xs font-mono text-slate-300 overflow-y-auto"
        >
            {firmwareLogs}
        </pre>
    </div>
  );

  const renderGenerationPanel = () => (
    <div className="bg-slate-800/50 rounded-lg flex flex-col h-full">
      <div className="flex border-b border-slate-700">
        <button onClick={() => setActiveTab('research')} className={\`px-4 py-2 text-sm font-semibold \${activeTab === 'research' ? 'text-cyan-300 bg-slate-700/50' : 'text-slate-400 hover:bg-slate-700/30'}\`}>
          1. Research
        </button>
        <button onClick={() => setActiveTab('firmware')} className={\`px-4 py-2 text-sm font-semibold \${activeTab === 'firmware' ? 'text-indigo-300 bg-slate-700/50' : 'text-slate-400 hover:bg-slate-700/30'}\`}>
          2. Firmware OTA
        </button>
      </div>

      <div className="flex-grow min-h-0">
        {activeTab === 'research' && (
          <div className="p-4">
              <p className="text-sm text-slate-400 mb-4">Start by providing a research goal. The agent will find and validate relevant scientific papers, which will appear in the "Research Dossier" below.</p>
              <textarea
                className="w-full bg-slate-900/70 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                rows="2"
                value={researchDomain}
                onChange={(e) => setResearchDomain(e.target.value)}
                placeholder="e.g., Increase focus for studying"
                disabled={isSwarmRunning}
              />
              {renderModelSelection()}
              <div className="mt-3 flex items-center justify-end gap-3">
                <div>
                 {isSwarmRunning ? (
                  <button
                    onClick={() => handleStopSwarm('User interrupted research.')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
                  >
                    <StopIcon className="h-5 w-5" />
                    Stop Research
                  </button>
                ) : (
                  <button
                    onClick={handleStartResearch}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2 transition-colors disabled:opacity-50"
                    disabled={isSwarmRunning || !researchDomain || generatingFromSourceId}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    Start Research
                  </button>
                )}
                </div>
              </div>
              
              {renderWorkflowControls()}
              {renderWorkflowSteps()}
          </div>
        )}
        {activeTab === 'firmware' && renderFirmwarePanel()}
      </div>
    </div>
  );
`;