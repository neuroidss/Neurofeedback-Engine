// This file defines the React component code for the main UI of the Neurofeedback Engine.
// It is stored as a template literal string to be loaded dynamically as a UI tool.

export const MAIN_PANEL_CODE = `
  const { useState, useEffect, useMemo } = React;

  // --- State Management ---
  const [researchDomain, setResearchDomain] = useState('Enhance focus and attention');
  const [selectedProtocol, setSelectedProtocol] = useState(null);
  const [runningProtocol, setRunningProtocol] = useState(null);
  const [mockEegData, setMockEegData] = useState(null);
  const [eegIntervalId, setEegIntervalId] = useState(null);

  // --- Memoized Data ---
  const protocolLibrary = useMemo(() => {
    return runtime.tools.list().filter(tool => 
      tool.category === 'UI Component' && tool.name !== 'Neurofeedback Engine Main UI' && tool.name !== 'Debug Log View'
    );
  }, [runtime.tools.list()]);

  // --- Effects ---
  useEffect(() => {
    // Select the first protocol by default if none is selected
    if (!selectedProtocol && protocolLibrary.length > 0) {
      setSelectedProtocol(protocolLibrary[0]);
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
  const handleGenerateProtocol = () => {
    if (isSwarmRunning) return;
    const workflowTool = runtime.tools.list().find(t => t.name === 'Execute Neurofeedback Generation Workflow');
    if (workflowTool) {
      startSwarmTask({
        task: {
          userRequest: { text: \`Generate a neurofeedback protocol for: \${researchDomain}\` },
          isScripted: true,
          script: [{
            name: 'Execute Neurofeedback Generation Workflow',
            arguments: { researchDomain }
          }],
        },
        systemPrompt: 'You are a helpful assistant executing a workflow.',
        allTools: runtime.tools.list(),
      });
    } else {
      runtime.logEvent('[ERROR] Could not find the "Execute Neurofeedback Generation Workflow" tool.');
    }
  };

  const handleRunProtocol = (protocol) => {
    if (runningProtocol && runningProtocol.id === protocol.id) {
      // Stop the currently running protocol
      clearInterval(eegIntervalId);
      setEegIntervalId(null);
      setRunningProtocol(null);
      setMockEegData(null);
      runtime.logEvent(\`[Player] Stopped protocol: \${protocol.name}\`);
    } else {
      // Stop any other running protocol first
      if (eegIntervalId) clearInterval(eegIntervalId);
      
      // Start the new protocol
      setRunningProtocol(protocol);
      runtime.logEvent(\`[Player] Starting protocol: \${protocol.name}\`);
      
      // Simulate EEG data based on the protocol's expected parameters
      const intervalId = setInterval(async () => {
        try {
            const processorTool = runtime.tools.list().find(t => t.name === 'Process Raw EEG Data Based On Paper');
            if (processorTool) {
                // Generate some plausible raw EEG data (e.g., 1 second at 256Hz)
                const rawEegSignal = Array.from({ length: 256 }, () => Math.random() * 2 - 1);
                
                // Use the tool to process it based on the protocol's description (which is the paper abstract)
                const { processedData } = await runtime.tools.run('Process Raw EEG Data Based On Paper', {
                    rawEegSignal,
                    paperAbstract: protocol.description,
                });
                setMockEegData(processedData);
            } else {
                 // Fallback if the processor tool isn't found
                 const dataKeys = protocol.description.match(/\\b(alpha|beta|theta|gamma|delta)_\\w+/g) || ['mock_value'];
                 const newData = {};
                 dataKeys.forEach(key => {
                   newData[key] = Math.random();
                 });
                 setMockEegData(newData);
            }
        } catch (e) {
            runtime.logEvent(\`[Player] Error processing mock EEG data: \${e.message}\`);
            // Stop on error
            clearInterval(intervalId);
            setRunningProtocol(null);
        }
      }, 1000);
      setEegIntervalId(intervalId);
    }
  };

  // --- Render Functions ---
  const renderGenerationPanel = () => (
    <div className="bg-slate-800/50 p-4 rounded-lg">
      <h2 className="text-xl font-bold text-cyan-300 mb-3">Protocol Generation</h2>
      <p className="text-sm text-slate-400 mb-4">Describe a desired mental state or neurofeedback goal. The agent swarm will research it and generate a new, runnable protocol.</p>
      <textarea
        className="w-full bg-slate-900/70 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
        rows="2"
        value={researchDomain}
        onChange={(e) => setResearchDomain(e.target.value)}
        placeholder="e.g., Increase focus for studying"
        disabled={isSwarmRunning}
      />
      <div className="mt-3 flex justify-end gap-3">
         {isSwarmRunning ? (
          <button
            onClick={() => handleStopSwarm('User interrupted generation.')}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
          >
            <StopIcon className="h-5 w-5" />
            Stop Generation
          </button>
        ) : (
          <button
            onClick={handleGenerateProtocol}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center gap-2 transition-colors"
            disabled={isSwarmRunning || !researchDomain}
          >
            <BeakerIcon className="h-5 w-5" />
            Generate New Protocol
          </button>
        )}
      </div>
      {isSwarmRunning && (
        <div className="mt-3 text-sm text-cyan-400 flex items-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-cyan-400"></div>
            <span>Agent swarm is active... See Event Log for details.</span>
        </div>
      )}
    </div>
  );

  const renderProtocolLibrary = () => (
    <div className="bg-slate-800/50 p-4 rounded-lg mt-4 flex-grow flex flex-col">
      <h2 className="text-xl font-bold text-purple-300 mb-3">Protocol Library</h2>
      <div className="overflow-y-auto pr-2 flex-grow">
        {protocolLibrary.length === 0 ? (
          <p className="text-slate-400 text-center py-8">No protocols found. Generate one above to begin.</p>
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
                className={\`px-6 py-3 rounded-full text-white font-bold flex items-center gap-2 text-lg transition-colors \${isThisProtocolRunning ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}\`}
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
  
  return (
    <div className="h-full w-full flex flex-col p-4 bg-gray-900/80">
        <header className="flex items-center gap-3 pb-4 border-b border-slate-700">
            <GearIcon className="h-8 w-8 text-cyan-300" />
            <div>
                <h1 className="text-2xl font-bold text-slate-100">Synergy Forge: Neurofeedback Engine</h1>
                <p className="text-sm text-slate-400">An autonomous agent swarm for neuro-generative BCI protocol design.</p>
            </div>
        </header>

        <div className="flex-grow flex gap-4 pt-4 overflow-hidden">
            <aside className="flex-[1] flex flex-col">
                {renderGenerationPanel()}
                {renderProtocolLibrary()}
            </aside>
            <section className="flex-[2] flex">
                {renderPlayer()}
            </section>
        </div>
    </div>
  );
`;
