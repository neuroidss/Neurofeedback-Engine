
// This file defines the React component code for the main UI of the Neurofeedback Engine.
// It is stored as a template literal string to be loaded dynamically as a UI tool.
import { USE_DEVICE_MANAGER_CODE } from './ui_panels/hooks/useDeviceManager';
import { USE_PROTOCOL_RUNNER_CODE } from './ui_panels/hooks/useProtocolRunner';
import { USE_PROVISIONING_CODE } from './ui_panels/hooks/useProvisioning';

export const MAIN_PANEL_CODE = `
  const { useState, useEffect, useMemo, useRef } = React;

  // --- Injected Hooks ---
  ${USE_DEVICE_MANAGER_CODE}
  ${USE_PROTOCOL_RUNNER_CODE}
  ${USE_PROVISIONING_CODE}
  
  const useFirmwareManager = ({ runtime, selectedDevices }) => {
    const [firmwareCode, setFirmwareCode] = useState('');
    const [logs, setLogs] = useState([]);
    const [isBusy, setIsBusy] = useState(false);
    const [deviceIp, setDeviceIp] = useState(''); // Auto-filled
    const [compiledPath, setCompiledPath] = useState(null);
    
    // State for viewing fetched documents (Schematic, PCB, Manifest)
    const [docViewer, setDocViewer] = useState(null); // { title, content, type }

    const log = (msg) => setLogs(prev => [ ...prev.slice(-20), \`[\${new Date().toLocaleTimeString()}] \${msg}\`]);

    // --- Auto-Sync IP from Selection ---
    useEffect(() => {
        // Always grab the IP of the *last* selected device to act as the "primary" target for viewing.
        // For flashing, we will use the whole list.
        const validDevices = selectedDevices.filter(d => d.ip);
        if (validDevices.length > 0) {
            setDeviceIp(validDevices[validDevices.length - 1].ip);
        }
    }, [selectedDevices]);

    // --- Smart Fetcher: Direct -> Proxy Fallback ---
    const fetchDeviceArtifact = async (endpoint) => {
        const url = 'http://' + deviceIp + endpoint;
        log('Fetching ' + url + '...');
        
        // 1. Try Direct Fetch (works for HTTP-to-HTTP or Localhost-to-Localhost)
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000); // Fast fail for direct
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (res.ok) return await res.text();
        } catch (e) {
            // Ignore direct failure, likely Mixed Content or CORS
        }

        // 2. Try Proxy (works for HTTPS-to-HTTP via Local Backend)
        try {
            const proxyUrl = 'http://localhost:3001'; 
            const res = await fetch(proxyUrl + '/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (res.ok) return await res.text();
            throw new Error('Proxy fetch failed: ' + res.status);
        } catch (e) {
            throw new Error('Could not fetch artifact. Ensure device is reachable or Local Server is running.');
        }
    };

    const handleViewArtifact = async (type, endpoint) => {
        if (!deviceIp) { log('❌ Error: No device selected or IP missing.'); return; }
        setIsBusy(true);
        try {
            const content = await fetchDeviceArtifact(endpoint);
            
            if (type === 'Source') {
                setFirmwareCode(content);
                log('✅ Source code loaded from device.');
            } else {
                setDocViewer({ title: type, content, type: 'text' });
                log('✅ ' + type + ' loaded.');
            }
        } catch (e) {
            log('❌ Error loading ' + type + ': ' + e.message);
        }
        setIsBusy(false);
    };

    const loadFirmware = async () => {
        setIsBusy(true); log('Loading firmware...');
        try {
            const result = await runtime.tools.run('Load Smart Hybrid Firmware', {});
            setFirmwareCode(result.firmwareCode);
            log('✅ Firmware loaded. You can now edit or copy the code.');
        } catch(e) { log('❌ Error: ' + e.message); }
        setIsBusy(false);
    };
    
    const compile = async () => {
        if (!firmwareCode) { log('❌ Error: No firmware code loaded.'); return; }
        setIsBusy(true); setCompiledPath(null); log('Compiling firmware on server...');
        try {
            const result = await runtime.tools.run('Compile ESP32 Firmware', { firmwareCode });
            log(result.logs);
            if (result.success) {
                setCompiledPath(result.firmwarePath);
                log('✅ Compilation successful. Path: ' + result.firmwarePath);
            } else {
                log('❌ Compilation failed.');
            }
        } catch(e) { log('❌ Error: ' + e.message); }
        setIsBusy(false);
    };

    const flash = async () => {
        if (!compiledPath) { log('❌ Error: Firmware not compiled yet.'); return; }
        
        // Identify targets
        const targets = selectedDevices.filter(d => d.ip && d.mode !== 'simulator');
        
        if (targets.length === 0) {
             if (deviceIp) {
                 // Fallback to manual IP entry
                 targets.push({ name: 'Manual Target', ip: deviceIp });
             } else {
                 log('❌ Error: No valid targets selected.'); 
                 return; 
             }
        }

        setIsBusy(true);
        
        log('🚀 Starting Batch Flash for ' + targets.length + ' devices...');
        
        for (const target of targets) {
            log('>> Flashing ' + target.name + ' (' + target.ip + ')...');
            try {
                const result = await runtime.tools.run('Flash ESP32 Firmware (OTA)', { firmwarePath: compiledPath, deviceIp: target.ip });
                log(result.logs);
                if (result.success) {
                    log('✅ Flash successful for ' + target.name);
                } else {
                    log('❌ Flash failed for ' + target.name);
                }
            } catch(e) { 
                log('❌ Error flashing ' + target.name + ': ' + e.message); 
            }
            // Small delay between devices
            await new Promise(r => setTimeout(r, 1000));
        }
        
        log('🏁 Batch operation complete.');
        setIsBusy(false);
    };
    
    return { 
        firmwareCode, setFirmwareCode, logs, isBusy, deviceIp, setDeviceIp, compiledPath, 
        docViewer, setDocViewer,
        loadFirmware, compile, flash, handleViewArtifact 
    };
  };

  // --- Main UI State ---
  const [leftTab, setLeftTab] = useState('research'); // 'research' | 'library' | 'firmware'
  const [rightTab, setRightTab] = useState('telemetry'); // 'telemetry' | 'logs'
  const [activeAppIdLocal, setActiveAppIdLocal] = useState(null); // Used for library selection highlighting
  const [showProvisioning, setShowProvisioning] = useState(false); // State for provisioning modal
  const [showSettings, setShowSettings] = useState(false); // State for settings modal
  const wasVibecodingRef = useRef(false);
  
  // --- Research Panel State (Lifted Up) ---
  const [researchInput, setResearchInput] = useState('Enhance focus and attention eeg');
  const [autonomyEnabled, setAutonomyEnabled] = useState(false);
  const [generatingIds, setGeneratingIds] = useState(new Set());

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

  // --- Modal Render ---
  const renderSettingsModal = () => {
      if (!showSettings) return null;
      return (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-in-scale">
                  <div className="flex justify-between items-center p-4 border-b border-slate-700">
                      <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          <GearIcon className="h-5 w-5 text-slate-400" />
                          System Configuration
                      </h2>
                      <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white">
                          <XCircleIcon className="h-6 w-6" />
                      </button>
                  </div>
                  <div className="p-6 space-y-6">
                      <div className="space-y-4">
                          <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider border-b border-slate-800 pb-2">Model Providers</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div className="space-y-2">
                                  <label className="text-xs text-slate-400">Google Gemini API Key</label>
                                  <input type="password" value={apiConfig.googleAIAPIKey || ''} onChange={e => setApiConfig({...apiConfig, googleAIAPIKey: e.target.value})} className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none" placeholder="AIza..." />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs text-slate-400">OpenAI API Key</label>
                                  <input type="password" value={apiConfig.openAIAPIKey || ''} onChange={e => setApiConfig({...apiConfig, openAIAPIKey: e.target.value})} className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none" placeholder="sk-..." />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs text-slate-400">DeepSeek API Key (Nebius)</label>
                                  <input type="password" value={apiConfig.deepSeekAPIKey || ''} onChange={e => setApiConfig({...apiConfig, deepSeekAPIKey: e.target.value})} className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none" />
                              </div>
                              <div className="space-y-2">
                                  <label className="text-xs text-slate-400">Ollama Host</label>
                                  <input type="text" value={apiConfig.ollamaHost || ''} onChange={e => setApiConfig({...apiConfig, ollamaHost: e.target.value})} className="w-full bg-black border border-slate-700 rounded px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none" placeholder="http://localhost:11434" />
                              </div>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <h3 className="text-sm font-bold text-purple-400 uppercase tracking-wider border-b border-slate-800 pb-2">Hardware Acceleration & Session</h3>
                          
                          <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded border border-slate-700">
                                  <div>
                                      <div className="text-sm font-bold text-white">Quantum Annealing (Simulated)</div>
                                      <div className="text-xs text-slate-500">Offload NP-hard optimization tasks to D-Wave solver proxy.</div>
                                  </div>
                                  <div className="relative inline-block w-10 h-5 align-middle select-none transition duration-200 ease-in">
                                      <input type="checkbox" name="toggle" id="quantum-toggle" checked={apiConfig.useQuantumSDR || false} onChange={e => setApiConfig({...apiConfig, useQuantumSDR: e.target.checked})} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300" style={{ right: apiConfig.useQuantumSDR ? '0' : '50%', borderColor: apiConfig.useQuantumSDR ? '#a855f7' : '#4b5563' }}/>
                                      <label htmlFor="quantum-toggle" className={\`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer \${apiConfig.useQuantumSDR ? 'bg-purple-900' : 'bg-gray-700'}\`}></label>
                                  </div>
                              </div>
                              
                              <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded border border-slate-700">
                                  <div>
                                      <div className="text-sm font-bold text-white">Auto-Restore Session</div>
                                      <div className="text-xs text-slate-500">Automatically resume last protocol and reconnect devices on page load.</div>
                                  </div>
                                  <div className="relative inline-block w-10 h-5 align-middle select-none transition duration-200 ease-in">
                                      <input type="checkbox" name="restore-toggle" id="restore-toggle" checked={apiConfig.autoRestoreSession || false} onChange={e => setApiConfig({...apiConfig, autoRestoreSession: e.target.checked})} className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer transition-all duration-300" style={{ right: apiConfig.autoRestoreSession ? '0' : '50%', borderColor: apiConfig.autoRestoreSession ? '#0ea5e9' : '#4b5563' }}/>
                                      <label htmlFor="restore-toggle" className={\`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer \${apiConfig.autoRestoreSession ? 'bg-sky-900' : 'bg-gray-700'}\`}></label>
                                  </div>
                              </div>

                              <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded border border-slate-700">
                                  <div>
                                      <div className="text-sm font-bold text-white">Compute Backend</div>
                                      <div className="text-xs text-slate-500">Select the engine for heavy DSP operations (Coherence, Filtering).</div>
                                  </div>
                                  <select 
                                    value={apiConfig.computeBackend || 'gpu'} 
                                    onChange={e => setApiConfig({...apiConfig, computeBackend: e.target.value})}
                                    className="bg-black border border-slate-600 text-xs text-white rounded px-2 py-1 focus:border-cyan-500 outline-none"
                                  >
                                    <option value="gpu">GPU (WebGL)</option>
                                    <option value="worker">CPU (Web Worker)</option>
                                    <option value="main">CPU (Main Thread)</option>
                                  </select>
                              </div>
                          </div>
                      </div>
                  </div>
                  <div className="p-4 border-t border-slate-700 flex justify-end">
                      <button onClick={() => setShowSettings(false)} className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded font-bold text-sm">Done</button>
                  </div>
              </div>
          </div>
      );
  }


  // --- Render Functions ---

  const renderModelSelector = () => {
      const allModels = [...models, ...ollamaModels].reduce((acc, model) => {
            if (model.provider) {
                acc[model.provider] = acc[model.provider] || [];
                acc[model.provider].push(model);
            }
            return acc;
        }, {});

      return (
        <div className="flex items-center gap-2 mb-3">
             <div className="flex-grow relative">
                <select 
                    value={selectedModel.id} 
                    onChange={(e) => {
                        const m = [...models, ...ollamaModels].find(m => m.id === e.target.value);
                        if(m) setSelectedModel(m);
                    }} 
                    disabled={isSwarmRunning} 
                    className="w-full bg-slate-900 border border-slate-700 rounded text-xs p-1.5 text-slate-300 focus:border-cyan-500 outline-none appearance-none"
                >
                    {Object.entries(allModels).map(([provider, group]) => (
                        <optgroup label={provider} key={provider}>
                            {group.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                        </optgroup>
                    ))}
                </select>
            </div>
            <button onClick={fetchOllamaModels} disabled={ollamaState.loading || isSwarmRunning} className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400" title="Refresh Models">
                <svg xmlns="http://www.w3.org/2000/svg" className={'h-4 w-4 ' + (ollamaState.loading ? 'animate-spin' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
            </button>
        </div>
      );
  }

  const renderResearchPanel = () => {
      return (
          <div className="flex flex-col h-full">
              <div className="flex-shrink-0 space-y-2 mb-4">
                  {renderModelSelector()}
                  
                  <div className="flex items-center justify-between bg-slate-800 p-2 rounded border border-slate-700">
                      <div className="flex flex-col">
                          <span className={\`text-xs font-bold \${autonomyEnabled ? 'text-purple-400' : 'text-slate-400'}\`}>NEURAL AUTONOMY</span>
                          <span className="text-[10px] text-slate-500">{autonomyEnabled ? 'Active: Auto-Gen & Deploy' : 'Manual Mode'}</span>
                      </div>
                      <button 
                          onClick={() => setAutonomyEnabled(!autonomyEnabled)}
                          className={\`w-10 h-5 rounded-full relative transition-colors \${autonomyEnabled ? 'bg-purple-600' : 'bg-slate-600'}\`}
                      >
                          <div className={\`absolute top-1 w-3 h-3 bg-white rounded-full transition-all \${autonomyEnabled ? 'left-6' : 'left-1'}\`}></div>
                      </button>
                  </div>

                  <textarea 
                    value={researchInput} onChange={(e) => setResearchInput(e.target.value)} 
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:border-cyan-500 outline-none resize-none h-24"
                    placeholder="Describe your target mental state or research goal..."
                    disabled={isSwarmRunning}
                  />
                  <button 
                    onClick={handleStartResearch}
                    className={\`w-full py-2 rounded text-sm font-bold text-white transition-colors \${isSwarmRunning ? 'bg-red-600 hover:bg-red-700' : 'bg-cyan-600 hover:bg-cyan-700'}\`}
                  >
                    {isSwarmRunning ? 'STOP AGENT' : 'INITIATE RESEARCH'}
                  </button>
              </div>

              <div className="flex-grow overflow-y-auto min-h-0 border-t border-slate-700 pt-2">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Intelligence Stream</h3>
                    {autonomyEnabled && isSwarmRunning && <span className="text-[10px] text-purple-400 animate-pulse">● Monitoring Stream</span>}
                  </div>
                  
                   {validatedSources.length === 0 && !runtime.subStepProgress ? (
                      <p className="text-xs text-slate-600 italic p-2 text-center">Awaiting data...</p>
                  ) : (
                      <div className="space-y-2">
                          {runtime.subStepProgress && (
                              <div className="bg-slate-800/50 border border-cyan-900/50 p-2 rounded mb-2">
                                  <div className="flex justify-between text-xs text-cyan-400 mb-1">
                                      <span>{runtime.subStepProgress.text}</span>
                                      <span>{Math.round((runtime.subStepProgress.current / runtime.subStepProgress.total) * 100)}%</span>
                                  </div>
                                  <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                                      <div className="h-full bg-cyan-500 transition-all duration-300" style={{ width: \`\${(runtime.subStepProgress.current / runtime.subStepProgress.total) * 100}%\` }}></div>
                                  </div>
                              </div>
                          )}
                          {validatedSources.map((source, i) => {
                              const isGenerating = generatingIds.has(source.uri);
                              return (
                                <div key={i} className={\`bg-slate-800 border p-2 rounded text-xs transition-colors group relative \${isGenerating ? 'border-purple-500/50' : 'border-slate-700 hover:border-slate-500'}\`}>
                                    <div className="flex justify-between items-start mb-1">
                                        <a href={source.uri} target="_blank" className="font-bold text-slate-300 hover:text-cyan-400 line-clamp-2 w-3/4">{source.title}</a>
                                        <span className={\`px-1.5 py-0.5 rounded text-[10px] font-mono \${source.reliabilityScore > 0.8 ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}\`}>{source.reliabilityScore.toFixed(2)}</span>
                                    </div>
                                    <p className="text-slate-500 line-clamp-2 mb-2">{source.summary}</p>
                                    
                                    <div className="flex justify-end gap-2 mt-2 border-t border-slate-700/50 pt-2">
                                        {isGenerating ? (
                                            <span className="text-[10px] text-purple-400 flex items-center gap-1">
                                                <div className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></div>
                                                Constructing Protocol...
                                            </span>
                                        ) : (
                                            autonomyEnabled ? (
                                                source.reliabilityScore >= 0.75 ? 
                                                <span className="text-[10px] text-slate-500 italic">Queued for Auto-Gen</span> :
                                                <span className="text-[10px] text-slate-600 italic">Low Score - Skipped</span>
                                            ) : (
                                                <button 
                                                    onClick={() => handleManualGenerate(source)}
                                                    className="text-[10px] bg-cyan-900/30 hover:bg-cyan-900/50 text-cyan-300 px-2 py-1 rounded border border-cyan-900"
                                                >
                                                    Generate Protocol
                                                </button>
                                            )
                                        )}
                                    </div>
                                </div>
                              );
                          })}
                      </div>
                  )}
              </div>
          </div>
      );
  };

  const renderLibraryPanel = () => (
      <div className="flex flex-col h-full">
          <div className="flex-grow overflow-y-auto min-h-0 space-y-2">
              {protocolLibrary.map(app => {
                  const isRunning = protocolRunner.runningProtocols.some(p => p.id === app.id);
                  return (
                    <button 
                        key={app.id} 
                        onClick={() => {
                            setActiveAppIdLocal(app.id);
                            protocolRunner.toggleProtocol(app);
                        }}
                        className={\`w-full text-left p-3 rounded border transition-all \${isRunning ? 'bg-cyan-900/30 border-cyan-500' : (activeAppIdLocal === app.id ? 'bg-slate-800 border-slate-600' : 'bg-slate-800 border-slate-700 hover:border-slate-500')}\`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={\`p-2 rounded \${isRunning ? 'bg-cyan-800 text-white' : 'bg-slate-900 text-cyan-400'}\`}>
                                {isRunning ? <PlayIcon className="h-5 w-5 animate-pulse"/> : <BeakerIcon className="h-5 w-5"/>}
                            </div>
                            <div className="flex-grow">
                                <div className="flex justify-between items-center">
                                    <div className="font-bold text-sm text-slate-200">{app.name}</div>
                                    {isRunning && <div className="text-[10px] bg-green-900 text-green-300 px-1 rounded">LIVE</div>}
                                </div>
                                <div className="text-xs text-slate-500 line-clamp-1">{app.description}</div>
                            </div>
                        </div>
                    </button>
                  );
              })}
              {protocolLibrary.length === 0 && <div className="text-center text-slate-600 text-sm mt-10">No protocols generated yet.</div>}
          </div>
          <div className="flex-shrink-0 pt-4 border-t border-slate-700 mt-2 space-y-2">
               <button onClick={() => protocolRunner.stopAllProtocols()} className="w-full py-2 bg-red-900/80 hover:bg-red-800 text-white text-xs font-bold rounded">
                   STOP ALL SESSIONS
               </button>
              <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => runtime.tools.run('Export Neurofeedback Protocols', {})} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded">Export Library</button>
                  <button onClick={() => { if(confirm("Reset all?")) runtime.tools.run('Factory Reset Protocols', {}) }} className="w-full py-2 bg-slate-800 hover:bg-red-900/50 text-xs text-red-400 rounded border border-slate-700">Reset</button>
              </div>
          </div>
      </div>
  );

  const renderFirmwarePanel = () => {
      const targetCount = selectedDevicesForFirmware.filter(d => d.ip && d.mode !== 'simulator').length;
      
      return (
         <div className="flex flex-col h-full space-y-2 text-xs">
            <div className="flex justify-between items-center bg-slate-800 px-3 py-2 rounded border border-slate-700">
                <button onClick={firmwareManager.loadFirmware} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-xs font-bold">Load Source</button>
                <button onClick={() => { navigator.clipboard.writeText(firmwareManager.firmwareCode); firmwareManager.loadFirmware(); }} className="text-slate-400 hover:text-white">
                    <span className="flex items-center gap-1">
                        <PaperClipIcon className="h-3 w-3"/> Copy
                    </span>
                </button>
            </div>
            
            <div className="flex-grow flex flex-col min-h-0 relative border border-slate-700 rounded bg-[#1e1e1e]">
                {firmwareManager.firmwareCode ? (
                    <textarea 
                        value={firmwareManager.firmwareCode} 
                        onChange={(e) => firmwareManager.setFirmwareCode(e.target.value)}
                        className="absolute inset-0 w-full h-full bg-transparent text-slate-300 font-mono text-[10px] p-2 outline-none resize-none"
                        spellCheck="false"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                        Click "Load Source" to view code
                    </div>
                )}
            </div>
            
            <div className="bg-slate-800 p-2 rounded border border-slate-700 h-1/3 flex flex-col">
                <div className="flex gap-2 mb-2">
                    <input 
                        type="text" 
                        value={firmwareManager.deviceIp} 
                        onChange={(e) => firmwareManager.setDeviceIp(e.target.value)} 
                        className="flex-grow bg-slate-900 border border-slate-600 p-1.5 rounded text-slate-300 font-mono" 
                        placeholder="Device IP"
                        title={targetCount > 1 ? \`Targeting \${targetCount} selected devices\` : "Target Device IP"}
                    />
                    <button onClick={firmwareManager.compile} disabled={firmwareManager.isBusy || !firmwareManager.firmwareCode} className="px-3 bg-blue-700 hover:bg-blue-600 rounded text-white">Compile</button>
                    <button 
                        onClick={firmwareManager.flash} 
                        disabled={firmwareManager.isBusy || !firmwareManager.compiledPath} 
                        className={\`px-3 rounded text-white \${targetCount > 1 ? 'bg-purple-800 hover:bg-purple-700 animate-pulse' : 'bg-purple-700 hover:bg-purple-600'}\`}
                        title={targetCount > 1 ? \`Flash to \${targetCount} devices\` : "Flash to single device"}
                    >
                        {targetCount > 1 ? \`Flash Swarm (\${targetCount})\` : 'Flash'}
                    </button>
                </div>
    
                 <div className="grid grid-cols-4 gap-2 mb-2">
                    <button onClick={() => firmwareManager.handleViewArtifact('Source', '/source')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600" title="Read Source Code directly from Device">View Source</button>
                    <button onClick={() => firmwareManager.handleViewArtifact('Schematic', '/schematic')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600" title="Download Schematics from Device">Schematic</button>
                    <button onClick={() => firmwareManager.handleViewArtifact('PCB', '/pcb')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600" title="Download PCB Design from Device">PCB</button>
                    <button onClick={() => firmwareManager.handleViewArtifact('Manifest', '/manifest')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600" title="View Device Manifest">Manifest</button>
                </div>
    
                <div className="flex-grow bg-black/50 rounded p-1 font-mono text-gray-500 overflow-y-auto whitespace-pre-wrap text-[9px]">
                    {firmwareManager.logs.length > 0 ? firmwareManager.logs.join('\\n') : "Ready."}
                </div>
            </div>
         </div>
      );
  }

  const renderTelemetryPanel = () => (
      <div className="flex flex-col h-full space-y-4">
          {/* Device List */}
          <div className="bg-slate-800/50 rounded border border-slate-700 overflow-hidden">
              <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-300">DEVICES</span>
                  <div className="flex gap-2">
                       <button onClick={() => setShowProvisioning(!showProvisioning)} className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded hover:bg-slate-600" title="Provision WiFi">Config WiFi</button>
                       <button onClick={deviceManager.handleAddBleDevice} disabled={!!deviceManager.bluetoothAvailabilityError} className="text-[10px] bg-cyan-900/50 text-cyan-400 px-2 py-0.5 rounded hover:bg-cyan-900">ADD BLE</button>
                       <button onClick={deviceManager.handleAddSerialDevice} className="text-[10px] bg-orange-900/50 text-orange-400 px-2 py-0.5 rounded hover:bg-orange-900" title="Connect via USB Serial">ADD USB</button>
                  </div>
              </div>
              <div className="p-2 space-y-1">
                  {showProvisioning && (
                      <div className="p-2 bg-slate-900/90 mb-2 rounded border border-purple-500/50 animate-fade-in">
                          <h4 className="text-[10px] font-bold text-purple-300 mb-2">Provision FreeEEG8 (WiFi via BLE)</h4>
                          <input type="text" placeholder="SSID" value={provisioning.provSsid} onChange={(e) => provisioning.setProvSsid(e.target.value)} className="w-full mb-1 text-xs bg-black border border-slate-700 rounded p-1" />
                          <input type="password" placeholder="Password" value={provisioning.provPassword} onChange={(e) => provisioning.setProvPassword(e.target.value)} className="w-full mb-2 text-xs bg-black border border-slate-700 rounded p-1" />
                          <button onClick={provisioning.handleStartProvisioning} disabled={provisioning.isProvisioningBusy} className="w-full text-xs bg-purple-700 hover:bg-purple-600 text-white py-1 rounded">
                            {provisioning.isProvisioningBusy ? 'Provisioning...' : 'Connect & Config'}
                          </button>
                          {provisioning.provStatus && <p className="text-[10px] text-slate-400 mt-1">{provisioning.provStatus}</p>}
                          {provisioning.provError && <p className="text-[10px] text-red-400 mt-1">{provisioning.provError}</p>}
                      </div>
                  )}
                  
                  {deviceManager.connectedDevices.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs p-1.5 bg-slate-700/30 rounded">
                          <div className="flex items-center gap-2">
                              <div className={\`w-2 h-2 rounded-full \${d.status === 'Active' ? 'bg-green-500' : (d.status === 'Connecting...' ? 'bg-yellow-500' : 'bg-red-500')}\`}></div>
                              <span className="text-slate-300">{d.name}</span>
                              {d.mode === 'serial' && <span className="text-[9px] text-orange-400 bg-orange-900/30 px-1 rounded">USB</span>}
                          </div>
                          <div className="flex items-center gap-2">
                             {d.mode === 'wifi' && (
                                 <button 
                                    onClick={() => deviceManager.handleToggleWss(d.id)} 
                                    className={\`px-1.5 py-0.5 rounded border text-[9px] font-bold transition-colors \${d.useWss ? 'bg-purple-900/80 border-purple-500 text-purple-200' : 'bg-slate-800 border-slate-600 text-slate-500 hover:border-slate-400'}\`}
                                    title="Toggle Secure WebSocket (WSS)."
                                 >
                                    {d.useWss ? 'WSS' : 'WS'}
                                 </button>
                             )}
                             <input type="checkbox" checked={deviceManager.activeDataSourceIds.includes(d.id)} onChange={() => deviceManager.handleToggleDataSource(d.id)} className="accent-cyan-500"/>
                          </div>
                      </div>
                  ))}
                   <div className="flex gap-1 mt-1">
                        <button onClick={() => deviceManager.handleAddSimulator('FreeEEG8')} className="flex-1 text-[10px] bg-slate-700/50 hover:bg-slate-600 text-slate-300 py-1 rounded">+ Sim 8</button>
                        <button onClick={() => deviceManager.handleAddSimulator('FreeEEG32')} className="flex-1 text-[10px] bg-slate-700/50 hover:bg-slate-600 text-slate-300 py-1 rounded">+ Sim 32</button>
                        <button onClick={() => deviceManager.handleAddSimulator('FreeEEG128')} className="flex-1 text-[10px] bg-slate-700/50 hover:bg-slate-600 text-slate-300 py-1 rounded">+ Sim 128</button>
                   </div>
              </div>
          </div>

          {/* Raw Data Monitor */}
          <div className="bg-slate-800/50 rounded border border-slate-700 flex-grow flex flex-col min-h-0">
               <div className="bg-slate-800 px-3 py-2 border-b border-slate-700">
                  <span className="text-xs font-bold text-slate-300">SIGNAL STREAM</span>
              </div>
              <div className="flex-grow p-2 bg-black/80 font-mono text-[10px] text-green-500 overflow-hidden relative">
                 <div className="absolute inset-0 p-2 overflow-y-auto">
                     {protocolRunner.connectionStatus && <div className="text-yellow-500 mb-1">STATUS: {protocolRunner.connectionStatus}</div>}
                     {protocolRunner.rawData ? (typeof protocolRunner.rawData === 'string' ? protocolRunner.rawData : JSON.stringify(protocolRunner.rawData)) : <span className="text-gray-600">No signal...</span>}
                 </div>
              </div>
          </div>
          
          {/* Vibecoder History (Mini) */}
          {vibecoderHistory.length > 0 && (
              <div className="bg-slate-800/50 rounded border border-slate-700 h-1/3 flex flex-col min-h-0">
                <div className="bg-slate-800 px-3 py-2 border-b border-slate-700">
                    <span className="text-xs font-bold text-purple-300">VIBECODER LOOPS</span>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1">
                    {vibecoderHistory.slice().reverse().map(item => (
                        <div key={item.iteration} className="flex justify-between text-[10px] bg-slate-700/30 p-1 rounded">
                            <span className="text-slate-400">Iter #{item.iteration}</span>
                            <span className="text-purple-400 font-bold">{(item.score * 100).toFixed(1)}%</span>
                        </div>
                    ))}
                </div>
              </div>
          )}
      </div>
  );


  return (
    <div className="h-full w-full bg-black text-slate-200 font-sans flex overflow-hidden relative">
        {renderSettingsModal()}
        
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

        <div className="w-1/4 min-w-[300px] max-w-[400px] border-r border-slate-800 flex flex-col bg-slate-900 z-10">
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

        <div className="flex-grow flex flex-col bg-black relative">
            {protocolRunner.runningProtocols.length > 0 ? (
                <div className={\`grid w-full h-full \${
                    protocolRunner.runningProtocols.length === 1 ? 'grid-cols-1' :
                    protocolRunner.runningProtocols.length === 2 ? 'grid-cols-2' :
                    'grid-cols-2 grid-rows-2' 
                }\`}>
                    {protocolRunner.runningProtocols.map(app => (
                        <div key={app.id} className="relative border border-slate-800/50 overflow-hidden">
                            <div className="absolute top-4 left-4 z-20 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full border border-white/10 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="font-bold text-xs text-white">{app.name}</span>
                                <button onClick={() => protocolRunner.toggleProtocol(app)} className="ml-2 text-slate-400 hover:text-white">×</button>
                            </div>
                            <div className="w-full h-full">
                                 <UIToolRunner 
                                    tool={app} 
                                    props={{ 
                                        processedData: protocolRunner.processedDataMap[app.id], 
                                        runtime,
                                        vibecoderHistory
                                    }} 
                                />
                            </div>
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
            
            {protocolRunner.runningProtocols.length > 0 && (
                 <div className="absolute bottom-0 left-0 right-0 h-12 bg-slate-900/80 backdrop-blur-md border-t border-slate-800 flex items-center justify-between px-6 z-30">
                     <div className="text-xs text-slate-400 flex items-center gap-2">
                         <span className="text-green-400 font-mono font-bold">{protocolRunner.connectionStatus || 'Connecting...'}</span>
                         <span>|</span>
                         <span>{protocolRunner.runningProtocols.length} Active Sessions</span>
                     </div>
                 </div>
            )}
        </div>

        <div className="w-1/4 min-w-[250px] max-w-[350px] border-l border-slate-800 flex flex-col bg-slate-900 z-10">
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
                        <div className="flex-grow overflow-y-auto font-mono text-[10px] text-slate-400 space-y-1">
                             {runtime.getState().eventLog.map((log, i) => <div key={i} className="break-words border-b border-slate-800/50 pb-0.5">{log}</div>)}
                        </div>
                     </div>
                )}
            </div>
        </div>

    </div>
  );
`
