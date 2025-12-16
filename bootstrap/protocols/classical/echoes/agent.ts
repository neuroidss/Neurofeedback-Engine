
export const GEOMANCER_BRAIN = `
const useUniversalAgent = (runtime, memory, audioInput, activeLore, worldModel) => {
    const [thought, setThought] = useState("Calibrating Aesthetic Sensors...");
    const [dialogue, setDialogue] = useState("");
    const [robotDirective, setRobotDirective] = useState(null); 
    const [isSpeaking, setIsSpeaking] = useState(false);

    // --- TTS WRAPPER ---
    const speak = async (text) => {
        if (isSpeaking || !text) return;
        setIsSpeaking(true);
        setDialogue(text);
        try {
            const audio = await runtime.ai.generateSpeech(text, 'Fenrir');
            if (audio && audio !== 'LOCAL_TTS_REQ') {
                const snd = new Audio("data:audio/wav;base64," + audio);
                await snd.play();
                snd.onended = () => setIsSpeaking(false);
            } else throw new Error("Local TTS fallback");
        } catch(e) {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 1.0; u.pitch = 0.8;
            u.onend = () => setIsSpeaking(false);
            window.speechSynthesis.speak(u);
        }
    };

    // --- AGENT LOOP ---
    useEffect(() => {
        const cycle = async () => {
            if (isSpeaking || memory.isIngesting) return;
            
            // 1. GATHER SENSORY DATA
            // worldModel comes from sensors.ts (Confirmed vs Hypotheses)
            const { confirmed, hypotheses } = worldModel || { confirmed: [], hypotheses: [] };
            
            // --- PRIORITY 1: VERIFY UNCERTAIN REALITY ---
            if (hypotheses.length > 0 && Math.random() > 0.5) {
                // Pick a hypothesis to verify
                const target = hypotheses[0];
                const msg = \`I see a faint shape that looks like a \${target.label}. Is that correct?\`;
                
                setThought(\`Verifying hypothesis: \${target.label} (Conf: \${target.confidence.toFixed(2)})\`);
                speak(msg);
                runtime.logEvent(\`[AGENT] 🔍 Verifying hypothesis: \${target.label}\`);
                return; // Skip judgment this cycle
            }

            // --- PRIORITY 2: JUDGE CONFIRMED REALITY ---
            const confirmedSummary = confirmed.map(e => \`\${e.label} (\${e.status})\`).join(', ');
            let visualContext = \`Confirmed Objects: [\${confirmedSummary || "None"}].\`;
            
            // Add Memory Context
            const recentMemories = await memory.retrieve("current visual state", null);
            if (recentMemories.length > 0) {
                visualContext += \` Recent Memory: \${recentMemories[0].content}.\`;
            }

            // Fetch the formal Framework Tool
            const responseTool = runtime.tools.list().find(t => t.name === 'evaluate_harmony');
            if (!responseTool) return;

            const systemPrompt = activeLore.agentPersona + 
                "\\nCRITICAL INSTRUCTION: You are a Perfectionist Inspector. " +
                "You rely ONLY on the 'Confirmed Objects' list. " +
                "If the list is empty, complain about the void. " +
                "You MUST use the 'evaluate_harmony' tool.";

            const userPrompt = \`
            SCENE DATA:
            \${visualContext}
            
            USER INPUT:
            \${audioInput.lastInput || "None"}
            
            TASK: Judge the scene. Do you like it? Explain why. Call the tool.
            \`;
            
            try {
                const result = await runtime.ai.processRequest(userPrompt, systemPrompt, [responseTool]);

                if (result.toolCalls && result.toolCalls.length > 0) {
                    for (const call of result.toolCalls) {
                        if (call.name === 'evaluate_harmony') {
                            const { judgment, critique, robotic_command, target_coordinates } = call.arguments;
                            
                            setThought(critique);
                            runtime.logEvent(\`[JUDGE] Verdict: \${judgment}\`);
                            runtime.logEvent(\`[OPINION] 🗣️ "\${critique}"\`);

                            if (robotic_command && robotic_command !== "MAINTAIN_HARMONY") {
                                let cmd = robotic_command;
                                if (target_coordinates) cmd += \` @ [\${target_coordinates.join(',')}]\`;
                                setRobotDirective(cmd);
                                runtime.logEvent(\`[ACTION] 🦾 EXECUTING: "\${cmd}"\`);
                                speak(critique + " Moving it now."); // Speak the reasoning
                            } else {
                                setRobotDirective("MAINTAIN_HARMONY");
                                if (Math.random() > 0.7) speak(critique); // Occasionally speak praise
                            }
                            
                            if (audioInput.lastInput) audioInput.clearInput();
                        }
                    }
                }
            } catch (e) {
                runtime.logEvent(\`[ERROR] \${e.message}\`);
            }
        };

        const interval = setInterval(cycle, 5000); // 5s Loop
        return () => clearInterval(interval);
    }, [worldModel, audioInput.lastInput, isSpeaking, activeLore, runtime.tools.list()]);

    return { thought, dialogue, isSpeaking, robotDirective };
};
`;
