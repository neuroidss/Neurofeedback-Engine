
// hooks/useAppStateManager.ts
import { useState, useEffect, useCallback } from 'react';
import { loadStateFromStorage, saveStateToStorage, saveMapStateToStorage, loadMapStateToStorage } from '../versioning';
import type { AIModel, APIConfig, ValidatedSource, LLMTool } from '../types';
import { ModelProvider } from '../types';
import { AI_MODELS } from '../constants';


const MOCK_SMR_ABSTRACT = `### Protocol Specification: SMR "Aperture" Focus Trainer

**Objective:** Enhance cognitive inhibition and attention by training the Sensorimotor Rhythm (SMR) while suppressing Theta activity.

**Signal Processing Logic:**
1.  **Input:** EEG channel 'Cz' (primary) or 'C3'/'C4' (fallback).
2.  **Metric:** \`focusRatio\` = (Power of 12-15 Hz) / (Power of 4-8 Hz).
3.  **Simulation:** If real data is absent, generate a smooth 0.5Hz oscillating signal ranging from 0.5 to 1.8 to demonstrate the full visual range.

**Visual Interface (The "Camera Lens" Metaphor):**
1.  **The Aperture (Focus):** A central ring that expands as \`focusRatio\` increases.
2.  **The Blur (Distraction):** A foggy overlay. Opacity decreases as focus increases.
3.  **Lock-On State:** When \`focusRatio > 1.2\`:
    *   The Aperture turns Gold and pulses.
    *   The Blur vanishes completely.
    *   Text "LOCK ON" appears.
4.  **Idle State:** Below 1.2, the Aperture is Cyan and the fog is visible.`;

const MOCK_SMR_SOURCE: ValidatedSource = {
    uri: 'internal://smr-aperture-focus-specification',
    title: 'Protocol Specification: SMR "Aperture" Focus Trainer',
    summary: 'A specific neurofeedback design using a "Camera Lens" metaphor. High SMR/Theta ratio expands a central aperture and clears a foggy overlay. Includes a "Lock-On" state with gold pulsing visuals when the ratio exceeds 1.2.',
    reliabilityScore: 0.99,
    justification: 'Canonical protocol specification designed for high-fidelity code generation.',
    status: 'valid',
    origin: 'AI Validation',
    textContent: MOCK_SMR_ABSTRACT
};


export function useAppStateManager() {
    const [eventLog, setEventLog] = useState<string[]>([]);

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
        computeBackend: 'gpu',
        defaultWifiSSID: '',
        defaultWifiPassword: '',
        autoRestoreSession: false,
        // Budget defaults: Higher by default for usability
        velocityLimit: 50,
        velocityWindow: 10,
        protocolGenerationMode: 'script'
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

    // --- Budgetary Guardian State ---
    const [apiCallTimestamps, setApiCallTimestamps] = useState<number[]>([]);
    const [isBudgetGuardTripped, setIsBudgetGuardTripped] = useState(false);
    
    // --- Global EEG Data Stream ---
    const [globalEegData, setGlobalEegData] = useState(null);
    
    // --- Vibecoder OS State ---
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
            computeBackend: storedState?.apiConfig?.computeBackend || ((storedState?.apiConfig as any)?.useGPUAcceleration === false ? 'worker' : 'gpu'),
            defaultWifiSSID: process.env.WIFI_SSID || '',
            defaultWifiPassword: process.env.WIFI_PASSWORD || '',
            autoRestoreSession: storedState?.apiConfig?.autoRestoreSession || false,
            // Load limits if present, otherwise default
            velocityLimit: storedState?.apiConfig?.velocityLimit || 50,
            velocityWindow: storedState?.apiConfig?.velocityWindow || 10,
            protocolGenerationMode: storedState?.apiConfig?.protocolGenerationMode || 'script',
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
            
            if (hasDuplicates(liveFeed, item => item.id) || hasDuplicates(allSources, item => item.id)) {
                logEvent("[SYSTEM] ERROR: Corrupted cache detected (duplicate items). Clearing cache to prevent application freeze.");
                localStorage.removeItem('synergy-forge-map-state');
                mapState = null; 
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
        
        // Ensure the MOCK_SMR_SOURCE is always present at the top if the list is empty OR if we want to force update it
        // We'll just check if a source with that URI exists, and if so, update it, otherwise add it.
        const smrIndex = initialValidatedSources.findIndex(s => s.uri === MOCK_SMR_SOURCE.uri);
        if (smrIndex !== -1) {
             initialValidatedSources[smrIndex] = MOCK_SMR_SOURCE; // Force update
        } else {
             initialValidatedSources.unshift(MOCK_SMR_SOURCE); // Add to top
             logEvent("[SYSTEM] Pre-loaded the 'Aperture' SMR specification into the Research Dossier.");
        }

        setValidatedSources(initialValidatedSources);
        
        setEventLog(prev => [`[${new Date().toLocaleTimeString()}] [SYSTEM] Session started.`, ...prev]);
    }, [logEvent]);

    // Effect to persist apiConfig state whenever it changes
    useEffect(() => {
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
            velocityLimit: apiConfig.velocityLimit,
            velocityWindow: apiConfig.velocityWindow,
            protocolGenerationMode: apiConfig.protocolGenerationMode,
        };
        saveStateToStorage({ apiConfig: configToSave });
    }, [apiConfig]);

    useEffect(() => {
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
        liveFeed,
        setLiveFeed,
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
        ollamaModels,
        ollamaState,
        fetchOllamaModels,
        apiCallTimestamps,
        setApiCallTimestamps,
        isBudgetGuardTripped,
        setIsBudgetGuardTripped,
        globalEegData,
        setGlobalEegData,
        vibecoderHistory,
        setVibecoderHistory,
    };
}