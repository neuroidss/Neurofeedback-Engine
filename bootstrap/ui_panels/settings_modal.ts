
export const SETTINGS_MODAL_CODE = `
  // --- Modal Render ---
  const renderSettingsModal = () => {
      if (!showSettings) return null;
      
      const handleTestCapabilities = async () => {
          const currentId = selectedModel.id;
          let cap = null;

          try {
              if (selectedModel.provider === 'Ollama') {
                  if (!apiConfig.ollamaHost) {
                      alert("Ollama Host URL is required.");
                      return;
                  }
                  runtime.logEvent(\`[System] Testing tool capabilities for \${currentId} (Ollama)...\`);
                  if (runtime.ai.testOllamaCapabilities) {
                      cap = await runtime.ai.testOllamaCapabilities(currentId);
                  }
              } else if (selectedModel.provider === 'OpenAI_API') {
                  if (!apiConfig.openAIAPIKey) {
                      alert("OpenAI API Key is required.");
                      return;
                  }
                  runtime.logEvent(\`[System] Testing tool capabilities for \${currentId} (OpenAI)...\`);
                  if (runtime.ai.testOpenAICapabilities) {
                      cap = await runtime.ai.testOpenAICapabilities(currentId);
                  }
              } else {
                  alert("Auto-testing is currently only available for Ollama and OpenAI models.");
                  return;
              }
              
              if (cap) {
                  // Update config
                  const newCaps = { ...apiConfig.modelCapabilities, [currentId]: cap };
                  setApiConfig({ ...apiConfig, modelCapabilities: newCaps });
                  
                  runtime.logEvent(\`[System] Result for \${currentId}: Native Support = \${cap.supportsNativeTools}, Use JSON Prompt = \${cap.useJsonInstruction}\`);
              } else {
                  alert("Runtime update required. Refresh page.");
              }
          } catch(e) {
              runtime.logEvent(\`[System] Test failed: \${e.message}\`);
          }
      };
      
      const restartBridge = async () => {
          try {
              runtime.logEvent(\`[Settings] Restarting AI Bridge with timeout: \${apiConfig.aiBridgeTimeout || 3600}s...\`);
              await runtime.tools.run('Bootstrap Universal AI Bridge', { 
                  targetUrl: 'http://127.0.0.1:11434', 
                  bridgeId: 'external_ai_bridge',
                  timeout: apiConfig.aiBridgeTimeout || 3600,
                  forceRestart: true
              });
              alert("Bridge restarted successfully.");
          } catch(e) {
              alert("Failed to restart bridge: " + e.message);
          }
      };
      
      const currentCaps = apiConfig.modelCapabilities?.[selectedModel.id];

      // Reusable Capability UI Component
      const renderCapabilityControls = () => {
          const isMinimizeThink = currentCaps?.thinkingMode === 'minimize';
          const isJsonMode = currentCaps?.useJsonInstruction;
          
          return (
              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                      <div>
                          <div className="text-sm font-bold text-white">Tool Strategy</div>
                          <div className="text-xs text-slate-500">
                              {currentCaps ? 
                                  \`Native: \${currentCaps.supportsNativeTools ? 'ON' : 'OFF'} | Prompt Injection: \${isJsonMode ? 'ON' : 'OFF'}\` 
                                  : "Default: Native (Auto)"}
                          </div>
                      </div>
                      <button 
                        onClick={() => {
                            const old = currentCaps || { supportsNativeTools: true, useJsonInstruction: false };
                            const newCaps = { ...apiConfig.modelCapabilities, [selectedModel.id]: { ...old, useJsonInstruction: !old.useJsonInstruction } };
                            setApiConfig({ ...apiConfig, modelCapabilities: newCaps });
                        }}
                        className={\`px-3 py-1.5 border text-xs rounded transition-colors \${isJsonMode ? 'bg-purple-900/50 border-purple-500 text-purple-200' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}\`}
                      >
                          {isJsonMode ? 'Inject Prompts (JSON Mode)' : 'Native API Tools'}
                      </button>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-800/50 pt-2">
                      <div>
                          <div className="text-sm font-bold text-white">Thinking Process</div>
                          <div className="text-xs text-slate-500">
                              Command: {isMinimizeThink ? '/no_think' : '/think'}
                          </div>
                      </div>
                      <button 
                        onClick={() => {
                            const old = currentCaps || { supportsNativeTools: true, useJsonInstruction: false };
                            const newMode = old.thinkingMode === 'minimize' ? 'default' : 'minimize';
                            const newCaps = { ...apiConfig.modelCapabilities, [selectedModel.id]: { ...old, thinkingMode: newMode } };
                            setApiConfig({ ...apiConfig, modelCapabilities: newCaps });
                        }}
                        className={\`px-3 py-1.5 border text-xs rounded transition-colors \${isMinimizeThink ? 'bg-red-900/50 border-red-500 text-red-200' : 'bg-slate-800 border-slate-600 text-slate-300 hover:bg-slate-700'}\`}
                        title="Toggles between standard reasoning (/think) and suppressed reasoning (/no_think) to save tokens."
                      >
                          {isMinimizeThink ? '/no_think (Fast)' : '/think (Reasoning)'}
                      </button>
                  </div>
                  
                  {(selectedModel.provider === 'Ollama' || selectedModel.provider === 'OpenAI_API') && (
                      <div className="pt-2">
                          <button 
                            onClick={handleTestCapabilities}
                            className="w-full px-3 py-1.5 bg-orange-900/50 hover:bg-orange-800 border border-orange-700 text-orange-200 text-xs font-bold rounded transition-colors"
                          >
                              Auto-Test Capabilities
                          </button>
                      </div>
                  )}
              </div>
          );
      };

      return (
          // Overlay: Fixed, covers entire screen, centers content using Flexbox
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              
              {/* Modal Container */}
              <div 
                  className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
                  style={{ animation: 'popIn 0.2s ease-out' }}
              >
                  <style>{\`
                    @keyframes popIn {
                      from { opacity: 0; transform: scale(0.95); }
                      to { opacity: 1; transform: scale(1); }
                    }
                  \`}</style>

                  {/* 1. Header */}
                  <div className="shrink-0 flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
                      <h2 className="text-lg font-bold text-white flex items-center gap-3">
                          <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                             <GearIcon className="h-5 w-5 text-cyan-400" />
                          </div>
                          <span>System Configuration</span>
                      </h2>
                      <button 
                        onClick={() => setShowSettings(false)} 
                        className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-full"
                      >
                          <XCircleIcon className="h-6 w-6" />
                      </button>
                  </div>
                  
                  {/* 2. Content */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-950/30">
                      
                      {/* Model Capabilities Section (Generic for both Ollama and OpenAI) */}
                      {(selectedModel.provider === 'Ollama' || selectedModel.provider === 'OpenAI_API' || selectedModel.provider === 'DeepSeek') && (
                          <div className="space-y-3">
                              <h3 className="text-xs font-bold text-orange-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                                  Model Config: {selectedModel.name}
                              </h3>
                              {renderCapabilityControls()}
                          </div>
                      )}

                      {/* AI Providers Section */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                              AI Connection Settings
                          </h3>
                          
                          {/* GLOBAL TIMEOUT SETTING - Moved to top level for visibility */}
                          <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800 flex items-center justify-between gap-4">
                              <div className="flex-grow">
                                  <label className="text-[10px] text-slate-400 font-bold block mb-1 uppercase tracking-wider">Global LLM Timeout (Seconds)</label>
                                  <div className="text-[10px] text-slate-500 mb-2">Controls read timeout for OpenAI, Ollama, and Bridge requests. Increase for large local models.</div>
                                  <div className="flex items-center gap-2">
                                      <input 
                                        type="number"
                                        value={apiConfig.aiBridgeTimeout || 3600}
                                        onChange={e => setApiConfig({...apiConfig, aiBridgeTimeout: parseInt(e.target.value)})}
                                        className="w-32 bg-black/40 border border-slate-700 rounded-md px-2 py-1 text-xs text-white focus:border-orange-500 outline-none"
                                      />
                                      <button 
                                        onClick={restartBridge}
                                        className="px-3 py-1.5 bg-orange-900/30 hover:bg-orange-900/50 border border-orange-800 text-orange-300 text-xs rounded font-bold transition-colors whitespace-nowrap"
                                        title="Re-deploy the local bridge with new timeout settings"
                                      >
                                        Apply to Bridge
                                      </button>
                                  </div>
                              </div>
                          </div>

                          <div className="grid gap-4">
                              {/* Google Gemini */}
                              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                                  <label className="block text-xs font-bold text-slate-300 mb-2">Google Gemini (Primary)</label>
                                  <input 
                                    type="password" 
                                    value={apiConfig.googleAIAPIKey || ''} 
                                    onChange={e => setApiConfig({...apiConfig, googleAIAPIKey: e.target.value})} 
                                    className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none placeholder-slate-600" 
                                    placeholder="API Key (AIza...)" 
                                  />
                              </div>

                              {/* OpenAI */}
                              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                                  <label className="block text-xs font-bold text-slate-300 mb-2">OpenAI / Compatible</label>
                                  <div className="space-y-3">
                                      <input 
                                        type="password" 
                                        value={apiConfig.openAIAPIKey || ''} 
                                        onChange={e => setApiConfig({...apiConfig, openAIAPIKey: e.target.value})} 
                                        className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none placeholder-slate-600" 
                                        placeholder="API Key (sk-...)" 
                                      />
                                      <div className="grid grid-cols-2 gap-2">
                                          <input 
                                            type="text" 
                                            value={apiConfig.openAIBaseUrl || ''} 
                                            onChange={e => setApiConfig({...apiConfig, openAIBaseUrl: e.target.value})} 
                                            className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none placeholder-slate-600" 
                                            placeholder="Base URL" 
                                          />
                                          <input 
                                            type="text" 
                                            value={apiConfig.openAICustomModel || ''} 
                                            onChange={e => setApiConfig({...apiConfig, openAICustomModel: e.target.value})} 
                                            className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-cyan-500 outline-none placeholder-slate-600" 
                                            placeholder="Model ID (e.g. gpt-4o)" 
                                          />
                                      </div>
                                  </div>
                              </div>

                               {/* DeepSeek */}
                              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                                  <label className="block text-xs font-bold text-slate-300 mb-2">DeepSeek (Nebius)</label>
                                  <div className="space-y-3">
                                      <input 
                                        type="password" 
                                        value={apiConfig.deepSeekAPIKey || ''} 
                                        onChange={e => setApiConfig({...apiConfig, deepSeekAPIKey: e.target.value})} 
                                        className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-purple-500 outline-none placeholder-slate-600" 
                                        placeholder="API Key" 
                                      />
                                      <input 
                                        type="text" 
                                        value={apiConfig.deepSeekBaseUrl || ''} 
                                        onChange={e => setApiConfig({...apiConfig, deepSeekBaseUrl: e.target.value})} 
                                        className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-purple-500 outline-none placeholder-slate-600" 
                                        placeholder="Base URL" 
                                      />
                                  </div>
                              </div>

                              {/* Ollama */}
                              <div className="bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                                  <label className="block text-xs font-bold text-slate-300 mb-2">Ollama (Local)</label>
                                  <div className="space-y-3">
                                      <div className="flex gap-2">
                                          <input 
                                            type="text" 
                                            value={apiConfig.ollamaHost || ''} 
                                            onChange={e => setApiConfig({...apiConfig, ollamaHost: e.target.value})} 
                                            className="flex-grow bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-orange-500 outline-none placeholder-slate-600" 
                                            placeholder="http://localhost:11434" 
                                          />
                                          <button 
                                            onClick={() => setApiConfig({...apiConfig, ollamaHost: 'http://localhost:3001/mcp/external_ai_bridge'})}
                                            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 text-xs rounded font-bold transition-colors whitespace-nowrap"
                                            title="Use the Kernel AI Bridge to bypass Mixed Content/CORS issues"
                                          >
                                            Use Bridge
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      </div>

                      {/* System Section (Moved Top for visibility of Immersive Mode) */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                              Experience & System
                          </h3>
                          
                          <div className="grid gap-3">
                               <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-white">Immersive Zen Mode</div>
                                      <div className="text-xs text-slate-500">Auto-hide menus for full-screen neurofeedback</div>
                                  </div>
                                  <input 
                                    type="checkbox" 
                                    checked={apiConfig.immersiveMode !== false} // Default true
                                    onChange={e => setApiConfig({...apiConfig, immersiveMode: e.target.checked})} 
                                    className="accent-cyan-500 h-4 w-4 cursor-pointer"
                                  />
                              </div>

                               <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-white">Protocol Generation</div>
                                      <div className="text-xs text-slate-500">Generation Strategy</div>
                                  </div>
                                  <select 
                                    value={apiConfig.protocolGenerationMode || 'script'} 
                                    onChange={e => setApiConfig({...apiConfig, protocolGenerationMode: e.target.value})}
                                    className="bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-1 focus:border-purple-500 outline-none"
                                  >
                                    <option value="script">Classic Script (React)</option>
                                    <option value="graph">Stream Graph (Vibecoder)</option>
                                  </select>
                              </div>

                              <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-white">Quantum Proxy</div>
                                      <div className="text-xs text-slate-500">Enable D-Wave simulation</div>
                                  </div>
                                  <input type="checkbox" checked={apiConfig.useQuantumSDR || false} onChange={e => setApiConfig({...apiConfig, useQuantumSDR: e.target.checked})} className="accent-purple-500 h-4 w-4"/>
                              </div>
                              
                              <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-white">Auto-Restore</div>
                                      <div className="text-xs text-slate-500">Resume last session on load</div>
                                  </div>
                                  <input type="checkbox" checked={apiConfig.autoRestoreSession || false} onChange={e => setApiConfig({...apiConfig, autoRestoreSession: e.target.checked})} className="accent-sky-500 h-4 w-4"/>
                              </div>

                              <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-white">Compute Backend</div>
                                      <div className="text-xs text-slate-500">DSP Processing Engine</div>
                                  </div>
                                  <select 
                                    value={apiConfig.computeBackend || 'gpu'} 
                                    onChange={e => setApiConfig({...apiConfig, computeBackend: e.target.value})}
                                    className="bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-1 focus:border-cyan-500 outline-none"
                                  >
                                    <option value="gpu">GPU (WebGL)</option>
                                    <option value="worker">CPU Worker</option>
                                    <option value="main">Main Thread</option>
                                  </select>
                              </div>
                          </div>
                      </div>

                      {/* Data & Storage Section */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-bold text-red-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                              Data & Storage
                          </h3>
                          <div className="grid gap-3">
                              <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-white">Persist App State</div>
                                      <div className="text-xs text-slate-500">Save settings & generated tools to LocalStorage</div>
                                  </div>
                                  <input 
                                    type="checkbox" 
                                    checked={!apiConfig.disablePersistence} 
                                    onChange={e => setApiConfig({...apiConfig, disablePersistence: !e.target.checked})} 
                                    className="accent-green-500 h-4 w-4 cursor-pointer"
                                  />
                              </div>
                              
                              <div className="flex items-center justify-between bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                                  <div>
                                      <div className="text-sm font-bold text-red-300">Clear Cache & Reset</div>
                                      <div className="text-xs text-slate-500">Wipe all local data (Factory Reset)</div>
                                  </div>
                                  <button 
                                    onClick={async () => {
                                        if (confirm("This will permanently delete all saved tools, settings, and data. Continue?")) {
                                            await runtime.tools.run('Factory Reset Protocols', {});
                                        }
                                    }}
                                    className="px-3 py-1.5 bg-red-900/50 hover:bg-red-800 border border-red-700 text-red-200 text-xs font-bold rounded transition-colors"
                                  >
                                      Clear Data
                                  </button>
                              </div>
                          </div>
                      </div>
                      
                      {/* Multimedia & IO Section */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-bold text-green-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                              Multimedia & IO
                          </h3>
                           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                               <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Image Gen</label>
                                  <select 
                                    value={apiConfig.imageModel || (imageModels[0] ? imageModels[0].id : '')} 
                                    onChange={e => setApiConfig({...apiConfig, imageModel: e.target.value})}
                                    className="w-full bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-2 focus:border-cyan-500 outline-none"
                                  >
                                    {imageModels.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                              </div>
                               <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Audio Input</label>
                                  <select 
                                    value={apiConfig.audioInputMode || (audioInputModes[0] ? audioInputModes[0].id : 'transcription')} 
                                    onChange={e => setApiConfig({...apiConfig, audioInputMode: e.target.value})}
                                    className="w-full bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-2 focus:border-cyan-500 outline-none"
                                  >
                                    {audioInputModes.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                              </div>
                               <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">TTS Engine</label>
                                  <select 
                                    value={apiConfig.ttsModel || (ttsModels[0] ? ttsModels[0].id : 'gemini-tts')} 
                                    onChange={e => setApiConfig({...apiConfig, ttsModel: e.target.value})}
                                    className="w-full bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-2 focus:border-cyan-500 outline-none"
                                  >
                                    {ttsModels.map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                  </select>
                              </div>
                           </div>
                      </div>
                  </div>
                  
                  {/* 3. Footer */}
                  <div className="shrink-0 p-4 border-t border-slate-800 bg-slate-900/80 flex justify-end">
                      <button 
                        onClick={() => setShowSettings(false)} 
                        className="px-6 py-2 bg-cyan-700 hover:bg-cyan-600 text-white rounded-md font-bold text-sm transition-colors shadow-lg"
                      >
                          Save & Close
                      </button>
                  </div>
              </div>
          </div>
      );
  }
`;
