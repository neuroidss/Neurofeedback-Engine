export const DATA_SOURCE_PANEL_CODE = `
  const renderProvisioningModal = ({provisioning}) => {
    if (!provisioning.isProvisioning) return null;

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center animate-fade-in">
        <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-lg p-6 text-slate-200">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-slate-100">Provision Device via BLE</h2>
            <button onClick={() => provisioning.setIsProvisioning(false)} className="p-1 rounded-full hover:bg-slate-700">
              <XCircleIcon className="h-8 w-8 text-slate-400" />
            </button>
          </div>
          <p className="text-sm text-slate-400 mb-4">Enter the Wi-Fi credentials you want to send to the device. The device must be in setup mode (flashing blue light).</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300">Wi-Fi SSID (Name)</label>
              <input 
                type="text" 
                value={provisioning.provSsid}
                onChange={(e) => provisioning.setProvSsid(e.target.value)}
                className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200"
                disabled={provisioning.isProvisioningBusy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300">Wi-Fi Password</label>
              <input 
                type="password" 
                value={provisioning.provPassword}
                onChange={(e) => provisioning.setProvPassword(e.target.value)}
                className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200"
                disabled={provisioning.isProvisioningBusy}
              />
            </div>
          </div>
          
          <div className="mt-4 p-2 bg-black/30 rounded-md text-center">
            <p className="text-sm font-mono text-cyan-300">{provisioning.provStatus || 'Awaiting input...'}</p>
            {provisioning.provError && <p className="text-sm font-mono text-red-400 mt-1">{provisioning.provError}</p>}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => provisioning.setIsProvisioning(false)} 
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg"
              disabled={provisioning.isProvisioningBusy}
            >
              Cancel
            </button>
            <button 
              type="button" 
              onClick={provisioning.handleStartProvisioning} 
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg flex items-center justify-center gap-2 disabled:bg-slate-500"
              disabled={provisioning.isProvisioningBusy}
            >
              {provisioning.isProvisioningBusy && <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              Start Provisioning
            </button>
          </div>
        </div>
      </div>
    );
  };
  
const renderDataSourcePanel = ({
  selectedProtocol,
  deviceManager,
  provisioning,
}) => {
    const requirements = selectedProtocol?.dataRequirements;
    
    return (
        <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col flex-shrink-0">
            <h2 className="text-xl font-bold text-teal-300 mb-3">Data &amp; Devices</h2>
            <div className="space-y-4">
                <div className="p-2 bg-slate-900/50 rounded-md border border-slate-700/80">
                  <h4 className="font-semibold text-sm text-slate-300">Protocol Requirements</h4>
                  {requirements ? (
                      <div className="text-xs font-mono text-slate-400 mt-1">
                          <p>Channels: {requirements.channels.length > 0 ? requirements.channels.join(', ') : 'All Available'}</p>
                          <p>Metrics: {requirements.metrics.join(', ')}</p>
                      </div>
                  ) : <p className="text-xs text-slate-500 mt-1">No protocol selected.</p>}
                </div>
                <div>
                    <h3 className="font-semibold text-slate-300 mb-1">Data Sources</h3>
                    <div className="space-y-2">
                       {deviceManager.connectedDevices.map(device => {
                            const isSelected = deviceManager.activeDataSourceIds.includes(device.id);
                            const isHardware = device.mode !== 'simulator';
                            const isSimulator = device.mode === 'simulator';

                            return (
                                <div key={device.id} className={\`p-3 rounded-md transition-all \${isSelected ? 'bg-slate-600/50 ring-2 ring-teal-400' : 'bg-slate-700/50'}\`}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                onChange={() => deviceManager.handleToggleDataSource(device.id)}
                                                className="h-5 w-5 rounded bg-slate-800 border-slate-600 text-teal-500 focus:ring-teal-500"
                                            />
                                            <div className="flex flex-col">
                                                <span className="text-slate-200">{device.name}</span>
                                                <div className="flex items-center gap-2">
                                                    {device.ip && <span className="text-xs text-teal-400 font-mono">{device.ip}</span>}
                                                    {device.channelCount && <span className="text-xs text-slate-500 font-mono">({device.channelCount} ch)</span>}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {(isSimulator && deviceManager.connectedDevices.length > 1) && <button onClick={() => deviceManager.handleRemoveDevice(device.id)} className="text-xs text-red-300 hover:text-red-200" title="Remove Simulator">✖</button>}
                                            {isHardware && <button onClick={() => deviceManager.handleRemoveDevice(device.id)} className="text-xs text-red-300 hover:text-red-200" title="Remove Device">✖</button>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="w-full mt-3 flex gap-2">
                        <div className="flex-1 text-sm bg-slate-600/80 hover:bg-slate-500/80 rounded-md relative group">
                            <button className="w-full px-3 py-2 text-center">Add Simulator</button>
                            <div className="absolute bottom-full mb-1 left-0 w-full bg-slate-700 rounded-md shadow-lg p-1 hidden group-hover:block z-10">
                                <a href="#" onClick={(e) => { e.preventDefault(); deviceManager.handleAddSimulator('FreeEEG8'); }} className="block px-2 py-1 text-xs hover:bg-slate-600 rounded">FreeEEG8 (8 ch)</a>
                                <a href="#" onClick={(e) => { e.preventDefault(); deviceManager.handleAddSimulator('FreeEEG32'); }} className="block px-2 py-1 text-xs hover:bg-slate-600 rounded">FreeEEG32 (32 ch)</a>
                                <a href="#" onClick={(e) => { e.preventDefault(); deviceManager.handleAddSimulator('FreeEEG128'); }} className="block px-2 py-1 text-xs hover:bg-slate-600 rounded">FreeEEG128 (128 ch)</a>
                            </div>
                        </div>
                        <button onClick={deviceManager.handleAddBleDevice} disabled={!!deviceManager.bluetoothAvailabilityError} title={deviceManager.bluetoothAvailabilityError} className="flex-1 text-sm px-3 py-2 bg-slate-600/80 hover:bg-slate-500/80 rounded-md disabled:opacity-50">Add BLE</button>
                        <button onClick={() => provisioning.setIsProvisioning(true)} disabled={!!deviceManager.bluetoothAvailabilityError} title={deviceManager.bluetoothAvailabilityError} className="flex-1 text-sm px-3 py-2 bg-slate-600/80 hover:bg-slate-500/80 rounded-md disabled:opacity-50">Provision</button>
                    </div>
                    {provisioning.isProvisioning && renderProvisioningModal({provisioning})}
                </div>
            </div>
        </div>
    );
  };
`