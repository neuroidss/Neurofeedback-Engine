
// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CORE_TOOLS } from '../constants';
import { BOOTSTRAP_TOOL_PAYLOADS } from '../bootstrap';
import { loadStateFromStorage, saveStateToStorage } from '../versioning';
import type { LLMTool, ToolCreatorPayload } from '../types';

export const generateMachineReadableId = (name: string, existingTools: LLMTool[]): string => {
  let baseId = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 50);
  if (!baseId) baseId = 'unnamed_tool';
  let finalId = baseId;
  let counter = 1;
  const existingIds = new Set(existingTools.map(t => t.id));
  while (existingIds.has(finalId)) {
    finalId = `${baseId}_${counter}`;
    counter++;
  }
  return finalId;
};

export const bootstrapTool = (payload: ToolCreatorPayload, existingTools: LLMTool[]): LLMTool => {
    const { ...toolData } = payload;
    
    // In client-only mode, the execution environment is always 'Client',
    // but we keep the category ('Server') for display and logical separation.
    const finalCategory = payload.category;

    const newId = generateMachineReadableId(toolData.name, existingTools);
    const now = new Date().toISOString();
    return {
        ...toolData,
        category: finalCategory,
        id: newId,
        version: 1,
        createdAt: now,
        updatedAt: now,
    };
};

export const initializeTools = (): LLMTool[] => {
    console.log("Bootstrapping initial toolset...");
    const allCreatedTools: LLMTool[] = [...CORE_TOOLS];
    
    BOOTSTRAP_TOOL_PAYLOADS.forEach(payload => {
        const newTool = bootstrapTool(payload, allCreatedTools);
        allCreatedTools.push(newTool);
    });
    console.log(`Bootstrap complete. ${allCreatedTools.length} client tools loaded.`);
    return allCreatedTools;
};

export const useToolManager = ({ logEvent, disablePersistence = false }: { logEvent: (message: string) => void, disablePersistence?: boolean }) => {
    const [tools, setTools] = useState<LLMTool[]>([]);
    
    // State for server tools and connection status
    const [serverTools, setServerTools] = useState<LLMTool[]>([]);
    const [isServerConnected, setIsServerConnected] = useState<boolean>(false);
    const isServerConnectedRef = useRef(isServerConnected);
    const initialServerCheckCompleted = useRef(false);
    isServerConnectedRef.current = isServerConnected;

    // Load Tools Effect
    useEffect(() => {
        const freshBootstrapTools = initializeTools();
        
        // If persistence is disabled, we just load bootstrap tools and exit.
        if (disablePersistence) {
            setTools(freshBootstrapTools);
            logEvent('[SYSTEM] Tool persistence disabled. Loaded bootstrap tools only.');
            return;
        }

        const storedState = loadStateFromStorage();
        const storedTools = storedState ? storedState.tools : [];

        if (!storedState) {
            setTools(freshBootstrapTools);
            logEvent('[SYSTEM] Initial toolset loaded. No previous state found.');
            return;
        }

        const updatedTools: LLMTool[] = [];
        const processedStoredToolNames = new Set<string>();
        
        // CACHE POLICY: HARD REFRESH FOR BOOTSTRAP TOOLS
        // To ensure debugging updates are always applied, we prefer the 'fresh' version 
        // of any bootstrap tool over the 'stored' version, effectively disabling caching 
        // for the core app logic while preserving user-created tools.
        
        let updatesCount = 0;

        // 1. Load all FRESH bootstrap tools first (Code is Truth)
        for (const freshTool of freshBootstrapTools) {
            updatedTools.push(freshTool);
            processedStoredToolNames.add(freshTool.name); // Mark as processed
        }

        // 2. Load USER tools (preserving those that are NOT in bootstrap)
        for (const storedTool of storedTools) {
            if (!processedStoredToolNames.has(storedTool.name)) {
                updatedTools.push(storedTool);
            } else {
                updatesCount++;
            }
        }
        
        logEvent(`[SYSTEM] Tool Manager: Forced update of ${freshBootstrapTools.length} core tools from source. Preserved ${updatedTools.length - freshBootstrapTools.length} user tools.`);
        setTools(updatedTools);

    }, []); // Run only once on mount (persistence toggle requires reload or manual save trigger currently)

    // Save Tools Effect
    useEffect(() => {
        if (disablePersistence) return;
        if (tools.length === 0) return;

        saveStateToStorage({ tools });
    }, [tools, disablePersistence]);

    const forceRefreshServerTools = useCallback(async () => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const response = await fetch('http://localhost:3001/api/tools', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const fetchedTools: LLMTool[] = await response.json();
                setServerTools(fetchedTools);
                if (!isServerConnectedRef.current) {
                    setIsServerConnected(true);
                    logEvent(`[INFO] ✅ Server connection re-established.`);
                }
                logEvent(`[SYSTEM] Server tool cache synchronized. Loaded ${fetchedTools.length} server tools.`);
                return { success: true, count: fetchedTools.length };
            } else {
                 throw new Error(`Server responded with status: ${response.status}`);
            }
        } catch (error) {
            setServerTools([]);
            if (isServerConnectedRef.current) {
                setIsServerConnected(false);
                logEvent('[WARN] ⚠️ Server connection lost during refresh.');
            }
            return { success: false, error: (error as Error).message };
        }
    }, [logEvent]);

    const allTools = useMemo(() => {
        const clientToolNames = new Set(tools.map(t => t.name));
        // Filter server tools to remove any that have the same name as a client tool,
        // giving client-side definitions precedence.
        const filteredServerTools = serverTools.filter(st => !clientToolNames.has(st.name));
        return [...tools, ...filteredServerTools];
    }, [tools, serverTools]);
    
    const allToolsRef = useRef(allTools);
    allToolsRef.current = allTools;

    useEffect(() => {
        const fetchServerStatusAndTools = async () => {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                const response = await fetch('http://localhost:3001/api/tools', { signal: controller.signal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const fetchedTools: LLMTool[] = await response.json();
                    setServerTools(currentServerTools => {
                        if (JSON.stringify(currentServerTools) !== JSON.stringify(fetchedTools)) {
                            if (isServerConnectedRef.current) {
                                logEvent(`[SYSTEM] Server tools updated via polling. Found ${fetchedTools.length} tools.`);
                            }
                            return fetchedTools;
                        }
                        return currentServerTools;
                    });
                    if (!isServerConnectedRef.current) {
                        setIsServerConnected(true);
                        logEvent('[INFO] ✅ Optional server connection established.');
                    }
                } else {
                    throw new Error(`Server responded with status: ${response.status}`);
                }
            } catch (error) {
                setServerTools([]);
                if (isServerConnectedRef.current) {
                    setIsServerConnected(false);
                    logEvent('[WARN] ⚠️ Optional server connection lost.');
                } else if (!initialServerCheckCompleted.current) {
                    logEvent('[INFO] Optional backend server not found. Running in client-only mode.');
                }
            } finally {
                initialServerCheckCompleted.current = true;
            }
        };

        fetchServerStatusAndTools();
        const intervalId = setInterval(fetchServerStatusAndTools, 10000); // Poll every 10 seconds

        return () => clearInterval(intervalId);
    }, [logEvent]);

    return {
        tools,
        setTools,
        allTools,
        allToolsRef,
        isServerConnected,
        generateMachineReadableId,
        forceRefreshServerTools,
    };
};
