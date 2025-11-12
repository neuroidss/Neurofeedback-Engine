// This file defines the React component code for the main UI of the Neurofeedback Engine.
// It is stored as a template literal string to be loaded dynamically as a UI tool.

export const MAIN_PANEL_CODE = `
  const { useState, useEffect, useMemo } = React;

  // --- State Management ---
  const [researchDomain, setResearchDomain] = useState('Enhance focus and attention eeg');
  const [selectedProtocol, setSelectedProtocol] = useState(null);
  const [runningProtocol, setRunningProtocol] = useState(null);
  const [mockEegData, setMockEegData] = useState(null);
  const [eegIntervalId, setEegIntervalId] = useState(null);
  const [isImportExportVisible, setImportExportVisible] = useState(false);
  const [exportedJson, setExportedJson] = useState('');
  const [jsonToImport, setJsonToImport] = useState('');
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [generatingFromSourceId, setGeneratingFromSourceId] = useState(null);
  const [connectedDevices, setConnectedDevices] = useState([
    { id: 'simulator', name: 'Built-in EEG Simulator', status: 'Active', channels: 'Any' }
  ]);


  // --- Memoized Data ---
  const protocolLibrary = useMemo(() => {
    return runtime.tools.list().filter(tool => 
      tool.category === 'UI Component' && tool.name !== 'Neurofeedback Engine Main UI' && tool.name !== 'Debug Log View'
    );
  }, [runtime.tools.list()]);
  
  const isWorkflowActive = useMemo(() => {
    return scriptExecutionState === 'running' || scriptExecutionState === 'paused' || scriptExecutionState === 'error';
  }, [scriptExecutionState]);


  // --- Effects ---
   useEffect(() => {
    fetchOllamaModels();
  }, []);

  useEffect(() => {
    // Select the first protocol by default if none is selected
    if (!selectedProtocol && protocolLibrary.length > 0) {
      setSelectedProtocol(protocolLibrary[0]);
    }
    // If the selected protocol is removed, reset selection
    if (selectedProtocol && !protocolLibrary.find(p => p.id === selectedProtocol.id)) {
        setSelectedProtocol(protocolLibrary.length > 0 ? protocolLibrary[0] : null);
    }
  }, [protocolLibrary, selectedProtocol]);
  
  // Cleanup interval on component unmount or when protocol stops
  useEffect(() => {
    return () => {
      if (eegIntervalId) {
        clearInterval(eegIntervalId);
      }
    };
  }, [eegIntervalId]);

  // --- Handlers ---
  const handleStartResearch = () => {
    if (isSwarmRunning) return;
    const workflowTool = runtime.tools.list().find(t => t.name === 'Execute Research Workflow');
    if (workflowTool) {
      // Clear previous research results
      setValidatedSources([]);
      startSwarmTask({
        task: {
          userRequest: { text: \`Find papers for: \${researchDomain}\` },
          isScripted: true,
          script: [{
            name: 'Execute Research Workflow',
            arguments: { researchDomain }
          }],
        },
        systemPrompt: 'You are a helpful assistant executing a research workflow.',
        allTools: runtime.tools.list(),
      });
    } else {
      runtime.logEvent('[ERROR] Could not find the "Execute Research Workflow" tool.');
    }
  };

  const handleGenerateFromSource = async (source) => {
    setGeneratingFromSourceId(source.uri);
    try {
        // This now calls the new, generic development tool from the framework.
        await runtime.tools.run('Develop Tool from Objective', { 
            objective: \`Create a neurofeedback UI component based on the findings in the paper titled '\${source.title}'\`,
            sourceMaterial: source.summary,
        });
    } catch (e) {
        runtime.logEvent(\`[Generation] ERROR: Failed to generate protocol from source '\${source.title.substring(0,30)}...': \${e.message}\`);
    } finally {
        setGeneratingFromSourceId(null);
    }
  };

  const handleRunProtocol = (protocol) => {
    // Stop condition
    if (runningProtocol && runningProtocol.id === protocol.id) {
      clearInterval(eegIntervalId);
      setEegIntervalId(null);
      setRunningProtocol(null);
      setMockEegData(null);
      runtime.logEvent(\`[Player] Stopped protocol: \${protocol.name}\`);
      return;
    }
    
    // Stop any other running protocol first
    if (eegIntervalId) clearInterval(eegIntervalId);
      
    // Start the new protocol
    setRunningProtocol(protocol);
    runtime.logEvent(\`[Player] Starting protocol: \${protocol.name}\`);
      
    const intervalId = setInterval(() => {
        if (!protocol.dataRequirements || !protocol.processingCode) {
            runtime.logEvent(\`[Player] WARN: Protocol '\${protocol.name}' is missing dataRequirements or processingCode. Cannot run session.\`);
            setMockEegData({ error: "Protocol is not executable." });
            clearInterval(intervalId); 
            setRunningProtocol(null);
            setEegIntervalId(null);
            return;
        }

        try {
            // Generate mock data based on requirements
            const mockEegChannels = {};
            for (const channel of protocol.dataRequirements.channels) {
                mockEegChannels[channel] = Array.from({ length: 256 }, () => Math.random() * 2 - 1);
            }

            // Execute the processing function
            // FIX: Trim the processingCode string. Template literals in the source can have leading/trailing
            // whitespace which can cause 'new Function' to fail due to Automatic Semicolon Insertion (ASI)
            // placing a semicolon after 'return'.
            // FIX: Replaced 'new Function' with '(0, eval)' to avoid "not constructable" type errors from linters analyzing string content.
            const processFn = (0, eval)(protocol.processingCode.trim());
            const newData = processFn(mockEegChannels, 256);
            setMockEegData(newData);

        } catch (e) {
            runtime.logEvent(\`[Player] ERROR executing processingCode for '\${protocol.name}': \${e.message}\`);
            // Use the intervalId from the closure to stop.
            clearInterval(intervalId); 
            setRunningProtocol(null);
            setEegIntervalId(null);
        }
    }, 500); 

    setEegIntervalId(intervalId);
  };
  
  const handleExport = async () => {
    try {
        const result = await runtime.tools.run('Export Neurofeedback Protocols', {});
        if (result.protocolsJson) {
            setExportedJson(result.protocolsJson);
            setJsonToImport(''); // Clear import field
            setImportExportVisible(true);
        }
    } catch (e) {
        runtime.logEvent(\`[Export] Error: \${e.message}\`);
    }
  };

  const handleImport = async () => {
    if (!jsonToImport) {
        runtime.logEvent('[Import] Text area is empty. Nothing to import.');
        return;
    }
    try {
        await runtime.tools.run('Import Neurofeedback Protocols', { protocolsJson: jsonToImport });
        setJsonToImport('');
        setImportExportVisible(false); // Close on successful import
    } catch (e) {
        runtime.logEvent(\`[Import] Error: \${e.message}\`);
    }
  };
  
  const handleExportSource = (source) => {
    const sourceJson = JSON.stringify({
        title: source.title,
        uri: source.uri,
        summary: source.summary,
        reliabilityScore: source.reliabilityScore,
        justification: source.justification,
    }, null, 2);
    navigator.clipboard.writeText(sourceJson);
    runtime.logEvent(\`[Dossier] Copied source "\${source.title.substring(0,30)}..." to clipboard.\`);
  };
  
  const handleRemoveSource = (uri) => {
    setValidatedSources(prev => prev.filter(s => s.uri !== uri));
  };


  // --- Render Functions ---
  const renderModelSelection = () => {
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
                                <div className="bg-cyan-400 h-1.5 rounded-full" style={{ width: \`\${(subStepProgress.current / subStepProgress.total) * 100}%\` }}></div>
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


  const renderGenerationPanel = () => (
    <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col">
      <h2 className="text-xl font-bold text-cyan-300 mb-3">1. Research Phase</h2>
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
  );

  const renderProtocolLibrary = () => (
    <div className="bg-slate-800/50 p-4 rounded-lg flex-grow flex flex-col min-h-0">
      <div className="flex justify-between items-center mb-3">
        <h2 className="text-xl font-bold text-purple-300">Protocol Library</h2>
        <button onClick={() => setImportExportVisible(!isImportExportVisible)} className="text-xs text-purple-300 hover:text-purple-200 p-1">
          {isImportExportVisible ? 'Close Import/Export' : 'Import / Export'}
        </button>
      </div>

      {isImportExportVisible && (
        <div className="mb-4 p-3 bg-slate-900/50 rounded-md border border-slate-700">
            <h3 className="font-semibold text-slate-300 mb-2">Export Protocols</h3>
            <textarea
                readOnly
                value={exportedJson || 'Click Export to generate JSON...'}
                className="w-full h-24 bg-slate-800 border border-slate-600 rounded-md p-2 text-xs font-mono text-slate-400"
            />
            <button onClick={handleExport} className="w-full mt-2 text-sm px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white rounded-md">Export All Protocols to JSON</button>
            <hr className="my-4 border-slate-700"/>
            <h3 className="font-semibold text-slate-300 mb-2">Import Protocols</h3>
            <textarea
                value={jsonToImport}
                onChange={(e) => setJsonToImport(e.target.value)}
                placeholder="Paste protocol JSON here..."
                className="w-full h-24 bg-slate-950 border border-slate-600 rounded-md p-2 text-xs font-mono text-slate-200 focus:ring-1 focus:ring-purple-500 focus:outline-none"
            />
            <button onClick={handleImport} disabled={!jsonToImport} className="w-full mt-2 text-sm px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-md disabled:bg-slate-600 disabled:cursor-not-allowed">Import from JSON</button>
        </div>
      )}

      <div className="overflow-y-auto pr-2 flex-grow min-h-0">
        {protocolLibrary.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No protocols found. Generate one to begin.</p>
        ) : (
          protocolLibrary.map(proto => (
            <div
              key={proto.id}
              onClick={() => setSelectedProtocol(proto)}
              className={\`p-3 mb-2 rounded-md cursor-pointer transition-colors \${selectedProtocol?.id === proto.id ? 'bg-purple-900/50 ring-2 ring-purple-500' : 'bg-slate-700/50 hover:bg-slate-600/50'}\`}
            >
              <h3 className="font-semibold text-purple-200">{\`\${proto.name} (v\${proto.version})\`}</h3>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderDataSourcePanel = () => {
    const requirements = selectedProtocol?.dataRequirements;
    
    return (
        <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col">
            <h2 className="text-xl font-bold text-teal-300 mb-3">Data & Devices</h2>
            <div className="flex-grow space-y-4">
                <div>
                    <h3 className="font-semibold text-slate-300 mb-1">Protocol Requirements</h3>
                    {requirements ? (
                        <div className="text-xs p-2 bg-slate-900/50 rounded-md font-mono text-slate-400 space-y-1">
                            <p>Channels: {requirements.channels.join(', ')}</p>
                            <p>Metrics: {requirements.metrics.join(', ')}</p>
                        </div>
                    ) : (
                        <p className="text-sm text-slate-500 italic p-2 bg-slate-900/50 rounded-md">No specific data requirements defined.</p>
                    )}
                </div>
                <div>
                    <h3 className="font-semibold text-slate-300 mb-1">Available Devices</h3>
                    <div className="space-y-2">
                        {connectedDevices.map(device => (
                            <div key={device.id} className="p-2 bg-slate-700/50 rounded-md flex justify-between items-center">
                                <span className="text-slate-200">{device.name}</span>
                                <span className="text-xs bg-green-800/70 text-green-200 px-2 py-0.5 rounded-full">{device.status}</span>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-2 text-sm py-1.5 bg-slate-700 hover:bg-slate-600 rounded-md disabled:opacity-50" disabled>
                        Add New Device...
                    </button>
                </div>
                 <div>
                    <h3 className="font-semibold text-slate-300 mb-1">Active Source</h3>
                    <p className="text-sm text-teal-300 bg-teal-900/50 p-2 rounded-md">
                        {connectedDevices.find(d => d.status === 'Active')?.name || 'None'}
                    </p>
                </div>
            </div>
        </div>
    );
  };

  const renderPlayer = () => {
    const isThisProtocolRunning = runningProtocol && selectedProtocol && runningProtocol.id === selectedProtocol.id;
    return (
      <div className="bg-slate-900/60 p-4 rounded-lg flex-[2] flex flex-col">
        <h2 className="text-xl font-bold text-green-300 mb-3">Protocol Player</h2>
        {selectedProtocol ? (
          <div className="flex flex-col h-full">
            <div className="bg-slate-800/70 p-3 rounded-md mb-4">
              <h3 className="text-lg font-bold text-green-200">{selectedProtocol.name}</h3>
              <p className="text-xs text-slate-400 mt-2 max-h-24 overflow-y-auto pr-2">
                <span className="font-semibold">Method (from Abstract):</span> {selectedProtocol.description}
              </p>
            </div>
            
            <div className="flex-grow bg-black/50 rounded-lg p-4 flex items-center justify-center border border-slate-700 relative">
                {isThisProtocolRunning ? (
                    <UIToolRunner tool={selectedProtocol} props={{ processedData: mockEegData, runtime }} />
                ) : (
                    <div className="text-center text-slate-500">
                        <p>Press Play to begin the neurofeedback session.</p>
                    </div>
                )}
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={() => handleRunProtocol(selectedProtocol)}
                disabled={!selectedProtocol.dataRequirements}
                className={\`px-6 py-3 rounded-full text-white font-bold flex items-center gap-2 text-lg transition-colors \${isThisProtocolRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} disabled:bg-slate-600 disabled:cursor-not-allowed\`}
                title={!selectedProtocol.dataRequirements ? "Protocol is missing data requirements and cannot be run." : ""}
              >
                {isThisProtocolRunning ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                {isThisProtocolRunning ? 'Stop Session' : 'Start Session'}
              </button>
            </div>

          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-500">Select a protocol from the library to view it.</p>
          </div>
        )}
      </div>
    );
  };

  const renderSettingsModal = () => {
    if (!isSettingsVisible) return null;

    const handleSave = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newConfig = {
            googleAIAPIKey: formData.get('googleAIAPIKey'),
            openAIAPIKey: formData.get('openAIAPIKey'),
            openAIBaseUrl: formData.get('openAIBaseUrl'),
            deepSeekAPIKey: formData.get('deepSeekAPIKey'),
            deepSeekBaseUrl: formData.get('deepSeekBaseUrl'),
            ollamaHost: formData.get('ollamaHost'),
        };
        setApiConfig(newConfig);
        setSettingsVisible(false);
        runtime.logEvent('[Settings] API configuration updated.');
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center animate-fade-in">
            <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-2xl p-6 text-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-slate-100">API Configuration</h2>
                    <button onClick={() => setSettingsVisible(false)} className="p-1 rounded-full hover:bg-slate-700">
                        <XCircleIcon className="h-8 w-8 text-slate-400" />
                    </button>
                </div>
                <form onSubmit={handleSave}>
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-3">
                        {/* Google Gemini */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Google Gemini API Key</label>
                            <input type="password" name="googleAIAPIKey" defaultValue={apiConfig.googleAIAPIKey} className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* OpenAI */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">OpenAI-Compatible API Key</label>
                            <input type="password" name="openAIAPIKey" defaultValue={apiConfig.openAIAPIKey} className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">OpenAI-Compatible Base URL</label>
                            <input type="text" name="openAIBaseUrl" defaultValue={apiConfig.openAIBaseUrl} placeholder="e.g., https://api.openai.com/v1" className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* Nebius / DeepSeek */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Nebius (DeepSeek) API Key</label>
                            <input type="password" name="deepSeekAPIKey" defaultValue={apiConfig.deepSeekAPIKey} className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Nebius (DeepSeek) Base URL</label>
                            <input type="text" name="deepSeekBaseUrl" defaultValue={apiConfig.deepSeekBaseUrl} placeholder="https://api.tokenfactory.nebius.com/v1/" className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* Ollama */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Ollama Host URL</label>
                            <input type="text" name="ollamaHost" defaultValue={apiConfig.ollamaHost} placeholder="e.g., http://localhost:11434" className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={() => setSettingsVisible(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
  };
  
  return (
    <div className="h-full w-full flex flex-col p-4 bg-gray-900/80">
        {renderSettingsModal()}
        <header className="flex items-center justify-between gap-3 pb-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
                <GearIcon className="h-8 w-8 text-cyan-300" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Neurofeedback Engine</h1>
                    <p className="text-sm text-slate-400">Autonomous Generation of Novel Neurofeedback Protocols.</p>
                </div>
            </div>
            <button onClick={() => setSettingsVisible(true)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors" title="API Settings">
                <GearIcon className="h-6 w-6 text-slate-300" />
            </button>
        </header>

        <div className="flex-grow flex gap-4 pt-4 overflow-hidden">
            <aside className="flex-[1] flex flex-col min-w-[30rem]">
                {renderGenerationPanel()}
                {renderResearchDossier()}
            </aside>
            <section className="flex-[3] flex gap-4 overflow-hidden">
                {renderPlayer()}
                <aside className="flex-[1] flex flex-col gap-4 min-w-[20rem]">
                    {renderDataSourcePanel()}
                    {renderProtocolLibrary()}
                </aside>
            </section>
        </div>
    </div>
  );
`;