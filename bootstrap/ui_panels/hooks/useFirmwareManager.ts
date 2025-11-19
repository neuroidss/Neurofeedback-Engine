
export const USE_FIRMWARE_MANAGER_CODE = `
  const useFirmwareManager = ({ runtime, selectedDevices }) => {
    const [firmwareCode, setFirmwareCode] = useState('');
    const [logs, setLogs] = useState([]);
    const [isBusy, setIsBusy] = useState(false);
    const [deviceIp, setDeviceIp] = useState(''); // Auto-filled
    const [compiledPath, setCompiledPath] = useState(null);
    
    // State for viewing fetched documents (Schematic, PCB, Manifest)
    const [docViewer, setDocViewer] = useState(null); // { title, content, type }

    const log = (msg) => setLogs(prev => [ ...prev.slice(-20), \`[\${new Date().toLocaleTimeString()}] \${msg}\`]);

    // --- Auto-Sync IP from Selection ---
    useEffect(() => {
        // Always grab the IP of the *last* selected device to act as the "primary" target for viewing.
        // For flashing, we will use the whole list.
        const validDevices = selectedDevices.filter(d => d.ip);
        if (validDevices.length > 0) {
            setDeviceIp(validDevices[validDevices.length - 1].ip);
        }
    }, [selectedDevices]);

    // --- Smart Fetcher: Direct -> Proxy Fallback ---
    const fetchDeviceArtifact = async (endpoint) => {
        const url = 'http://' + deviceIp + endpoint;
        log('Fetching ' + url + '...');
        
        // 1. Try Direct Fetch (works for HTTP-to-HTTP or Localhost-to-Localhost)
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 2000); // Fast fail for direct
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(id);
            if (res.ok) return await res.text();
        } catch (e) {
            // Ignore direct failure, likely Mixed Content or CORS
        }

        // 2. Try Proxy (works for HTTPS-to-HTTP via Local Backend)
        try {
            const proxyUrl = 'http://localhost:3001'; 
            const res = await fetch(proxyUrl + '/browse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            if (res.ok) return await res.text();
            throw new Error('Proxy fetch failed: ' + res.status);
        } catch (e) {
            throw new Error('Could not fetch artifact. Ensure device is reachable or Local Server is running.');
        }
    };

    const handleViewArtifact = async (type, endpoint) => {
        if (!deviceIp) { log('❌ Error: No device selected or IP missing.'); return; }
        setIsBusy(true);
        try {
            const content = await fetchDeviceArtifact(endpoint);
            
            if (type === 'Source') {
                setFirmwareCode(content);
                log('✅ Source code loaded from device.');
            } else {
                setDocViewer({ title: type, content, type: 'text' });
                log('✅ ' + type + ' loaded.');
            }
        } catch (e) {
            log('❌ Error loading ' + type + ': ' + e.message);
        }
        setIsBusy(false);
    };

    const loadFirmware = async () => {
        setIsBusy(true); log('Loading firmware...');
        try {
            const result = await runtime.tools.run('Load Smart Hybrid Firmware', {});
            setFirmwareCode(result.firmwareCode);
            log('✅ Firmware loaded. You can now edit or copy the code.');
        } catch(e) { log('❌ Error: ' + e.message); }
        setIsBusy(false);
    };
    
    const compile = async () => {
        if (!firmwareCode) { log('❌ Error: No firmware code loaded.'); return; }
        setIsBusy(true); setCompiledPath(null); log('Compiling firmware on server...');
        try {
            const result = await runtime.tools.run('Compile ESP32 Firmware', { firmwareCode });
            log(result.logs);
            if (result.success) {
                setCompiledPath(result.firmwarePath);
                log('✅ Compilation successful. Path: ' + result.firmwarePath);
            } else {
                log('❌ Compilation failed.');
            }
        } catch(e) { log('❌ Error: ' + e.message); }
        setIsBusy(false);
    };

    const flash = async () => {
        if (!compiledPath) { log('❌ Error: Firmware not compiled yet.'); return; }
        
        // Identify targets
        const targets = selectedDevices.filter(d => d.ip && d.mode !== 'simulator');
        
        if (targets.length === 0) {
             if (deviceIp) {
                 // Fallback to manual IP entry
                 targets.push({ name: 'Manual Target', ip: deviceIp });
             } else {
                 log('❌ Error: No valid targets selected.'); 
                 return; 
             }
        }

        setIsBusy(true);
        
        log('🚀 Starting Batch Flash for ' + targets.length + ' devices...');
        
        for (const target of targets) {
            log('>> Flashing ' + target.name + ' (' + target.ip + ')...');
            try {
                const result = await runtime.tools.run('Flash ESP32 Firmware (OTA)', { firmwarePath: compiledPath, deviceIp: target.ip });
                log(result.logs);
                if (result.success) {
                    log('✅ Flash successful for ' + target.name);
                } else {
                    log('❌ Flash failed for ' + target.name);
                }
            } catch(e) { 
                log('❌ Error flashing ' + target.name + ': ' + e.message); 
            }
            // Small delay between devices
            await new Promise(r => setTimeout(r, 1000));
        }
        
        log('🏁 Batch operation complete.');
        setIsBusy(false);
    };
    
    return { 
        firmwareCode, setFirmwareCode, logs, isBusy, deviceIp, setDeviceIp, compiledPath, 
        docViewer, setDocViewer,
        loadFirmware, compile, flash, handleViewArtifact 
    };
  };
`;
