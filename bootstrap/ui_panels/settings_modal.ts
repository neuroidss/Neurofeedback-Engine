
export const SETTINGS_MODAL_CODE = `
  // --- Modal Render ---
  const renderSettingsModal = () => {
      if (!showSettings) return null;
      return (
          // Overlay: Fixed, covers entire screen, centers content using Flexbox
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
              
              {/* Modal Container */}
              {/* Removed 'animate-fade-in-scale' because it contained a 'translate(-50%, -50%)' transform which conflicted with Flexbox centering. */}
              <div 
                  className="relative w-full max-w-2xl bg-[#0f172a] border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]"
                  style={{ animation: 'popIn 0.2s ease-out' }}
              >
                  {/* Style tag for local animation to avoid dependency on index.html's broken keyframes */}
                  <style>{\`
                    @keyframes popIn {
                      from { opacity: 0; transform: scale(0.95); }
                      to { opacity: 1; transform: scale(1); }
                    }
                  \`}</style>

                  {/* 1. Header - Fixed height */}
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
                  
                  {/* 2. Content - Scrollable */}
                  <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-slate-950/30">
                      
                      {/* AI Providers Section */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-bold text-cyan-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                              AI Providers
                          </h3>
                          
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
                                  <input 
                                    type="text" 
                                    value={apiConfig.ollamaHost || ''} 
                                    onChange={e => setApiConfig({...apiConfig, ollamaHost: e.target.value})} 
                                    className="w-full bg-black/40 border border-slate-700 rounded-md px-3 py-2 text-xs text-white focus:border-orange-500 outline-none placeholder-slate-600" 
                                    placeholder="http://localhost:11434" 
                                  />
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
                                    value={apiConfig.imageModel || 'imagen-4.0-generate-001'} 
                                    onChange={e => setApiConfig({...apiConfig, imageModel: e.target.value})}
                                    className="w-full bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-2 focus:border-cyan-500 outline-none"
                                  >
                                    <option value="imagen-4.0-generate-001">Imagen 4.0 (HQ)</option>
                                    <option value="gemini-2.5-flash-image">Flash Image</option>
                                  </select>
                              </div>
                               <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Audio Input</label>
                                  <select 
                                    value={apiConfig.audioInputMode || 'transcription'} 
                                    onChange={e => setApiConfig({...apiConfig, audioInputMode: e.target.value})}
                                    className="w-full bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-2 focus:border-cyan-500 outline-none"
                                  >
                                    <option value="transcription">Text Transcription</option>
                                    <option value="raw">Raw Audio</option>
                                  </select>
                              </div>
                               <div>
                                  <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">TTS Engine</label>
                                  <select 
                                    value={apiConfig.ttsModel || 'gemini-tts'} 
                                    onChange={e => setApiConfig({...apiConfig, ttsModel: e.target.value})}
                                    className="w-full bg-black/40 border border-slate-700 text-xs text-white rounded-md px-2 py-2 focus:border-cyan-500 outline-none"
                                  >
                                    <option value="gemini-tts">Gemini Cloud</option>
                                    <option value="browser">Browser (Offline)</option>
                                  </select>
                              </div>
                           </div>
                      </div>

                      {/* System Section */}
                      <div className="space-y-3">
                          <h3 className="text-xs font-bold text-purple-400 uppercase tracking-widest border-b border-slate-800/60 pb-2">
                              System
                          </h3>
                          
                          <div className="grid gap-3">
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
                  </div>
                  
                  {/* 3. Footer - Fixed height */}
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