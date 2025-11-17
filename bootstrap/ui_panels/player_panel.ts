// This file is now an orchestrator that combines smaller, more manageable pieces.
import { USE_DEVICE_MANAGER_CODE } from './hooks/useDeviceManager';
import { USE_PROTOCOL_RUNNER_CODE } from './hooks/useProtocolRunner';
import { USE_PROVISIONING_CODE } from './hooks/useProvisioning';

import { DATA_SOURCE_PANEL_CODE } from './player/DataSourcePanel';
import { PROTOCOL_LIBRARY_CODE } from './player/ProtocolLibrary';
import { PLAYER_DISPLAY_CODE } from './player/PlayerDisplay';


export const PLAYER_PANEL_CODE = `
  // --- INJECTED HOOKS ---
  ${USE_DEVICE_MANAGER_CODE}
  ${USE_PROTOCOL_RUNNER_CODE}
  ${USE_PROVISIONING_CODE}

  // --- INJECTED UI COMPONENTS ---
  ${DATA_SOURCE_PANEL_CODE}
  ${PROTOCOL_LIBRARY_CODE}
  ${PLAYER_DISPLAY_CODE}
  
  // This is now the main component body, acting as an orchestrator.
  // It was previously a large, monolithic block of code.

  // --- State that belongs to the orchestrator ---
  const [isImportExportVisible, setImportExportVisible] = useState(false);
  const [exportedJson, setExportedJson] = useState('');
  const [jsonToImport, setJsonToImport] = useState('');
  
  // --- Custom Hooks ---
  const deviceManager = useDeviceManager({ runtime });
  const provisioning = useProvisioning({ runtime, onDeviceProvisioned: deviceManager.onDeviceProvisioned });
  const protocolRunner = useProtocolRunner({ 
    runtime, 
    activeDataSourceIds: deviceManager.activeDataSourceIds, 
    connectedDevices: deviceManager.connectedDevices,
    setConnectedDevices: deviceManager.setConnectedDevices,
    selectedProtocol
  });

  // --- Handlers ---
  const handleExport = async () => {
    try {
        const result = await runtime.tools.run('Export Neurofeedback Protocols', {});
        if (result.protocolsJson) {
            setExportedJson(result.protocolsJson);
            setJsonToImport(''); // Clear import field
            setImportExportVisible(true);
        }
    } catch (e) {
        runtime.logEvent(\`[Export] Error: \${e.message}\`);
    }
  };

  const handleImport = async () => {
    if (!jsonToImport) {
        runtime.logEvent('[Import] Text area is empty. Nothing to import.');
        return;
    }
    try {
        await runtime.tools.run('Import Neurofeedback Protocols', { protocolsJson: jsonToImport });
        setJsonToImport('');
        setImportExportVisible(false); // Close on successful import
    } catch (e) {
        runtime.logEvent(\`[Import] Error: \${e.message}\`);
    }
  };

  const handleRunProtocolWrapper = () => {
    if (selectedProtocol) {
      protocolRunner.handleRunProtocol(selectedProtocol);
    }
  };

  // --- Main Render Function ---
  const renderPlayer = () => {
    return (
        <div className="flex-[2] bg-slate-800/50 p-4 rounded-lg flex flex-col">
          {renderPlayerDisplay({
            selectedProtocol,
            runningProtocol: protocolRunner.runningProtocol,
            processedData: protocolRunner.processedData,
            rawData: protocolRunner.rawData,
            connectionStatus: protocolRunner.connectionStatus,
            handleRunProtocol: handleRunProtocolWrapper,
            runtime
          })}
        </div>
    );
  };
`