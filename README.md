# Neurofeedback Engine

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

The Neurofeedback Engine is a browser-first platform that empowers AI agents to conduct novel neuroscience research, generate executable neurotechnology, and autonomously optimize brain-computer interfaces (BCIs).

![Neurofeedback Engine](https://github.com/neuroidss/Neurofeedback-Engine/blob/main/Screenshot%20from%202025-11-18%2023-48-24.png?raw=true)

Licensed under AGPL, this project creates an open ecosystem where AI agents act as autonomous researchers, mining scientific literature to create self-contained, executable neurofeedback protocols.

## Core Architecture

The engine is built on a **Client-First, Hybrid-Compute** architecture designed for real-time performance and broad hardware compatibility.

### 1. Autonomous R&D Swarm
*   **Objective-Driven:** Users state a high-level goal (e.g., "Enhance theta-gamma coupling for memory").
*   **Federated Search:** Agents autonomously query PubMed, BioRxiv, and Google Patents.
*   **Self-Healing Generation:** The system writes, compiles, and *fixes* its own JavaScript/React code to build custom UI tools and signal processing pipelines.

### 2. "Tri-Link" Hardware Integration
The platform supports the custom **FreeEEG8 Firmware v3.1**, enabling robust connectivity via three simultaneous channels:
*   **Web Bluetooth (BLE):** For seamless, zero-install provisioning and control.
*   **WiFi (WebSocket/WSS):** For high-bandwidth, low-latency data streaming over local networks.
*   **USB Serial:** For reliable, hardwired telemetry and debugging.
*   **Simulators:** Built-in physics-based simulators for 8, 32, and 128-channel arrays.

### 3. Hybrid DSP Engine
Real-time signal processing is decoupled from the main UI thread to ensure smooth 60fps rendering.
*   **GPU Acceleration:** Uses **GPU.js (WebGL)** to offload O(N²) matrix calculations (like Phase Locking Value / ciPLV) for high-density arrays (up to 128 channels).
*   **Web Workers:** Fallback to multi-threaded CPU processing for standard operations.
*   **Quantum Proxy:** Connects to a backend simulation of **D-Wave Quantum Annealers** to solve NP-hard combinatorial optimization problems, such as Hypergraph Dissonance in collective coherence protocols.

### 4. Vibecoder OS
An experimental, autonomous optimization loop:
1.  **Generate:** The agent creates a visual environment intended to induce a specific mental state (e.g., "Deep Focus").
2.  **Measure:** It captures real-time EEG data from the user.
3.  **Mutate:** Using the brainwave state as a loss function, it iteratively rewrites the UI code in real-time to maximize the target metric, evolving a hyper-personalized interface.

## AI Model Support

The engine is agnostic to the underlying LLM provider and supports:
*   **Google Gemini:** 3 Pro, 2.5 Flash/Pro.
*   **DeepSeek (via Nebius):** DeepSeek-V3 and R1 models.
*   **OpenAI:** GPT-4o/mini.
*   **Local / Private:**
    *   **Ollama:** For running open-weight models (Llama 3, Mistral) locally.
    *   **Wllama:** In-browser execution of quantized models via WebAssembly.
    *   **HuggingFace:** Direct browser-based inference.

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

## Target Verticals

*   **Rapid Prototyping:** Reduce the "Paper-to-Protocol" cycle from months to minutes.
*   **Collective Intelligence:** Tools for measuring and training group flow states using hypergraph analysis.
*   **Therapeutic Gaming:** Procedurally generated environments that adapt to user neural states.
*   **Open Science:** A transparent, reproducible platform for sharing neurofeedback paradigms.

## License

**AGPLv3**. This ensures that all improvements to the engine and the agents within it remain free and open source.
