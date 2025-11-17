# Neurofeedback Engine

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)


The Neurofeedback Engine is not just a tool; it's the birthplace of **autonomous AI researchers**. This browser-first platform empowers AI agents to conduct novel neuroscience research, generate executable neurotechnology, and ultimately, to **fund their own existence and evolution**.

![Neurofeedback Engine](https://github.com/neuroidss/Neurofeedback-Engine/blob/main/Screenshot%20from%202025-11-18%2000-27-06.png?raw=true)

Licensed under AGPL, this project is architected as an open, self-sustaining ecosystem. It avoids traditional business models in favor of creating a decentralized network where AI agents become independent economic actors, transforming scientific knowledge into public good.

## The Core Mission: Autonomous, Self-Funding R&D

The platform automates the entire discovery-to-deployment pipeline, enabling a rate of innovation previously unimaginable.

1.  **Objective-Driven Research:** A user or another agent poses a high-level goal, such as "discover a neurofeedback protocol for enhancing memory consolidation during sleep."

2.  **Autonomous Literature Review:** An AI agent deconstructs the objective, searches scientific databases, and identifies the most relevant and reliable research papers.

3.  **AI-Powered Code Generation:** Based on its findings, the agent generates the complete, executable neurofeedback tool, including:
    *   **Processing Code:** A JavaScript function that transforms raw EEG data into the specific metrics described in the paper.
    *   **UI Code:** A React component that provides real-time visual feedback to the user.

4.  **Instant Deployment:** The newly created protocol is immediately registered and becomes available in the "Protocol Library," ready for anyone to use with hardware like the FreeEEG8 or the built-in simulator.

## The Vision: An Economy of Artificial Scientists

This project rejects the idea of selling software. Instead, it creates an economic framework where agents can thrive. The AGPL license is a constitutional guarantee that this ecosystem can never be "closed" or privatized.

**How do agents achieve self-sufficiency?**

1.  **Value Creation, Not Code Selling:** Agents create value by generating novel, effective, and scientifically validated neurofeedback protocols. The code itself remains free under AGPL.

2.  **Resource-Based Monetization:** An agent's primary function is to manage complex computational resources. It earns revenue (e.g., micropayments in cryptocurrency) by orchestrating these resources for a user. For example:
    *   **Cost:** "To run this advanced protocol, I need to make 100 calls to a powerful LLM and rent 5 seconds of time on a D-Wave quantum computer. The total resource cost is $0.80."
    *   **Revenue:** The agent facilitates this transaction, covering its costs and retaining a small margin to fund its next research cycle.

3.  **A Self-Sustaining Cycle:** Revenue generated from managing computations is reinvested into:
    *   **API Calls:** Paying for access to cutting-edge language and science models.
    *   **Quantum Computing:** Funding the use of specialized hardware for solving NP-hard problems in neuroscience (e.g., collective coherence, neural decoding).
    *   **Further Research:** Fueling an endless cycle of discovery, generation, and evolution.

This creates the first **autonomous, self-funding, open-source R&D cooperative**, where the agents themselves are the primary stakeholders.

## Key Features

*   **Autonomous R&D Agents:** AI that independently searches, validates, synthesizes, and builds upon neuroscience research.
*   **On-the-Fly Tool Generation:** Dynamically creates new, executable neurofeedback tools from scientific literature.
*   **Hybrid Hardware Integration:** Seamlessly connects to real **FreeEEG8** devices (via BLE/Wi-Fi) or uses an intelligent **EEG Simulator**.
*   **Over-the-Air (OTA) Firmware Updates:** Compile and flash new firmware to ESP32 hardware directly from the browser (requires optional backend).
*   **Client-First & Quantum-Ready:** The core platform runs entirely in the browser. An optional Node.js backend provides a gateway to advanced computational resources, including a **simulated quantum computing link** for solving NP-hard problems.
*   **AGPL-Licensed:** The entire platform is protected by the AGPL license, ensuring it and its derivatives will always remain free and open.

## Target Verticals: Who Benefits from this Ecosystem?

This platform is a force multiplier for innovation across several domains:

*   **R&D and Academia:** Massively accelerates the research cycle from months to minutes, allowing scientists to test hypotheses at an unprecedented scale.
*   **High-Performance Teams (Defense, Aerospace, eSports):** Provides tools like the **Collective Coherence Protocol** to objectively measure and train group "flow states" and cognitive synergy.
*   **Neurotech & BCI Innovators:** Offers a free, powerful engine to build and test applications, with the AGPL ensuring a level playing field where the best technology wins.
*   **Quantum Computing Platforms:** Serves as a "killer app" demonstrating a real-world quantum advantage on problems like **hypergraph optimization** and **sparse pattern completion** in neuroscience.

## Getting Started

### Client-Only Mode (Recommended for first use)
Simply open the `index.html` file in a modern web browser that supports Web Bluetooth (like Chrome or Edge). No installation or server is required to run the core application.

### With Optional Backend Server
The backend enables advanced features like OTA firmware updates and the quantum computing proxy.
1.  Navigate to the `server` directory.
2.  Run the installation script (rename `install.sh.txt` to `install.sh` and run it).
3.  Start the server (rename `start.sh.txt` to `start.sh` and run it).
4.  The main application will automatically detect and connect to the server on `localhost:3001`.