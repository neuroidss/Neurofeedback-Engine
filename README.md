
# Neurofeedback Engine

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

The Neurofeedback Engine is a browser-first platform that empowers AI agents to conduct novel neuroscience research, generate executable neurotechnology, and autonomously optimize brain-computer interfaces (BCIs).

![Neurofeedback Engine](https://github.com/neuroidss/Neurofeedback-Engine/blob/main/Screenshot%20from%202025-11-18%2023-48-24.png?raw=true)

Licensed under AGPL, this project creates an open ecosystem where AI agents act as autonomous researchers, mining scientific literature to create self-contained, executable neurofeedback protocols.

## Core Features

### 1. Neuro-Audio Studio (Zero-Hardware)
A professional-grade auditory entrainment suite that works instantly in any browser.
*   **Open-Loop Mode:** Uses Binaural Beats, Isochronic Tones, and Generative Ambient Music to guide the brain into Focus, Relaxation, or Sleep states without any sensors.
*   **Audio-Visual Entrainment (AVE):** Syncs a visual stroboscope with the binaural beat frequency to reinforce neural entrainment through the visual cortex (SSVEP). **WARNING:** This feature produces flashing lights and should not be used by individuals with photosensitive epilepsy.
*   **Adaptive Sonic Shield:** Uses the microphone to monitor ambient noise levels. If a distraction (e.g., conversation, traffic) spikes, the engine automatically boosts the background "Brown Noise" density to mask it, preventing the "Startle Response" and preserving deep focus.
*   **Bio-Harmony:** Uses your webcam (computer vision) to detect emotional valence (smile/frown) and automatically adjusts the musical harmony (Major/Lydian vs Minor/Dorian).
*   **Neuro-Link:** If an EEG device is connected, it switches to "Closed-Loop" mode, dynamically adjusting the beat frequency based on real-time attention metrics.

### 2. Stream Engine Architecture
The engine is built on a reactive dataflow graph system ("Vibecoder Genesis").
*   **Node-Based Logic:** Signal processing pipelines are constructed as directed graphs of nodes (Source -> Filter -> Sink).
*   **Hot-Swappable:** The AI agent can re-wire the graph in real-time without reloading the page.
*   **Cross-Modal:** Nodes can process EEG, Audio, and Vision data simultaneously.

### 3. Autonomous R&D Swarm
*   **Objective-Driven:** Users state a high-level goal (e.g., "Enhance theta-gamma coupling for memory").
*   **Federated Search:** Agents autonomously query PubMed, BioRxiv, and Google Patents.
*   **Self-Healing Generation:** The system writes, compiles, and *fixes* its own JavaScript/React code to build custom UI tools and signal processing pipelines.

### 4. "Tri-Link" Hardware Integration
The platform supports the custom **FreeEEG8 Firmware v3.1**, enabling robust connectivity via three simultaneous channels:
*   **Web Bluetooth (BLE):** For seamless, zero-install provisioning and control.
*   **WiFi (WebSocket/WSS):** For high-bandwidth, low-latency data streaming over local networks.
*   **USB Serial:** For reliable, hardwired telemetry and debugging.

### 5. Hybrid DSP & Quantum Proxy
Real-time signal processing is decoupled from the main UI thread.
*   **GPU Acceleration:** Uses **GPU.js (WebGL)** for O(N²) matrix calculations (ciPLV).
*   **Quantum Annealing:** Connects to a backend simulation of **D-Wave Quantum Annealers** for solving NP-hard combinatorial optimization problems in brain networks.

## AI Model Support

The engine is agnostic to the underlying LLM provider and supports:
*   **Google Gemini:** 3 Pro, 2.5 Flash/Pro (Supports Image Gen, TTS, and Lyria Music).
*   **DeepSeek (via Nebius):** DeepSeek-V3 and R1 models.
*   **OpenAI:** GPT-4o/mini.
*   **Local / Private:** Ollama, Wllama (WASM), HuggingFace (WebGPU).

## Getting Started

### Client-Only Mode (Quick Start)
No installation required for core features.
1.  Clone the repository.
2.  Run `npm install` and `npm run dev`.
3.  Open `http://localhost:5173`.

### Full Stack Mode (Optional)
Enables OTA Firmware Updates, Python Proxies, and Quantum Simulation.

1.  **Start the Backend:**
    ```bash
    cd server
    ./install.sh  # Installs Node & Python deps
    ./start.sh    # Starts server on port 3001
    ```
2.  **Start the Client:**
    ```bash
    # In root directory
    npm run dev
    ```

## License

**AGPLv3**. This ensures that all improvements to the engine and the agents within it remain free and open source.
