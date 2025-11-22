
import { USE_DEVICE_MANAGER_CODE } from './ui_panels/hooks/useDeviceManager';
import { USE_PROTOCOL_RUNNER_CODE } from './ui_panels/hooks/useProtocolRunner';
import { USE_PROVISIONING_CODE } from './ui_panels/hooks/useProvisioning';
import { USE_FIRMWARE_MANAGER_CODE } from './ui_panels/hooks/useFirmwareManager';
import { RENDER_FUNCTIONS_CODE } from './ui_panels/render_functions';
import { PLAYER_DISPLAY_CODE } from './ui_panels/player/PlayerDisplay';
import { UNIVERSAL_CANVAS_CODE } from './ui_panels/UniversalCanvas';
import { USE_STREAM_ENGINE_CODE } from './ui_panels/hooks/useStreamEngine';
import { GENESIS_PROMPT } from '../constants';

export const MAIN_PANEL_CODE = `
  const { useState, useEffect, useMemo, useRef } = React;

  ${USE_DEVICE_MANAGER_CODE}
  
  ${USE_PROTOCOL_RUNNER_CODE}

  ${USE_PROVISIONING_CODE}
  
  ${USE_FIRMWARE_MANAGER_CODE}

  ${USE_STREAM_ENGINE_CODE}
  
  ${UNIVERSAL_CANVAS_CODE}
  ${PLAYER_DISPLAY_CODE}

  // --- State ---
  const [leftTab, setLeftTab] = useState('research');
  const [rightTab, setRightTab] = useState('telemetry');
  const [activeAppIdLocal, setActiveAppIdLocal] = useState(null);
  const [showProvisioning, setShowProvisioning] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [genesisMode, setGenesisMode] = useState(false);
  const wasVibecodingRef = useRef(false);
  
  const [evoModalOpen, setEvoModalOpen] = useState(false);
  const [evoTargetProtocol, setEvoTargetProtocol] = useState(null);
  const [evoGoalInput, setEvoGoalInput] = useState('');
  
  const [researchInput, setResearchInput] = useState('Enhance focus and attention eeg');
  const [autonomyEnabled, setAutonomyEnabled] = useState(false);
  const [generatingIds, setGeneratingIds] = useState(new Set());
  
  const fileInputRef = useRef(null);
  
  const [visionState, setVisionState] = useState({ active: false, lastUpdate: 0, data: null });

  // --- Immersive Mode State ---
  const isImmersive = apiConfig.immersiveMode !== false; // Default to true
  const [panelVisibility, setPanelVisibility] = useState({ left: false, right: false, top: false, bottom: false });
  const hoverTimers = useRef({ left: null, right: null, top: null, bottom: null });

  const handlePanelEnter = (side) => {
      if (!isImmersive) return;
      if (hoverTimers.current[side]) clearTimeout(hoverTimers.current[side]);
      setPanelVisibility(prev => ({ ...prev, [side]: true }));
  };

  const handlePanelLeave = (side) => {
      if (!isImmersive) return;
      hoverTimers.current[side] = setTimeout(() => {
          setPanelVisibility(prev => ({ ...prev, [side]: false }));
      }, 400);
  };

  useEffect(() => {
      if (!runtime.neuroBus) return;
      const handleFrame = (frame) => {
          if (frame.type === 'Vision') {
              setVisionState({ active: true, lastUpdate: Date.now(), data: frame.payload });
          }
      };
      const unsub = runtime.neuroBus.subscribe(handleFrame);
      
      const interval = setInterval(() => {
          setVisionState(prev => {
              if (prev.active && (Date.now() - prev.lastUpdate > 2000)) {
                  return { active: false, lastUpdate: prev.lastUpdate, data: null };
              }
              return prev;
          });
      }, 1000);
      
      return () => { unsub(); clearInterval(interval); };
  }, []);

  const { apiCallCount } = runtime.getState();
  const totalApiCalls = Object.values(apiCallCount || {}).reduce((a, b) => a + b, 0);

  const protocolLibrary = useMemo(() => {
    return runtime.tools.list().filter(tool => 
      tool.category === 'UI Component' && tool.name !== 'Neurofeedback Engine Main UI' && tool.name !== 'Debug Log View'
    );
  }, [runtime.tools.list()]);
  
  const deviceManager = useDeviceManager({ runtime });
  const streamEngineManager = useStreamEngine({ runtime });
  
  const selectedDevicesForFirmware = useMemo(() => {
      return deviceManager.connectedDevices.filter(d => deviceManager.activeDataSourceIds.includes(d.id));
  }, [deviceManager.connectedDevices, deviceManager.activeDataSourceIds]);

  const provisioning = useProvisioning({ runtime, onDeviceProvisioned: deviceManager.onDeviceProvisioned });
  const protocolRunner = useProtocolRunner({ 
    runtime, 
    activeDataSourceIds: deviceManager.activeDataSourceIds, 
    connectedDevices: deviceManager.connectedDevices,
    setConnectedDevices: deviceManager.setConnectedDevices,
    setGlobalEegData,
    startSwarmTask
  });
  const firmwareManager = useFirmwareManager({ runtime, selectedDevices: selectedDevicesForFirmware });

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
                  
                  setActiveAppIdLocal(tool.id);
                  protocolRunner.toggleProtocol(tool);
              }
          }
      }
  }, [apiConfig.autoRestoreSession, runtime.tools.list()]);

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
              } else {
                   runtime.logEvent('[System] ❌ Import failed: ' + result.message);
              }
          } catch (err) {
              runtime.logEvent('[System] ❌ Critical Import Error: ' + err.message);
          }
          event.target.value = '';
      };
      reader.readAsText(file);
  };

  const handleFactoryReset = () => {
      console.log("Factory reset requested");
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

  const handleGenesisLaunch = () => {
      if (!isSwarmRunning) {
          setGenesisMode(true);
          streamEngineManager.startEngine();
          runtime.logEvent('[Genesis] 🌌 Bootstrapping Stream Engine...');
          
          const genesisPrompt = ${JSON.stringify(GENESIS_PROMPT)};

          startSwarmTask({
              task: {
                  userRequest: { text: "Initialize the Vibecoder Genesis graph. Connect vision to visuals." }
              },
              systemPrompt: genesisPrompt,
              allTools: runtime.tools.list()
          });
      } else {
          handleStopSwarm();
          streamEngineManager.stopEngine();
          setGenesisMode(false);
      }
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

  ${RENDER_FUNCTIONS_CODE}

  // --- Global Header (Slide-out in Zen Mode) ---
  const renderGlobalHeader = () => {
      const visible = isImmersive ? panelVisibility.top : true;
      const classes = isImmersive
          ? \`fixed top-0 left-0 w-full h-12 bg-slate-900/95 backdrop-blur border-b border-slate-800 z-[70] shadow-lg transform transition-transform duration-300 \${visible ? 'translate-y-0' : '-translate-y-full'}\`
          : "w-full h-12 bg-slate-900 border-b border-slate-800 flex-none z-20 relative";

      return (
          <div 
            className={classes}
            onMouseEnter={() => handlePanelEnter('top')}
            onMouseLeave={() => handlePanelLeave('top')}
          >
              <div className="flex items-center justify-between px-4 h-full">
                  <div className="font-bold text-slate-100 tracking-wider flex items-center gap-2">
                        <div className="w-3 h-3 bg-cyan-500 rounded-sm rotate-45"></div>
                        NEUROFEEDBACK
                  </div>
                  <button onClick={() => setShowSettings(true)} className="text-slate-500 hover:text-white transition-colors p-2">
                      <GearIcon className="h-5 w-5"/>
                  </button>
              </div>
          </div>
      );
  };

  // --- Global Footer (Slide-out in Zen Mode) ---
  const renderGlobalFooter = () => {
      const visible = isImmersive ? panelVisibility.bottom : true;
      const classes = isImmersive
        ? \`fixed bottom-0 left-0 w-full h-8 bg-slate-900/90 backdrop-blur border-t border-slate-800 z-[70] transform transition-transform duration-300 \${visible ? 'translate-y-0' : 'translate-y-full'}\`
        : "w-full h-8 bg-slate-900 border-t border-slate-800 flex-none z-20 relative";

      return (
         <div 
            className={classes}
            onMouseEnter={() => handlePanelEnter('bottom')}
            onMouseLeave={() => handlePanelLeave('bottom')}
         >
             <div className="flex items-center justify-between px-6 h-full">
                 <div className="text-[10px] text-slate-400 flex items-center gap-2">
                     <span className="text-green-400 font-mono font-bold">{protocolRunner.connectionStatus || 'System Ready'}</span>
                     {protocolRunner.runningProtocols.length > 0 && (
                         <>
                             <span>|</span>
                             <span>{protocolRunner.runningProtocols.length} Active</span>
                         </>
                     )}
                 </div>
                 <div className="text-[10px] text-slate-500 font-mono">
                    API Ops: {totalApiCalls}
                 </div>
             </div>
         </div>
      );
  };

  // --- Left Panel Wrapper ---
  const renderLeftPanelContainer = () => {
      const visible = isImmersive ? panelVisibility.left : true;
      // In Zen mode: Absolute positioning, full height minus header? No, full screen height.
      // In Normal mode: Relative block.
      
      const containerClasses = isImmersive 
          ? \`fixed top-0 left-0 h-full w-[350px] bg-slate-900/95 backdrop-blur shadow-2xl z-[60] border-r border-slate-800 transform transition-transform duration-300 ease-out \${visible ? 'translate-x-0' : '-translate-x-full'}\`
          : "w-1/4 min-w-[300px] max-w-[400px] flex flex-col border-r border-slate-800 bg-slate-900 relative z-10";

      return (
          <div 
            className={containerClasses}
            onMouseEnter={() => handlePanelEnter('left')}
            onMouseLeave={() => handlePanelLeave('left')}
          >
            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-800 shrink-0 bg-slate-900 pt-12 md:pt-0"> {/* Add padding top in Zen if header overlaps? No, z-index handles it. */}
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
      );
  };

  // --- Right Panel Wrapper ---
  const renderRightPanelContainer = () => {
      const visible = isImmersive ? panelVisibility.right : true;
      const containerClasses = isImmersive 
          ? \`fixed top-0 right-0 h-full w-[300px] bg-slate-900/95 backdrop-blur shadow-2xl z-[60] border-l border-slate-800 transform transition-transform duration-300 ease-out \${visible ? 'translate-x-0' : 'translate-x-full'}\`
          : "w-1/4 min-w-[250px] max-w-[350px] flex flex-col border-l border-slate-800 bg-slate-900 relative z-10";

      return (
          <div 
            className={containerClasses}
            onMouseEnter={() => handlePanelEnter('right')}
            onMouseLeave={() => handlePanelLeave('right')}
          >
            <div className="h-12 border-b border-slate-800 flex items-center px-4 justify-between bg-slate-900 shrink-0">
                <span className="text-xs font-bold text-slate-500 tracking-wider uppercase">Telemetry & I/O</span>
                <div className="flex gap-1">
                    <button 
                        onClick={handleGenesisLaunch} 
                        className={\`p-1.5 rounded hover:bg-slate-800 \${genesisMode ? 'text-purple-400 border border-purple-500' : 'text-slate-600'}\`} 
                        title="Launch Vibecoder Genesis Mode"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547a2 2 0 00-.547 1.806l.443 2.387a6 6 0 00.517 3.86l.158.318a6 6 0 00.517 3.86l.477 2.387zM12 6V4m0 2a2 2 0 012 2v1H10V8a2 2 0 012-2z" /></svg>
                    </button>
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
      );
  };

  // --- Center Stage / Main Content ---
  const renderCenterStage = () => {
      return (
        <div className="flex-grow flex flex-col bg-black relative z-0 overflow-hidden">
             {genesisMode ? (
                 <div className="flex-grow relative w-full h-full">
                     <UniversalCanvas runtime={runtime} />
                     <div className="absolute top-4 left-4 z-50">
                         <div className="bg-purple-900/50 border border-purple-500 text-purple-200 px-3 py-1 rounded font-bold text-xs animate-pulse">
                             VIBECODER GENESIS ACTIVE
                         </div>
                     </div>
                 </div>
             ) : (
                <div className="flex-grow relative overflow-hidden flex">
                    {protocolRunner.runningProtocols.length > 0 ? (
                        <div className={\`grid w-full h-full \${
                            protocolRunner.runningProtocols.length === 1 ? 'grid-cols-1' :
                            protocolRunner.runningProtocols.length === 2 ? 'grid-cols-2' :
                            'grid-cols-2 grid-rows-2' 
                        }\`}>
                            {protocolRunner.runningProtocols.map(app => (
                                <div key={app.id} className="relative border border-slate-800/50 overflow-hidden bg-[#050505] p-0">
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
                        <div className="flex-grow flex flex-col items-center justify-center text-slate-600 opacity-50">
                            <BeakerIcon className="h-24 w-24 mb-4 text-slate-700" />
                            <h2 className="text-xl font-bold text-slate-500">Ready for Deployment</h2>
                            <p className="text-sm">Select protocols from the Library to launch.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
      );
  };

  // --- Main Layout Return ---
  return (
    <div className="h-full w-full bg-black text-slate-200 font-sans overflow-hidden relative flex flex-col">
        {renderSettingsModal()}
        {renderEvolveModal()}
        {renderResetConfirmModal()}
        
        <input 
            type="file" 
            ref={fileInputRef}
            style={{ display: 'none' }} 
            accept=".json"
            onChange={handleFileImport}
        />
        
        {/* Global Overlays - Header & Footer */}
        {renderGlobalHeader()}
        
        {/* Main Content Area */}
        {/* In Zen mode, this takes full screen. In Normal, it flexes. */}
        <div className="flex-grow flex relative overflow-hidden">
            {renderLeftPanelContainer()}
            {renderCenterStage()}
            {renderRightPanelContainer()}
        </div>

        {renderGlobalFooter()}

        {/* Trigger Zones for Immersive Mode */}
        {isImmersive && (
            <>
                <div className="fixed top-0 left-0 h-full w-4 z-[55] cursor-pointer" onMouseEnter={() => handlePanelEnter('left')} />
                <div className="fixed top-0 right-0 h-full w-4 z-[55] cursor-pointer" onMouseEnter={() => handlePanelEnter('right')} />
                <div className="fixed bottom-0 left-0 w-full h-4 z-[55] cursor-pointer" onMouseEnter={() => handlePanelEnter('bottom')} />
                <div className="fixed top-0 left-0 w-full h-4 z-[55] cursor-pointer" onMouseEnter={() => handlePanelEnter('top')} />
            </>
        )}

        {/* Security Handshake Modal */}
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
        
        {/* Doc Viewer Modal */}
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

    </div>
  );
`;
