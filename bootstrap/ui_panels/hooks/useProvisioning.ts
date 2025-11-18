
export const USE_PROVISIONING_CODE = `
const useProvisioning = ({ runtime, onDeviceProvisioned }) => {
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isProvisioningBusy, setIsProvisioningBusy] = useState(false);
  
  // Initialize with priority: LocalStorage -> Config (Env Vars) -> Empty
  const [provSsid, setProvSsid] = useState(() => {
      return localStorage.getItem('neurofeedback-wifi-ssid') || runtime.getState().apiConfig.defaultWifiSSID || '';
  });
  const [provPassword, setProvPassword] = useState(() => {
      return localStorage.getItem('neurofeedback-wifi-pass') || runtime.getState().apiConfig.defaultWifiPassword || '';
  });
  
  const [provError, setProvError] = useState('');
  const [provStatus, setProvStatus] = useState('');

  const handleStartProvisioning = async () => {
    if (!provSsid) {
      setProvError('SSID cannot be empty.');
      return;
    }
    
    // Persistence: Save current values to localStorage for next time
    localStorage.setItem('neurofeedback-wifi-ssid', provSsid);
    localStorage.setItem('neurofeedback-wifi-pass', provPassword);

    setIsProvisioningBusy(true);
    setProvError('');
    setProvStatus('Requesting Bluetooth device...');
    try {
      const result = await runtime.tools.run('Configure WiFi via Bluetooth', { ssid: provSsid, password: provPassword });
      
      // result should now contain ipAddress
      setProvStatus('Success! Connected to ' + result.deviceName + ' at ' + result.ipAddress);
      
      onDeviceProvisioned(result.deviceName, result.ipAddress);
      
      setTimeout(() => {
        setIsProvisioning(false);
        setIsProvisioningBusy(false);
      }, 3000);
    } catch (e) {
      setProvError(e.message);
      setProvStatus('Failed.');
      setIsProvisioningBusy(false);
    }
  };

  return {
    isProvisioning,
    setIsProvisioning,
    isProvisioningBusy,
    provSsid,
    setProvSsid,
    provPassword,
    setProvPassword,
    provError,
    provStatus,
    handleStartProvisioning
  };
};
`;