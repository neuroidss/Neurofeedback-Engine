
export const USE_PROTOCOL_RUNNER_CODE = `
const useProtocolRunner = ({ runtime, activeDataSourceIds, connectedDevices, setConnectedDevices, selectedProtocol }) => {
  const [runningProtocol, setRunningProtocol] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [rawData, setRawData] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [eegIntervalId, setEegIntervalId] = useState(null);

  const webSocketManagerRef = useRef({ ws: null, retries: 0, maxRetries: 5, reconnectTimeout: null, intendedClose: false, url: '', protocol: null });
  const streamCharsRef = useRef(new Map());
  const eegBufferRef = useRef({});
  const runningProtocolRef = useRef(null);
  const asyncLoopControllerRef = useRef({ active: false });
  const simulationTimeRef = useRef(0);
  const channelMixRef = useRef({});
  const phaseLagRef = useRef(Math.PI / 3);

  useEffect(() => { runningProtocolRef.current = runningProtocol; }, [runningProtocol]);

  const DEVICE_CHANNEL_MAPS = {
    'FreeEEG8': ['Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4', 'P3', 'P4'],
    'FreeEEG32': ['FP1', 'AF3', 'F7', 'F3', 'FC1', 'FC5', 'T7', 'C3', 'CP1', 'CP5', 'P7', 'P3', 'Pz', 'PO3', 'O1', 'Oz', 'O2', 'PO4', 'P4', 'P8', 'CP6', 'CP2', 'C4', 'T8', 'FC6', 'FC2', 'F4', 'F8', 'AF4', 'FP2', 'Fz', 'Cz'],
    'FreeEEG128': Array.from({length: 128}, (_, i) => \`CH\${i+1}\`)
  };
  
  const stopWebSocketSession = () => {
    const manager = webSocketManagerRef.current;
    if (!manager.ws) return;
    runtime.logEvent(\`[Player] Intentionally closing WebSocket session.\`);
    manager.intendedClose = true;
    if (manager.reconnectTimeout) clearTimeout(manager.reconnectTimeout);
    manager.ws.onopen = manager.ws.onmessage = manager.ws.onerror = manager.ws.onclose = null;
    if (manager.ws.readyState === WebSocket.OPEN || manager.ws.readyState === WebSocket.CONNECTING) manager.ws.close();
    webSocketManagerRef.current = { ...webSocketManagerRef.current, ws: null, retries: 0 };
    setConnectionStatus('');
  };

  const startWebSocketSession = (url, protocol, processor, isAsync) => {
    stopWebSocketSession();
    const manager = webSocketManagerRef.current;
    manager.intendedClose = false;
    manager.url = url;
    manager.protocol = protocol;
    manager.retries = 0;

    const connect = () => {
        if (manager.intendedClose || manager.retries >= manager.maxRetries) {
            runtime.logEvent(\`[Player] WebSocket: Max retries reached for \${manager.url}. Aborting.\`);
            stopRunningProtocol();
            return;
        }

        const ws = new WebSocket(manager.url);
        manager.ws = ws;

        ws.onopen = () => {
            runtime.logEvent(\`[Player] WebSocket connection opened to \${manager.url}\`);
            setConnectionStatus('Connected');
            manager.retries = 0;
        };

        ws.onmessage = async (event) => {
            if (!runningProtocolRef.current) return;
            const data = event.data;
            setRawData(data);
            const values = data.split(',');
            if (values.length < 9) return;
            
            const bufferSize = 256;
            const channelMap = DEVICE_CHANNEL_MAPS['FreeEEG8'];

            // 1. Append new samples to buffer
            for (let i = 0; i < 8; i++) {
                const channelName = channelMap[i];
                if (!eegBufferRef.current[channelName]) {
                    eegBufferRef.current[channelName] = [];
                }
                eegBufferRef.current[channelName].push(parseFloat(values[i + 1]));
                if (eegBufferRef.current[channelName].length > bufferSize) {
                    eegBufferRef.current[channelName].shift();
                }
            }
            
            // 2. Check if all buffers are full and process
            const allBuffersFull = channelMap.every(ch => eegBufferRef.current[ch] && eegBufferRef.current[ch].length === bufferSize);

            if(allBuffersFull) {
                const eegDataSnapshot = {};
                channelMap.forEach(ch => { eegDataSnapshot[ch] = [...eegBufferRef.current[ch]]; });
                
                try {
                  if (isAsync) {
                      const result = await processor.update(eegDataSnapshot, 250);
                      if (runningProtocolRef.current?.id === protocol.id) setProcessedData(result);
                  } else {
                      const result = processor(eegDataSnapshot, 250);
                      if (runningProtocolRef.current?.id === protocol.id) setProcessedData(result);
                  }
                } catch(e) {
                    runtime.logEvent(\`[Player] Processor Error: \${e.message}\`);
                    stopRunningProtocol();
                }
            }
        };

        ws.onerror = (error) => {
            runtime.logEvent(\`[Player] WebSocket error: An unknown error occurred.\`);
        };

        ws.onclose = (event) => {
            if (manager.intendedClose) return;
            manager.retries++;
            const timeout = Math.min(1000 * Math.pow(2, manager.retries), 10000);
            runtime.logEvent(\`[Player] WebSocket disconnected. Attempting reconnect #\${manager.retries} in \${timeout / 1000}s...\`);
            setConnectionStatus(\`Reconnecting (\${manager.retries})...\`);
            manager.reconnectTimeout = setTimeout(connect, timeout);
        };
    };
    connect();
  };

  const stopRunningProtocol = () => {
    if (!runningProtocolRef.current) return;
    const protocolName = runningProtocolRef.current.name;
    
    runtime.logEvent(\`[Player] Stopped protocol: \${protocolName}\`);
    if (eegIntervalId) clearInterval(eegIntervalId);
    asyncLoopControllerRef.current.active = false;
    
    stopWebSocketSession();

    const activeBleDevices = connectedDevices.filter(d => activeDataSourceIds.includes(d.id) && d.mode === 'ble');
    for (const bleDevice of activeBleDevices) {
        const streamInfo = streamCharsRef.current.get(bleDevice.id);
        if (streamInfo) {
            const { cmdChar, bleDeviceHandle } = streamInfo;
            if(cmdChar) cmdChar.writeValue(new TextEncoder().encode('BLE_STREAM_OFF')).catch(e => runtime.logEvent(\`[Player] WARN: Failed to send BLE_STREAM_OFF: \${e.message}\`));
            if (bleDeviceHandle?.gatt?.connected) bleDeviceHandle.gatt.disconnect();
            streamCharsRef.current.delete(bleDevice.id);
        }
        setConnectedDevices(prev => prev.map(d => d.id === bleDevice.id ? { ...d, status: 'Offline' } : d));
    }
    
    eegBufferRef.current = {};
    simulationTimeRef.current = 0;
    channelMixRef.current = {};
    phaseLagRef.current = Math.PI / 3;
    setRunningProtocol(null);
    setProcessedData(null);
    setRawData(null);
    setConnectionStatus('');
    setEegIntervalId(null);
  };

  const handleRunProtocol = async (protocol) => {
    if (runningProtocolRef.current && runningProtocolRef.current.id === protocol.id) {
        stopRunningProtocol();
        return;
    }
    if (runningProtocolRef.current) stopRunningProtocol();
      
    setRunningProtocol(protocol);
    runtime.logEvent(\`[Player] Starting protocol: \${protocol.name}\`);
    
    const activeDevices = connectedDevices.filter(d => activeDataSourceIds.includes(d.id));
    if (activeDevices.length === 0) {
        runtime.logEvent('[Player] ERROR: No active data source selected.');
        setRunningProtocol(null); return;
    }
    
    const hardwareDevices = activeDevices.filter(d => d.mode !== 'simulator');
    if (hardwareDevices.length > 1) {
        runtime.logEvent('[Player] ERROR: Multi-device streaming is only supported for simulators at this time.');
        setRunningProtocol(null); return;
    }
    
    let processor;
    let isAsync = false;
    try {
        const fnOrFactory = eval('(' + protocol.processingCode + ')');

        if (typeof fnOrFactory !== 'function') {
            throw new Error("Processing code did not evaluate to a function or factory.");
        }

        // A factory function is identified by having 1 argument ('runtime').
        // A direct processor has 2 arguments ('eegData', 'sampleRate').
        if (fnOrFactory.length === 1) { 
            processor = fnOrFactory(runtime);
            isAsync = true; // Factories always produce async-style processors.
        } else { 
            processor = fnOrFactory;
            isAsync = false;
        }

        // Final validation of the resulting processor.
        if (isAsync) {
            if (!processor || typeof processor.update !== 'function') {
                 throw new Error("Async processor factory did not return a valid object with an 'update' method.");
            }
        } else {
            if (typeof processor !== 'function') {
                 throw new Error("Processor is not a valid function.");
            }
        }
    } catch (e) {
        const detailedError = e instanceof Error ? \`\${e.name}: \${e.message}\` : String(e);
        runtime.logEvent(\`[Player] ERROR compiling processor for '\${protocol.name}'. Details: \${detailedError}\`);
        // Also log the full error and the code to the console for developers
        console.error(\`--- Processor Compilation Error for '\${protocol.name}' ---\`);
        console.error(e);
        console.error("--- Offending 'processingCode' ---");
        console.error(protocol.processingCode);
        console.error("--- End of Offending Code ---");
        
        setRunningProtocol(null); return;
    }
    
    eegBufferRef.current = {};

    if (activeDevices.every(d => d.mode === 'simulator')) {
        setConnectionStatus('Simulating');
        const updateSim = async () => {
            const bufferSize = 256; // 1 second of data at 250Hz
            const samplesToGenerate = 25; // Generate 100ms of data (25 samples @ 250Hz)

            for (let s = 0; s < samplesToGenerate; s++) {
                // Slowly drift the phase lag between the two sources for more dynamic behavior
                phaseLagRef.current += (Math.random() - 0.5) * 0.05;
                phaseLagRef.current = Math.max(0.1, Math.min(Math.PI - 0.1, phaseLagRef.current));

                const sourceA_alpha = Math.sin(simulationTimeRef.current) * 50;
                const sourceB_alpha = Math.sin(simulationTimeRef.current + phaseLagRef.current) * 50;

                for (const device of activeDevices) {
                    const channelMap = DEVICE_CHANNEL_MAPS[device.deviceType] || [];
                    for(let i = 0; i < device.channelCount; i++) {
                        const channelName = channelMap[i] || \`CH\${i+1}\`;
                        const key = activeDevices.length > 1 ? \`\${device.id}-\${channelName}\` : channelName;
                        
                        if (!eegBufferRef.current[key]) eegBufferRef.current[key] = [];
                        
                        // Each channel has its own unique, slowly drifting mix of the two sources
                        if (!channelMixRef.current[key]) {
                            channelMixRef.current[key] = Math.random(); // Initialize mix ratio
                        }
                        channelMixRef.current[key] += (Math.random() - 0.5) * 0.02; // Drift
                        channelMixRef.current[key] = Math.max(0.1, Math.min(0.9, channelMixRef.current[key])); // Clamp
                        
                        const mix_A = channelMixRef.current[key];
                        const mix_B = 1 - mix_A;
                        
                        const coherent_signal = sourceA_alpha * mix_A + sourceB_alpha * mix_B;
                        
                        const beta_noise = (Math.random() - 0.5) * 20; 
                        const theta_noise = (Math.random() - 0.5) * 30;

                        const newSample = coherent_signal + beta_noise + theta_noise;

                        eegBufferRef.current[key].push(newSample);
                        if (eegBufferRef.current[key].length > bufferSize) {
                            eegBufferRef.current[key].shift();
                        }
                    }
                }
                simulationTimeRef.current += (2 * Math.PI * 10) / 250; // Corresponds to 10Hz alpha
            }

            // Set rawData for debug view
            const channelKeys = Object.keys(eegBufferRef.current);
            if (channelKeys.length > 0) {
                const summary = channelKeys.map(key => {
                    const buffer = eegBufferRef.current[key];
                    if (buffer && buffer.length > 0) {
                        const lastSample = buffer[buffer.length - 1];
                        const cleanKey = key.split('-').pop();
                        return \`\${cleanKey}: \${lastSample.toFixed(2)}\`;
                    }
                    return null;
                }).filter(Boolean).join(', ');

                setRawData(\`[Simulating] \${channelKeys.length} channels active. \${summary}\`);
            }

            const activeChannelKeys = [];
            for (const device of activeDevices) {
                const channelMap = DEVICE_CHANNEL_MAPS[device.deviceType] || [];
                for(let i = 0; i < device.channelCount; i++) {
                    const channelName = channelMap[i] || \`CH\${i+1}\`;
                    activeChannelKeys.push(activeDevices.length > 1 ? \`\${device.id}-\${channelName}\` : channelName);
                }
            }

            const allBuffersFull = activeChannelKeys.every(key => eegBufferRef.current[key] && eegBufferRef.current[key].length === bufferSize);

            if (allBuffersFull) {
                const combinedEegData = {};
                activeChannelKeys.forEach(key => {
                    combinedEegData[key] = [...eegBufferRef.current[key]];
                });
                
                try {
                  const result = isAsync ? await processor.update(combinedEegData, 250) : processor(combinedEegData, 250);
                  if (runningProtocolRef.current?.id === protocol.id) setProcessedData(result);
                } catch(e) {
                   runtime.logEvent(\`[Player] Processor Error: \${e.message}\`);
                   stopRunningProtocol();
                }
            }
        };

        if (isAsync) {
            asyncLoopControllerRef.current.active = true;
            const asyncLoop = async () => {
                if (!asyncLoopControllerRef.current.active) return;
                await updateSim();
                if (asyncLoopControllerRef.current.active) setTimeout(asyncLoop, 100);
            };
            asyncLoop();
        } else {
            const intervalId = setInterval(updateSim, 100);
            setEegIntervalId(intervalId);
        }
        return;
    }
    
    const hardwareDevice = hardwareDevices[0];
    setConnectedDevices(prev => prev.map(d => d.id === hardwareDevice.id ? {...d, status: 'Connecting...', error: null} : d));
    
    if (hardwareDevice.mode === 'wifi') {
        if (!hardwareDevice.ip) {
            const error = 'Device IP address is not set for Wi-Fi mode.';
            runtime.logEvent(\`[Player] ERROR: \${error}\`);
            setConnectedDevices(prev => prev.map(d => d.id === hardwareDevice.id ? {...d, status: 'Error', error} : d));
            setRunningProtocol(null); return;
        }
        const url = \`ws://\${hardwareDevice.ip}:81\`;
        startWebSocketSession(url, protocol, processor, isAsync);
        setConnectedDevices(prev => prev.map(d => d.id === hardwareDevice.id ? {...d, status: 'Active'} : d));
    }
    
    if (hardwareDevice.mode === 'ble') {
        const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
        const CMD_CHAR_UUID = "beb54840-36e1-4688-b7f5-ea07361b26a8";
        const DATA_CHAR_UUID = "beb54843-36e1-4688-b7f5-ea07361b26a8";

        (async () => {
            try {
                runtime.logEvent(\`[Player] Attempting BLE connection to \${hardwareDevice.name}\`);
                const bleDeviceHandle = await navigator.bluetooth.requestDevice({
                    filters: [{ name: hardwareDevice.name }],
                    optionalServices: [SERVICE_UUID]
                });
                
                const server = await bleDeviceHandle.gatt.connect();
                const service = await server.getPrimaryService(SERVICE_UUID);
                const cmdChar = await service.getCharacteristic(CMD_CHAR_UUID);
                const dataChar = await service.getCharacteristic(DATA_CHAR_UUID);
                
                streamCharsRef.current.set(hardwareDevice.id, { cmdChar, bleDeviceHandle });

                const handleData = async (event) => {
                    if (!runningProtocolRef.current) return;
                    const value = event.target.value;
                    const dataString = new TextDecoder().decode(value);
                    setRawData(dataString);

                    const parts = dataString.split(',');
                    if (parts.length < 9) return;
                    
                    const bufferSize = 256;
                    const channelMap = DEVICE_CHANNEL_MAPS['FreeEEG8'];

                    for (let i = 0; i < 8; i++) {
                        const channelName = channelMap[i];
                        if (!eegBufferRef.current[channelName]) {
                            eegBufferRef.current[channelName] = [];
                        }
                        eegBufferRef.current[channelName].push(parseFloat(parts[i + 1]));
                        if (eegBufferRef.current[channelName].length > bufferSize) {
                            eegBufferRef.current[channelName].shift();
                        }
                    }
                    
                    const allBuffersFull = channelMap.every(ch => eegBufferRef.current[ch] && eegBufferRef.current[ch].length === bufferSize);

                    if (allBuffersFull) {
                        const eegDataSnapshot = {};
                        channelMap.forEach(ch => { eegDataSnapshot[ch] = [...eegBufferRef.current[ch]]; });

                        try {
                            if (isAsync) {
                                const result = await processor.update(eegDataSnapshot, 250);
                                if (runningProtocolRef.current?.id === protocol.id) setProcessedData(result);
                            } else {
                                const result = processor(eegDataSnapshot, 250);
                                if (runningProtocolRef.current?.id === protocol.id) setProcessedData(result);
                            }
                        } catch(e) {
                            runtime.logEvent(\`[Player] Processor Error: \${e.message}\`);
                            stopRunningProtocol();
                        }
                    }
                };

                await dataChar.startNotifications();
                dataChar.addEventListener('characteristicvaluechanged', handleData);
                
                await cmdChar.writeValue(new TextEncoder().encode('BLE_STREAM_ON'));

                setConnectedDevices(prev => prev.map(d => d.id === hardwareDevice.id ? {...d, status: 'Active'} : d));
                setConnectionStatus('Connected via BLE');

            } catch (e) {
                runtime.logEvent(\`[Player] BLE connection failed: \${e.message}\`);
                setConnectedDevices(prev => prev.map(d => d.id === hardwareDevice.id ? {...d, status: 'Error', error: e.message} : d));
                stopRunningProtocol();
            }
        })();
    }
  };
  
  useEffect(() => {
    return stopRunningProtocol;
  }, []);

  return {
    runningProtocol,
    processedData,
    rawData,
    connectionStatus,
    handleRunProtocol,
    stopRunningProtocol
  };
};
`