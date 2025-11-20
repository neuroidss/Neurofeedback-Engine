
// This file defines the React component code for the main UI of the Neurofeedback Engine.
// It is stored as a template literal string to be loaded dynamically as a UI tool.
import { USE_DEVICE_MANAGER_CODE } from './ui_panels/hooks/useDeviceManager';
import { USE_PROTOCOL_RUNNER_CODE } from './ui_panels/hooks/useProtocolRunner';
import { USE_PROVISIONING_CODE } from './ui_panels/hooks/useProvisioning';
import { USE_FIRMWARE_MANAGER_CODE } from './ui_panels/hooks/useFirmwareManager';
import { RENDER_FUNCTIONS_CODE } from './ui_panels/render_functions';
import { PLAYER_DISPLAY_CODE } from './ui_panels/player/PlayerDisplay';

export const MAIN_PANEL_CODE = `
  const { useState, useEffect, useMemo, useRef } = React;

  // --- Injected Hooks ---
  ${USE_DEVICE_MANAGER_CODE}
  
  // Override useProtocolRunner to add alerts on error
  ${USE_PROTOCOL_RUNNER_CODE}

  ${USE_PROVISIONING_CODE}
  
  ${USE_FIRMWARE_MANAGER_CODE}
  
  // --- Injected Player Display ---
  ${PLAYER_DISPLAY_CODE}

  // --- Main UI State ---
  const [leftTab, setLeftTab] = useState('research'); // 'research' | 'library' | 'firmware'
  const [rightTab, setRightTab] = useState('telemetry'); // 'telemetry' | 'logs'
  const [activeAppIdLocal, setActiveAppIdLocal] = useState(null); // Used for library selection highlighting
  const [showProvisioning, setShowProvisioning] = useState(false); // State for provisioning modal
  const [showSettings, setShowSettings] = useState(false); // State for settings modal
  const [showResetConfirm, setShowResetConfirm] = useState(false); // State for Factory Reset modal
  const wasVibecodingRef = useRef(false);
  
  // --- Evolution Modal State ---
  const [evoModalOpen, setEvoModalOpen] = useState(false);
  const [evoTargetProtocol, setEvoTargetProtocol] = useState(null);
  const [evoGoalInput, setEvoGoalInput] = useState('');
  
  // --- Research Panel State (Lifted Up) ---
  const [researchInput, setResearchInput] = useState('Enhance focus and attention eeg');
  const [autonomyEnabled, setAutonomyEnabled] = useState(false);
  const [generatingIds, setGeneratingIds] = useState(new Set());
  
  // --- Import/Export Refs ---
  const fileInputRef = useRef(null);
  
  // --- API Counter ---
  const { apiCallCount } = runtime.getState();
  const totalApiCalls = Object.values(apiCallCount || {}).reduce((a, b) => a + b, 0);

  // --- Memoized Data ---
  const protocolLibrary = useMemo(() => {
    return runtime.tools.list().filter(tool => 
      tool.category === 'UI Component' && tool.name !== 'Neurofeedback Engine Main UI' && tool.name !== 'Debug Log View'
    );
  }, [runtime.tools.list()]);
  
  // --- Custom Hooks for Player & Device Logic ---
  const deviceManager = useDeviceManager({ runtime });
  
  // Filter connected devices based on selection to pass to firmware manager
  const selectedDevicesForFirmware = useMemo(() => {
      return deviceManager.connectedDevices.filter(d => deviceManager.activeDataSourceIds.includes(d.id));
  }, [deviceManager.connectedDevices, deviceManager.activeDataSourceIds]);

  const provisioning = useProvisioning({ runtime, onDeviceProvisioned: deviceManager.onDeviceProvisioned });
  const protocolRunner = useProtocolRunner({ 
    runtime, 
    activeDataSourceIds: deviceManager.activeDataSourceIds, 
    connectedDevices: deviceManager.connectedDevices,
    setConnectedDevices: deviceManager.setConnectedDevices,
    setGlobalEegData
  });
  const firmwareManager = useFirmwareManager({ runtime, selectedDevices: selectedDevicesForFirmware });

  // --- Effects ---
  
  // Auto-Restore Session Effect
  const hasRestoredRef = useRef(false);
  useEffect(() => {
      if (hasRestoredRef.current) return;
      
      if (apiConfig.autoRestoreSession) {
          hasRestoredRef.current = true;
          const lastProtocolId = localStorage.getItem('neurofeedback-last-protocol');
          
          if (lastProtocolId) {
              const tool = runtime.tools.list().find(t => t.id === lastProtocolId);
              if (tool) {
                  runtime.logEvent('[Session] 🔄 Auto-restoring session for protocol: ' + tool.name);
                  runtime.logEvent('[Session] 📡 Reconnecting ' + deviceManager.activeDataSourceIds.length + ' active devices...');
                  
                  // Sync devices state is already loaded by useDeviceManager
                  setActiveAppIdLocal(tool.id);
                  // This will trigger connection to all active devices
                  protocolRunner.toggleProtocol(tool);
              }
          }
      }
  }, [apiConfig.autoRestoreSession, runtime.tools.list()]);

  // Autonomy Logic Effect
  useEffect(() => {
      if (!autonomyEnabled || !isSwarmRunning) return;

      const processQueue = async () => {
          const candidate = validatedSources.find(s => 
              s.reliabilityScore >= 0.75 && 
              !generatingIds.has(s.uri) &&
              !runtime.tools.list().some(t => t.description.includes(s.title)) 
          );

          if (candidate) {
              setGeneratingIds(prev => { const n = new Set(prev); n.add(candidate.uri); return n; });
              runtime.logEvent(\`[Autonomy] ⚡ Auto-generating protocol for: "\${candidate.title.substring(0, 30)}..."\`);
              
              try {
                  const { newTool } = await runtime.tools.run('Develop Tool from Objective', {
                      objective: \`Create a neurofeedback protocol based on this research: \${candidate.title}\`,
                      sourceMaterial: candidate.summary + '\\n\\n' + (candidate.textContent || '')
                  });

                  if (newTool) {
                      runtime.logEvent(\`[Autonomy] 🚀 Hot-swapping to new protocol: \${newTool.name}\`);
                      protocolRunner.stopAllProtocols();
                      protocolRunner.toggleProtocol(newTool);
                      setActiveAppId(newTool.id);
                  }
              } catch (e) {
                  runtime.logEvent(\`[Autonomy] ❌ Generation failed for \${candidate.title}: \${e.message}\`);
              } finally {
              }
          }
      };
      
      const timer = setInterval(processQueue, 2000);
      return () => clearInterval(timer);

  }, [autonomyEnabled, isSwarmRunning, validatedSources, generatingIds, runtime.tools.list()]);

  // Handle external app launch requests
  useEffect(() => {
    if (activeAppId) {
        const app = runtime.tools.list().find(t => t.id === activeAppId);
        if (app) {
            const isAlreadyRunning = protocolRunner.runningProtocols.some(p => p.id === app.id);
            if (!isAlreadyRunning) {
                if (wasVibecodingRef.current) protocolRunner.stopAllProtocols();
                protocolRunner.toggleProtocol(app);
            }
            setActiveAppIdLocal(app.id);
        }
    }
  }, [activeAppId]);
  
  useEffect(() => {
    const isCurrentlyVibecoding = isSwarmRunning && currentUserTask?.userRequest?.text.includes('Vibecode');
    if (wasVibecodingRef.current && !isCurrentlyVibecoding) {
        runtime.logEvent('[Vibecoder] Task finished. Stopping data capture session.');
        protocolRunner.stopAllProtocols();
    }
    wasVibecodingRef.current = isCurrentlyVibecoding;
  }, [isSwarmRunning, currentUserTask]);


  // --- Handlers ---
  const handleStartResearch = () => {
    if (isSwarmRunning) {
        handleStopSwarm();
    } else {
        setValidatedSources([]); 
        startSwarmTask({
            task: { userRequest: { text: 'Find papers for: ' + researchInput }, isScripted: true, script: [{ name: 'Execute Research Workflow', arguments: { researchDomain: researchInput } }] },
            systemPrompt: 'You are a helpful assistant executing a research workflow.', allTools: runtime.tools.list(),
        });
    }
  };

  const handleManualGenerate = async (source) => {
      if (generatingIds.has(source.uri)) return;
      setGeneratingIds(prev => { const n = new Set(prev); n.add(source.uri); return n; });
      try {
          const { newTool } = await runtime.tools.run('Develop Tool from Objective', {
              objective: 'Create protocol for: ' + source.title,
              sourceMaterial: source.summary + '\\n\\n' + (source.textContent || '')
          });
          if (newTool) {
               setActiveAppIdLocal(newTool.id);
               protocolRunner.toggleProtocol(newTool);
          }
      } catch (e) {
          alert('Generation failed: ' + e.message);
      } finally {
          setGeneratingIds(prev => { const n = new Set(prev); n.delete(source.uri); return n; });
      }
  };

  const handleExportLibrary = async () => {
      runtime.logEvent('[System] Exporting library...');
      try {
          const result = await runtime.tools.run('Export Neurofeedback Protocols', {});
          if (result && result.protocolsJson) {
              const blob = new Blob([result.protocolsJson], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'neurofeedback_protocols_' + new Date().toISOString().slice(0,10) + '.json';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
              runtime.logEvent('[System] 💾 Protocol library exported successfully.');
          } else {
               runtime.logEvent('[System] ⚠️ Export tool returned no data.');
          }
      } catch (e) {
          runtime.logEvent('[System] ❌ Export failed: ' + e.message);
      }
  };
  
  const handleImportClick = () => {
      if (fileInputRef.current) {
          fileInputRef.current.click();
      }
  };

  const handleFileImport = async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
          try {
              const content = e.target.result;
              runtime.logEvent('[System] 📥 Importing protocols from file...');
              const result = await runtime.tools.run('Import Neurofeedback Protocols', { protocolsJson: content });
              if (result.success) {
                   runtime.logEvent('[System] ✅ ' + result.message);
                   // Force refresh logic if needed, though tool list usually updates automatically via React state
              } else {
                   runtime.logEvent('[System] ❌ Import failed: ' + result.message);
              }
          } catch (err) {
              runtime.logEvent('[System] ❌ Critical Import Error: ' + err.message);
          }
          // Reset value to allow re-importing same file if needed
          event.target.value = '';
      };
      reader.readAsText(file);
  };

  const handleFactoryReset = () => {
      console.log("Factory reset requested"); // Log to confirm click
      runtime.logEvent('[System] Factory reset requested by user.');
      setShowResetConfirm(true);
  };
  
  const confirmFactoryReset = async () => {
      setShowResetConfirm(false);
      try {
          runtime.logEvent('[System] 🛑 Factory reset initiated by user.');
          await runtime.tools.run('Factory Reset Protocols', {});
      } catch(e) {
          console.error(e);
          runtime.logEvent('[System] ❌ Reset failed: ' + e.message);
          alert('Reset failed: ' + e.message);
      }
  };
  
  const handleEvolveRequest = (protocol) => {
      setEvoTargetProtocol(protocol);
      setEvoModalOpen(true);
  };
  
  const handleEvolveConfirm = () => {
      if (!evoGoalInput.trim() || !evoTargetProtocol) return;
      
      runtime.logEvent("[System] 🧬 Initiating Universal Evolution for: " + evoTargetProtocol.name);
      setEvoModalOpen(false);
      
      startSwarmTask({
            task: {
                userRequest: { 
                    text: "Evolve the tool '" + evoTargetProtocol.name + "' based on this goal: " + evoGoalInput 
                },
                isScripted: true,
                script: [
                    {
                        name: "Evolve Protocol Safely",
                        arguments: {
                            baseToolName: evoTargetProtocol.name,
                            observedInterest: evoGoalInput
                        }
                    }
                ]
            },
            systemPrompt: "Evolutionary Architect",
            allTools: runtime.tools.list()
        });
        setEvoGoalInput('');
  };

  const renderEvolveModal = () => {
      if (!evoModalOpen) return null;
      return (
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
               <div className="bg-slate-900 border-2 border-purple-500 rounded-lg shadow-2xl w-full max-w-md p-6">
                   <h2 className="text-lg font-bold text-purple-300 mb-1">🧬 Protocol Evolution</h2>
                   <p className="text-xs text-slate-400 mb-4">Target: <span className="text-white font-bold">{evoTargetProtocol?.name}</span></p>
                   
                   <label className="text-xs text-slate-300 block mb-2">Evolution Vector (What should change?)</label>
                   <textarea 
                        value={evoGoalInput}
                        onChange={(e) => setEvoGoalInput(e.target.value)}
                        className="w-full bg-black/50 border border-slate-600 rounded p-2 text-sm text-white mb-4 h-24 focus:border-purple-500 outline-none"
                        placeholder="e.g., 'Add a scoring system', 'Make visuals react to Theta waves', 'Gamify the feedback loop'"
                        autoFocus
                   />
                   
                   <div className="flex justify-end gap-3">
                       <button onClick={() => setEvoModalOpen(false)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs">Cancel</button>
                       <button onClick={handleEvolveConfirm} className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white font-bold rounded text-xs">Initiate Evolution</button>
                   </div>
               </div>
          </div>
      );
  };
  
  const renderResetConfirmModal = () => {
      if (!showResetConfirm) return null;
      return (
          <div className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
               <div className="bg-red-950/80 border-2 border-red-600 rounded-lg shadow-2xl w-full max-w-md p-6 text-center">
                   <div className="flex justify-center mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                   </div>
                   <h2 className="text-xl font-bold text-red-200 mb-2">FACTORY RESET</h2>
                   <p className="text-sm text-red-100/80 mb-6">
                       This will <strong className="text-white">PERMANENTLY DELETE</strong> all custom tools, generated protocols, and research data. 
                       <br/><br/>The application will restart in a clean state.
                   </p>
                   
                   <div className="flex justify-center gap-4">
                       <button onClick={() => setShowResetConfirm(false)} className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold text-sm">Cancel</button>
                       <button onClick={confirmFactoryReset} className="px-6 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded text-sm shadow-[0_0_15px_rgba(220,38,38,0.5)]">Confirm Reset</button>
                   </div>
               </div>
          </div>
      );
  };

  // --- Render Functions (Extracted) ---
  ${RENDER_FUNCTIONS_CODE}

  return (
    <div className="h-full w-full bg-black text-slate-200 font-sans flex overflow-hidden relative">
        {renderSettingsModal()}
        {renderEvolveModal()}
        {renderResetConfirmModal()}
        
        {/* Hidden Input for Import */}
        <input 
            type="file" 
            ref={fileInputRef}
            style={{ display: 'none' }} 
            accept=".json"
            onChange={handleFileImport}
        />
        
        {protocolRunner.authNeededDevice && (
            <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-slate-900 border-2 border-yellow-600 rounded-lg shadow-2xl max-w-md w-full p-6 text-center">
                    <div className="flex justify-center mb-4 text-yellow-500">
                         <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">Security Handshake Required</h2>
                    <p className="text-sm text-slate-300 mb-4">
                        Your browser blocked the connection to <strong>{protocolRunner.authNeededDevice.name}</strong> ({protocolRunner.authNeededDevice.ip}) because it uses a self-signed certificate.
                    </p>
                    <div className="bg-black/50 p-3 rounded border border-slate-700 text-left text-xs text-slate-400 mb-6 space-y-2">
                        <p>1. Click the button below to open the device page.</p>
                        <p>2. You will see a warning "Your connection is not private".</p>
                        <p>3. Click <strong>Advanced</strong> -> <strong>Proceed to {protocolRunner.authNeededDevice.ip} (unsafe)</strong>.</p>
                        <p>4. Once the page loads (even if it says 404), close it and come back here.</p>
                    </div>
                    <div className="flex gap-3">
                         <button 
                            onClick={() => window.open('https://' + protocolRunner.authNeededDevice.ip, '_blank')}
                            className="flex-1 py-3 bg-yellow-700 hover:bg-yellow-600 text-white font-bold rounded transition-colors"
                        >
                            Open Auth Page
                        </button>
                        <button 
                            onClick={() => protocolRunner.setAuthNeededDevice(null)}
                            className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded transition-colors"
                        >
                            Done / Retry
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {firmwareManager.docViewer && (
            <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-6 animate-fade-in">
                <div className="bg-slate-900 border border-slate-600 rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col">
                    <div className="flex justify-between items-center p-4 border-b border-slate-700">
                        <h2 className="text-lg font-bold text-white">{firmwareManager.docViewer.title}</h2>
                        <button onClick={() => firmwareManager.setDocViewer(null)} className="text-slate-400 hover:text-white">
                            <XCircleIcon className="h-6 w-6" />
                        </button>
                    </div>
                    <div className="flex-grow p-0 relative bg-[#1e1e1e] overflow-hidden">
                         <textarea 
                            readOnly
                            value={firmwareManager.docViewer.content} 
                            className="absolute inset-0 w-full h-full bg-transparent text-slate-300 font-mono text-xs p-4 outline-none resize-none"
                            spellCheck="false"
                        />
                    </div>
                    <div className="p-3 border-t border-slate-700 flex justify-end gap-2 bg-slate-800">
                        <button onClick={() => navigator.clipboard.writeText(firmwareManager.docViewer.content)} className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold">Copy to Clipboard</button>
                        <button onClick={() => firmwareManager.setDocViewer(null)} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded text-xs font-bold">Close</button>
                    </div>
                </div>
            </div>
        )}

        <div className="w-1/4 min-w-[300px] max-w-[400px] border-r border-slate-800 flex flex-col bg-slate-900 z-20 shadow-xl">
            <div className="h-12 border-b border-slate-800 flex items-center px-4 justify-between">
                <div className="font-bold text-slate-100 tracking-wider flex items-center gap-2">
                    <div className="w-3 h-3 bg-cyan-500 rounded-sm rotate-45"></div>
                    NEUROFEEDBACK
                </div>
                <button onClick={() => setShowSettings(true)} className="text-slate-500 hover:text-white"><GearIcon className="h-4 w-4"/></button>
            </div>
            <div className="flex border-b border-slate-800">
                <button onClick={() => setLeftTab('research')} className={\`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors \${leftTab === 'research' ? 'border-cyan-500 text-cyan-400 bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}\`}>Mission Control</button>
                <button onClick={() => setLeftTab('library')} className={\`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors \${leftTab === 'library' ? 'border-cyan-500 text-cyan-400 bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}\`}>Library</button>
                <button onClick={() => setLeftTab('firmware')} className={\`flex-1 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors \${leftTab === 'firmware' ? 'border-cyan-500 text-cyan-400 bg-slate-800' : 'border-transparent text-slate-500 hover:text-slate-300'}\`}>System</button>
            </div>
            <div className="flex-grow p-4 min-h-0 overflow-hidden">
                {leftTab === 'research' && renderResearchPanel()}
                {leftTab === 'library' && renderLibraryPanel()}
                {leftTab === 'firmware' && renderFirmwarePanel()}
            </div>
        </div>

        {/* Center Panel with Flexbox Layout for Status Bar */}
        <div className="flex-grow flex flex-col bg-black relative z-0">
            {/* Player Grid Wrapper */}
            <div className="flex-grow relative overflow-hidden">
                {protocolRunner.runningProtocols.length > 0 ? (
                    <div className={\`grid w-full h-full \${
                        protocolRunner.runningProtocols.length === 1 ? 'grid-cols-1' :
                        protocolRunner.runningProtocols.length === 2 ? 'grid-cols-2' :
                        'grid-cols-2 grid-rows-2' 
                    }\`}>
                        {protocolRunner.runningProtocols.map(app => (
                            <div key={app.id} className="relative border border-slate-800/50 overflow-hidden bg-[#050505] p-2">
                                {renderPlayerDisplay({
                                    selectedProtocol: app,
                                    runningProtocol: app,
                                    processedData: protocolRunner.processedDataMap[app.id],
                                    rawData: protocolRunner.rawData,
                                    connectionStatus: protocolRunner.connectionStatus,
                                    handleRunProtocol: (p) => protocolRunner.toggleProtocol(p),
                                    runtime,
                                    vibecoderHistory,
                                    startSwarmTask,
                                    onEvolve: handleEvolveRequest
                                })}
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex h-full flex-col items-center justify-center text-slate-600 opacity-50">
                        <BeakerIcon className="h-24 w-24 mb-4 text-slate-700" />
                        <h2 className="text-xl font-bold text-slate-500">Ready for Deployment</h2>
                        <p className="text-sm">Select protocols from the Library to launch.</p>
                    </div>
                )}
            </div>
            
            {/* Status Bar - Positioned via Flexbox so it never overlaps */}
            {protocolRunner.runningProtocols.length > 0 && (
                 <div className="flex-none h-8 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 flex items-center justify-between px-6 z-30">
                     <div className="text-[10px] text-slate-400 flex items-center gap-2">
                         <span className="text-green-400 font-mono font-bold">{protocolRunner.connectionStatus || 'Connecting...'}</span>
                         <span>|</span>
                         <span>{protocolRunner.runningProtocols.length} Active Sessions</span>
                     </div>
                     <div className="text-[10px] text-slate-500 font-mono">
                        API Ops: {totalApiCalls}
                     </div>
                 </div>
            )}
        </div>

        <div className="w-1/4 min-w-[250px] max-w-[350px] border-l border-slate-800 flex flex-col bg-slate-900 z-20 shadow-xl">
            <div className="h-12 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900">
                <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">Telemetry & I/O</span>
                <div className="flex gap-1">
                    <button onClick={() => setRightTab('telemetry')} className={\`p-1.5 rounded hover:bg-slate-800 \${rightTab === 'telemetry' ? 'text-cyan-400' : 'text-slate-600'}\`}><DeviceIcon className="h-4 w-4"/></button>
                    <button onClick={() => setRightTab('logs')} className={\`p-1.5 rounded hover:bg-slate-800 \${rightTab === 'logs' ? 'text-cyan-400' : 'text-slate-600'}\`}><TerminalIcon className="h-4 w-4"/></button>
                </div>
            </div>
            <div className="flex-grow p-4 min-h-0 overflow-hidden">
                {rightTab === 'telemetry' ? renderTelemetryPanel() : (
                     <div className="h-full flex flex-col">
                        <div className="flex-grow overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1 custom-scrollbar">
                             {runtime.getState().eventLog.map((log, i) => <div key={i} className="break-words border-b border-slate-800/50 pb-0.5">{log}</div>)}
                        </div>
                     </div>
                )}
            </div>
        </div>

    </div>
  );
`;
