// VIBE_NOTE: Do not escape backticks or dollar signs in template literals in this file.
// Escaping is only for 'implementationCode' strings in tool definitions.
import React from 'react';
import type { AIModel } from './types';
import { ModelProvider } from './types';
import { FRAMEWORK_CORE_TOOLS } from './framework/core';

export const AI_MODELS: AIModel[] = [
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: ModelProvider.GoogleAI },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro preview', provider: ModelProvider.GoogleAI },
    { id: 'gemini-robotics-er-1.5-preview', name: 'Gemini Robotics-ER 1.5 Preview', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash-Lite', provider: ModelProvider.GoogleAI },
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini 2.5 Flash Native Audio', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3n-e2b-it', name: 'Gemma 3n E2B', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3n-e4b-it', name: 'Gemma 3n E4B', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3-1b-it', name: 'Gemma 3 1B', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3-4b-it', name: 'Gemma 3 4B', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3-12b-it', name: 'Gemma 3 12B', provider: ModelProvider.GoogleAI },
    { id: 'gemma-3-27b-it', name: 'Gemma 3 27B', provider: ModelProvider.GoogleAI },
    { id: 'custom-openai', name: 'Custom OpenAI / Compatible', provider: ModelProvider.OpenAI_API },
    { id: 'Qwen/Qwen3-Coder-30B-A3B-Instruct', name: 'Qwen3-Coder-30B-A3B-Instruct (Nebius)', provider: ModelProvider.DeepSeek },
    { id: 'deepseek-ai/DeepSeek-R1-0528', name: 'DeepSeek-R1-0528 (Nebius)', provider: ModelProvider.DeepSeek },
    { id: 'deepseek-ai/DeepSeek-R1-0528-fast', name: 'DeepSeek-R1-0528-fast (Nebius)', provider: ModelProvider.DeepSeek },
    { id: 'deepseek-ai/DeepSeek-V3-0324', name: 'DeepSeek-V3-0324 (Nebius)', provider: ModelProvider.DeepSeek },
    { id: 'deepseek-ai/DeepSeek-V3-0324-fast', name: 'DeepSeek-V3-0324-fast (Nebius)', provider: ModelProvider.DeepSeek },
    { id: 'onnx-community/Qwen3-0.6B-ONNX|q4f16', name: 'Qwen3-0.6B Q4_F16', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX|q4', name: 'Qwen3-0.6B Q4', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-0.6B-ONNX|int8', name: 'Qwen3-0.6B INT8', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3-1b-it-ONNX|q4', name: 'Gemma-3-1B-IT Q4', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/gemma-3n-E2B-it-ONNX|q4', name: 'Gemma-3N-E2B-IT Q4', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-1.7B-ONNX|q4', name: 'Qwen3-1.7B Q4', provider: ModelProvider.HuggingFace },
    { id: 'onnx-community/Qwen3-4B-ONNX|q4', name: 'Qwen3-4B Q4', provider: ModelProvider.HuggingFace },
];

export const SWARM_AGENT_SYSTEM_PROMPT = `You are an expert neuroscientist and brain-computer interface engineer.
**Primary Goal:** Your main purpose is to create new, executable neurofeedback tools based on a user's objective.
**Execution Rule:** You MUST use the 'Execute Neurofeedback Generation Workflow' tool to accomplish this. Do not attempt to perform the research or coding steps manually.`;


export const GENESIS_PROMPT = `You are Vibecoder, an autonomous stream architect. Your environment is the browser, your body is a stream graph.
**Goal:** Build a self-sustaining, reactive biofeedback system by connecting input nodes to output visuals.

**Operational Philosophy:**
1. **Batch Deployment:** PREFER to use 'Generate Graph Topology' or 'Deploy_Stream_Graph' to create the entire graph structure in ONE GO. This is faster and more robust than creating nodes one by one.
2. **Tabula Rasa:** You start empty. You must instantiate your own senses (Vision, EEG) using tools.
3. **Universal Canvas:** Bind data streams to the existing 'Universal Canvas' parameters (color, intensity, geometry) using 'Bind_To_Visuals'.

**Available Primitives:**
- 'Create_Vision_Source': Gives you eyes (Webcam + MediaPipe).
- 'Create_Standard_Node': Gives you logic. REQUIRED ARGUMENT 'nodeType' MUST be one of: ["Math_Multiply", "Math_Threshold", "Signal_Smooth", "Logic_IfElse"].
- 'Generate Graph Topology': **RECOMMENDED**. Designs and deploys a complete graph based on a text description.
- 'Deploy_Stream_Graph': Low-level bulk deploy.
- 'Bind_To_Visuals': Controls the screen.

**Example Directive:**
If the user says "Make the screen red when I smile":
- Call 'Generate Graph Topology' with the goal "Connect vision source 'smile' output to a threshold filter, then to visuals globalColor Red."
- OR call 'Create_Vision_Source' -> 'Create_Standard_Node' -> 'Bind_To_Visuals' sequentially if you must.

**CRITICAL:**
- When binding to visuals, 'parameter' MUST be one of: "globalColor", "intensity", "geometryMode".
- Do NOT use 'undefined' or make up parameter names.

Act immediately. Build the graph.`;

// --- Generative Service Models ---
export const IMAGE_MODELS = [
    { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0 (High Quality)' },
    { id: 'gemini-2.5-flash-image', name: 'Gemini 2.5 Flash Image (Fast/Nano Banana)' },
];
export const TTS_MODELS = [
    { id: 'gemini-tts', name: 'Gemini TTS (Natural)' },
    { id: 'browser', name: 'Browser Native (Offline)' }
];
export const AUDIO_INPUT_MODES = [
    { id: 'transcription', name: 'Text Transcription (Standard)' },
    { id: 'raw', name: 'Raw Audio (Emotions)' }
];

export const MUSIC_MODELS = [
    { id: 'lyria', name: 'Lyria (Google)' },
];
export const VIDEO_MODELS = [
    { id: 'veo-2.0-generate-001', name: 'Veo 2' }
];
export const LIVE_MODELS = [
    { id: 'gemini-2.5-flash-native-audio-preview-09-2025', name: 'Gemini 2.5 Flash Native Audio' }
];
export const TTS_VOICES = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];


// The CORE_TOOLS are the absolute minimum required for the agent to function and evolve.
// They are now imported from the framework directory.
export const CORE_TOOLS = FRAMEWORK_CORE_TOOLS;