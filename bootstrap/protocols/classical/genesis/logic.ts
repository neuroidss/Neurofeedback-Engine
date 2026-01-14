
export const GENESIS_LOGIC = `
    // --- LORE PRESETS ---
    const LORE_PRESETS = {
        "VOID": "A formless void where thoughts manifest as reality. Pure ontology.",
        "CYBER_NOIR": "Neo-Tokyo, 2088. Perpetual rain. High tech, low life. You are a detective tracking a digital ghost.",
        "ELDRITCH": "A Victorian mansion on a cliff. The geometry is wrong. Whispers in the walls. Sanity is fraying.",
        "HIGH_FANTASY": "The Kingdom of Aethelgard. Magic is dying. You are the last Archmage seeking the source."
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            const text = evt.target.result;
            
            // --- JSON IMPORT (Quick Start) ---
            if (file.name.toLowerCase().endsWith('.json')) {
                handleGraphImport(text);
                return;
            }
            
            // --- TEXT INGESTION (AI Parsing) ---
            setManuscript(text);
            ingestFate(text);
        };
        reader.readAsText(file);
    };
    
    const handleGraphImport = (jsonString) => {
        try {
            const data = JSON.parse(jsonString);
            
            // Robustly extract fields (support loose formats)
            const importedNodes = data.fateGraph || data.nodes || [];
            const importedLore = data.lore || data.customLore || "";
            const importedMeta = data.meta || {};
            
            if (!Array.isArray(importedNodes) || importedNodes.length === 0) {
                throw new Error("JSON does not contain a valid 'fateGraph' or 'nodes' array.");
            }
            
            setParsingLog(["📥 Importing Fate Graph from JSON...", \`Loaded \${importedNodes.length} Events.\`]);
            
            // 1. Hydrate Logic State
            setFateGraph(importedNodes);
            setCustomLore(importedLore);
            
            // 2. Hydrate Visualization State
            // Reconstruct the graphData structure used by the visualizer
            const visualNodes = importedNodes.map(n => ({
                id: n.id,
                label: n.title,
                summary: n.key_event,
                entities: n.entities || [],
                alchemy: n.alchemy || {}
            }));
            
            const edges = [];
            for(let i=0; i<visualNodes.length-1; i++) {
                edges.push({ source: visualNodes[i].id, target: visualNodes[i+1].id });
            }
            
            setGraphData({ nodes: visualNodes, edges });
            
            // 3. Update UI Controls
            setSelectedLoreKey("CUSTOM"); // Switch to custom so the loaded lore is active
            if (importedMeta.style) window._genesis_meta = importedMeta;
            
            setParsingLog(prev => [...prev, "✅ Graph Hydrated Successfully. Ready to Initiate."]);
            
        } catch (e) {
            alert("Failed to import Fate Graph: " + e.message);
            setParsingLog(prev => [...prev, "❌ Import Failed: " + e.message]);
        }
    };
    
    const handleExportFateGraph = () => {
        if (!fateGraph || fateGraph.length === 0) return;
        
        const exportData = {
            meta: window._genesis_meta || { style: "Standard" },
            lore: selectedLoreKey === 'MANUSCRIPT' ? customLore : (selectedLoreKey === 'CUSTOM' ? customLore : LORE_PRESETS[selectedLoreKey]),
            fateGraph: fateGraph,
            timestamp: Date.now()
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "fate_graph_" + new Date().toISOString().slice(0,10) + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Robust JSON Extractor for potentially messy LLM output
    const extractJson = (text) => {
        try {
            // 1. Try direct parse
            return JSON.parse(text);
        } catch (e) {
            // 2. Try Regex for code block
            // We construct the regex dynamically to avoid the triple-backticks appearing literally in this source code,
            // which can confuse the UI Tool Runner's markdown stripping logic.
            const ticks = "\`\`\`"; 
            const pattern = new RegExp(ticks + "json\\\\s*([\\\\s\\\\S]*?)\\\\s*" + ticks);
            
            const match = text.match(pattern);
            if (match) {
                try { return JSON.parse(match[1]); } catch(e2) {}
            }
            // 3. Try finding first { and last }
            const start = text.indexOf('{');
            const end = text.lastIndexOf('}');
            if (start !== -1 && end !== -1) {
                try { return JSON.parse(text.substring(start, end + 1)); } catch(e3) {}
            }
            return null;
        }
    };

    const ingestFate = async (text) => {
        setIsParsingFate(true);
        setParsingLog(["Initializing Alchemical Ingestion...", "Splitting Manuscript..."]);
        setGraphData({ nodes: [], edges: [] });
        setFateGraph([]);
        setCustomLore("");
        
        // 1. Smart Split (Chunks for processing)
        // Reduced chunk size slightly to ensure model pays attention to details
        const chunkSize = 8000;
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
            chunks.push(text.slice(i, i + chunkSize));
        }
        
        setParsingLog(prev => [...prev, \`Detected \${chunks.length} segments. Beginning Multi-Perspective Analysis...\`]);
        setSelectedLoreKey("MANUSCRIPT");

        let accumulatedLore = "";
        let detectedStyle = "Standard RPG";
        let detectedCharacters = [];
        let detectedMechanics = [];
        
        // --- COHESION ENGINE ---
        let globalStoryContext = "Start of the story."; 
        let eventCounter = 0;
        
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            
            // UI BREATHING ROOM: Allow React to render updates
            await new Promise(resolve => setTimeout(resolve, 100));
            
            setParsingLog(prev => [...prev, \`Analyzing Segment \${i+1}/\${chunks.length}...\`]);

            const systemPrompt = \`You are the Alchemist of Destiny. 
            Analyze the provided manuscript segment (Part \${i+1}/\${chunks.length}).
            
            PREVIOUS CONTEXT: \${globalStoryContext}
            
            TASK:
            1. Extract KEY EVENTS as "Alchemical Reactions". Identify at least 1-3 major events in this chunk.
            2. For each event, identify ALL participating entities (The Components).
            3. CRITICAL: "DOUBLE-ENTRY REALITY". For EACH entity, describe the event strictly from THEIR subjective perspective.
            
            RETURN JSON FORMAT ONLY:
            {
                "lore_update": "string (Worldbuilding details)",
                "story_summary_update": "string (Concise summary of this segment)",
                "new_events": [
                    { 
                        "title": "Short Event Title", 
                        "key_event": "Objective Summary (God's Eye View)", 
                        "canonical_action": "The exact action/dialogue",
                        "narrative_function": "The abstract purpose (e.g. 'Betrayal', 'Discovery')",
                        "entities": ["Hero", "Villain", "The Sword"],
                        "alchemy": {
                            "Hero": "Subjective view (e.g. 'I struck down evil')",
                            "Villain": "Subjective view (e.g. 'The fanatic murdered me')",
                            "The Sword": "Subjective view (e.g. 'I tasted blood')"
                        }
                    }
                ]
            }\`;
            
            try {
                const res = await runtimeRef.current.ai.generateText("MANUSCRIPT SEGMENT:\\n" + chunk, systemPrompt);
                const parsed = extractJson(res);
                
                if (parsed) {
                    if (parsed.story_summary_update) globalStoryContext += " " + parsed.story_summary_update;
                    if (parsed.lore_update) {
                        accumulatedLore += "\\n\\n" + parsed.lore_update;
                        setCustomLore(prev => (prev + "\\n\\n" + parsed.lore_update).trim());
                    }
                    
                    if (parsed.new_events && Array.isArray(parsed.new_events) && parsed.new_events.length > 0) {
                        const newNodes = parsed.new_events.map((e, idx) => ({
                            id: \`evt_\${eventCounter + idx}\`,
                            index: eventCounter + idx,
                            ...e
                        }));
                        
                        // Update Data
                        setFateGraph(prev => [...prev, ...newNodes]);
                        
                        // Update Visualizer Graph (With new Reference to trigger re-render)
                        setGraphData(prev => {
                            const lastNodeId = prev.nodes.length > 0 ? prev.nodes[prev.nodes.length - 1].id : null;
                            const newGraphNodes = newNodes.map(e => ({ 
                                id: e.id,
                                label: e.title, 
                                summary: e.key_event,
                                entities: e.entities || [],
                                alchemy: e.alchemy || {}
                            }));
                            
                            const newEdges = [];
                            if (lastNodeId && newGraphNodes.length > 0) {
                                newEdges.push({ source: lastNodeId, target: newGraphNodes[0].id });
                            }
                            for (let k = 0; k < newGraphNodes.length - 1; k++) {
                                newEdges.push({ source: newGraphNodes[k].id, target: newGraphNodes[k+1].id });
                            }

                            return {
                                nodes: [...prev.nodes, ...newGraphNodes],
                                edges: [...(prev.edges || []), ...newEdges]
                            };
                        });
                        
                        eventCounter += newNodes.length;
                        setParsingLog(prev => [...prev, \`  + Distilled \${newNodes.length} reactions.\`]);
                    } else {
                        setParsingLog(prev => [...prev, \`  ! No events found in block \${i+1}. Context updated.\`]);
                    }
                } else {
                    setParsingLog(prev => [...prev, \`  ! Failed to parse JSON in block \${i+1}.\`]);
                }
            } catch(e) {
                setParsingLog(prev => [...prev, \`  ! Error in Block \${i+1}: \${e.message}\`]);
            }
        }
        
        window._genesis_meta = { style: detectedStyle, characters: detectedCharacters, mechanics: detectedMechanics };
        setParsingLog(prev => [...prev, "Ingestion Complete. Reality Matrix Stabilized."]);
        setIsParsingFate(false);
    };

    const handleCreateSession = async () => {
        const loreText = selectedLoreKey === 'MANUSCRIPT' ? customLore : (selectedLoreKey === 'CUSTOM' ? customLore : LORE_PRESETS[selectedLoreKey]);
        if (!loreText) { alert("No Lore detected."); return; }
        const meta = window._genesis_meta || { style: "Standard", characters: [], mechanics: [] };

        const newSession = {
            id: 'sess_' + Date.now(),
            lore: loreText,
            style: meta.style,          
            characters: meta.characters,
            mechanics: meta.mechanics,
            worldState: "The story begins.",
            ledger: { "Player": ["Unknown Status"] }, 
            turnCount: 0,
            chatHistory: [],
            gmLog: [],
            fateGraph: fateGraph, 
            currentFateIndex: 0,
            timestamp: Date.now()
        };
        
        setActiveSession(newSession);
        setChatHistory([]);
        setGmLog([]);
        setView("GAME");
        setTimeout(() => turnCycle(newSession, "INITIALIZE", false, isEchoMode), 100);
    };

    const handleLoadSession = (sess) => {
        setActiveSession(sess);
        setChatHistory(sess.chatHistory || []);
        setGmLog(sess.gmLog || []);
        setView("GAME");
    };

    const interpretInput = async (rawInput, lore) => {
        const prompt = \`User said: "\${rawInput}". 
        LORE CONTEXT: \${lore}
        TASK:
        1. Check if this action is PHYSICALLY possible in the lore.
        2. Check if this action contradicts established facts.
        3. If valid, rewrite as diegetic action.
        4. If INVALID, rewrite as a "Failed Attempt" describing WHY it fails.
        
        Output ONLY the rewritten action.\`;
        
        const interpreted = await runtimeRef.current.ai.generateText(prompt, "Narrative Filter.");
        return interpreted.replace(/["']/g, "");
    };

    const turnCycle = async (session, rawAction, isDefault = false, isEchoMode = false) => {
        setPhase("PROCESSING");
        try {
            const { lore, worldState, turnCount, chatHistory, fateGraph, currentFateIndex, style, characters, mechanics, ledger } = session;
            
            let processedAction = rawAction;
            let nextFate = fateGraph && fateGraph.length > currentFateIndex ? fateGraph[currentFateIndex] : null;

            // --- USER INPUT HANDLING ---
            if (isEchoMode && (isDefault || rawAction === "INITIALIZE") && nextFate) {
                if (nextFate.canonical_action) {
                    addGmLog("ECHO_MODE", "Injecting Canonical Action...");
                    processedAction = nextFate.canonical_action;
                } else {
                    const echoPrompt = \`LORE: \${lore} GOAL: \${nextFate.key_event} TASK: Write perfect character action.\`;
                    processedAction = await runtimeRef.current.ai.generateText(echoPrompt, "Character Voice.");
                }
                addChat("USER", processedAction + " (Echo Sync)");
            } else if (!isDefault && rawAction !== "INITIALIZE") {
                addChat("USER", rawAction); 
                processedAction = await interpretInput(rawAction, lore);
                addChat("INTERPRETER", processedAction); 
            } else if (isDefault && !isEchoMode) {
                addChat("SYSTEM", \`TIMEOUT: \${rawAction}...\`);
            }

            let elasticityAdjustment = "";
            let fateContext = "";
            let userMindProfile = "Unknown";
            let alchemyReport = "";
            
            if (nextFate) {
                // --- ALCHEMY ENGINE: PERSPECTIVE SIMULATION ---
                fateContext = \`TARGET: \${nextFate.title}. FUNCTION: \${nextFate.narrative_function}.\`;
                
                if (nextFate.alchemy) {
                    // We check if the user's action aligns with the "Hero" perspective expected by the graph
                    // Or if they have shifted the reaction.
                    const alchemyPrompt = \`
                    EVENT: \${nextFate.key_event}
                    PLAYER ACTION: "\${processedAction}"
                    
                    EXPECTED PERSPECTIVES:
                    \${JSON.stringify(nextFate.alchemy, null, 2)}
                    
                    TASK: Calculate the "Alchemical Reaction".
                    1. Does the Player's action change how the other entities perceive the event?
                    2. Generate the ACTUAL subjective experience for each entity based on the Player's specific action.
                    
                    RETURN JSON: { "reactions": { "EntityName": "Thought/Feeling" }, "dissonance_alert": "string (optional)" }
                    \`;
                    
                    try {
                        const alchemyRes = await runtimeRef.current.ai.generateText(alchemyPrompt, "Alchemist.");
                        const alc = extractJson(alchemyRes);
                        
                        if (alc) {
                            let logMsg = "⚗️ ALCHEMICAL REACTION:\\n";
                            for (const [ent, thought] of Object.entries(alc.reactions || {})) {
                                logMsg += \`  • \${ent}: "\${thought}"\\n\`;
                            }
                            if (alc.dissonance_alert) logMsg += \`  ⚠️ DISSONANCE: \${alc.dissonance_alert}\`;
                            
                            addGmLog("ALCHEMY", logMsg);
                            alchemyReport = logMsg; // Pass to main sim
                        }
                    } catch(e) {}
                }
            }

            let memoryContext = "No history.";
            if (turnCount > 2) {
                memoryContext = "Recent: " + chatHistory.slice(-5).map(c => c.text).join("\\n");
            }
            
            // --- PHASE 1: THEORY OF MIND (The User Profile) ---
            if (chatHistory.length > 0) {
                const tomPrompt = \`
                PLAYER HISTORY:
                \${chatHistory.slice(-10).map(c => c.sender === 'USER' ? c.text : '').join('\\n')}
                
                TASK: Profile the Player.
                - Are they aggressive, cautious, or chaotic?
                
                Return a 1-sentence "Psych Profile".
                \`;
                try {
                    userMindProfile = await runtimeRef.current.ai.generateText(tomPrompt, "Psychologist");
                    setUserModel(userMindProfile);
                } catch(e) {}
            }

            // --- PHASE 2: SIMULATION ---
            setPhase("NARRATING");
            
            const mainPrompt = \`
            LORE: \${lore}
            STATE: \${worldState}
            ACTION: "\${processedAction}"
            HISTORY: \${memoryContext}
            \${fateContext}
            ALCHEMICAL REALITY: \${alchemyReport}
            
            TASK:
            1. Simulate the outcome. Apply Mechanics: \${JSON.stringify(mechanics || [])}.
            2. Incorporate the multi-perspective reactions into the narrative subtlety.
            3. Update Inventory/Status.
            4. Check if the "Narrative Function" of the target fate was achieved.
            
            RETURN JSON: 
            { 
                "new_world_state": "...", 
                "narrative": "...", 
                "fate_node_complete": boolean,
                "ledger_updates": [ { "entity": "string", "change": "string" } ]
            }
            \`;
            
            const res1 = await runtimeRef.current.ai.generateText(mainPrompt, "You are the Game Master.");
            let step1 = extractJson(res1);
            if (!step1) step1 = { narrative: res1, new_world_state: worldState, fate_node_complete: false, ledger_updates: [] };
            
            addChat("GM", step1.narrative);
            session.worldState = step1.new_world_state;
            session.turnCount++;
            
            if (step1.ledger_updates) {
                step1.ledger_updates.forEach(u => addGmLog("LEDGER", \`\${u.entity}: \${u.change}\`));
            }

            if (step1.fate_node_complete && nextFate) {
                addGmLog("FATE_ENGINE", \`Node \${currentFateIndex} Complete. Advancing.\`);
                session.currentFateIndex++;
            }
            
            // --- PHASE 3: GUARDIAN OF LORE (Choice Generation) ---
            setPhase("GENERATING_CHOICES");
            
            // Re-fetch next fate in case we just advanced
            const upcomingFate = session.fateGraph[session.currentFateIndex];

            const choicePrompt = \`
            SITUATION: \${step1.narrative}
            NEXT PLOT NODE: \${upcomingFate ? upcomingFate.key_event : "Unknown"} (Function: \${upcomingFate ? upcomingFate.narrative_function : "Survival"})
            USER PROFILE: \${userMindProfile}
            
            TASK: Generate 3 Choices as the "Guardian of Lore".
            
            1. CHOICE A [THE CANON]: The choice that leads directly to the 'Next Plot Node'. This is what the manuscript demands.
            2. CHOICE B [THE RESONANCE]: A choice tailored to the 'User Profile'. What does THIS player want to do? (Must be Lore-Valid).
            3. CHOICE C [THE WORLD]: A choice derived purely from physics/logic of the current situation, ignoring the plot entirely. (e.g. Retreat, Craft, Observe).
            
            RETURN JSON: { "choices": [{"id":"A", "text":"..."}, ...], "default_action": "..." }
            \`;
            
            const res2 = await runtimeRef.current.ai.generateText(choicePrompt, "Game Designer.");
            let step2 = extractJson(res2);
            if (!step2) step2 = { choices: [{id:"A", text:"Continue"}], default_action: "Wait" };
            
            setCurrentChoices(step2.choices);
            
            if (isEchoMode && upcomingFate && upcomingFate.canonical_action) {
                 setDefaultAction(upcomingFate.canonical_action);
            } else {
                 setDefaultAction(step2.default_action);
            }
            
            setCountdown(MAX_COUNTDOWN);
            setPhase("CHOOSING");
            saveSession(session);

        } catch (e) {
            addGmLog("ERROR", e.message);
            setPhase("CHOOSING"); 
        }
    };
`;
