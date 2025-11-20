
export const USE_DEVICE_MANAGER_CODE = `
const useDeviceManager = ({ runtime }) => {
  // Synchronous initialization from LocalStorage to ensure data is available immediately for auto-restore
  const [connectedDevices, setConnectedDevices] = useState(() => {
      try {
          const savedDevices = localStorage.getItem('neurofeedback-devices');
          const defaultDevice = { id: 'simulator-free8-1', name: 'FreeEEG8 Simulator #1', status: 'Active', ip: null, mode: 'simulator', deviceType: 'FreeEEG8', channelCount: 8, useWss: false };
          
          if (savedDevices) {
              const parsedDevices = JSON.parse(savedDevices);
              const loadedHardware = parsedDevices
                .filter(d => d.mode !== 'simulator')
                .map(d => ({ ...d, status: 'Offline', error: null, useWss: d.useWss || false })); // Hardware starts offline
              
              // Find simulators in saved data or use default
              const savedSimulators = parsedDevices.filter(d => d.mode === 'simulator');
              const simulators = savedSimulators.length > 0 ? savedSimulators : [defaultDevice];
              
              return [...simulators, ...loadedHardware];
          }
          return [defaultDevice];
      } catch (e) {
          runtime.logEvent('[System] Error loading saved devices: ' + e.message);
          return [{ id: 'simulator-free8-1', name: 'FreeEEG8 Simulator #1', status: 'Active', ip: null, mode: 'simulator', deviceType: 'FreeEEG8', channelCount: 8, useWss: false }];
      }
  });

  const [activeDataSourceIds, setActiveDataSourceIds] = useState(() => {
      try {
          const savedActiveIds = localStorage.getItem('neurofeedback-active-device-ids');
          if (savedActiveIds) {
              const parsed = JSON.parse(savedActiveIds);
              return Array.isArray(parsed) ? parsed : ['simulator-free8-1'];
          }
          return ['simulator-free8-1'];
      } catch (e) {
          return ['simulator-free8-1'];
      }
  });

  const [bluetoothAvailabilityError, setBluetoothAvailabilityError] = useState('');

  // Persistence Effect: Saves state whenever it changes
  useEffect(() => {
    try {
        const devicesToSave = connectedDevices
            .map(({ bleDevice, port, ...rest }) => rest); // Strip non-serializable fields
        localStorage.setItem('neurofeedback-devices', JSON.stringify(devicesToSave));
        localStorage.setItem('neurofeedback-active-device-ids', JSON.stringify(activeDataSourceIds));
    } catch (e) {
        runtime.logEvent('[System] Failed to save devices: ' + e.message);
    }
  }, [connectedDevices, activeDataSourceIds]);

  // Check for Web Bluetooth availability
  useEffect(() => {
    if ('bluetooth' in navigator) return;
    const platform = navigator.platform || 'unknown';
    if (platform.toLowerCase().includes('linux')) setBluetoothAvailabilityError('Web Bluetooth may be disabled on Linux. Try enabling the flag at chrome://flags/#enable-experimental-web-platform-features');
    else setBluetoothAvailabilityError('Web Bluetooth API is not available on this browser. Please use Chrome or Edge.');
  }, []);

  const onDeviceProvisioned = (deviceName, ipAddress) => {
    const newDevice = {
        id: deviceName,
        name: deviceName,
        status: ipAddress ? 'Active' : 'Offline',
        ip: ipAddress || null,
        mode: 'wifi', 
        deviceType: 'FreeEEG8', 
        channelCount: 8,
        error: null,
        useWss: false,
    };
    
    setConnectedDevices(prev => {
        const exists = prev.find(d => d.id === newDevice.id);
        if (exists) {
            return prev.map(d => d.id === newDevice.id ? { ...d, ...newDevice } : d);
        }
        return [...prev, newDevice];
    });
    
    // Automatically select it
    if (ipAddress) {
        setActiveDataSourceIds(prev => {
            if (!prev.includes(newDevice.id)) return [...prev, newDevice.id];
            return prev;
        });
    }
  };

  const handleAddSimulator = (deviceType) => {
    const typePrefix = deviceType.toLowerCase().replace('eeg', '');
    const existingSimulators = connectedDevices.filter(d => d.deviceType === deviceType);
    const newId = typePrefix + '-' + (existingSimulators.length + 1);
    
    const channelCounts = {'FreeEEG8': 8, 'FreeEEG32': 32, 'FreeEEG128': 128};

    const newSimulator = {
        id: newId,
        name: deviceType + ' Simulator #' + (existingSimulators.length + 1),
        status: 'Active',
        ip: null,
        mode: 'simulator',
        deviceType: deviceType,
        channelCount: channelCounts[deviceType],
        error: null,
        useWss: false
    };
    setConnectedDevices(prev => [...prev, newSimulator]);
    setActiveDataSourceIds(prev => [...prev, newId]); // Auto-select
    runtime.logEvent('[Device] Added ' + newSimulator.name);
  };

  const handleRemoveDevice = (deviceId) => {
    if(connectedDevices.length <= 1) return;
    setActiveDataSourceIds(prev => prev.filter(id => id !== deviceId));
    setConnectedDevices(prev => prev.filter(d => d.id !== deviceId));
    runtime.logEvent('[Device] Removed device: ' + deviceId);
  };

  const handleAddBleDevice = async () => {
    if (bluetoothAvailabilityError) {
        alert(bluetoothAvailabilityError);
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
            bleDevice: deviceHandle,
            deviceType: 'FreeEEG8',
            channelCount: 8,
            error: null,
            useWss: false
        };
        
        if (!connectedDevices.find(d => d.id === newDevice.id)) {
            setConnectedDevices(prev => [...prev, newDevice]);
            setActiveDataSourceIds(prev => [...prev, newDevice.id]); // Auto-select
            runtime.logEvent('[Device] Added new BLE device: ' + newDevice.name + '.');
        } else {
            runtime.logEvent('[Device] Device ' + newDevice.name + ' is already in the list.');
            alert('Device ' + newDevice.name + ' is already in the list.');
        }
    } catch (e) {
        const msg = 'ERROR adding BLE device: ' + e.message;
        runtime.logEvent('[Device] ' + msg);
        if (!e.message.includes('User cancelled')) {
            alert(msg);
        }
    }
  };

  const handleAddSerialDevice = async () => {
    console.log('Attempting to add Serial device...');
    if (!navigator.serial) {
        const msg = 'Web Serial API is not supported in this browser. Please use Chrome, Edge, or Opera.';
        console.error(msg);
        runtime.logEvent('[Device] ' + msg);
        alert(msg);
        return;
    }
    try {
        runtime.logEvent('[Device] Requesting USB Serial device...');
        const port = await navigator.serial.requestPort();
        const id = 'usb-serial-' + Date.now(); 
        
        const newDevice = {
            id: id,
            name: 'USB Device (Serial)',
            status: 'Offline',
            ip: null,
            mode: 'serial',
            port: port, 
            deviceType: 'FreeEEG8', 
            channelCount: 8,
            error: null,
            useWss: false
        };
        
        setConnectedDevices(prev => [...prev, newDevice]);
        setActiveDataSourceIds(prev => [...prev, newDevice.id]); // Auto-select
        runtime.logEvent('[Device] Added USB Serial device.');
        
    } catch (e) {
        console.error('Serial add error:', e);
        const msg = 'Serial selection failed: ' + e.message;
        runtime.logEvent('[Device] ' + msg);
        if (!e.message.includes('No port selected') && !e.message.includes('User cancelled')) {
            alert(msg);
        }
    }
  };
  
  const handleToggleDataSource = (deviceId) => {
    setActiveDataSourceIds(prev => {
        const isSelected = prev.includes(deviceId);
        if (isSelected) {
            return prev.length > 1 ? prev.filter(id => id !== deviceId) : prev;
        } else {
            return [...prev, deviceId];
        }
    });
  };

  const handleToggleWss = (deviceId) => {
    setConnectedDevices(prev => prev.map(d => {
        if (d.id === deviceId) {
            const newWssState = !d.useWss;
            runtime.logEvent(\`[Device] Toggled WSS for \${d.name}: \${newWssState ? 'ON (wss://)' : 'OFF (ws://)'}\`);
            return { ...d, useWss: newWssState };
        }
        return d;
    }));
  };

  return {
    connectedDevices,
    setConnectedDevices,
    activeDataSourceIds,
    setActiveDataSourceIds,
    bluetoothAvailabilityError,
    onDeviceProvisioned,
    handleAddSimulator,
    handleRemoveDevice,
    handleAddBleDevice,
    handleAddSerialDevice,
    handleToggleDataSource,
    handleToggleWss
  };
};
`;