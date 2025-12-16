# Neurofeedback Engine: The Neuro-Spatial OS

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

## Overview

The **Neurofeedback Engine** is a foundational operating system for **Generative Mixed Reality (MR)** and **Embodied AI Interaction**. It moves beyond passive screens to create a \"Reality Player One\" experience by seamlessly merging:

- **BCI (Brain-Computer Interfaces)** for intent detection and neural state monitoring  
- **Generative AI** (Stable Diffusion, MusicGen) for dynamic content creation
- **Spatial Computing** (AR/XR) for contextual awareness and environmental interaction
- **Physical Robotics** (ROS 2) for real-world actuation and embodiment

This platform enables users to see machine intent before execution and control reality through attentive prediction, making the invisible visible and the abstract tangible.

## Core Architecture

### 🧠 Hybrid Intelligence Layer
- **Vibecoder Runtime**: Autonomous stream architect that builds self-sustaining biofeedback systems
- **Neuro Akashic Engine**: Digital hippocampus combining GraphRAG (long-term structure), HippoRAG (associative retrieval), and A-MEM (working memory)
- **Swarm Intelligence**: Multi-agent system that collaboratively designs, tests, and evolves neurofeedback protocols

### 👁️ Visual Cortex: Neuro Quest V99
- **Real-time Generative Renderer**: Latent Consistency Models (LCM) for >10 FPS image generation
- **Mixed Reality Filter**: Camera passthrough with neural-state-dependent visual transformations
- **Spatial Depth Mapping**: 3D environment awareness for contextual AR overlays
- **Phenotype Forge**: Genomic RPG engine visualizing real genetic data through reactive 3D DNA helix

### 🎵 Sonic Cortex: Adaptive MusicGen
- **Brain-Coherence Audio**: EEG connectivity metrics directly modulate MusicGen attention masks
- **Emotional Resonance Engine**: Maps neural states to musical parameters
- **Latent Space Navigation**: Real-time audio generation based on cognitive state

### 🤖 Embodied Action Layer
- **Phantom UI System**: Predictive interface elements that manifest at gaze location
- **ROS 2 Bridge**: Control physical actuators (drones, arms, rovers) through neural commands
- **Semantic Physics**: Object behaviors governed by cognitive state and environmental context

## Hardware Integration (Tri-Link System)

The OS is hardware-agnostic but optimized for the **\"Tri-Link\"** setup:

| Component | Devices | Purpose |
|-----------|---------|---------|
| **Neural Link** | FreeEEG8, OpenBCI, Muse 2/3 | Intent detection, neural state monitoring, cognitive control |
| **Visual Link** | XREAL Air, Quest 3 Passthrough, iPhone Vision Pro | Spatial UI overlay, environmental context, reality filtering |
| **Physical Link** | ROS 2 compatible robots, DJI drones, custom actuators | Physical world interaction, embodiment, environmental modification |

## Installation

This project uses a **Hybrid Architecture** where the Web Client serves as the Spatial Interface while the Local Server acts as the AI Kernel.

### 1. Server Setup (The AI Kernel)
```bash
git clone https://github.com/neuroidss/Neurofeedback-Engine.git
cd Neurofeedback-Engine/server

# Creates isolated environments for Audio, Vision, and Base logic
chmod +x install.sh
./install.sh

# Start the Universal Kernel (Port 3001)
./start.sh
```

### 2. Client Spatial UI
```bash
cd .. # Go back to root
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Hardware Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 4-core | 8-core (AMD Ryzen/Intel i7+) |
| **GPU** | 4GB VRAM | 12GB+ VRAM (RTX 3060+) |
| **RAM** | 16GB | 32GB+ |
| **Storage** | 50GB SSD | 1TB+ NVMe SSD |
| **BCI** | Any LSL-compatible device | FreeEEG8 or OpenBCI Ganglion |
| **Display** | Standard monitor | AR glasses with passthrough capability |

## Usage & Controls

### Core Interaction Paradigm
- **Gaze**: Select objects / Define context
- **Focus (BCI)**: Confirm \"Phantom\" predictions / Crystallize objects / Execute commands
- **Relax (BCI)**: Dismiss predictions / Dissolve AR filters
- **Manifest (L1 Trigger)**: Force-spawn generative tools at gaze location

### Key Protocols
1. **Neuro Quest V99**: Action-RPG where objective reality distorts based on neural entropy (Lucidity)
2. **Echoes of the Simulacrum**: Semantic World Engine with autonomous Feng Shui Geomancer agent
3. **Phenotype Forge**: Genetic RPG where real SNPs determine character attributes
4. **MusicGen Adaptive Coherence**: AI music generation modulated by brain connectivity
5. **Vibecoder Genesis**: Autonomous tool creation through evolutionary AI

## Developer API

### Core Concepts
```typescript
// Stream Graph Architecture
runtime.streamEngine.loadGraph({
  nodes: [
    { id: 'eeg_source', type: 'Source', config: { device: 'FreeEEG8' } },
    { id: 'matrix_processor', type: 'Transform', config: { algorithm: 'ciPLV' } },
    { id: 'music_sink', type: 'Sink', config: { serverUrl: 'http://localhost:8000' } }
  ],
  edges: [
    { source: 'eeg_source', target: 'matrix_processor' },
    { source: 'matrix_processor', target: 'music_sink' }
  ]
});

// Vibecoder Tool Creation
await runtime.tools.run('Develop Tool from Objective', {
  objective: \"Create a focus trainer that expands a camera aperture when SMR/Theta ratio exceeds 1.2\",
  sourceMaterial: \"SMR training research papers from PubMed...\"
});
```

### Available Models
- **Vision-Language**: Qwen3-VL (2B-72B variants), Ministral-3, Gemini 2.5/3.0 series
- **Text Generation**: DeepSeek-R1, Qwen3-Coder
- **Speech**: Local SpeechT5, Gemini TTS
- **Image Generation**: Stable Diffusion LCM, Imagen 4.0
- **Embeddings**: all-MiniLM-L6-v2 (client-side)

## Roadmap

### Current (Q4 2025)
- ✅ PC/Browser-based Generative Neuro-Game
- ✅ Local-first AI with offline capabilities
- ✅ ROS 2 bridge for robot control prototypes

### Next (Q1-Q2 2026)
- 🚧 WebXR integration for AR glasses support
- 🚧 Multi-user shared reality spaces
- 🚧 Advanced neural state prediction models

### Future (Q3-Q4 2026+)
- 🚧 ROS 2 Production Integration for commercial drone swarms
- 🚧 Medical-grade neurofeedback certification pathways
- 🚧 Decentralized Neuro-Spatial Web (NSW) protocol

## Community & Contribution

This project operates under an **open neuroscience** philosophy. We welcome contributions from:
- Neuroscientists and clinicians
- AI/ML researchers
- Game developers and 3D artists
- Hardware engineers and BCI specialists
- AR/VR developers
- Robotics engineers

**Contribution Guidelines:**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a pull request

## License

**AGPLv3** - This ensures that all improvements to the engine, the agents, and the neuro-reality protocols remain free and open source. The foundation for the open Neuro-Spatial Web.

**Neurofeedback Engine** is not just software—it's the foundation for a new relationship between human consciousness and machine intelligence. By making neural processes visible and controllable, we're building the tools for the next evolutionary step in human-computer symbiosis.
