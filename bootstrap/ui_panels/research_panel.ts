
export const RESEARCH_PANEL_CODE = `
  const renderModelSelector = () => {
      const allModels = [...models, ...ollamaModels].reduce((acc, model) => {
            if (model.provider) {
                acc[model.provider] = acc[model.provider] || [];
                acc[model.provider].push(model);
            }
            return acc;
        }, {});

      // Helper to generate unique key for selection state
      const getModelKey = (m) => m.provider + "::" + m.id;

      return (
        <div className="flex items-center gap-2 mb-3">
             <div className="flex-grow relative">
                <select 
                    value={getModelKey(selectedModel)} 
                    onChange={(e) => {
                        const [provider, id] = e.target.value.split("::");
                        const m = [...models, ...ollamaModels].find(m => m.id === id && m.provider === provider);
                        if(m) setSelectedModel(m);
                    }} 
                    disabled={isSwarmRunning} 
                    className="w-full bg-slate-900 border border-slate-700 rounded text-xs p-1.5 text-slate-300 focus:border-cyan-500 outline-none appearance-none cursor-pointer hover:border-slate-600 transition-colors"
                >
                    {Object.entries(allModels).map(([provider, group]) => (
                        <optgroup label={provider} key={provider}>
                            {group.map(model => (
                                <option key={getModelKey(model)} value={getModelKey(model)}>
                                    {model.name}
                                </option>
                            ))}
                        </optgroup>
                    ))}
                </select>
                <div className="absolute right-2 top-1.5 pointer-events-none text-slate-500">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
            </div>
            <button onClick={fetchOllamaModels} disabled={ollamaState.loading || isSwarmRunning} className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 transition-colors" title="Refresh Models">
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
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:border-cyan-500 outline-none resize-none h-24 custom-scrollbar"
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

              <div className="flex-grow overflow-y-auto min-h-0 border-t border-slate-700 pt-2 custom-scrollbar">
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
`;
