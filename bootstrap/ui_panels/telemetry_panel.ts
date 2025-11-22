
export const TELEMETRY_PANEL_CODE = `
  // --- Real-time Signal Monitoring ---
  const [signalStats, setSignalStats] = React.useState({ latency: 0, bufferHealth: 100, fps: 0 });
  
  React.useEffect(() => {
      if (!runtime.neuroBus) return;
      const handleSystemFrame = (frame) => {
          if (frame.type === 'Vision' && frame.payload && typeof frame.payload.fps === 'number') {
              setSignalStats(prev => ({ ...prev, fps: frame.payload.fps }));
          }
          // Heuristic for latency: difference between frame timestamp and now
          const latency = Date.now() - frame.timestamp;
          setSignalStats(prev => ({ ...prev, latency }));
      };
      const unsub = runtime.neuroBus.subscribe(handleSystemFrame);
      return unsub;
  }, [runtime]);

  const renderTelemetryPanel = () => (
      <div className="flex flex-col h-full space-y-2">
          
          {/* Device List (Max height 40% to avoid crushing stream) */}
          <div className="bg-slate-800/50 rounded border border-slate-700 flex flex-col flex-shrink-0 max-h-[40%] min-h-[120px] overflow-hidden">
              <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 flex justify-between items-center shrink-0">
                  <span className="text-xs font-bold text-slate-300">DEVICES</span>
                  <div className="flex gap-2">
                       <button onClick={() => setShowProvisioning(!showProvisioning)} className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded hover:bg-slate-600 transition-colors" title="Provision WiFi">Config WiFi</button>
                       <button onClick={deviceManager.handleAddBleDevice} disabled={!!deviceManager.bluetoothAvailabilityError} className="text-[10px] bg-cyan-900/50 text-cyan-400 px-2 py-0.5 rounded hover:bg-cyan-900 transition-colors">ADD BLE</button>
                       <button onClick={deviceManager.handleAddSerialDevice} className="text-[10px] bg-orange-900/50 text-orange-400 px-2 py-0.5 rounded hover:bg-orange-900 transition-colors" title="Connect via USB Serial">ADD USB</button>
                       <button onClick={deviceManager.handleAddCamera} className="text-[10px] bg-purple-900/50 text-purple-400 px-2 py-0.5 rounded hover:bg-purple-900 transition-colors" title="Add System Webcam">ADD CAM</button>
                  </div>
              </div>
              <div className="p-2 space-y-1 overflow-y-auto custom-scrollbar">
                  {showProvisioning && (
                      <div className="p-2 bg-slate-900/90 mb-2 rounded border border-purple-500/50 animate-fade-in">
                          <h4 className="text-[10px] font-bold text-purple-300 mb-2">Provision FreeEEG8 (WiFi via BLE)</h4>
                          <input type="text" placeholder="SSID" value={provisioning.provSsid} onChange={(e) => provisioning.setProvSsid(e.target.value)} className="w-full mb-1 text-xs bg-black border border-slate-700 rounded p-1 focus:border-purple-500 outline-none" />
                          <input type="password" placeholder="Password" value={provisioning.provPassword} onChange={(e) => provisioning.setProvPassword(e.target.value)} className="w-full mb-2 text-xs bg-black border border-slate-700 rounded p-1 focus:border-purple-500 outline-none" />
                          <button onClick={provisioning.handleStartProvisioning} disabled={provisioning.isProvisioningBusy} className="w-full text-xs bg-purple-700 hover:bg-purple-600 text-white py-1 rounded transition-colors">
                            {provisioning.isProvisioningBusy ? 'Provisioning...' : 'Connect & Config'}
                          </button>
                          {provisioning.provStatus && <p className="text-[10px] text-slate-400 mt-1">{provisioning.provStatus}</p>}
                          {provisioning.provError && <p className="text-[10px] text-red-400 mt-1">{provisioning.provError}</p>}
                      </div>
                  )}
                  
                  {/* Dynamic Vision Source Entry */}
                  {visionState.active && (
                      <div className="flex flex-col text-xs p-1.5 bg-purple-900/20 border border-purple-500/30 rounded mb-1 animate-fade-in">
                          <div className="flex items-center justify-between mb-1">
                              <div className="flex items-center gap-2">
                                  <div className={\`w-2 h-2 rounded-full \${visionState.data?.status === 'loading' ? 'bg-yellow-500 animate-ping' : 'bg-purple-500 animate-pulse'}\`}></div>
                                  <span className="text-purple-200 font-bold">Integrated Camera</span>
                                  <span className="text-[9px] text-purple-400 bg-purple-900/50 px-1 rounded">VISION</span>
                              </div>
                              <div className="text-[9px] text-purple-300 font-mono">
                                {visionState.data?.status === 'loading' ? 'INIT...' : 'ACTIVE'}
                              </div>
                          </div>
                          {visionState.data?.status === 'loading' && (
                              <div className="text-[9px] text-yellow-500 text-center py-1">{visionState.data.message || 'Loading...'}</div>
                          )}
                          {visionState.data && visionState.data.status !== 'loading' && (
                              <div className="grid grid-cols-3 gap-2 text-[9px] font-mono mt-1 border-t border-purple-800/50 pt-1">
                                  <div className="flex flex-col items-center bg-black/20 rounded p-0.5">
                                      <span className="text-purple-400 text-[8px]">SMILE</span>
                                      <span className="text-white font-bold">{(visionState.data.smile * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="flex flex-col items-center bg-black/20 rounded p-0.5">
                                      <span className="text-purple-400 text-[8px]">EYES</span>
                                      <span className="text-white font-bold">{(visionState.data.eyeOpen * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="flex flex-col items-center bg-black/20 rounded p-0.5">
                                      <span className="text-purple-400 text-[8px]">FPS</span>
                                      <span className="text-white font-bold">{signalStats.fps}</span>
                                  </div>
                              </div>
                          )}
                      </div>
                  )}

                  {deviceManager.connectedDevices.map(d => (
                      <div key={d.id} className="flex items-center justify-between text-xs p-1.5 bg-slate-700/30 rounded">
                          <div className="flex items-center gap-2">
                              <div className={\`w-2 h-2 rounded-full \${d.status === 'Active' || d.status === 'Ready' ? 'bg-green-500' : (d.status === 'Connecting...' ? 'bg-yellow-500' : 'bg-red-500')}\`}></div>
                              <span className="text-slate-300">{d.name}</span>
                              {d.mode === 'serial' && <span className="text-[9px] text-orange-400 bg-orange-900/30 px-1 rounded">USB</span>}
                              {d.deviceType === 'Camera' && <span className="text-[9px] text-purple-400 bg-purple-900/30 px-1 rounded">CAM</span>}
                              {d.deviceType === 'Microphone' && <span className="text-[9px] text-yellow-400 bg-yellow-900/30 px-1 rounded">MIC</span>}
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
                             <input type="checkbox" checked={deviceManager.activeDataSourceIds.includes(d.id)} onChange={() => deviceManager.handleToggleDataSource(d.id)} className="accent-cyan-500 cursor-pointer"/>
                          </div>
                      </div>
                  ))}
                   <div className="flex gap-1 mt-1">
                        <button onClick={() => deviceManager.handleAddSimulator('FreeEEG8')} className="flex-1 text-[10px] bg-slate-700/50 hover:bg-slate-600 text-slate-300 py-1 rounded transition-colors" title="Add EEG Simulator">+ Sim 8</button>
                        <button onClick={() => deviceManager.handleAddSimulator('Camera')} className="flex-1 text-[10px] bg-purple-900/20 hover:bg-purple-900/40 text-purple-300 py-1 rounded transition-colors border border-purple-900/50" title="Add Virtual Camera (Simulates Face Tracking)">+ Sim Cam</button>
                        <button onClick={() => deviceManager.handleAddSimulator('Microphone')} className="flex-1 text-[10px] bg-yellow-900/20 hover:bg-yellow-900/40 text-yellow-300 py-1 rounded transition-colors border border-yellow-900/50" title="Add Virtual Microphone">+ Sim Mic</button>
                   </div>
              </div>
          </div>

          {/* Signal Stream Monitor - Grows to fill */}
          <div className="bg-slate-800/50 rounded border border-slate-700 flex-grow flex flex-col min-h-0 overflow-hidden">
               <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 flex justify-between items-center shrink-0">
                  <span className="text-xs font-bold text-slate-300">SIGNAL STREAM</span>
                  <div className="flex gap-2 text-[9px] font-mono">
                      <span className={\`\${signalStats.latency < 50 ? 'text-green-400' : 'text-yellow-500'}\`}>
                          LAT: {signalStats.latency}ms
                      </span>
                  </div>
              </div>
              <div className="flex-grow p-2 bg-black/80 font-mono text-[10px] text-green-500 overflow-hidden relative">
                 <div className="absolute inset-0 p-2 overflow-y-auto custom-scrollbar">
                     {protocolRunner.connectionStatus && <div className="text-yellow-500 mb-1">STATUS: {protocolRunner.connectionStatus}</div>}
                     {protocolRunner.rawData ? (typeof protocolRunner.rawData === 'string' ? protocolRunner.rawData : JSON.stringify(protocolRunner.rawData)) : <span className="text-gray-600">No signal...</span>}
                 </div>
              </div>
          </div>
          
          {/* Vibecoder History (Fixed height, not flex-grow) */}
          {vibecoderHistory.length > 0 && (
              <div className="bg-slate-800/50 rounded border border-slate-700 h-32 flex-shrink-0 flex flex-col min-h-0">
                <div className="bg-slate-800 px-3 py-2 border-b border-slate-700 shrink-0">
                    <span className="text-xs font-bold text-purple-300">VIBECODER LOOPS</span>
                </div>
                <div className="flex-grow overflow-y-auto p-2 space-y-1 custom-scrollbar">
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
`;
