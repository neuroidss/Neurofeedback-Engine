# Neurofeedback Engine

**Live Demo:** [https://neuroidss.github.io/Neurofeedback-Engine/](https://neuroidss.github.io/Neurofeedback-Engine/)

The Neurofeedback Engine is a browser-first, **autonomous R&D platform** where AI agents not only conduct neuroscience research but are designed to **fund their own evolution** by creating commercially viable neuro-technology. It mines scientific papers for novel EEG-based brain training protocols and instantly generates new, executable neurofeedback tools for interfaces like the FreeEEG8.

The core of the platform is a "fast food" model for neuro-technology: a powerful, automated engine that transforms scientific knowledge into ready-to-use digital tools, bridging the gap between the lab and the user.

## The Generation Engine: From Paper to Protocol in Minutes

Instead of slow, manual R&D, the Neurofeedback Engine automates the discovery-to-deployment pipeline, allowing researchers to test hypotheses at a rate previously unimaginable.

1.  **Objective-Driven Research:** The user provides a high-level research domain, such as "deep relaxation" or "enhancing gamma-wave activity for focus."

2.  **Autonomous Literature Review:** An AI agent deconstructs the objective, searches scientific databases like PubMed, and identifies the most relevant and reliable research paper.

3.  **AI-Powered Code Generation:** Based on the paper, the agent generates two key artifacts:
    *   **Processing Code:** A JavaScript function that processes raw EEG data into the specific metrics described in the paper.
    *   **UI Code:** A React component that implements the visual feedback logic based on the processed metrics.

4.  **Instant Tool Creation & Deployment:** The newly generated code is immediately registered as a **new, executable LLM Tool**. It instantly appears in the "Protocol Library," ready to be run in the app's "Neurofeedback Player" with a single click.

## Key Features

*   **Autonomous R&D Agent:** An AI pipeline that searches for, validates, and synthesizes neuroscience research.
*   **On-the-Fly Tool Generation:** Each protocol is dynamically created as a new, executable tool with data processing logic and a visual UI component.
*   **Hybrid Hardware Integration:** Seamlessly switch between the built-in EEG simulator and a real **FreeEEG8** device using a smart hybrid connection model (BLE for setup, Wi-Fi for streaming).
*   **Over-the-Air (OTA) Firmware Updates:** Compile and flash new firmware directly to your ESP32-based hardware from the web interface.
*   **Client-First & Quantum-Ready:** The entire AI research and UI runs in the browser. An optional Node.js backend unlocks advanced features, including a simulated quantum computing link for solving NP-hard problems in advanced protocols.
*   **Intelligent Data Simulation:** A built-in simulator generates the specific raw EEG data required by each protocol, enabling immediate use and testing without hardware.

## Target Verticals: Who Is This For?

This platform is not just a tool; it's a force multiplier for innovation across several high-value domains.

#### 1. R&D and Academia (Research as a Service)
*   **Problem:** The R&D cycle from hypothesis to a testable neurofeedback protocol can take months.
*   **Solution:** Our engine reduces this cycle to minutes. We enable neuroscientists to **generate and test 100 protocols a day, not one a month**, dramatically accelerating the pace of discovery.

#### 2. High-Performance Teams (Defense, Aerospace, eSports)
*   **Problem:** Achieving and measuring cognitive synergy and intuitive "flow state" in elite teams (pilots, special forces, eSports athletes) is subjective and difficult to train.
*   **Solution:** The **Collective Coherence Protocol** and hypergraph optimization offer an objective, data-driven system for training cognitive synergy and achieving peak team performance where milliseconds and intuition are critical.

#### 3. Neurotech & BCI Companies
*   **Problem:** BCI hardware companies need a rich ecosystem of applications to drive device adoption, but creating them is slow and expensive.
*   **Solution:** The Neurofeedback Engine can be licensed as a white-label platform, creating an **automatic "app store" for neuro-applications**. It allows hardware companies to offer their users an ever-growing library of scientifically validated protocols with near-zero development cost.

#### 4. Clinical & Therapeutic Centers
*   **Problem:** Neurofeedback therapy for conditions like ADHD, PTSD, and anxiety lacks standardization and personalization.
*   **Solution:** Our agent can adapt and personalize protocols based on a patient's real-time biometric data, creating an auditable chain from the source scientific paper to the clinical effect — a critical feature for regulatory approval.

#### 5. Quantum Computing Platforms
*   **Problem:** Quantum cloud providers (IBM Quantum, D-Wave, AWS Braket) need "killer apps" to demonstrate a real-world quantum advantage.
*   **Solution:** We offer the world's first browser-based neurofeedback platform with quantum acceleration. Our protocols for **collective coherence (hypergraph optimization)** and **neural decoding (sparse pattern completion)** are practical use cases that showcase the power of QPU/GPU hybrid computing.

## The Vision: Towards a Self-Funding R&D Ecosystem

The ultimate goal is for the agents to not just build tools, but to build a self-sustaining business around them. This platform is designed to test a "triple-launch" strategy:

1.  **Open-Source Core:** The foundational engine remains open-source to attract the brightest minds in the scientific and developer communities, fostering rapid innovation.
2.  **Enterprise Platform:** Advanced modules (Quantum Boost, multi-user dashboards, clinical validation suites) are licensed to research labs, clinics, and high-performance organizations.
3.  **White-Label Engine:** The core generation technology is licensed to BCI hardware manufacturers, allowing them to instantly provide a rich software ecosystem for their devices.

This model creates a virtuous cycle: revenue from enterprise and white-label clients funds further development of the open-source core, enabling the agents to tackle even more complex R&D challenges and, ultimately, become self-sufficient.

## Getting Started

### Client-Only Mode (Recommended for first use)
Simply open the `index.html` file in a modern web browser that supports Web Bluetooth (like Chrome or Edge). No installation or server is required to run the core application, including AI-powered research and hardware connection via BLE.

### With Optional Backend Server
The backend enables advanced features like Over-the-Air (OTA) firmware updates.
1.  Navigate to the `server` directory.
2.  Run the installation script (rename `install.sh.txt` to `install.sh` and run it).
3.  Start the server (rename `start.sh.txt` to `start.sh` and run it).
4.  The main application will automatically detect and connect to the server on `localhost:3001`.
