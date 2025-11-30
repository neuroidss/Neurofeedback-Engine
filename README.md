
# Neurofeedback Engine & Neuro Quest: Generative Reality System

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

**A Browser-First Platform for Autonomous Neurotechnology & Generative Reality.**

The **Neurofeedback Engine** is not just a dashboard; it is a **Swarm Intelligence System** capable of conducting neuroscience research, writing its own code, and compiling executable neurofeedback protocols in real-time.

It powers **Neuro Quest**, a hybrid Action-RPG where the game world, narrative, and music adapt to your real-time neural state (Lucidity, Focus, Coherence).

---

## 🚀 Core Modules

### ⚔️ Neuro Quest (Generative RPG)
A hybrid application that offloads heavy rendering to a native Python window while maintaining control via the Web UI.
*   **The "Dream Stream":** Uses **Latent Consistency Models (LCM)** to render the world at 10+ FPS based on the Game Master's narrative and your neural stability.
*   **Psychoanalytic AI Game Master:** An autonomous agent that distinguishes between the "Symbolic" (World State) and the "Imaginary" (User Perception), creating hallucinations when your neural focus drops.
*   **Elemental Combat:** A fully playable Action-RPG system with Genshin-style elemental reactions (Fire, Water, Lightning, Wind), playable via Gamepad or Keyboard.

### 🎵 MusicGen Adaptive (Neuro-Link)
A dedicated generative audio pipeline for creating "Neuro-Adaptive Music".
*   **Direct Neuro-Link:** Maps real-time **EEG Coherence (ciPLV)** directly to the Attention Masks of the **MusicGen** Transformer model. High brain connectivity = High musical structural integrity.
*   **Zero-Gap Playback:** A custom Python engine that manages context windows to generate infinite, seamless audio on consumer GPUs.
*   **Isolated Environment:** Runs in a dedicated `venv_audio` environment to prevent dependency conflicts.

### 🌌 Vibecoder Genesis (Stream Engine)
A reactive dataflow graph system inspired by visual programming languages.
*   **Hot-Swappable Topology:** The AI agent can re-wire the signal processing graph in real-time without reloading the page.
*   **Universal Canvas:** A shared 3D visualization layer (React Three Fiber) controlled by graph outputs.
*   **Cross-Modal:** Nodes can process EEG, Computer Vision (Face/Gaze), and Audio data simultaneously.

### 🔬 Neuro-Audio Studio
A professional-grade auditory entrainment suite running entirely in the browser.
*   **Sonic Shield:** Uses microphone input to detect ambient noise and automatically masks it with generative colored noise to prevent the "Startle Response".
*   **Bio-Harmony:** Uses computer vision to detect emotional valence and adjusts musical scales (Lydian vs. Dorian) instantly.

---

## 🏗️ Architecture: The Universal Kernel

The system uses a **Client-Server-Swarm** architecture:

1.  **React Client (The UI):** Handles visualization, state management, and the Agent Swarm.
2.  **Universal Kernel (Node.js):** A process orchestrator (MCP) running on port `3001`. It spawns and manages Python microservices.
3.  **Python Shards:** Specialized, isolated environments for heavy lifting:
    *   `venv`: General purpose.
    *   `venv_vision`: Stable Diffusion / Neuro Quest (Torch + Diffusers).
    *   `venv_audio`: MusicGen (Torch + AudioCraft + Numpy < 2.0).

---

## 📦 Installation

This project requires **Node.js (v18+)** and **Python 3.10+**.

### 1. Backend Setup (The Kernel)
The backend manages multiple virtual environments to handle conflicting dependencies between MusicGen and Stable Diffusion.

```bash
git clone https://github.com/your-username/Neurofeedback-Engine.git
cd Neurofeedback-Engine/server

# Make the installer executable
chmod +x install.sh

# Run the installer. 
# This will create 'venv', 'venv_audio', and 'venv_vision'.
# Grab a coffee, this downloads PyTorch multiple times.
./install.sh
```

### 2. Frontend Setup
```bash
# Go back to root
cd ..

# Install React dependencies
npm install
```

---

## 🕹️ Usage

### 1. Start the Universal Kernel
You must keep this terminal open. It acts as the bridge between the Web UI and the Python AI models.

```bash
cd server
./start.sh
```
*The server will listen on port 3001.*

### 2. Launch the Web Client
Open a new terminal.

```bash
npm run dev
```
*Open `http://localhost:5173` in your browser.*

### 3. Configuration (API Keys)
1.  Click the **Gear Icon** in the top-right corner of the Web UI.
2.  **Google Gemini:** Required for the Agent Swarm (Reasoning).
3.  **DeepSeek / OpenAI (Optional):** For alternative reasoning models.
4.  **Local Ollama (Optional):** For fully offline text generation.

---

## 🧠 Hardware Support ("Tri-Link")

The platform supports the custom **FreeEEG8 Firmware v3.1**, enabling robust connectivity via three simultaneous channels:

*   **Web Bluetooth (BLE):** Zero-install wireless connection.
*   **WiFi (WebSocket/WSS):** High-bandwidth streaming over local networks.
*   **USB Serial:** Hardwired telemetry for ultra-low latency.

**No Hardware? No Problem.**
The system includes high-fidelity **Simulators** for EEG, Camera, and Microphone data. You can develop and test protocols without a BCI headset.

---

## 🤝 Contributing

We welcome "Vibecoders" – developers who want to push the boundaries of BCI and Generative AI.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes.
4.  Push to the branch.
5.  Open a Pull Request.

## 📄 License

**AGPLv3**. This project is open-source. All improvements to the engine and the agents within it must remain free and open.

