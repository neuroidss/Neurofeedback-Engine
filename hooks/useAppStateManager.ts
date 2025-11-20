




import { useState, useEffect, useCallback } from 'react';
import { loadStateFromStorage, saveStateToStorage, saveMapStateToStorage, loadMapStateToStorage } from '../versioning';
import type { AIModel, APIConfig, ValidatedSource, LLMTool } from '../types';
// FIX: ModelProvider is now imported from its source in `types.ts` instead of from `constants.ts`.
import { ModelProvider } from '../types';
import { AI_MODELS } from '../constants';


const MOCK_SMR_ABSTRACT = `Sensorimotor rhythm (SMR) neurofeedback, targeting the 12-15 Hz frequency band, is associated with states of focused calm. The protocol aims to enhance SMR activity. The core metric is the ratio of SMR power (12-15 Hz) to theta power (4-8 Hz). Positive reinforcement is provided when this SMR/theta ratio increases. The user interface should provide simple, clear feedback via a vertical bar that grows in height and changes color from blue to green as the ratio improves.`;

const MOCK_SMR_SOURCE: ValidatedSource = {
    uri: 'internal://smr-example-protocol-1',
    title: 'Example: SMR Neurofeedback for ADHD',
    summary: MOCK_SMR_ABSTRACT,
    reliabilityScore: 0.95,
    justification: 'This is a canonical example of a well-researched neurofeedback protocol, pre-loaded for demonstration purposes.',
    status: 'valid',
    origin: 'AI Validation',
    textContent: MOCK_SMR_ABSTRACT
};


