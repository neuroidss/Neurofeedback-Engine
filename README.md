# Neurofeedback Engine: The Neuro-Spatial OS

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

The **Neurofeedback Engine** is a foundational operating system for **Generative Mixed Reality (MR)** and **Embodied AI Interaction**.

It moves beyond passive screens to create a "Reality Player One" experience. By merging BCI (Brain-Computer Interfaces) with Generative AI (Cosmos/Genie) and Spatial Computing (AR), it allows users to **see the future intent of machines** and **control reality through attentive prediction**.

![Neuro-Spatial Concept](https://github.com/neuroidss/Neurofeedback-Engine/blob/main/docs/assets/neuro_quest_screenshot.png?raw=true)

## 🔮 Core Concepts

### 1. Phantom UI (Generative Predictive Control)
*The system doesn't just react; it predicts.*
*   **Concept:** Using Generative Video Models (like Genie/Cosmos), the engine predicts the next probable frames of reality (e.g., "The user wants to pick up the cup").
*   **The Phantom:** A holographic "ghost" of the action appears in AR over the real object.
*   **Neuro-Confirmation:** If the user focuses on this phantom (High SMR/Beta), the BCI validates the intent, and the command is sent to a robot/smart home to execute it.
*   **Result:** "Telekinetic" control without gestures. You see the future you want, and the system makes it real.

### 2. Machine Theory of Mind (Robot Telepathy)
*See what the machines are thinking.*
*   **AR Overlay:** When looking at drones or androids, the system projects their internal state, path planning, and logic into the user's field of view.
*   **Bi-Directional Sync:** The user's emotional state (Stress/Focus from BCI) is broadcast to the robot swarm. If you are anxious, the drones slow down and turn blue. If you are focused, they execute complex maneuvers.

### 3. Attentive Modeling (Generative CAD Lite)
*Where attention goes, reality flows.*
*   **Gaze-Driven Creation:** Stare at an empty space. The "Vibecoder" agent detects your fixation and spawns a generative tool (MCP) to fill that void—whether it's a virtual window to a forest or a dashboard for data analysis.
*   **MCP Creates MCP:** The system is recursive. You don't write code; you manifest tools that write code for you, live in the spatial environment.

---

## 🚀 The Stack

### 👁️ Visual Cortex: Neuro Quest V99 (Hybrid Reality)
A high-performance Python backend for **Latent Consistency Rendering**.
*   **Mixed Reality Mode:** Instead of generating a full VR world, V99 can take a camera feed (Passthrough) and apply a "Neuro-Filter".
*   **Effect:** Transform your room into a "Cyberpunk Bunker" or "Mycelial Forest" in real-time. The stability of the filter depends on your **Lucidity** (Neural Entropy).

### 🌌 Vibecoder Genesis (Spatial Stream Engine)
The reactive nervous system connecting Sensors, AI, and Actuators.
*   **Node-Based Logic:** Connects `Vision_Source` (AR Glasses) -> `Predictive_Model` -> `Robot_Actuator`.
*   **WebXR Ready:** Designed to render graph outputs directly into 3D space using `react-three-fiber` / `@react-three/xr`.

### 🎵 MusicGen Coherence (Adaptive Soundtrack)
An auditory cortex that ensures the "vibe" matches the reality.
*   **Semantic Conductor:** Uses **CLAP/ImageBind** to listen to the generated audio and compare it with the visual context. If the AR shows a "Horror" scene, the music shifts to dissonant strings.

---

## 🛠️ Hardware Ecosystem

The OS is designed to be hardware-agnostic but optimized for the "Tri-Link" setup:

1.  **Neural Link:** **FreeEEG8** (or any LSL device) for intent and state detection.
2.  **Visual Link:** **AR Glasses** (XREAL, Quest 3 Passthrough) for the Phantom UI overlay.
3.  **Physical Link:** **ROS 2 Bridge** for communicating with drones, arms, and rovers.

## 📦 Installation

This is a **Hybrid Architecture**. The Web Client acts as the Spatial Interface, while the Local Server acts as the AI Kernel.

### 1. Server Setup (The Kernel)
Manages heavy compute (Stable Diffusion, MusicGen, ROS 2 Bridge).

```bash
git clone https://github.com/neuroidss/Neurofeedback-Engine.git
cd Neurofeedback-Engine/server

# Creates isolated environments for Audio, Vision, and Base logic
chmod +x install.sh
./install.sh

# Start the Universal Kernel (Port 3001)
./start.sh
```

### 2. Client Setup (The Spatial UI)
```bash
cd .. 
npm install
npm run dev
```
Open `http://localhost:5173`.

## 🎮 Interaction Model

*   **Gaze:** Select object / Define context.
*   **Focus (BCI):** Confirm "Phantom" prediction / Crystallize object / Execute command.
*   **Relax (BCI):** Dismiss prediction / dissolve AR filter.
*   **Manifest (L1 Trigger):** Force-spawn a generative tool at gaze location.

## Roadmap & Market

*   **Current:** PC/Browser-based Generative Neuro-Game.
*   **Next:** WebXR integration for AR Glasses support.
*   **Future:** ROS 2 Integration for controlling physical drone swarms via "Phantom UI".

## License

**AGPLv3**. The foundation for the open Neuro-Spatial Web.
