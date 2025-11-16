// This file defines the React component code for the main UI of the Neurofeedback Engine.
// It is stored as a template literal string to be loaded dynamically as a UI tool.
import { SETTINGS_MODAL_CODE } from './ui_panels/settings_modal';
import { LEFT_PANEL_CODE } from './ui_panels/left_panel';
import { PLAYER_PANEL_CODE } from './ui_panels/player_panel';

export const MAIN_PANEL_CODE = `
  const { useState, useEffect, useMemo, useRef } = React;

  // --- State Management ---
  const [researchDomain, setResearchDomain] = useState('Enhance focus and attention eeg');
  const [selectedProtocol, setSelectedProtocol] = useState(null);
  const [runningProtocol, setRunningProtocol] = useState(null);
  const [processedData, setProcessedData] = useState(null);
  const [eegIntervalId, setEegIntervalId] = useState(null);
  const [isImportExportVisible, setImportExportVisible] = useState(false);
  const [exportedJson, setExportedJson] = useState('');
  const [jsonToImport, setJsonToImport] = useState('');
  const [isSettingsVisible, setSettingsVisible] = useState(false);
  const [generatingFromSourceId, setGeneratingFromSourceId] = useState(null);
  const [connectedDevices, setConnectedDevices] = useState([
    { id: 'simulator', name: 'Built-in EEG Simulator', status: 'Active', ip: null, mode: 'simulator' }
  ]);
  const [activeDataSourceId, setActiveDataSourceId] = useState('simulator');
  const [activeTab, setActiveTab] = useState('research');
  const [rawData, setRawData] = useState(null);
  const deviceHandlesRef = useRef(new Map());

  // Firmware OTA State
  const [firmwareCode, setFirmwareCode] = useState('');
  const [deviceIp, setDeviceIp] = useState('192.168.1.100');
  const [firmwareLogs, setFirmwareLogs] = useState('Firmware logs will appear here...');
  const [isCompiling, setIsCompiling] = useState(false);
  const [isFlashing, setIsFlashing] = useState(false);
  const [lastCompiledPath, setLastCompiledPath] = useState(null);

  // --- Memoized Data ---
  const protocolLibrary = useMemo(() => {
    return runtime.tools.list().filter(tool => 
      tool.category === 'UI Component' && tool.name !== 'Neurofeedback Engine Main UI' && tool.name !== 'Debug Log View'
    );
  }, [runtime.tools.list()]);
  
  const isWorkflowActive = useMemo(() => {
    return scriptExecutionState === 'running' || scriptExecutionState === 'paused' || scriptExecutionState === 'error';
  }, [scriptExecutionState]);


  // --- Effects ---
   useEffect(() => {
    fetchOllamaModels();
  }, []);
  
  // --- Device Persistence Effects ---
  useEffect(() => {
    try {
        const savedDevices = localStorage.getItem('neurofeedback-devices');
        const savedActiveId = localStorage.getItem('neurofeedback-active-device-id');
        
        if (savedDevices) {
            const parsedDevices = JSON.parse(savedDevices);
            const initialDevices = [
                { id: 'simulator', name: 'Built-in EEG Simulator', status: 'Active', ip: null, mode: 'simulator' }
            ];
            const loadedHardware = parsedDevices
              .filter(d => d.id !== 'simulator')
              .map(d => ({ 
                  ...d, 
                  status: 'Offline', 
                  ip: null, 
                  error: null,
                  mode: d.mode || 'wifi' // Add mode with default
                }));
            initialDevices.push(...loadedHardware);
            setConnectedDevices(initialDevices);
            runtime.logEvent('[System] Loaded ' + loadedHardware.length + ' saved devices from local storage.');
        }
        
        if (savedActiveId) {
            setActiveDataSourceId(savedActiveId);
        }
    } catch (e) {
        runtime.logEvent('[System] WARN: Could not load saved devices from local storage. ' + e.message);
    }
  }, []);

  useEffect(() => {
    try {
        const devicesToSave = connectedDevices
            .filter(d => d.id !== 'simulator')
            .map(({ bleHandle, ...rest }) => rest); // Ensure non-serializable handles aren't saved
        localStorage.setItem('neurofeedback-devices', JSON.stringify(devicesToSave));
        localStorage.setItem('neurofeedback-active-device-id', activeDataSourceId);
    } catch (e) {
        runtime.logEvent('[System] WARN: Could not save devices to local storage. ' + e.message);
    }
  }, [connectedDevices, activeDataSourceId]);


  useEffect(() => {
    // Select the first protocol by default if none is selected
    if (!selectedProtocol && protocolLibrary.length > 0) {
      setSelectedProtocol(protocolLibrary[0]);
    }
    // If the selected protocol is removed, reset selection
    if (selectedProtocol && !protocolLibrary.find(p => p.id === selectedProtocol.id)) {
        setSelectedProtocol(protocolLibrary.length > 0 ? protocolLibrary[0] : null);
    }
  }, [protocolLibrary, selectedProtocol]);
  
  // Cleanup interval on component unmount or when protocol stops
  useEffect(() => {
    return () => {
      if (eegIntervalId) {
        clearInterval(eegIntervalId);
      }
    };
  }, [eegIntervalId]);

  // --- Handlers ---
  const handleStartResearch = () => {
    if (isSwarmRunning) return;
    const workflowTool = runtime.tools.list().find(t => t.name === 'Execute Research Workflow');
    if (workflowTool) {
      // Clear previous research results
      setValidatedSources([]);
      startSwarmTask({
        task: {
          userRequest: { text: \`Find papers for: \${researchDomain}\` },
          isScripted: true,
          script: [{
            name: 'Execute Research Workflow',
            arguments: { researchDomain }
          }],
        },
        systemPrompt: 'You are a helpful assistant executing a research workflow.',
        allTools: runtime.tools.list(),
      });
    } else {
      runtime.logEvent('[ERROR] Could not find the "Execute Research Workflow" tool.');
    }
  };

  const handleGenerateFromSource = async (source) => {
    setGeneratingFromSourceId(source.uri);
    try {
        // This now calls the new, generic development tool from the framework.
        await runtime.tools.run('Develop Tool from Objective', { 
            objective: \`Create a neurofeedback UI component based on the findings in the paper titled '\${source.title}'\`,
            sourceMaterial: source.summary,
        });
    } catch (e) {
        runtime.logEvent(\`[Generation] ERROR: Failed to generate protocol from source '\${source.title.substring(0,30)}...': \${e.message}\`);
    } finally {
        setGeneratingFromSourceId(null);
    }
  };
  
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
  
  const handleExportSource = (source) => {
    const sourceJson = JSON.stringify({
        title: source.title,
        uri: source.uri,
        summary: source.summary,
        reliabilityScore: source.reliabilityScore,
        justification: source.justification,
    }, null, 2);
    navigator.clipboard.writeText(sourceJson);
    runtime.logEvent(\`[Dossier] Copied source "\${source.title.substring(0,30)}..." to clipboard.\`);
  };
  
  const handleRemoveSource = (uri) => {
    setValidatedSources(prev => prev.filter(s => s.uri !== uri));
  };
  
  const handleLoadFirmware = async () => {
    try {
        const result = await runtime.tools.run('Load Smart Hybrid Firmware', {});
        setFirmwareCode(result.firmwareCode);
        setFirmwareLogs('Loaded Smart Hybrid firmware for FreeEEG8.');
    } catch(e) {
        setFirmwareLogs(\`Error loading firmware: \${e.message}\`);
    }
  };

  const handleCompile = async () => {
    setIsCompiling(true);
    setFirmwareLogs('Starting firmware compilation...');
    setLastCompiledPath(null);
    try {
        const result = await runtime.tools.run('Compile ESP32 Firmware', { firmwareCode });
        setFirmwareLogs(prev => prev + '\\n--- COMPILATION ---\\n' + result.logs);
        setLastCompiledPath(result.firmwarePath);
    } catch(e) {
        setFirmwareLogs(prev => prev + \`\\n--- COMPILE ERROR ---\\n\${e.message}\`);
    } finally {
        setIsCompiling(false);
    }
  };
  
  const handleFlash = async () => {
    if (!lastCompiledPath) {
        setFirmwareLogs(prev => prev + '\\n--- FLASH ERROR ---\\nNo firmware has been compiled yet. Please compile first.');
        return;
    }
    setIsFlashing(true);
    setFirmwareLogs(prev => prev + \`\\n--- FLASHING \${lastCompiledPath} to \${deviceIp} ---\`);
    try {
        const result = await runtime.tools.run('Flash ESP32 Firmware (OTA)', { firmwarePath: lastCompiledPath, deviceIp });
        setFirmwareLogs(prev => prev + '\\n' + result.logs);
    } catch(e) {
        setFirmwareLogs(prev => prev + \`\\n--- FLASH ERROR ---\\n\${e.message}\`);
    } finally {
        setIsFlashing(false);
    }
  };

  // --- Render Functions ---
  ${SETTINGS_MODAL_CODE}
  ${LEFT_PANEL_CODE}
  ${PLAYER_PANEL_CODE}
  
  return (
    <div className="h-full w-full flex flex-col p-4 bg-gray-900/80">
        {renderSettingsModal()}
        <header className="flex items-center justify-between gap-3 pb-4 border-b border-slate-700">
            <div className="flex items-center gap-3">
                <GearIcon className="h-8 w-8 text-cyan-300" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-100">Neurofeedback Engine</h1>
                    <p className="text-sm text-slate-400">Autonomous Generation of Novel Neurofeedback Protocols.</p>
                </div>
            </div>
            <button onClick={() => setSettingsVisible(true)} className="p-2 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors" title="API Settings">
                <GearIcon className="h-6 w-6 text-slate-300" />
            </button>
        </header>

        <div className="flex-grow flex gap-4 pt-4 overflow-hidden">
            <aside className="flex-[1] flex flex-col min-w-[30rem]">
                {renderGenerationPanel()}
                {renderResearchDossier()}
            </aside>
            <section className="flex-[3] flex gap-4 overflow-hidden">
                {renderPlayer()}
                <aside className="flex-[1] flex flex-col gap-4 min-w-[20rem]">
                    {renderDataSourcePanel()}
                    {renderProtocolLibrary()}
                </aside>
            </section>
        </div>
    </div>
  );
`