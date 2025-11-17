export const USE_PROVISIONING_CODE = `
const useProvisioning = ({ runtime, onDeviceProvisioned }) => {
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [isProvisioningBusy, setIsProvisioningBusy] = useState(false);
  const [provSsid, setProvSsid] = useState('');
  const [provPassword, setProvPassword] = useState('');
  const [provError, setProvError] = useState('');
  const [provStatus, setProvStatus] = useState('');

  const handleStartProvisioning = async () => {
    if (!provSsid) {
      setProvError('SSID cannot be empty.');
      return;
    }
    setIsProvisioningBusy(true);
    setProvError('');
    setProvStatus('Requesting Bluetooth device...');
    try {
      const result = await runtime.tools.run('Configure WiFi via Bluetooth', { ssid: provSsid, password: provPassword });
      setProvStatus(\`Success! Device '\${result.deviceName}' will restart.\`);
      onDeviceProvisioned(result.deviceName);
      setTimeout(() => {
        setIsProvisioning(false);
        setIsProvisioningBusy(false);
        setProvSsid('');
        setProvPassword('');
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
`