
export const USE_SERVER_MANAGER_CODE = `
const useServerManager = ({ runtime }) => {
    const [processes, setProcesses] = useState([]);
    const [isPolling, setIsPolling] = useState(true);
    const [lastUpdate, setLastUpdate] = useState(Date.now());
    const [selectedConsoleId, setSelectedConsoleId] = useState(null);
    const [autoScroll, setAutoScroll] = useState(false); // Default OFF

    const fetchProcesses = async () => {
        if (!runtime.isServerConnected()) {
            setProcesses([]);
            return;
        }
        try {
            const result = await runtime.tools.run('List Managed Processes', {});
            if (result && result.processes) {
                // Memory Optimization: Truncate logs in client state to prevent OOM
                const truncatedProcesses = result.processes.map(p => ({
                    ...p,
                    logs: (p.logs || []).slice(-50) // Keep only last 50 lines per process
                }));
                setProcesses(truncatedProcesses);
                setLastUpdate(Date.now());
            }
        } catch (e) {
            console.warn('[ServerManager] Failed to fetch processes:', e);
        }
    };

    useEffect(() => {
        fetchProcesses();
        if (!isPolling) return;
        const interval = setInterval(fetchProcesses, 2000);
        return () => clearInterval(interval);
    }, [isPolling, runtime]); // Depend on runtime connection status implicitly

    const stopProcess = async (processId) => {
        try {
            runtime.logEvent('[ServerManager] Stopping process: ' + processId);
            await runtime.tools.run('Stop Process', { processId });
            fetchProcesses(); // Refresh immediately
            if (selectedConsoleId === processId) setSelectedConsoleId(null);
        } catch (e) {
            runtime.logEvent('[ServerManager] Failed to stop process: ' + e.message);
        }
    };

    return {
        processes,
        isPolling,
        setIsPolling,
        lastUpdate,
        stopProcess,
        refresh: fetchProcesses,
        selectedConsoleId,
        setSelectedConsoleId,
        autoScroll,
        setAutoScroll
    };
};
`;
