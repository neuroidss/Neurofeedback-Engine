
export const SERVER_PANEL_CODE = `
  const renderServerPanel = () => {
      const { processes, stopProcess, refresh, selectedConsoleId, setSelectedConsoleId } = serverManager;
      
      // VIEW 1: CONSOLE / TERMINAL
      if (selectedConsoleId) {
          const activeProc = processes.find(p => p.processId === selectedConsoleId);
          const logs = activeProc ? activeProc.logs : ["Process not found or terminated."];
          const isPython = activeProc?.type === 'python';

          return (
              <div className="flex flex-col h-full bg-[#0a0a0a] rounded border border-slate-700 overflow-hidden">
                  {/* Terminal Header */}
                  <div className="flex justify-between items-center bg-slate-800 px-3 py-2 border-b border-slate-700 shrink-0">
                      <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedConsoleId(null)} className="text-slate-400 hover:text-white transition-colors" title="Back to List">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                          </button>
                          <span className="text-xs font-bold text-white font-mono">{selectedConsoleId}</span>
                          <span className={\`text-[9px] px-1.5 rounded \` + (isPython ? 'bg-yellow-900/50 text-yellow-300' : 'bg-green-900/50 text-green-300')}>
                              {isPython ? 'PYTHON' : 'NODE'}
                          </span>
                      </div>
                      <div className="flex gap-2 items-center">
                          <button 
                              onClick={() => serverManager.setAutoScroll(!serverManager.autoScroll)} 
                              className={\`text-[9px] px-2 py-1 rounded border transition-colors \` + (serverManager.autoScroll ? 'bg-cyan-900/50 text-cyan-400 border-cyan-700' : 'bg-slate-800 text-slate-500 border-slate-600')}
                              title="Toggle Auto-Scroll"
                          >
                              {serverManager.autoScroll ? 'SCROLL: ON' : 'SCROLL: OFF'}
                          </button>
                          <div className="w-px h-3 bg-slate-700 mx-1"></div>
                          <button onClick={refresh} className="text-[10px] text-cyan-400 hover:text-white">UPDATE</button>
                          <button onClick={() => stopProcess(selectedConsoleId)} className="text-[10px] text-red-400 hover:text-red-300">KILL</button>
                      </div>
                  </div>
                  
                  {/* Terminal Body */}
                  <div 
                    className="flex-grow overflow-y-auto p-3 font-mono text-[10px] bg-black custom-scrollbar" 
                    style={{ overflowAnchor: 'none' }}
                  >
                      {logs.length === 0 && <div className="text-slate-600 italic">Waiting for output...</div>}
                      {logs.map((line, i) => {
                          const isSys = line.includes('[INFO]') || line.includes('Start') || line.includes('ERR: INFO:') || line.includes('TF32 Precision');
                          const isErr = !isSys && (line.includes('ERR:') || line.includes('Error') || line.includes('Traceback') || line.includes('Exception') || line.includes('failed'));
                          
                          return (
                              <div key={i} className={\`break-words whitespace-pre-wrap mb-0.5 \` + (isErr ? 'text-red-400' : (isSys ? 'text-blue-300' : 'text-slate-300'))}>
                                  {line}
                              </div>
                          );
                      })}
                      {/* Shared Ref for Auto-Scroll */}
                      {serverManager.autoScroll && <div ref={terminalEndRef} style={{height: 1}} />}
                  </div>
              </div>
          );
      }

      // VIEW 2: PROCESS LIST
      return (
          <div className="flex flex-col h-full space-y-2">
              <div className="flex justify-between items-center bg-slate-800 px-3 py-2 rounded border border-slate-700 shrink-0">
                  <span className="text-xs font-bold text-slate-300">MANAGED PROCESSES (MCP)</span>
                  <button onClick={refresh} className="text-[10px] text-cyan-400 hover:text-white">REFRESH</button>
              </div>
              
              <div className="flex-grow overflow-y-auto space-y-2 custom-scrollbar">
                  {processes.length === 0 && (
                      <div className="text-center text-slate-500 text-xs py-4">
                          No managed processes running.
                          <br/>Server is {runtime.isServerConnected() ? 'Online' : 'Offline'}.
                      </div>
                  )}
                  
                  {processes.map(proc => {
                      const logs = proc.logs || [];
                      const cleanLogs = logs.filter(l => !l.includes('GET /health')).slice(-3);
                      const isPython = proc.type === 'python';
                      
                      return (
                          <div key={proc.processId} className="bg-slate-800/50 border border-slate-700 rounded p-2 flex flex-col gap-2 group hover:border-slate-600 transition-colors">
                              <div className="flex justify-between items-start">
                                  <div className="flex flex-col cursor-pointer" onClick={() => setSelectedConsoleId(proc.processId)}>
                                      <div className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                          <span className="text-xs font-bold text-slate-200 group-hover:text-cyan-300 transition-colors">{proc.processId}</span>
                                      </div>
                                      <div className="flex gap-2 mt-1 text-[9px] font-mono text-slate-400">
                                          <span className={\`\` + (isPython ? 'text-yellow-400' : 'text-green-400')}>{isPython ? 'PYTHON' : 'NODE'}</span>
                                          <span>PORT: {proc.port}</span>
                                          <span>UP: {proc.uptime.toFixed(0)}s</span>
                                      </div>
                                  </div>
                                  <div className="flex gap-1">
                                      <button 
                                          onClick={() => setSelectedConsoleId(proc.processId)}
                                          className="text-[9px] bg-slate-700 hover:bg-slate-600 text-white px-2 py-1 rounded border border-slate-600 transition-colors"
                                      >
                                          TERMINAL
                                      </button>
                                      <button 
                                          onClick={() => stopProcess(proc.processId)} 
                                          className="text-[9px] bg-red-900/30 text-red-400 px-2 py-1 rounded border border-red-900 hover:bg-red-900 hover:text-white transition-colors"
                                      >
                                          KILL
                                      </button>
                                  </div>
                              </div>
                              
                              <div 
                                  onClick={() => setSelectedConsoleId(proc.processId)}
                                  className="bg-black/40 rounded p-1.5 text-[9px] font-mono text-slate-400 border border-slate-700/50 overflow-hidden cursor-pointer hover:bg-black/60"
                              >
                                  {cleanLogs.length > 0 ? (
                                      cleanLogs.map((line, i) => (
                                          <div key={i} className="truncate opacity-80">{line}</div>
                                      ))
                                  ) : (
                                      <span className="italic opacity-50">No recent output...</span>
                                  )}
                              </div>
                          </div>
                      );
                  })}
              </div>
          </div>
      );
  };
`;
