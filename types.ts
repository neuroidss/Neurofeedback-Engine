
// types.ts
export type ToolCategory = 'UI Component' | 'Functional' | 'Automation' | 'Server';
export type AgentStatus = 'idle' | 'working' | 'error' | 'success';

export interface AgentWorker {
  id: string;
  status: AgentStatus;
  lastAction: string | null;
  error: string | null;
  result: any | null;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  defaultValue?: any;
}

export interface EEGDataRequirements {
  type: 'eeg';
  channels: string[]; // e.g., ['C3', 'C4', 'Cz']
  metrics: string[]; // e.g., ['smr_power', 'theta_beta_ratio']
}

export interface ScientificDossier {
    title: string;
    hypothesis: string;       // "Increasing 12-15Hz at Cz improves motor inhibition."
    mechanism: string;        // "Operant conditioning via visual reward."
    targetNeuralState: string; // "Relaxed Focus"
    citations: string[];      // ["Sterman, 1996", "DOI:10.1016/j.clinph.2000..."]
    relatedKeywords: string[]; // ["ADHD", "Sleep Spindles", "Motor Cortex"]
}

export interface LLMTool {
  id:string;
  name:string;
  description: string;
  category: ToolCategory;
  version: number;
  parameters: ToolParameter[];
  purpose?: string;
  implementationCode: string;
  processingCode?: string;
  createdAt?: string;
  updatedAt?: string;
  executionEnvironment: 'Client' | 'Server';
  dataRequirements?: EEGDataRequirements;
  scientificDossier?: ScientificDossier; 
}

export type NewToolPayload = Omit<LLMTool, 'id' | 'version' | 'createdAt' | 'updatedAt'>;

export interface ToolCreatorPayload {
  name: string;
  description: string;
  category: ToolCategory;
  executionEnvironment: 'Client' | 'Server';
  parameters: ToolParameter[];
  implementationCode: string;
  processingCode?: string;
  purpose: string;
  dataRequirements?: EEGDataRequirements;
  scientificDossier?: ScientificDossier;
}

export interface AIToolCall {
    name: string;
    arguments: Record<string, any>;
}

export interface AIResponse {
  toolCalls: AIToolCall[] | null;
  text?: string; // The raw text response from the model, if any.
}

export interface EnrichedAIResponse {
  toolCall: AIToolCall | null;
  tool?: LLMTool;
  executionResult?: any;
  executionError?: string;
}

// The different high-level contexts the agent can be in.
export type MainView = 'SYNERGY_FORGE';


export enum ModelProvider {
  GoogleAI = 'GoogleAI',
  OpenAI_API = 'OpenAI_API',
  DeepSeek = 'DeepSeek',
  Ollama = 'Ollama',
  HuggingFace = 'HuggingFace',
  Wllama = 'Wllama',
}

export interface ModelCapability {
    supportsNativeTools: boolean;
    useJsonInstruction: boolean; // Forces text-based tool prompting
    thinkingMode?: 'default' | 'minimize'; // 'default' = (/think), 'minimize' = (/no_think)
}

export interface AIModel {
  id: string;
  name: string;
  provider: ModelProvider;
  baseUrl?: string; // Optional override for specific endpoint
  apiKey?: string;  // Optional override for specific key
}

export type ComputeBackend = 'gpu' | 'worker' | 'main';

export interface APIConfig {
  googleAIAPIKey?: string;
  
  // OpenAI / Compatible
  openAIAPIKey?: string;
  openAIBaseUrl?: string;
  openAICustomModel?: string; // For compatible APIs or specific model versions
  
  // DeepSeek (Nebius/Official)
  deepSeekAPIKey?: string;
  deepSeekBaseUrl?: string;
  
  // Local / Self-Hosted
  ollamaHost?: string;
  
  useQuantumSDR?: boolean;
  computeBackend?: ComputeBackend; // Replaces boolean toggle with selector
  defaultWifiSSID?: string;
  defaultWifiPassword?: string;
  autoRestoreSession?: boolean; // Automatically reconnect devices and restart protocol on reload
  
