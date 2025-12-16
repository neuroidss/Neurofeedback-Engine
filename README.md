# Neurofeedback Engine: Generative Neuro-Reality System

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

The **Neurofeedback Engine** is a platform for **Generative Neuro-Reality**. It merges real-time brain-computer interfaces (BCI) with generative AI (Stable Diffusion, MusicGen, LLMs) to create immersive experiences that adapt to your neural state.

It is designed not just for gaming, but as a tool for **Digital Psychedelic Therapy** and **Cyber-Shamanism**, enabling users to externalize their subconscious and "crystallize" mental order out of chaos.

## 🚀 Core Modules

### ⚔️ Neuro Quest (Native V99)
A high-performance, generative Action-RPG running on a hybrid engine (Native Python Renderer + Web Telemetry).
*   **The "Trip" (Generative Stream):** The world is rendered in real-time using **Latent Consistency Models (LCM)**. It flows and mutates based on your neural entropy (Lucidity).
*   **The "Integration" (Psychic Anchors):** A therapeutic mechanic inspired by psychedelic integration. Use high-focus states to **"Manifest"** permanent order. Pressing the Manifest trigger locks the generative chaos, creating a permanent "Anchor" in the world database that persists across sessions.
*   **Elemental Combat:** Genshin-style reaction system (Fire, Water, Lightning, Wind) controlled via Gamepad.
*   **Native Performance:** Runs a dedicated Python process for direct GPU access and high-FPS video streaming to the browser.

### 🎵 MusicGen Coherence (Neuro-Adaptive Audio)
A specialized pipeline for AI music generation that listens to your brain.
*   **Attention Masking:** Uses real-time **EEG Coherence Matrices (ciPLV)** to modulate the Self-Attention layers of the **MusicGen** model. High brain synchrony = highly structured, long-context music. Low synchrony = chaotic, short-context jazz.
*   **Infinite Stream:** Adaptive buffering system ensures gapless, endless playback.

### 🌌 Vibecoder Genesis (Stream Engine)
The reactive nervous system of the platform.
*   **Node-Based Logic:** A visual programming environment where signals flows from Sources (EEG, Vision) -> Transforms (Math, Filters) -> Sinks (Visuals, Audio).
*   **Hot-Swappable:** The AI agent can re-wire the graph in real-time to create new biofeedback protocols on the fly.

### 🧠 Neuro-Akashic Engine (Alpha / Roadmap)
A "Digital Hippocampus" for the generative world.
*   **Architecture:** Combines **GraphRAG** (Long-term structure), **HippoRAG** (Associative retrieval), and **A-MEM** (Working memory).
*   **Goal:** To remember not just *what* happened, but *how it felt*. If you encounter a "Cave" and feel "Fear" (Beta spikes), the engine links these concepts globally, tailoring future hallucinations to therapeutic needs.

## 🛠️ Hardware Support ("Tri-Link")

Compatible with **FreeEEG8** and standard LSL devices.
1.  **Web Bluetooth (BLE):** Zero-install wireless connection.
2.  **WiFi (UDP/WSS):** High-bandwidth streaming over local networks.
3.  **USB Serial:** Hardwired telemetry for ultra-low latency.

**Simulators:** Includes built-in physics-based simulators for EEG, Camera (Face Tracking), and Microphone input.

## 📦 Installation (Full Stack)

This project uses a **Hybrid Architecture**. The Client (React) orchestrates the Server (Python/Node), which manages heavy AI processes (MCPs).

### 1. Server Setup (The Kernel)
The server manages isolated virtual environments to prevent dependency conflicts (e.g., MusicGen's old numpy vs. Stable Diffusion's new torch).

```bash
git clone https://github.com/neuroidss/Neurofeedback-Engine.git
cd Neurofeedback-Engine/server

# Creates 3 environments:
# 1. venv (Base System)
# 2. venv_audio (MusicGen / AudioCraft)
# 3. venv_vision (Neuro World / Diffusers)
chmod +x install.sh
./install.sh

# Start the Universal Kernel (Port 3001)
./start.sh
```

### 2. Client Setup (The UI)
```bash
cd .. # Go back to root
npm install
npm run dev
```
Open `http://localhost:5173`.

## 🎮 Controls (Neuro Quest)

*   **Left Stick:** Move
*   **Right Stick:** Camera Pan
*   **Left Trigger (L2):** **Lucidity Dampener** (Relax to destabilize world / Focus to stabilize).
*   **Left Bumper (L1):** **MANIFEST** (Create Psychic Anchor). Requires High Focus.
*   **Face Buttons:** Elemental Combat (Fire, Water, etc).

## License

**AGPLv3**. This ensures that all improvements to the engine, the agents, and the neuro-reality protocols remain free and open source.