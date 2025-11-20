
export const LIBRARY_PANEL_CODE = `
  const renderLibraryPanel = () => (
      <div className="flex flex-col h-full">
          <div className="flex-grow overflow-y-auto min-h-0 space-y-2 custom-scrollbar">
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
          <div className="flex-shrink-0 pt-4 border-t border-slate-700 mt-2 space-y-3">
               <button onClick={() => protocolRunner.stopAllProtocols()} className="w-full py-2 bg-red-900/80 hover:bg-red-800 text-white text-xs font-bold rounded shadow-sm transition-colors">
                   STOP ALL SESSIONS
               </button>
               
               {/* Exchange Section */}
               <div>
                   <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Exchange Protocols</h4>
                   <div className="flex gap-2">
                      <button onClick={handleImportClick} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Import JSON</button>
                      <button onClick={handleExportLibrary} className="flex-1 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded border border-slate-700 transition-colors">Export Library</button>
                  </div>
               </div>
               
               {/* System Section */}
               <div>
                   <button 
                        onClick={handleFactoryReset} 
                        className="w-full py-2 bg-transparent hover:bg-red-900/20 text-xs text-red-500 rounded border border-red-900/50 transition-colors mt-2"
                   >
                        Factory Reset
                   </button>
               </div>
          </div>
      </div>
  );
`;