  // --- NEW: Granular Model Selection ---
  imageModel?: string; // 'imagen-4.0-generate-001' | 'gemini-2.5-flash-image'
  audioInputMode?: 'transcription' | 'raw'; // 'transcription' (Browser STT) | 'raw' (Send Audio to Model)
  ttsModel?: string; // 'browser' | 'gemini-tts'

  // --- Budgetary Guardian Settings ---
  velocityLimit?: number; // Max calls per window
  velocityWindow?: number; // Window in seconds

  // --- Generator Mode ---
  protocolGenerationMode?: 'script' | 'graph'; // 'script' = Classic React, 'graph' = Stream Engine
  
  // --- UI Preferences ---
  immersiveMode?: boolean; // Auto-hide panels
  
  // --- Data & Storage ---
  disablePersistence?: boolean; // If true, do not save state to localStorage
  
  // NEW: Per-model capabilities
  modelCapabilities?: Record<string, ModelCapability>;
}

export type UIToolRunnerProps = Record<string, any>;

export interface ExecuteActionFunction {
    (toolCall: AIToolCall, agentId: string, context?: MainView): Promise<EnrichedAIResponse>;
    getRuntimeApiForAgent: (agentId: string) => any;
}

export interface ScoredTool {
  tool: LLMTool;
  score: number;
}

export type ToolRelevanceMode = 'Embeddings' | 'All' | 'LLM';

export enum SearchDataSource {
    PubMed = 'PubMed',
    BioRxivPmcArchive = 'BioRxivPmcArchive',
    GooglePatents = 'GooglePatents',
    WebSearch = 'WebSearch',
}

export interface SearchResult {
    title: string;
    link: string;
    snippet: string;
    source: SearchDataSource;
}

export type SourceStatus = 'unverified' | 'valid' | 'invalid' | 'validating' | 'fetch-failed';

export interface GroundingSource {
    uri: string;
    title: string;
    status: SourceStatus;
    origin: SearchDataSource;
    content?: string;
    reliability?: number; // 0.0 to 1.0, assessed by AI
    reliabilityJustification?: string; // AI's reason for the score
    reason?: string; // Reason for status (e.g., fetch failure, invalid)
}

export interface ValidatedSource {
    uri: string;
    title: string;
    summary: string;
    reliabilityScore: number;
    justification: string;
    status: 'valid';
    origin: 'AI Validation';
    textContent?: string;
}


// --- NEW for Step-by-Step Execution ---
export type ScriptExecutionState = 'idle' | 'running' | 'paused' | 'finished' | 'error';
export type StepStatus = { status: 'pending' | 'completed' | 'error'; result?: any; error?: string };
export type SubStepProgress = { text: string, current: number, total: number } | null;

// --- VIBECODER GENESIS TYPES ---

export interface NeuroFrame {
    timestamp: number;
    sourceId: string;
    type: 'EEG' | 'Vision' | 'Audio' | 'System';
    payload: any; // Flexible payload (e.g., FaceLandmarkerResult, EEG Epoch)
    confidence?: number;
}

export interface StreamNode {
    id: string;
    type: 'Source' | 'Transform' | 'Sink';
    // The JS implementation code for the node's logic.
    // Signature: (inputs: Record<string, any>, config: any, state: any, bus: any) => Promise<{ output?: any, state?: any }>
    implementation: string; 
    config: Record<string, any>;
    state: Record<string, any>; // Internal state for the node (e.g., filters)
    inputs: string[]; // IDs of nodes feeding into this
    position?: { x: number, y: number }; // For UI visualization
    toolName?: string; // Optional: origin tool
    nodeType?: string; // Optional: subtype
    parameter?: string; // Optional: for Sink
}

export interface StreamGraph {
    id: string;
    nodes: Record<string, StreamNode>;
    edges: any[]; // Optional, implicitly defined by inputs
}

export interface VisualState {
    globalColor: string; // Hex or HSL
    intensity: number; // 0-1
    geometryMode: 'Particles' | 'FlowField' | 'Void';
    textOverlay?: string;
    distortions?: string[];
}