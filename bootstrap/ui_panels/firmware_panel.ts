
export const FIRMWARE_PANEL_CODE = `
  const renderFirmwarePanel = () => {
      const targetCount = selectedDevicesForFirmware.filter(d => d.ip && d.mode !== 'simulator').length;
      
      return (
         <div className="flex flex-col h-full space-y-2 text-xs">
            {/* Top Bar: Load Source / Copy */}
            <div className="flex-shrink-0 flex justify-between items-center bg-slate-800 px-3 py-2 rounded border border-slate-700">
                <button onClick={firmwareManager.loadFirmware} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-1 rounded text-xs font-bold transition-colors">Load Source</button>
                <button onClick={() => { navigator.clipboard.writeText(firmwareManager.firmwareCode); firmwareManager.loadFirmware(); }} className="text-slate-400 hover:text-white transition-colors">
                    <span className="flex items-center gap-1">
                        <PaperClipIcon className="h-3 w-3"/> Copy
                    </span>
                </button>
            </div>
            
            {/* Middle: Code Editor (Grows to fill space) */}
            <div className="flex-grow flex flex-col min-h-0 relative border border-slate-700 rounded bg-[#1e1e1e]">
                {firmwareManager.firmwareCode ? (
                    <textarea 
                        value={firmwareManager.firmwareCode} 
                        onChange={(e) => firmwareManager.setFirmwareCode(e.target.value)}
                        className="absolute inset-0 w-full h-full bg-transparent text-slate-300 font-mono text-[10px] p-2 outline-none resize-none custom-scrollbar"
                        spellCheck="false"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                        Click "Load Source" to view code
                    </div>
                )}
            </div>
            
            {/* Bottom: Controls (Auto height based on content, never hidden) */}
            <div className="flex-shrink-0 bg-slate-800 p-2 rounded border border-slate-700 flex flex-col gap-2">
                <div className="flex gap-2">
                    <input 
                        type="text" 
                        value={firmwareManager.deviceIp} 
                        onChange={(e) => firmwareManager.setDeviceIp(e.target.value)} 
                        className="flex-grow bg-slate-900 border border-slate-600 p-1.5 rounded text-slate-300 font-mono focus:border-cyan-500 outline-none" 
                        placeholder="Device IP"
                        title={targetCount > 1 ? \`Targeting \${targetCount} selected devices\` : "Target Device IP"}
                    />
                    <button onClick={firmwareManager.compile} disabled={firmwareManager.isBusy || !firmwareManager.firmwareCode} className="px-3 bg-blue-700 hover:bg-blue-600 rounded text-white transition-colors">Compile</button>
                    <button 
                        onClick={firmwareManager.flash} 
                        disabled={firmwareManager.isBusy || !firmwareManager.compiledPath} 
                        className={\`px-3 rounded text-white transition-colors \${targetCount > 1 ? 'bg-purple-800 hover:bg-purple-700 animate-pulse' : 'bg-purple-700 hover:bg-purple-600'}\`}
                        title={targetCount > 1 ? \`Flash to \${targetCount} devices\` : "Flash to single device"}
                    >
                        {targetCount > 1 ? \`Flash Swarm (\${targetCount})\` : 'Flash'}
                    </button>
                </div>
    
                 <div className="grid grid-cols-4 gap-2">
                    <button onClick={() => firmwareManager.handleViewArtifact('Source', '/source')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600 transition-colors" title="Read Source Code directly from Device">View Source</button>
                    <button onClick={() => firmwareManager.handleViewArtifact('Schematic', '/schematic')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600 transition-colors" title="Download Schematics from Device">Schematic</button>
                    <button onClick={() => firmwareManager.handleViewArtifact('PCB', '/pcb')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600 transition-colors" title="Download PCB Design from Device">PCB</button>
                    <button onClick={() => firmwareManager.handleViewArtifact('Manifest', '/manifest')} disabled={firmwareManager.isBusy} className="bg-slate-700 hover:bg-slate-600 text-slate-300 py-1 rounded text-[9px] border border-slate-600 transition-colors" title="View Device Manifest">Manifest</button>
                </div>
    
                {/* Mini Log Console */}
                <div className="h-24 bg-black/50 rounded p-1 font-mono text-gray-500 overflow-y-auto whitespace-pre-wrap text-[9px] custom-scrollbar border border-slate-900/50">
                    {firmwareManager.logs.length > 0 ? firmwareManager.logs.join('\\n') : "Ready."}
                </div>
            </div>
         </div>
      );
  }
`;