// FIX: Changed from const arrow function to a function declaration
// to potentially resolve type inference issues in consuming hooks.
export function useAppStateManager() {
    const [eventLog, setEventLog] = useState<string[]>([]);

    // FIX: Moved logEvent declaration before its first use to resolve the 'used before declaration' error.
    const logEvent = useCallback((message: string) => {
        const timestamp = new Date().toLocaleTimeString();
        setEventLog(prev => [...prev, `[${timestamp}] ${message}`]);
    }, []);

    const [apiCallCount, setApiCallCount] = useState<Record<string, number>>({});
    const [selectedModel, setSelectedModel] = useState<AIModel>(AI_MODELS[0]);
    const [apiConfig, setApiConfig] = useState<APIConfig>({
        googleAIAPIKey: '',
        openAIAPIKey: '',
        openAIBaseUrl: 'https://api.openai.com/v1',
        openAICustomModel: 'gpt-4o',
        deepSeekAPIKey: '',
        deepSeekBaseUrl: 'https://api.tokenfactory.nebius.com/v1/',
        ollamaHost: 'http://localhost:11434',
        useQuantumSDR: false,
        computeBackend: 'gpu', // Default to GPU
        defaultWifiSSID: '',
        defaultWifiPassword: '',
        autoRestoreSession: false,
    });
    // Live feed state
    const [liveFeed, setLiveFeed] = useState<any[]>([]);
    // Persistent map state
    const [allSources, setAllSources] = useState<any[]>([]);
    const [validatedSources, setValidatedSources] = useState<ValidatedSource[]>([]);
    const [mapData, setMapData] = useState<any[]>([]);
    const [pcaModel, setPcaModel] = useState<any | null>(null);
    const [mapNormalization, setMapNormalization] = useState<any | null>(null);
    const [taskPrompt, setTaskPrompt] = useState('Discover novel neurofeedback protocols for enhancing cognitive functions like focus and memory.');

    // State for dynamic Ollama model fetching
    const [ollamaModels, setOllamaModels] = useState<AIModel[]>([]);
    const [ollamaState, setOllamaState] = useState<{ loading: boolean; error: string | null }>({ loading: false, error: null });

    // --- NEW: Budgetary Guardian State ---
    const [apiCallTimestamps, setApiCallTimestamps] = useState<number[]>([]);
    const [isBudgetGuardTripped, setIsBudgetGuardTripped] = useState(false);
    
    // --- NEW: Global EEG Data Stream ---
    const [globalEegData, setGlobalEegData] = useState(null);
    
    // --- NEW: Vibecoder OS State ---
    const [vibecoderHistory, setVibecoderHistory] = useState<any[]>([]);


    const fetchOllamaModels = useCallback(async () => {
        setOllamaState({ loading: true, error: null });
        try {
            // Environment-aware URL selection to bypass CORS in remote deployments
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const ollamaApiUrl = isLocal
                ? `${apiConfig.ollamaHost}/api/tags`
                : `http://localhost:3001/api/ollama-proxy/tags`;

            logEvent(`[Ollama] Fetching models via: ${ollamaApiUrl}`);

            const response = await fetch(ollamaApiUrl);
            if (!response.ok) {
                const errorText = await response.text();
                const errorJson = JSON.parse(errorText);
                const errorOrigin = isLocal ? `Ollama server at ${apiConfig.ollamaHost}` : 'the local MCP proxy server (localhost:3001)';
                throw new Error(`Failed to fetch models from ${errorOrigin}. Status ${response.status}: ${errorJson.error || errorText}`);
            }
            const data = await response.json();
            const models: AIModel[] = data.models.map((model: any) => ({
                id: model.name,
                name: model.name,
                provider: ModelProvider.Ollama,
            }));
            setOllamaModels(models);
            if (models.length === 0) {
                 setOllamaState({ loading: false, error: "No models found on Ollama server." });
            } else {
                 setOllamaState({ loading: false, error: null });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to fetch Ollama models.";
            setOllamaState({ loading: false, error: message });
            setOllamaModels([]);
        }
    }, [apiConfig.ollamaHost, logEvent]);


    // Load state from storage on initial mount
    useEffect(() => {
        const storedState = loadStateFromStorage();
        
        // Load API config, prioritizing user-saved keys, then environment variables
        setApiConfig(prevConfig => ({
            ...prevConfig,
            googleAIAPIKey: storedState?.apiConfig?.googleAIAPIKey || process.env.GEMINI_API_KEY || '',
            openAIAPIKey: storedState?.apiConfig?.openAIAPIKey || '',
            openAIBaseUrl: storedState?.apiConfig?.openAIBaseUrl || 'https://api.openai.com/v1',
            openAICustomModel: storedState?.apiConfig?.openAICustomModel || 'gpt-4o',
            deepSeekAPIKey: storedState?.apiConfig?.deepSeekAPIKey || process.env.NEBIUS_API_KEY || '',
            deepSeekBaseUrl: storedState?.apiConfig?.deepSeekBaseUrl || 'https://api.tokenfactory.nebius.com/v1/',
            ollamaHost: storedState?.apiConfig?.ollamaHost || 'http://localhost:11434',
            useQuantumSDR: storedState?.apiConfig?.useQuantumSDR || false,
            // Handle legacy boolean useGPUAcceleration -> new computeBackend enum
            computeBackend: storedState?.apiConfig?.computeBackend || ((storedState?.apiConfig as any)?.useGPUAcceleration === false ? 'worker' : 'gpu'),
            defaultWifiSSID: process.env.WIFI_SSID || '',
            defaultWifiPassword: process.env.WIFI_PASSWORD || '',
            autoRestoreSession: storedState?.apiConfig?.autoRestoreSession || false,
        }));

        if (storedState?.apiConfig?.googleAIAPIKey) {
            console.log("Loaded API config from storage.", storedState.apiConfig);
        } else if (process.env.GEMINI_API_KEY) {
            logEvent("[SYSTEM] Loaded Gemini API key from environment variable.");
        }
        
        // Load map state
        let mapState = loadMapStateToStorage(logEvent);
        if (mapState) {
            const hasDuplicates = (arr: any[], idSelector: (item: any) => any) => {
                if (!Array.isArray(arr)) return false;
                const ids = new Set();
                for (const item of arr) {
                    if (!item) continue;
                    const id = idSelector(item);
                    if (!id) continue; // Ignore items without an ID
                    if (ids.has(id)) {
                        return true; // Found a duplicate
                    }
                    ids.add(id);
                }
                return false;
            };

            const liveFeed = mapState.liveFeed || [];
            const allSources = mapState.allSources || [];
            
            // Check for duplicates in the two main arrays that are rendered with keys
            if (hasDuplicates(liveFeed, item => item.id) || hasDuplicates(allSources, item => item.id)) {
                logEvent("[SYSTEM] ERROR: Corrupted cache detected (duplicate items). Clearing cache to prevent application freeze.");
                localStorage.removeItem('synergy-forge-map-state');
                mapState = null; // Nullify state to force a fresh start
            }
        }

        let initialValidatedSources: ValidatedSource[] = [];

        if (mapState) {
            setAllSources(mapState.allSources);
            initialValidatedSources = mapState.validatedSources || [];
            setMapData(mapState.mapData);
            setPcaModel(mapState.pcaModel);
            setMapNormalization(mapState.mapNormalization);
            setLiveFeed(mapState.liveFeed || []);
            if (mapState.taskPrompt) {
                setTaskPrompt(mapState.taskPrompt);
            }
        }
        
        // After loading everything from storage, check if we need to add the example.
        // This ensures a clean slate or first-time users see the example.
        if (initialValidatedSources.length === 0) {
            initialValidatedSources.push(MOCK_SMR_SOURCE);
            logEvent("[SYSTEM] Pre-loaded an example SMR protocol into the Research Dossier for demonstration.");
        }
        setValidatedSources(initialValidatedSources);
        
        // Initialize with a welcome message
        setEventLog(prev => [`[${new Date().toLocaleTimeString()}] [SYSTEM] Session started.`, ...prev]);
    }, [logEvent]);

    // Effect to persist apiConfig state whenever it changes
    useEffect(() => {
        // Create a version of the config that only includes user-set values,
        // not ones from process.env, to avoid writing them to localStorage.
        const configToSave: APIConfig = {
            googleAIAPIKey: apiConfig.googleAIAPIKey,
            openAIAPIKey: apiConfig.openAIAPIKey,
            openAIBaseUrl: apiConfig.openAIBaseUrl,
            openAICustomModel: apiConfig.openAICustomModel,
            deepSeekAPIKey: apiConfig.deepSeekAPIKey,
            deepSeekBaseUrl: apiConfig.deepSeekBaseUrl,
            ollamaHost: apiConfig.ollamaHost,
            useQuantumSDR: apiConfig.useQuantumSDR,
            computeBackend: apiConfig.computeBackend,
            autoRestoreSession: apiConfig.autoRestoreSession,
        };
        saveStateToStorage({ apiConfig: configToSave });
    }, [apiConfig]);

    // Effect to persist map state and live feed whenever it changes
    useEffect(() => {
        // This effect will run whenever any of the map-related states change,
        // ensuring the map is always saved.
        saveMapStateToStorage({
            allSources,
            validatedSources,
            mapData,
            pcaModel,
            mapNormalization,
            liveFeed,
            taskPrompt,
        }, logEvent);
    }, [allSources, validatedSources, mapData, pcaModel, mapNormalization, liveFeed, taskPrompt, logEvent]);


    return {
        eventLog,
        setEventLog,
        logEvent,
        apiCallCount,
        setApiCallCount,
        selectedModel,
        setSelectedModel,
        apiConfig,
        setApiConfig,
        // Feed state and setters
        liveFeed,
        setLiveFeed,
        // Map state and setters
        allSources,
        setAllSources,
        validatedSources,
        setValidatedSources,
        mapData,
        setMapData,
        pcaModel,
        setPcaModel,
        mapNormalization,
        setMapNormalization,
        taskPrompt,
        setTaskPrompt,
        // Ollama dynamic model state and fetcher
        ollamaModels,
        ollamaState,
        fetchOllamaModels,
        // Budgetary Guardian
        apiCallTimestamps,
        setApiCallTimestamps,
        isBudgetGuardTripped,
        setIsBudgetGuardTripped,
        // Global EEG Data Stream
        globalEegData,
        setGlobalEegData,
        // Vibecoder OS
        vibecoderHistory,
        setVibecoderHistory,
    };
}