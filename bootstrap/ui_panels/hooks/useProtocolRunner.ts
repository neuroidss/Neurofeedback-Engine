
export const USE_PROTOCOL_RUNNER_CODE = `
const useProtocolRunner = ({ runtime, activeDataSourceIds, connectedDevices, setConnectedDevices, setGlobalEegData }) => {
  const [runningProtocols, setRunningProtocols] = useState([]);
  const [processedDataMap, setProcessedDataMap] = useState({});
  const [rawData, setRawData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [authNeededDevice, setAuthNeededDevice] = useState(null);
  
  // Track active connections
  const webSocketManagerRef = useRef(new Map());
  const streamCharsRef = useRef(new Map()); // Stores BLE connection info
  const serialManagerRef = useRef(new Map()); // Map<deviceId, { port, reader, readableStreamClosed, writer }>

  const eegBufferRef = useRef({});
  const activeProcessorsRef = useRef(new Map()); 
  const asyncLoopControllerRef = useRef({ active: false });
  const simulationTimeRef = useRef(0);
  const channelMixRef = useRef({});
  const phaseLagRef = useRef(Math.PI / 3);
  
  // Performance & Threading Controls
  const processingLockRef = useRef(false); // Decouples ingestion from processing
  const lastTelemetryUpdateRef = useRef(0); // Throttles UI updates
  
  // To track which keys we expect to be full before processing a frame
  const activeChannelKeysRef = useRef([]);

  const DEVICE_CHANNEL_MAPS = {
    // Standard 10-20 locations for 8-channel devices
    'FreeEEG8': ['Fz', 'C3', 'Cz', 'C4', 'Pz', 'O1', 'Oz', 'O2'],
    'FreeEEG32': ['FP1', 'AF3', 'F7', 'F3', 'FC1', 'FC5', 'T7', 'C3', 'CP1', 'CP5', 'P7', 'P3', 'Pz', 'PO3', 'O1', 'Oz', 'O2', 'PO4', 'P4', 'P8', 'CP6', 'CP2', 'C4', 'T8', 'FC6', 'FC2', 'F4', 'F8', 'AF4', 'FP2', 'Fz', 'Cz'],
    'FreeEEG128': Array.from({length: 128}, (_, i) => 'CH' + (i+1))
  };
  
  // --- Helper: Robust Serial Cleanup ---
  const cleanupSerial = async (id) => {
      const m = serialManagerRef.current.get(id);
      if (!m) return;
      
      runtime.logEvent('[Player] Cleaning up serial connection for ' + id + '...');
      
      try {
          if (m.reader) {
              await m.reader.cancel().catch(e => console.warn("Serial reader cancel warning:", e));
              m.reader.releaseLock();
          }
          
          if (m.writer) {
              try {
                  await m.writer.write(new TextEncoder().encode("STREAM_OFF\\n"));
              } catch(e) { /* ignore */ }
              m.writer.releaseLock();
          }

          if (m.readableStreamClosed) {
              await m.readableStreamClosed.catch(() => { /* Ignore stream closing errors */ });
          }
          
          if (m.port) {
              await m.port.close().catch(e => console.warn("Port close warning:", e));
          }
          runtime.logEvent('[Player] Serial port closed successfully.');

      } catch(e) { 
          console.error('Serial cleanup error:', e);
          runtime.logEvent('[Player] Warning during serial cleanup: ' + e.message);
      } finally {
          serialManagerRef.current.delete(id);
      }
  };

  const processEEGFrame = async (eegDataSnapshot) => {
      setGlobalEegData(eegDataSnapshot);
      const results = {};
      const processors = activeProcessorsRef.current;
      
      if (processors.size === 0) return;

      const promises = [];
      const protocolIds = [];

      for (const [id, proc] of processors.entries()) {
          if (proc.isAsync) {
              promises.push(proc.processor.update(eegDataSnapshot, 250));
              protocolIds.push(id);
          } else {
              try {
                  results[id] = proc.processor(eegDataSnapshot, 250);
              } catch (e) {
                  runtime.logEvent('[Player] Error in protocol ' + id + ': ' + e.message);
              }
          }
      }

      if (promises.length > 0) {
          const asyncResults = await Promise.all(promises.map(p => p.catch(e => ({ error: e.message }))));
          asyncResults.forEach((res, idx) => {
              results[protocolIds[idx]] = res;
          });
      }

      setProcessedDataMap(prev => ({ ...prev, ...results }));
  };
  
  const checkAndProcessFrame = async () => {
      // 1. Threading Check: If the processor is busy, DROP THE FRAME.
      // This ensures the data ingestion loop (which feeds this function) never waits.
      if (processingLockRef.current) {
          return; 
      }

      const bufferSize = 256;
      const keys = activeChannelKeysRef.current;
      if (keys.length === 0) return;

      // Check if ALL active channels have enough data
      const allBuffersFull = keys.every(key => eegBufferRef.current[key] && eegBufferRef.current[key].length >= bufferSize);

      if (allBuffersFull) {
          try {
              processingLockRef.current = true;
              const eegDataSnapshot = {};
              keys.forEach(key => { 
                  // Take the snapshot
                  eegDataSnapshot[key] = [...eegBufferRef.current[key]]; 
                  
                  // ALIASING for simpler protocol access
                  if (key.includes(':')) {
                      const simpleName = key.split(':')[1];
                      if (!eegDataSnapshot[simpleName]) {
                           eegDataSnapshot[simpleName] = eegDataSnapshot[key];
                      }
                  }
              });
              await processEEGFrame(eegDataSnapshot);
          } catch(e) {
              console.error("Processing error", e);
          } finally {
              processingLockRef.current = false;
          }
      }
  };

  const updateTelemetryUI = (dataStr) => {
      const now = Date.now();
      if (now - lastTelemetryUpdateRef.current > 100) { // Throttle to 10fps max
          setRawData(dataStr);
          lastTelemetryUpdateRef.current = now;
      }
  };

  const ingestData = (deviceId, channelValues) => {
      const device = connectedDevices.find(d => d.id === deviceId);
      if (!device) return;
      
      const deviceType = device.deviceType || 'FreeEEG8';
      const channelMap = DEVICE_CHANNEL_MAPS[deviceType] || [];
      const bufferSize = 256;

      for (let i = 0; i < channelValues.length; i++) {
          const rawChName = channelMap[i] || 'CH' + (i + 1);
          
          const prefixedKey = \`\${deviceId}:\${rawChName}\`;
          const simpleKey = rawChName;
          
          // Decide where to store it based on what we are tracking
          let key = simpleKey;
          if (activeChannelKeysRef.current.includes(prefixedKey)) {
              key = prefixedKey;
          } else if (!activeChannelKeysRef.current.includes(simpleKey)) {
               if (activeChannelKeysRef.current.some(k => k.includes(':'))) {
                   key = prefixedKey;
               }
          }
          
          if (!eegBufferRef.current[key]) eegBufferRef.current[key] = [];
          eegBufferRef.current[key].push(channelValues[i]);
          if (eegBufferRef.current[key].length > bufferSize) eegBufferRef.current[key].shift();
      }
      
      // IMPORTANT: We do NOT await this. It runs detached.
      checkAndProcessFrame();
  };

  const startWebSocket = (device) => {
      const { id, ip, useWss } = device;
      if (webSocketManagerRef.current.has(id)) return;

      const protocol = useWss ? 'wss' : 'ws';
      const port = useWss ? 443 : 81; 
      const url = protocol + '://' + ip + ':' + port;
      
      const manager = { ws: null, retries: 0, maxRetries: 5, url };
      webSocketManagerRef.current.set(id, manager);

      const connect = () => {
          if (manager.retries >= manager.maxRetries) {
              runtime.logEvent('[Player] WS Max retries for ' + id);
              setConnectionStatus('Error: ' + id);
              return;
          }

          runtime.logEvent('[Player] Connecting to ' + url + ' ...');
          try {
              const ws = new WebSocket(manager.url);
              manager.ws = ws;

              ws.onopen = () => {
                  runtime.logEvent('[Player] WS Connected: ' + id);
                  manager.retries = 0;
                  setConnectionStatus('Connected');
                  setAuthNeededDevice(null);
                  setConnectedDevices(prev => prev.map(d => d.id === id ? { ...d, status: 'Active' } : d));
              };

              ws.onmessage = (event) => {
                  const data = event.data;
                  updateTelemetryUI(data);
                  const values = data.split(',').map(parseFloat);
                  if (values.length >= 9) {
                      ingestData(id, values.slice(1));
                  }
              };

              ws.onerror = (e) => {
                  if (useWss) {
                      runtime.logEvent('[Player] 🔒 WSS Connection blocked. User authorization required.');
                      setAuthNeededDevice({ id, ip, name: device.name });
                  }
              };

              ws.onclose = () => {
                  if (webSocketManagerRef.current.has(id)) {
                      manager.retries++;
                      setTimeout(connect, 2000);
                  }
              };
          } catch (e) {
              setConnectionStatus('Config Error');
          }
      };
      connect();
  };

  const connectBLE = async (device) => {
      if (streamCharsRef.current.has(device.id)) return;
      
      if (!device.bleDevice || !device.bleDevice.gatt) {
           runtime.logEvent('[Player] BLE Handle lost for ' + device.name);
           return;
      }
      
      try {
          runtime.logEvent('[Player] Connecting BLE to ' + device.name + '...');
          const server = await device.bleDevice.gatt.connect();
          
          const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
          const DATA_UUID = "beb54843-36e1-4688-b7f5-ea07361b26a8";
          const CMD_UUID = "beb54840-36e1-4688-b7f5-ea07361b26a8";

          const service = await server.getPrimaryService(SERVICE_UUID);
          const dataChar = await service.getCharacteristic(DATA_UUID);
          const cmdChar = await service.getCharacteristic(CMD_UUID);
          
          await dataChar.startNotifications();
          
          const onData = (event) => {
              const val = new TextDecoder().decode(event.target.value);
              updateTelemetryUI(val);
              const parts = val.split(',').map(parseFloat);
              if (parts.length >= 9) ingestData(device.id, parts.slice(1));
          };
          
          dataChar.addEventListener('characteristicvaluechanged', onData);
          
          streamCharsRef.current.set(device.id, { 
              server, dataChar, cmdChar, onData, device: device.bleDevice 
          });
          
          await cmdChar.writeValue(new TextEncoder().encode('BLE_STREAM_ON'));
          
          setConnectionStatus('BLE Connected');
          setConnectedDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: 'Active' } : d));
          runtime.logEvent('[Player] BLE Streaming started for ' + device.name);

      } catch (e) {
          runtime.logEvent('[Player] BLE Connect Failed: ' + e.message);
          setConnectionStatus('BLE Error');
      }
  };

  const startSerialConnection = async (device) => {
      if (serialManagerRef.current.has(device.id)) {
          setConnectedDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: 'Active' } : d));
          return;
      }
      if (!device.port) return;
      
      try {
          runtime.logEvent('[Player] Opening Serial Port for ' + device.name + '...');
          
          try {
               await device.port.open({ baudRate: 115200 });
          } catch(openError) {
              if (!openError.message.includes('already open')) throw openError;
          }
          
          const textDecoder = new TextDecoderStream();
          const readableStreamClosed = device.port.readable.pipeTo(textDecoder.writable);
          const reader = textDecoder.readable.getReader();
          const writer = device.port.writable.getWriter();
          
          serialManagerRef.current.set(device.id, { port: device.port, reader, readableStreamClosed, writer });
          
          await writer.write(new TextEncoder().encode("STREAM_ON\\n"));
          writer.releaseLock();
          
          setConnectionStatus('Serial Active');
          setConnectedDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: 'Active' } : d));
          runtime.logEvent('[Player] Serial streaming active for ' + device.name);
          
          let buffer = '';
          while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                  buffer += value;
                  const lines = buffer.split('\\n');
                  buffer = lines.pop();
                  
                  for (const line of lines) {
                      const trimmed = line.trim();
                      if (trimmed) {
                          if (!trimmed.startsWith('ACK:') && !trimmed.startsWith('BLE:')) {
                              updateTelemetryUI(trimmed);
                              const parts = trimmed.split(',').map(parseFloat);
                              if (parts.length >= 9 && !isNaN(parts[0])) {
                                  ingestData(device.id, parts.slice(1));
                              }
                          }
                      }
                  }
              }
          }
      } catch (e) {
          setConnectionStatus('Serial Error');
          setConnectedDevices(prev => prev.map(d => d.id === device.id ? { ...d, status: 'Error' } : d));
          runtime.logEvent('[Player] Serial Connection Failed: ' + e.message);
          await cleanupSerial(device.id);
      }
  };

  // Clean up all resources (sockets, serial, workers) but NOT persistence.
  // This is used for unmounting and stopping.
  const _cleanupResources = async () => {
    asyncLoopControllerRef.current.active = false;
    
    webSocketManagerRef.current.forEach(m => { if (m.ws) m.ws.close(); });
    webSocketManagerRef.current.clear();

    streamCharsRef.current.forEach(async ({ cmdChar, dataChar, onData, device }) => {
        try {
            if (cmdChar) await cmdChar.writeValue(new TextEncoder().encode('BLE_STREAM_OFF'));
            if (dataChar && onData) dataChar.removeEventListener('characteristicvaluechanged', onData);
            if (device && device.gatt.connected) device.gatt.disconnect();
        } catch(e) {}
    });
    streamCharsRef.current.clear();
    
    const serialIds = Array.from(serialManagerRef.current.keys());
    for (const id of serialIds) { await cleanupSerial(id); }
    
    eegBufferRef.current = {};
    activeChannelKeysRef.current = [];
    activeProcessorsRef.current.clear();
    processingLockRef.current = false; 
    
    setRunningProtocols([]);
    setProcessedDataMap({});
    setRawData(null);
    setConnectionStatus('Stopped');
    setGlobalEegData(null);
    
    setConnectedDevices(prev => prev.map(d => activeDataSourceIds.includes(d.id) ? { ...d, status: 'Offline' } : d));
  };

  // User-initiated stop. Clears persistence.
  const stopAllProtocols = async () => {
      runtime.logEvent('[Player] Stopping all protocols.');
      // Clear persistence
      localStorage.removeItem('neurofeedback-last-protocol');
      await _cleanupResources();
  };

  const ensureDataStream = async (activeDevices) => {
      if (activeDevices.length === 0) return;
      
      const neededChannelKeys = [];
      const isMultiDevice = activeDevices.length > 1;
      
      activeDevices.forEach(d => {
          const map = DEVICE_CHANNEL_MAPS[d.deviceType] || DEVICE_CHANNEL_MAPS['FreeEEG8'];
          const count = d.channelCount || 8;
          for(let i=0; i<count; i++) {
              const chName = map[i] || 'CH'+(i+1);
              neededChannelKeys.push(isMultiDevice ? \`\${d.id}:\${chName}\` : chName);
          }
      });
      activeChannelKeysRef.current = neededChannelKeys;
      
      const simulators = activeDevices.filter(d => d.mode === 'simulator');
      if (simulators.length > 0 && !asyncLoopControllerRef.current.active) {
          runtime.logEvent('[Player] Starting Simulation Loop.');
          setConnectionStatus('Simulating (' + simulators.length + ')');
          asyncLoopControllerRef.current.active = true;
          
          const updateSim = async () => {
              const samplesToGenerate = 10; // 250Hz simulation
              for (let s = 0; s < samplesToGenerate; s++) {
                  phaseLagRef.current += (Math.random() - 0.5) * 0.05;
                  const sourceA = Math.sin(simulationTimeRef.current) * 50;
                  const sourceB = Math.sin(simulationTimeRef.current + phaseLagRef.current) * 50;
                  
                  simulators.forEach(sim => {
                       const channelMap = DEVICE_CHANNEL_MAPS[sim.deviceType] || [];
                       const vals = [];
                       for(let i=0; i<sim.channelCount; i++) {
                           const chName = channelMap[i] || 'CH'+(i+1);
                           const key = isMultiDevice ? \`\${sim.id}:\${chName}\` : chName;
                           if (!channelMixRef.current[key]) channelMixRef.current[key] = Math.random();
                           const mix = channelMixRef.current[key];
                           const noise = (Math.random() - 0.5) * 30;
                           vals.push((sourceA * mix + sourceB * (1 - mix)) + noise);
                       }
                       updateTelemetryUI(Date.now() + ',' + vals.map(v => v.toFixed(0)).join(','));
                       ingestData(sim.id, vals);
                  });
                  simulationTimeRef.current += (2 * Math.PI * 10) / 250; 
              }
          };
          const loop = async () => {
              if (!asyncLoopControllerRef.current.active) return;
              await updateSim();
              if (asyncLoopControllerRef.current.active) setTimeout(loop, 40); 
          };
          loop();
      }
      
      activeDevices.forEach(d => {
          if (d.mode === 'wifi') startWebSocket(d);
          if (d.mode === 'ble') connectBLE(d); 
          if (d.mode === 'serial') startSerialConnection(d);
      });
  };

  const toggleProtocol = async (protocol) => {
    if (!protocol) return;

    if (activeProcessorsRef.current.has(protocol.id)) {
        activeProcessorsRef.current.delete(protocol.id);
        setRunningProtocols(prev => prev.filter(p => p.id !== protocol.id));
        setProcessedDataMap(prev => { const n = { ...prev }; delete n[protocol.id]; return n; });
        
        // If we just stopped the only protocol, shutdown resources AND clear persistence
        if (activeProcessorsRef.current.size === 0) {
             stopAllProtocols();
        }
        return;
    }

    runtime.logEvent('[Player] Launching: ' + protocol.name);
    // Save state for auto-restore
    localStorage.setItem('neurofeedback-last-protocol', protocol.id);

    const activeDevices = connectedDevices.filter(d => activeDataSourceIds.includes(d.id));
    if (activeDevices.length === 0) {
        runtime.logEvent('[Player] ERROR: No data sources selected.');
        return;
    }
    
    try {
        const fnOrFactory = eval('(' + protocol.processingCode + ')');
        let processor;
        let isAsync = false;

        if (typeof fnOrFactory !== 'function') throw new Error("Code is not a function.");
        if (fnOrFactory.length === 1) { processor = fnOrFactory(runtime); isAsync = true; } 
        else { processor = fnOrFactory; isAsync = false; }

        if (isAsync && (typeof processor?.update !== 'function')) throw new Error("Async processor missing update().");
        
        activeProcessorsRef.current.set(protocol.id, { processor, isAsync });
        setRunningProtocols(prev => [...prev, protocol]);
        ensureDataStream(activeDevices);

    } catch (e) {
        runtime.logEvent("[Player] Compilation Error: " + e.message);
    }
  };
  
  // Cleanup only resources on unmount, do not clear persistence
  useEffect(() => { return _cleanupResources; }, []);

  return {
    runningProtocols,
    processedDataMap,
    rawData,
    connectionStatus,
    authNeededDevice,
    setAuthNeededDevice,
    toggleProtocol,
    stopAllProtocols
  };
};
`