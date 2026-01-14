
# Neurofeedback Engine: Generative Neuro-Reality System

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

The **Neurofeedback Engine** is a platform for **Generative Neuro-Reality**. It merges real-time brain-computer interfaces (BCI) with generative AI to create immersive experiences that adapt to your neural state.

## 🧬 Genesis Driver (The Narrative Core)

The **Genesis Driver** is an autopoietic narrative engine designed to ingest raw literature and convert it into a playable, elastic reality.

### Key Technologies:
1.  **Fate Graphing:**
    *   Ingests raw text (novels, lore documents) and chunks them into a directed acyclic graph (DAG) of narrative events.
    *   **Elasticity Engine:** Calculates "Logic Distance" between your actions and the canon. If you deviate, it generates "Structural Substitutions"—alternative events that fulfill the same narrative function (e.g., "Meet the Mentor") via different means.

2.  **The Alchemical Engine (Rashomon Effect):**
    *   Events are not static descriptions. They are calculated as **Chemical Reactions** between entities.
    *   **Perspective Matrix:** The engine tracks the subjective reality of every entity. Ideally, the Hero's "Victory" matches the Villain's "Defeat". When these perspectives misalign (e.g., Hero thinks they saved the town, Town thinks Hero destroyed it), the engine flags **Alchemical Dissonance**.

3.  **Recursive Language Models (RLM):**
    *   To handle infinite context, the engine writes and executes its own JavaScript code to recursively summarize and query massive history logs on demand.

4.  **Echo Mode:**
    *   A simulation mode where the engine acts as *both* the GM and the Player, attempting to generate the "Perfect Canonical Run" of the ingested story. Useful for testing the Fate Graph's integrity.

## 🚀 Other Core Modules

### ⚔️ Neuro Quest (Hybrid Engine)
A high-performance Action-RPG running on a hybrid architecture (Python Native + React).
*   **Semantic Physics:** Conflict is resolved not by HP/Damage numbers, but by calculating the vector dot-product between concept embeddings (e.g., "Fire" vs "Ice" = High Conflict, "Fire" vs "Rage" = Resonance).
*   **Holacracy Mode:** A variant where entities are "Holons" drifting towards semantic attractors.

### 🧠 Neuro-Akashic Engine
A "Digital Hippocampus" using **GraphRAG** and **HippoRAG** concepts.
*   **Associative Retrieval:** Memories are linked not just by time, but by semantic similarity and emotional valence (derived from facial expression analysis).

## 🛠️ Hardware Support ("Tri-Link")

Compatible with **FreeEEG8** and standard LSL devices.
1.  **Web Bluetooth (BLE):** Zero-install wireless connection.
2.  **WiFi (UDP/WSS):** High-bandwidth streaming.
3.  **USB Serial:** Ultra-low latency telemetry.

## 📦 Installation

### 1. Server Setup (The Kernel)
The server manages heavy AI processes (MCPs) like V-JEPA, MusicGen, and local LLMs.

```bash
git clone https://github.com/neuroidss/Neurofeedback-Engine.git
cd Neurofeedback-Engine/server
./install.sh
./start.sh
```

### 2. Client Setup (The UI)
```bash
cd ..
npm install
npm run dev
```
Open `http://localhost:5173`.

## License
**AGPLv3**.
