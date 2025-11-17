export const PLAYER_PANEL_CODE = `
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isProvisioningBusy, setIsProvisioningBusy] = useState(false);
  const [provSsid, setProvSsid] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provError, setProvError] = useState('');
  const [provStatus, setProvStatus] = useState('');
  const [bluetoothAvailabilityError, setBluetoothAvailabilityError] = useState('');

  // --- Data Source & Connection Management ---
  const [connectionStatus, setConnectionStatus] = useState('');
  const webSocketManagerRef = useRef({ ws: null, retries: 0, maxRetries: 5, reconnectTimeout: null, intendedClose: false, url: '', protocol: null });
  const streamCharsRef = useRef(new Map());
  const eegBufferRef = useRef({});
  const runningProtocolRef = useRef(null);
  const asyncLoopControllerRef = useRef({ active: false });


  useEffect(() => { runningProtocolRef.current = runningProtocol; }, [runningProtocol]);

  const HARDWARE_CHANNEL_MAP = ['F3', 'F4', 'C3', 'C4', 'P3', 'P4', 'Cz', 'Fz'];

  const stopWebSocketSession = () => {
    const manager = webSocketManagerRef.current;
    if (!manager.ws) return;
    runtime.logEvent('[Player] Intentionally closing WebSocket session.');
    manager.intendedClose = true;
    if (manager.reconnectTimeout) clearTimeout(manager.reconnectTimeout);
    manager.ws.onopen = manager.ws.onmessage = manager.ws.onerror = manager.ws.onclose = null;
    if (manager.ws.readyState === 0 || manager.ws.readyState === 1) manager.ws.close();
    webSocketManagerRef.current = { ...webSocketManagerRef.current, ws: null };
    setConnectionStatus('');
  };

  const startWebSocketSession = (url, protocol, processor, isAsync) => {
    if (webSocketManagerRef.current.ws) {
        runtime.logEvent('[Player] WebSocket session already exists. Closing old one.');
        stopWebSocketSession();
    }
    
    runtime.logEvent(\`[Player] Attempting to connect to WebSocket: \${url}\`);
    setConnectionStatus(\`Connecting to \${url}...\`);
    const newWs = new WebSocket(url);
    const manager = webSocketManagerRef.current;
    manager.ws = newWs;
    manager.intendedClose = false;
    manager.retries = 0;
    manager.url = url;
    manager.protocol = protocol;

    newWs.onopen = () => {
        runtime.logEvent('[Player] ✅ WebSocket connection established.');
        setConnectionStatus('Connected via Wi-Fi');
        manager.retries = 0;
        if (manager.reconnectTimeout) clearTimeout(manager.reconnectTimeout);
    };

    newWs.onmessage = async (event) => {
        setRawData(event.data);
        const dataPoints = event.data.split(',').map(Number);
        if (dataPoints.length < 9) return; // Expect timestamp + 8 channels

        const requiredChannels = protocol.dataRequirements.channels;
        const incomingChannels = dataPoints.slice(1);
        
        HARDWARE_CHANNEL_MAP.forEach((chName, idx) => {
            if (requiredChannels.includes(chName) && eegBufferRef.current[chName]) {
                eegBufferRef.current[chName].push(incomingChannels[idx]);
                if (eegBufferRef.current[chName].length > 256) eegBufferRef.current[chName].shift();
            }
        });
        
        const isBufferReady = requiredChannels.every(ch => eegBufferRef.current[ch]?.length === 256);

        if (isBufferReady) {
            try {
                if (runningProtocolRef.current?.id === protocol.id) {
                    const newData = isAsync ? await processor.update(eegBufferRef.current, 256) : processor(eegBufferRef.current, 256);
                    setProcessedData(newData);
                }
            } catch (e) {
                runtime.logEvent(\`[Player] ERROR executing processingCode from WebSocket data: \${e.message}\`);
                stopRunningProtocol();
            }
        }
    };

    newWs.onerror = (event) => {
        runtime.logEvent(\`[Player] ❌ WebSocket error: \${event.type}\`);
        setConnectionStatus(\`Error: Connection failed.\`);
    };

    newWs.onclose = () => {
        if (manager.intendedClose) {
            runtime.logEvent('[Player] WebSocket connection closed by user.');
        } else {
            runtime.logEvent('[Player] WebSocket connection lost. Attempting to reconnect...');
            setConnectionStatus('Reconnecting...');
            if (manager.retries < manager.maxRetries) {
                manager.retries++;
                manager.reconnectTimeout = setTimeout(() => startWebSocketSession(manager.url, manager.protocol, processor, isAsync), 2000 * manager.retries);
            } else {
                runtime.logEvent('[Player] ❌ Max WebSocket reconnect attempts reached. Stopping protocol.');
                stopRunningProtocol();
            }
        }
    };
  };

  const stopRunningProtocol = () => {
    if (!runningProtocolRef.current) return;
    const protocolName = runningProtocolRef.current.name;
    
    runtime.logEvent(\`[Player] Stopped protocol: \${protocolName}\`);
    if (eegIntervalId) clearInterval(eegIntervalId);
    asyncLoopControllerRef.current.active = false;
    setEegIntervalId(null);
    
    stopWebSocketSession();

    const activeDevice = connectedDevices.find(d => d.id === activeDataSourceId);
    if (activeDevice && activeDevice.mode === 'ble') {
        const streamChars = streamCharsRef.current.get(activeDevice.id);
        if (streamChars && streamChars.dataChar) {
            streamChars.dataChar.oncharacteristicvaluechanged = null;
        }
    }
    
    setRunningProtocol(null);
    setProcessedData(null);
    setRawData(null);
    
    if (activeDevice?.mode !== 'ble') {
        setConnectionStatus('');
    }
  };
  
  const handleRunProtocol = (protocol) => {
    if (runningProtocolRef.current && runningProtocolRef.current.id === protocol.id) {
        stopRunningProtocol();
        return;
    }
    if (runningProtocolRef.current) stopRunningProtocol();
      
    setRunningProtocol(protocol);
    runtime.logEvent(\`[Player] Starting protocol: \${protocol.name}\`);
    
    const activeDevice = connectedDevices.find(d => d.id === activeDataSourceId);
    if (!activeDevice || (activeDevice.status !== 'Active' && activeDevice.status !== 'Ready')) {
        runtime.logEvent(\`[Player] ERROR: Active data source '\${activeDevice?.name || 'Unknown'}' is not online or ready.\`);
        setRunningProtocol(null);
        return;
    }

    if (!protocol.dataRequirements || !protocol.processingCode) {
        runtime.logEvent(\`[Player] WARN: Protocol '\${protocol.name}' is missing execution info.\`);
        setRunningProtocol(null);
        return;
    }
    
    eegBufferRef.current = {};
    protocol.dataRequirements.channels.forEach(ch => eegBufferRef.current[ch] = []);

    let processor;
    let isAsync = false;
    try {
        const processorFactory = (0, eval)(protocol.processingCode.trim());
        // For async protocols, the factory itself needs the runtime to pass down.
        if (typeof processorFactory === 'function' && processorFactory.length > 0) {
            processor = processorFactory(runtime);
            if (processor && typeof processor.update === 'function') {
                isAsync = true;
                runtime.logEvent('[Player] Detected async processing protocol.');
            } else {
                // If it took runtime but didn't return an update function, treat as sync
                processor = processorFactory;
                isAsync = false;
            }
        } else {
             // For simple sync functions or async factories that don't need runtime
            processor = processorFactory();
             if (processor && typeof processor.update === 'function') {
                isAsync = true;
                runtime.logEvent('[Player] Detected async processing protocol.');
             } else {
                processor = processorFactory;
             }
        }

    } catch(e) {
        runtime.logEvent(\`[Player] FATAL ERROR: Could not eval processingCode. \${e.message}\`);
        stopRunningProtocol();
        return;
    }


    if (activeDataSourceId === 'simulator') {
        if(isAsync) {
            asyncLoopControllerRef.current.active = true;
            const runAsyncLoop = async () => {
                if (!asyncLoopControllerRef.current.active) return;
                try {
                    const mockEegChannels = {};
                    protocol.dataRequirements.channels.forEach(ch => { mockEegChannels[ch] = Array.from({ length: 256 }, () => Math.random() * 2 - 1); });
                    const newData = await processor.update(mockEegChannels, 256);
                    if (asyncLoopControllerRef.current.active) setProcessedData(newData);
                } catch(e) {
                     runtime.logEvent(\`[Player] ERROR executing async processingCode: \${e.message}\`);
                     if (asyncLoopControllerRef.current.active) stopRunningProtocol();
                }
                if (asyncLoopControllerRef.current.active) setTimeout(runAsyncLoop, 500);
            };
            runAsyncLoop();
        } else {
            const intervalId = setInterval(() => {
                try {
                    const mockEegChannels = {};
                    protocol.dataRequirements.channels.forEach(ch => { mockEegChannels[ch] = Array.from({ length: 256 }, () => Math.random() * 2 - 1); });
                    const newData = processor(mockEegChannels, 256);
                    setProcessedData(newData);
                    setRawData(JSON.stringify(mockEegChannels['Cz']?.slice(0, 8) || []).slice(1,-1));
                } catch (e) {
                    runtime.logEvent(\`[Player] ERROR executing processingCode: \${e.message}\`);
                    stopRunningProtocol();
                }
            }, 500);
            setEegIntervalId(intervalId);
        }
    } else if (activeDevice.mode === 'ble') {
        const runBleWithReconnect = async () => {
            try {
                // ... connection logic ...
                let deviceRef = deviceHandlesRef.current.get(activeDevice.id);
                if (!deviceRef) throw new Error("Device handle not found. Please connect first.");
                if (!deviceRef.handle.gatt.connected) {
                    server = await deviceRef.handle.gatt.connect();
                    deviceHandlesRef.current.set(activeDevice.id, { ...deviceRef, server });
                }
                
                // ... stream setup ...
                const dataChar = (await (async () => {
                    const existing = streamCharsRef.current.get(activeDevice.id);
                    if(existing) return existing.dataChar;
                    const service = await deviceRef.server.getPrimaryService("4fafc201-1fb5-459e-8fcc-c5c9c331914b");
                    const cmdChar = await service.getCharacteristic("beb54840-36e1-4688-b7f5-ea07361b26a8");
                    const dataChar = await service.getCharacteristic("beb54843-36e1-4688-b7f5-ea07361b26a8");
                    streamCharsRef.current.set(activeDevice.id, { cmdChar, dataChar });
                    await dataChar.startNotifications();
                    await cmdChar.writeValue(new TextEncoder().encode('BLE_STREAM_ON'));
                    return dataChar;
                })());
                
                dataChar.oncharacteristicvaluechanged = async (event) => {
                    const value = new TextDecoder().decode(event.target.value);
                    setRawData(value);
                    const dataPoints = value.split(',').map(Number);
                    if (dataPoints.length < 9) return;
                    
                    const requiredChannels = protocol.dataRequirements.channels;
                    const incomingChannels = dataPoints.slice(1);
                    HARDWARE_CHANNEL_MAP.forEach((chName, idx) => {
                        if (requiredChannels.includes(chName) && eegBufferRef.current[chName]) {
                            eegBufferRef.current[chName].push(incomingChannels[idx]);
                            if (eegBufferRef.current[chName].length > 256) eegBufferRef.current[chName].shift();
                        }
                    });
                    const ready = requiredChannels.every(ch => eegBufferRef.current[ch]?.length === 256);
                    if (ready) {
                        try {
                           if (runningProtocolRef.current?.id === protocol.id) {
                                const newData = isAsync ? await processor.update(eegBufferRef.current, 256) : processor(eegBufferRef.current, 256);
                                setProcessedData(newData);
                            }
                        } catch (e) {
                            runtime.logEvent(\`[Player] ERROR processing BLE data: \${e.message}\`);
                            stopRunningProtocol();
                        }
                    }
                };
                setConnectionStatus('Connected via BLE');
            } catch (e) {
                runtime.logEvent(\`[Player] ERROR starting BLE stream: \${e.message}\`);
                stopRunningProtocol();
            }
        };
        runBleWithReconnect();
    } else { // Wi-Fi logic
        const deviceIp = activeDevice.ip;
        if (!deviceIp) {
            runtime.logEvent(\`[Player] ERROR: Device '\${activeDevice.name}' is active but has no IP.\`);
            setRunningProtocol(null); return;
        }
        startWebSocketSession(\`ws://\${deviceIp}:81\`, protocol, processor, isAsync);
    }
  };

  useEffect(() => {
    if ('bluetooth' in navigator) return;
    const platform = navigator.platform || 'unknown';
    if (platform.toLowerCase().includes('linux')) setBluetoothAvailabilityError('Web Bluetooth may be disabled on Linux. Try enabling the flag at chrome://flags/#enable-experimental-web-platform-features');
    else setBluetoothAvailabilityError('Web Bluetooth API is not available on this browser. Please use Chrome or Edge.');
  }, []);

  const handleAddBleDevice = async () => {
    if (bluetoothAvailabilityError) {
        runtime.logEvent('[Device] ERROR: ' + bluetoothAvailabilityError);
        return;
    }
    try {
        runtime.logEvent('[Device] Requesting BLE device to add to the list...');
        const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
        const deviceHandle = await navigator.bluetooth.requestDevice({ 
            filters: [{ namePrefix: 'FreeEEG8' }],
            optionalServices: [SERVICE_UUID] 
        });
        if (!deviceHandle) {
            runtime.logEvent('[Device] No device selected.');
            return;
        }

        const newDevice = {
            id: deviceHandle.name,
            name: deviceHandle.name,
            status: 'Offline',
            ip: null,
            mode: 'ble',
            error: null
        };
        
        if (!connectedDevices.find(d => d.id === newDevice.id)) {
            setConnectedDevices(prev => [...prev, newDevice]);
            runtime.logEvent(\`[Device] Added new BLE device: \${newDevice.name}. You can now connect to it from the list.\`);
        } else {
            runtime.logEvent(\`[Device] Device \${newDevice.name} is already in the list.\`);
        }

    } catch (e) {
        runtime.logEvent(\`[Device] ERROR adding BLE device: \${e.message}\`);
    }
  };

  const handleConnectDevice = async (deviceId) => {
    const deviceToConnect = connectedDevices.find(d => d.id === deviceId);
    if (!deviceToConnect) return;

    if (deviceToConnect.mode === 'ble') {
        if (bluetoothAvailabilityError) {
            runtime.logEvent('[Device] ERROR: ' + bluetoothAvailabilityError);
            setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', error: bluetoothAvailabilityError } : d));
            return;
        }
        setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Connecting', error: null } : d));
        try {
            runtime.logEvent(\`[Device] Requesting BLE device handle for \${deviceToConnect.name}...\`);
            const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
            const deviceHandle = await navigator.bluetooth.requestDevice({ filters: [{ name: deviceToConnect.name }], optionalServices: [SERVICE_UUID] });
            if (!deviceHandle) throw new Error("User cancelled device selection.");
            
            runtime.logEvent(\`[Device] Establishing persistent GATT connection to \${deviceToConnect.name}...\`);
            const server = await deviceHandle.gatt.connect();
            deviceHandlesRef.current.set(deviceId, { handle: deviceHandle, server: server });

            deviceHandle.addEventListener('gattserverdisconnected', () => {
                runtime.logEvent(\`[Device] BLE device \${deviceToConnect.name} disconnected.\`);
                deviceHandlesRef.current.delete(deviceId);
                streamCharsRef.current.delete(deviceId); // Clean up stream refs on disconnect
                setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', ip: null, error: 'Device disconnected' } : d));
                if (activeDataSourceId === deviceId) {
                    if (runningProtocolRef.current) stopRunningProtocol();
                    setActiveDataSourceId('simulator');
                }
            });

            runtime.logEvent(\`[Device] BLE handle acquired for \${deviceToConnect.name}. Device is ready.\`);
            setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Ready' } : d));
        } catch (e) {
            runtime.logEvent(\`[Device] ERROR acquiring BLE handle for \${deviceToConnect.name}: \${e.message}\`);
            setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', error: e.message } : d));
        }
        return;
    }

    // Wi-Fi Connection Logic
    setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Connecting', error: null } : d));
    try {
        runtime.logEvent(\`[Device] Activating Wi-Fi for \${deviceToConnect.name}...\`);
        const result = await runtime.tools.run('Manage Device Connection', { command: 'WIFI_ON' });
        if (result.status === 'WIFI_ACTIVE' && result.ipAddress) {
            const deviceName = result.deviceName || deviceToConnect.name;
            runtime.logEvent(\`[Device] \${deviceName} is now active at IP: \${result.ipAddress}\`);
            setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, name: deviceName, status: 'Active', ip: result.ipAddress } : d));
        } else {
            throw new Error("Failed to activate Wi-Fi.");
        }
    } catch (e) {
        runtime.logEvent(\`[Device] ERROR connecting to \${deviceToConnect.name}: \${e.message}\`);
        setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', error: e.message } : d));
    }
  };

  const handleDisconnectDevice = async (deviceId) => {
      const deviceToDisconnect = connectedDevices.find(d => d.id === deviceId);
      if (!deviceToDisconnect) return;

      if (activeDataSourceId === deviceId) {
          if (runningProtocolRef.current) stopRunningProtocol();
          setActiveDataSourceId('simulator');
      }

      if (deviceToDisconnect.mode === 'ble') {
          const deviceRef = deviceHandlesRef.current.get(deviceId);
          if (deviceRef && deviceRef.handle.gatt.connected) {
              runtime.logEvent(\`[Device] Disconnecting from BLE device \${deviceToDisconnect.name}...\`);
              deviceRef.handle.gatt.disconnect(); // This will trigger the 'gattserverdisconnected' listener for state cleanup.
          } else {
              // Manually update state if already disconnected
              deviceHandlesRef.current.delete(deviceId);
              streamCharsRef.current.delete(deviceId);
              setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', ip: null, error: null } : d));
          }
          return;
      }
      
      setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Connecting' } : d));
      try {
          runtime.logEvent(\`[Device] Deactivating Wi-Fi for \${deviceToDisconnect.name}...\`);
          await runtime.tools.run('Manage Device Connection', { command: 'WIFI_OFF' });
          runtime.logEvent(\`[Device] \${deviceToDisconnect.name} is now offline.\`);
          setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', ip: null } : d));
      } catch (e) {
          runtime.logEvent(\`[Device] ERROR disconnecting from \${deviceToDisconnect.name}: \${e.message}. Forcing offline.\`);
          setConnectedDevices(prev => prev.map(d => d.id === deviceId ? { ...d, status: 'Offline', ip: null } : d));
      }
  };
  
  const handleSetActiveSource = (deviceId) => {
    if (activeDataSourceId === deviceId) return;
    if (runningProtocolRef.current) stopRunningProtocol();
    setActiveDataSourceId(deviceId);
    runtime.logEvent(\`[Player] Active data source set to: \${connectedDevices.find(d=>d.id===deviceId)?.name}\`);
  };

  const handleStartProvisioning = async () => {
    setIsProvisioningBusy(true);
    setProvError('');
    setProvStatus('Requesting Bluetooth device...');
    try {
        const result = await runtime.tools.run('Configure WiFi via Bluetooth', { ssid: provSsid, password: provPassword });
        setProvStatus(\`Success! Device '\${result.deviceName}' will now reboot. It has been added to your devices list.\`);
        const newDevice = {
            id: result.deviceName,
            name: result.deviceName,
            status: 'Offline',
            ip: null,
            mode: 'wifi'
        };
        if (!connectedDevices.find(d => d.id === newDevice.id)) {
            setConnectedDevices(prev => [...prev, newDevice]);
        }
        setTimeout(() => {
            setIsProvisioning(false);
            setIsProvisioningBusy(false);
        }, 3000);
    } catch (e) {
        setProvError(\`Provisioning failed: \${e.message}\`);
        setProvStatus('');
        setIsProvisioningBusy(false);
    }
  };

  const renderProvisioningModal = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center">
        <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold mb-4">Provision New Device via BLE</h3>
            {bluetoothAvailabilityError ? (
                 <p className="text-red-400 text-sm">{bluetoothAvailabilityError}</p>
            ) : (
                <form onSubmit={(e) => { e.preventDefault(); handleStartProvisioning(); }}>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-400">Wi-Fi Network (SSID)</label>
                            <input type="text" value={provSsid} onChange={e => setProvSsid(e.target.value)} required className="w-full mt-1 bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-400">Wi-Fi Password</label>
                            <input type="password" value={provPassword} onChange={e => setProvPassword(e.target.value)} required className="w-full mt-1 bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200" />
                        </div>
                        {provStatus && <p className="text-sm text-green-400">{provStatus}</p>}
                        {provError && <p className="text-sm text-red-400">{provError}</p>}
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={() => setIsProvisioning(false)} disabled={isProvisioningBusy} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg">Cancel</button>
                        <button type="submit" disabled={isProvisioningBusy || !provSsid} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg flex items-center gap-2 disabled:bg-slate-500">
                           {isProvisioningBusy && <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                           Start Provisioning
                        </button>
                    </div>
                </form>
            )}
        </div>
    </div>
  );

  const renderProtocolLibrary = () => (
    <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col flex-grow min-h-0">
        <div className="flex justify-between items-center mb-3 flex-shrink-0">
            <h2 className="text-xl font-bold text-violet-300">Protocol Library</h2>
            <div className="flex gap-2">
                 <button onClick={handleExport} className="text-xs px-2 py-1 bg-slate-700 hover:bg-slate-600 rounded-md">Export / Import</button>
                 <button onClick={() => { localStorage.removeItem('neurofeedback-engine-protocols-state'); localStorage.removeItem('neurofeedback-devices'); runtime.logEvent('[System] Cleared all caches. Please reload.'); window.location.reload(); }} className="text-xs px-2 py-1 bg-red-800/50 text-red-300 border border-red-700 rounded-md hover:bg-red-700/50" title="Reset all protocols and settings">Factory Reset</button>
            </div>
        </div>
        <div className="overflow-y-auto flex-grow space-y-2 pr-2">
            {protocolLibrary.map(proto => {
                const isSelected = selectedProtocol && selectedProtocol.id === proto.id;
                return (
                    <button 
                        key={proto.id} 
                        onClick={() => setSelectedProtocol(proto)}
                        className={\`w-full text-left p-3 rounded-md transition-colors \${isSelected ? 'bg-slate-600 ring-2 ring-violet-400' : 'bg-slate-700/50 hover:bg-slate-700'}\`}
                    >
                        <h4 className="font-semibold text-slate-200">{proto.name}</h4>
                    </button>
                );
            })}
        </div>
        {isImportExportVisible && (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-100 flex items-center justify-center">
                <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-2xl p-6">
                    <h3 className="text-lg font-bold mb-4">Export / Import Protocols</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-400">Exported JSON</label>
                            <textarea readOnly value={exportedJson} className="w-full h-32 mt-1 bg-slate-900 border border-slate-600 rounded-md p-2 text-xs font-mono"></textarea>
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-400">JSON to Import</label>
                            <textarea value={jsonToImport} onChange={(e) => setJsonToImport(e.target.value)} className="w-full h-32 mt-1 bg-slate-900 border border-slate-600 rounded-md p-2 text-xs font-mono"></textarea>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button onClick={() => setImportExportVisible(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg">Close</button>
                        <button onClick={handleImport} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg">Import</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );

  const renderDataSourcePanel = () => {
    const requirements = selectedProtocol?.dataRequirements;
    
    const handleModeChange = (deviceId, newMode) => {
        if(runningProtocolRef.current) stopRunningProtocol();
        const deviceRef = deviceHandlesRef.current.get(deviceId);
        if (deviceRef && deviceRef.handle.gatt.connected) {
             deviceRef.handle.gatt.disconnect();
        }
        setConnectedDevices(prev => prev.map(d => {
            if (d.id === deviceId) return { ...d, mode: newMode, status: 'Offline', ip: null, error: null };
            return d;
        }));
    };
    
    return (
        <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col flex-shrink-0">
            <h2 className="text-xl font-bold text-teal-300 mb-3">Data & Devices</h2>
            <div className="space-y-4">
                <div className="p-2 bg-slate-900/50 rounded-md border border-slate-700/80">
                  <h4 className="font-semibold text-sm text-slate-300">Protocol Requirements</h4>
                  {requirements ? (
                      <div className="text-xs font-mono text-slate-400 mt-1">
                          <p>Channels: {requirements.channels.join(', ')}</p>
                          <p>Metrics: {requirements.metrics.join(', ')}</p>
                      </div>
                  ) : <p className="text-xs text-slate-500 mt-1">No protocol selected.</p>}
                </div>
                <div>
                    <h3 className="font-semibold text-slate-300 mb-1">Data Sources</h3>
                    <div className="space-y-2">
                       {connectedDevices.map(device => {
                            const isDataSourceActive = device.id === activeDataSourceId;
                            const isConnecting = device.status === 'Connecting';
                            const isSimulator = device.id === 'simulator';
                            const isDeviceOnline = device.status === 'Active' || device.status === 'Ready';

                            return (
                                <div key={device.id} className={'p-3 rounded-md transition-all ' + (isDataSourceActive ? 'bg-slate-600/50 ring-2 ring-teal-400' : 'bg-slate-700/50')}>
                                    <div className="flex justify-between items-center">
                                        <div className="flex flex-col">
                                            <span className="text-slate-200">{device.name}</span>
                                            {device.ip && <span className="text-xs text-teal-400 font-mono">{device.ip}</span>}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {isDeviceOnline && !isDataSourceActive && (
                                                <button onClick={() => handleSetActiveSource(device.id)} className="text-xs px-2 py-1 bg-teal-700 hover:bg-teal-600 rounded-md">Activate</button>
                                            )}
                                            {isDataSourceActive && <span className="text-xs bg-green-800/70 text-green-200 px-2 py-0.5 rounded-full font-semibold">Active Source</span>}

                                            {!isSimulator && (
                                                isConnecting ? (
                                                    <span className="text-xs text-yellow-200 px-2 py-0.5 rounded-full flex items-center gap-1">...</span>
                                                ) : isDeviceOnline ? (
                                                     <button onClick={() => handleDisconnectDevice(device.id)} className="text-xs px-2 py-1 bg-red-800/70 hover:bg-red-700/70 text-red-200 rounded-md">Disconnect</button>
                                                ) : (
                                                    <button onClick={() => handleConnectDevice(device.id)} className="text-xs px-2 py-1 bg-cyan-700 hover:bg-cyan-600 rounded-md">Connect</button>
                                                )
                                            )}
                                        </div>
                                    </div>
                                    {!isSimulator && (
                                        <div className="flex items-center gap-2 text-xs mt-2 border-t border-slate-600/50 pt-2">
                                            <span className="text-slate-400">Mode:</span>
                                            <select value={device.mode} onChange={(e) => handleModeChange(device.id, e.target.value)} className="bg-slate-800 border-none rounded text-xs p-1 focus:ring-1 focus:ring-teal-400 focus:outline-none">
                                                <option value="wifi">Wi-Fi</option>
                                                <option value="ble">BLE</option>
                                            </select>
                                        </div>
                                    )}
                                    {device.status === 'Offline' && device.error && <p className="text-xs text-red-400 mt-2">Last Error: {device.error}</p>}
                                    {isDataSourceActive && !isSimulator && (device.mode === 'wifi' || device.mode === 'ble') && (
                                        <div className="mt-2 pt-2 border-t border-slate-600">
                                            <h5 className="text-xs font-semibold text-slate-400 mb-1">Device Configuration</h5>
                                            <div className="text-xs font-mono text-slate-400 bg-slate-800 p-2 rounded-md">
                                                <p>Channel Map (8 channels): F3, F4, C3, C4, P3, P4, Cz, Fz</p>
                                                <p className="mt-1 text-slate-500">Note: This is the assumed hardware channel order. The protocol will only use the channels it requires.</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="w-full mt-3 flex gap-2">
                        <button
                            onClick={handleAddBleDevice}
                            disabled={!!bluetoothAvailabilityError}
                            title={bluetoothAvailabilityError || "Add a device for direct BLE data streaming."}
                            className="flex-1 text-sm px-3 py-2 bg-slate-600/80 hover:bg-slate-500/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add BLE Device
                        </button>
                        <button
                            onClick={() => {
                                setProvError('');
                                setProvStatus('');
                                setProvSsid('');
                                setProvPassword('');
                                setIsProvisioning(true);
                            }}
                            disabled={!!bluetoothAvailabilityError}
                            title={bluetoothAvailabilityError || "Provision a new device with Wi-Fi credentials over BLE."}
                            className="flex-1 text-sm px-3 py-2 bg-slate-600/80 hover:bg-slate-500/80 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Provision Wi-Fi
                        </button>
                    </div>
                    {isProvisioning && renderProvisioningModal()}
                </div>
            </div>
        </div>
    );
  };

  const renderPlayer = () => {
    const isRunningThis = runningProtocol && selectedProtocol && runningProtocol.id === selectedProtocol.id;

    return (
        <div className="flex-[2] bg-slate-800/50 p-4 rounded-lg flex flex-col">
            <h2 className="text-xl font-bold text-cyan-300 mb-3">Protocol Player</h2>
            {selectedProtocol ? (
                <>
                    <div className="mb-4 p-3 bg-slate-700/30 rounded-md border border-slate-600/50">
                        <h3 className="font-bold text-lg text-slate-200">{selectedProtocol.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">{selectedProtocol.description}</p>
                    </div>
                    <div className="flex-grow bg-black rounded-md relative">
                        {runningProtocol && runningProtocol.id === selectedProtocol.id ? (
                            <UIToolRunner tool={runningProtocol} props={{ processedData, runtime }} />
                        ) : (
                             <div className="h-full w-full flex items-center justify-center">
                               <p className="text-slate-500">Waiting for EEG data...</p>
                             </div>
                        )}
                    </div>
                    <div className="mt-4 flex flex-col gap-2">
                       <div className="bg-black/40 rounded p-2 border border-slate-700">
                          <h4 className="text-xs font-mono text-slate-500">RAW DATA STREAM DEBUG</h4>
                          <p className="text-xs font-mono text-green-400 truncate">
                            {connectionStatus && \`[\${connectionStatus}] \`}
                            {rawData ? (typeof rawData === 'string' ? rawData : JSON.stringify(rawData)) : "No data received yet..."}
                          </p>
                       </div>
                        <button 
                            onClick={() => handleRunProtocol(selectedProtocol)}
                            className={\`w-full py-3 rounded-lg font-bold text-lg flex items-center justify-center gap-2 \${isRunningThis ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}\`}
                        >
                            {isRunningThis ? <StopIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                            {isRunningThis ? 'Stop Session' : 'Start Session'}
                        </button>
                    </div>
                </>
            ) : (
                <div className="flex-grow flex items-center justify-center">
                    <p className="text-slate-500">Select a protocol from the library to begin.</p>
                </div>
            )}
        </div>
    );
  };
`