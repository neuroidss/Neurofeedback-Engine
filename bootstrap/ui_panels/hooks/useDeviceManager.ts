export const USE_DEVICE_MANAGER_CODE = `
const useDeviceManager = ({ runtime }) => {
  const [connectedDevices, setConnectedDevices] = useState([
    { id: 'simulator-free8-1', name: 'FreeEEG8 Simulator #1', status: 'Active', ip: null, mode: 'simulator', deviceType: 'FreeEEG8', channelCount: 8 }
  ]);
  const [activeDataSourceIds, setActiveDataSourceIds] = useState(['simulator-free8-1']);
  const [bluetoothAvailabilityError, setBluetoothAvailabilityError] = useState('');

  // --- Persistence Effects ---
  useEffect(() => {
    try {
        const savedDevices = localStorage.getItem('neurofeedback-devices');
        if (savedDevices) {
            const parsedDevices = JSON.parse(savedDevices);
            const initialDevices = [
                { id: 'simulator-free8-1', name: 'FreeEEG8 Simulator #1', status: 'Active', ip: null, mode: 'simulator', deviceType: 'FreeEEG8', channelCount: 8 }
            ];
            const loadedHardware = parsedDevices
              .filter(d => d.mode !== 'simulator')
              .map(d => ({ ...d, status: 'Offline', ip: null, error: null }));
            initialDevices.push(...loadedHardware);
            setConnectedDevices(initialDevices);
        }
        
        const savedActiveIds = localStorage.getItem('neurofeedback-active-device-ids');
        if (savedActiveIds) {
            const parsedIds = JSON.parse(savedActiveIds);
            if (Array.isArray(parsedIds) && parsedIds.length > 0) {
                setActiveDataSourceIds(parsedIds);
            }
        }
    } catch (e) {
        runtime.logEvent('[System] WARN: Could not load saved devices from local storage. ' + e.message);
    }
  }, []);

  useEffect(() => {
    try {
        const devicesToSave = connectedDevices
            .filter(d => d.mode !== 'simulator')
            .map(({ bleHandle, ...rest }) => rest);
        localStorage.setItem('neurofeedback-devices', JSON.stringify(devicesToSave));
        localStorage.setItem('neurofeedback-active-device-ids', JSON.stringify(activeDataSourceIds));
    } catch (e) {
        runtime.logEvent('[System] WARN: Could not save devices to local storage. ' + e.message);
    }
  }, [connectedDevices, activeDataSourceIds]);

  // Check for Web Bluetooth availability
  useEffect(() => {
    if ('bluetooth' in navigator) return;
    const platform = navigator.platform || 'unknown';
    if (platform.toLowerCase().includes('linux')) setBluetoothAvailabilityError('Web Bluetooth may be disabled on Linux. Try enabling the flag at chrome://flags/#enable-experimental-web-platform-features');
    else setBluetoothAvailabilityError('Web Bluetooth API is not available on this browser. Please use Chrome or Edge.');
  }, []);

  const onDeviceProvisioned = (deviceName) => {
    const newDevice = {
        id: deviceName,
        name: deviceName,
        status: 'Offline',
        ip: null,
        mode: 'wifi', // Provisioning implies Wi-Fi mode
        error: null,
    };
     if (!connectedDevices.find(d => d.id === newDevice.id)) {
        setConnectedDevices(prev => [...prev, newDevice]);
    }
  };

  const handleAddSimulator = (deviceType) => {
    const typePrefix = deviceType.toLowerCase().replace('eeg', '');
    const existingSimulators = connectedDevices.filter(d => d.deviceType === deviceType);
    const newId = \`\${typePrefix}-\${existingSimulators.length + 1}\`;
    
    const channelCounts = {'FreeEEG8': 8, 'FreeEEG32': 32, 'FreeEEG128': 128};

    const newSimulator = {
        id: newId,
        name: \`\${deviceType} Simulator #\${existingSimulators.length + 1}\`,
        status: 'Active',
        ip: null,
        mode: 'simulator',
        deviceType: deviceType,
        channelCount: channelCounts[deviceType],
        error: null
    };
    setConnectedDevices(prev => [...prev, newSimulator]);
    runtime.logEvent(\`[Device] Added \${newSimulator.name}\`);
  };

  const handleRemoveDevice = (deviceId) => {
    // Cannot remove the last device
    if(connectedDevices.length <= 1) return;
    setActiveDataSourceIds(prev => prev.filter(id => id !== deviceId));
    setConnectedDevices(prev => prev.filter(d => d.id !== deviceId));
    runtime.logEvent(\`[Device] Removed device: \${deviceId}\`);
  };

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
            runtime.logEvent(\`[Device] No device selected.\`);
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
            runtime.logEvent(\`[Device] Added new BLE device: \${newDevice.name}.\`);
        } else {
            runtime.logEvent(\`[Device] Device \${newDevice.name} is already in the list.\`);
        }
    } catch (e) {
        runtime.logEvent(\`[Device] ERROR adding BLE device: \${e.message}\`);
    }
  };
  
  const handleToggleDataSource = (deviceId) => {
    setActiveDataSourceIds(prev => {
        const isSelected = prev.includes(deviceId);
        const device = connectedDevices.find(d => d.id === deviceId);
        if (!device) return prev;
        
        const isHardware = device.mode !== 'simulator';

        if (isSelected) {
            return prev.length > 1 ? prev.filter(id => id !== deviceId) : prev;
        } else {
            if (isHardware) {
                return [deviceId];
            } else {
                const hardwareSelected = prev.some(id => {
                  const d = connectedDevices.find(dev => dev.id === id);
                  return d && d.mode !== 'simulator';
                });
                return hardwareSelected ? [deviceId] : [...prev, deviceId];
            }
        }
    });
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
    handleToggleDataSource
  };
};
`