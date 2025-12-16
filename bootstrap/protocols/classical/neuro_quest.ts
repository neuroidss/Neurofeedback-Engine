
import type { ToolCreatorPayload } from '../../../types';
import { NEURO_QUEST_UI_IMPL } from './neuro_quest/frontend';
import { NEURO_QUEST_PYTHON_CODE } from './neuro_quest/backend';

const NEURO_QUEST_BROWSER_IMPL = `
    const { useState, useEffect, useRef, useMemo, useCallback } = React;

    // --- 0. MATH UTILS (The Semantic Kernel) ---
    // Pure JS implementation of vector operations for 384-dim embeddings
    const dot = (a, b) => a.reduce((sum, v, i) => sum + v * b[i], 0);
    const mag = (v) => Math.sqrt(dot(v, v));
    const normalize = (v) => {
        const m = mag(v);
        return m === 0 ? v : v.map(x => x / m);
    };
    const cosineSim = (a, b) => {
        if (!a || !b) return 0;
        return dot(a, b) / (mag(a) * mag(b));
    };

    // --- 1. LORE DATABASE (Rance X Mode) ---
    const RANCE_LORE = useMemo(() => ({
        title: "Operation: Rance X (The Final War)",
        context: "The Floating Continent faces the apocalypse. The Demon Army, led by Kayblis, has launched a simultaneous invasion.",
        resources: {
            "Humanity": { start: 3000000, max: 3000000, icon: "🛡️" },
            "Troops": { start: 10000, icon: "⚔️" },
            "AP": { start: 4, max: 4, icon: "⚡" },
            "Gold": { start: 500, icon: "💰" }
        },
        // The Laws of Physics for this Universe.
        // Entities are projected onto these axes to determine interaction effects.
        laws: [
            ["System Authority", "System Crash"], // The "Invincible Field" Axis
            ["Physical Matter", "Magic Energy"],  // The Material Axis
            ["Holy Light", "Darkness Miasma"],    // The Moral Axis
            ["Creation", "Destruction"]           // The Entropy Axis
        ],
        territories: [
            { id: "Leazas", status: "Allied", difficulty: 0.2, desc: "The Superpower. Green plains and mighty castles.", anchor: "Order, Knight, Wealth, Defense, Plains, Castle", img_prompt: "Grand white castle on green plains, knights patrolling, anime style fantasy landscape" },
            { id: "Helman", status: "Contested", difficulty: 0.6, desc: "The Northern Empire. Frozen wastelands.", anchor: "Cold, Iron, Revolution, War, Snow, Rust, Empire", img_prompt: "Snowy fortress, rusty iron gates, frozen wasteland, military dystopian fantasy" },
            { id: "Zeth", status: "Contested", difficulty: 0.7, desc: "The Magic Kingdom. Floating islands.", anchor: "Magic, Sky, Lightning, Golem, Elitism, Tower", img_prompt: "Floating islands with magic towers, lightning storms, purple sky, high fantasy" },
            { id: "Japan", status: "Neutral", difficulty: 0.4, desc: "The Eastern Island. Cherry blossoms, samurai.", anchor: "Spirit, Blade, Flower, Samurai, Tradition, Cherry Blossom", img_prompt: "Japanese shrine, cherry blossoms falling, samurai silhouette, mystic atmosphere" },
            { id: "Free Cities", status: "Enemy", difficulty: 0.5, desc: "A coalition of trade cities in the desert.", anchor: "Sand, Trade, Chaos, Money, Mercenary, Desert", img_prompt: "Desert city ruins, burning market, demon flags, smoke and fire" },
            { id: "Monster Realm", status: "Enemy", difficulty: 1.0, desc: "The Domain of Kayblis.", anchor: "Demon, Fire, Hell, Invincible, Darkness, Boss, Lava", img_prompt: "Hellscape, obsidian castle, lava rivers, red sky, absolute despair" }
        ],
        deck: [
            { id: "Rance", rank: "UR", type: "Warrior", desc: "The Hero. Wields the demon sword Chaos.", tags: ["Chaos", "System Crash", "Attack", "Sword", "Hero", "Glitch"], bond: 5 },
            { id: "Sill Plain", rank: "SSR", type: "Healer", desc: "Rance's slave and powerful ice mage.", tags: ["Ice Cold", "Heal", "Support", "Water", "Loyalty", "Peace"], bond: 10 },
            { id: "Rick Addison", rank: "SSR", type: "Knight", desc: "The Red General of Leazas.", tags: ["Order", "Sword", "Honor", "Physical Matter", "Speed", "Fire"], bond: 3 },
            { id: "Magic The Gandhi", rank: "SR", type: "Mage", desc: "Queen of Zeth.", tags: ["Magic Energy", "Lightning", "Intellect", "Destruction", "Authority"], bond: 2 }
        ],
        enemies: [
            { id: "Demon General Xavier", desc: "Apostle of the old Demon King.", tags: ["Gravity", "Magic Energy", "Darkness Miasma", "Apostle", "Fear"], power: 2000 },
            { id: "Demon General Nosferatu", desc: "The Vampire Lord.", tags: ["Blood", "Undead", "Night", "Darkness Miasma", "Regen"], power: 1800 },
            { id: "Kayblis", desc: "The Demon King.", tags: ["System Authority", "Fire Heat", "Invincible", "Demon King", "Destruction", "Absolute"], power: 5000 },
            { id: "Demon Horde", desc: "A swarm of lower demons.", tags: ["Demon", "Weak", "Swarm", "Darkness Miasma", "Chaos"], power: 800 }
        ]
    }), []);

    // --- 2. NEURO-AKASHIC ENGINE (Client-Side GraphRAG) ---
    const useNeuroAkashic = () => {
        const nodesRef = useRef([]);
        const workingMemoryRef = useRef([]);

        const index = useCallback(async (content, type, tags, embedding) => {
            const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
            const node = { id, content, type, tags, embedding, edges: [], timestamp: Date.now() };
            nodesRef.current.push(node);
            
            workingMemoryRef.current.push(node);
            if (workingMemoryRef.current.length > 5) workingMemoryRef.current.shift();

            // HippoRAG Simulation: Associative Linking via Vector Similarity
            // "Neurons that fire together, wire together"
            nodesRef.current.forEach(existing => {
                if (existing.id === id) return;
                const sim = cosineSim(embedding, existing.embedding);
                if (sim > 0.6) { // Semantic Threshold
                    node.edges.push({ target: existing.id, weight: sim });
                    existing.edges.push({ target: id, weight: sim });
                }
            });
        }, []);

        return { index, nodes: nodesRef.current };
    };

    // --- 3. SEMANTIC PHYSICS ENGINE (Vector Calculation) ---
    const useSemanticEngine = (runtime, lore) => {
        const [vectors, setVectors] = useState({});
        const [laws, setLaws] = useState([]);
        const [status, setStatus] = useState("Initializing...");
        const [isReady, setIsReady] = useState(false);
        const memory = useNeuroAkashic();

        useEffect(() => {
            const init = async () => {
                setStatus("Calculating Semantic Embeddings...");
                const toEmbed = [];
                const keys = [];

                // Prepare batch embedding request
                lore.laws.forEach(pair => {
                    toEmbed.push(pair[0]); keys.push(\`LAW_POS_\${pair[0]}\`);
                    toEmbed.push(pair[1]); keys.push(\`LAW_NEG_\${pair[1]}\`);
                });
                lore.territories.forEach(t => {
                    toEmbed.push(t.anchor); keys.push(\`TERR_\${t.id}\`);
                });
                lore.deck.forEach(c => {
                    toEmbed.push(c.tags.join(" ") + " " + c.desc); keys.push(\`CARD_\${c.id}\`);
                });
                lore.enemies.forEach(e => {
                    toEmbed.push(e.tags.join(" ") + " " + e.desc); keys.push(\`ENEMY_\${e.id}\`);
                });

                try {
                    // Call Browser-Based Transformers.js via runtime
                    const embeddings = await runtime.ai.generateEmbeddings(toEmbed);
                    
                    const vecMap = {};
                    embeddings.forEach((vec, i) => { vecMap[keys[i]] = vec; });

                    // Construct the Laws of Physics (Axes)
                    // Axis = Vector(Positive Concept) - Vector(Negative Concept)
                    const activeLaws = lore.laws.map(pair => {
                        const pos = vecMap[\`LAW_POS_\${pair[0]}\`];
                        const neg = vecMap[\`LAW_NEG_\${pair[1]}\`];
                        const axis = normalize(pos.map((v, i) => v - neg[i]));
                        return { name: \`\${pair[0]}<>\${pair[1]}\`, axis, pos: pair[0], neg: pair[1] };
                    });

                    setVectors(vecMap);
                    setLaws(activeLaws);
                    setIsReady(true);
                    setStatus("System Online.");
                    
                    // Init Memory with start context
                    await memory.index("Game Initialized. The Demon King Kayblis threatens the world.", "system", ["start"], embeddings[0]); 

                } catch (e) {
                    console.error("Semantic Init Error:", e);
                    setStatus("Critical Error: Semantic Engine failed. " + e.message);
                    setIsReady(false);
                }
            };
            init();
        }, []);

        const calculateClash = (attackerKey, defenderKey, focusLevel) => {
            if (!isReady) return { damageMult: 1.0, log: ["System Not Ready"] };

            let vAtk = vectors[attackerKey];
            let vDef = vectors[defenderKey];
            
            if (!vAtk || !vDef) return { damageMult: 1.0, log: ["Unknown Vector"] };

            // Entropy Injection (Neural Noise)
            // Lower focus = Higher random noise added to the attack vector
            const noise = (1.0 - focusLevel) * 0.2;
            vAtk = vAtk.map(x => x + (Math.random() - 0.5) * noise);

            const log = [];
            let multiplier = 1.0;
            
            // Check projection against every Universal Law
            laws.forEach(law => {
                const atkProj = dot(vAtk, law.axis);
                const defProj = dot(vDef, law.axis);
                
                // If both entities have strong polarity on this axis...
                if (Math.abs(atkProj) > 0.1 && Math.abs(defProj) > 0.1) {
                    // Opposite Signs = Conflict (Bonus Damage)
                    // e.g. "System Authority" (+) vs "System Crash" (-)
                    if (Math.sign(atkProj) !== Math.sign(defProj)) {
                        const bonus = Math.abs(atkProj - defProj);
                        multiplier += bonus;
                        log.push(\`⚡ CRITICAL: \${law.name} (+\${bonus.toFixed(1)}x)\`);
                    } else {
                        // Same Sign = Resonance/Resistance (Reduced Damage)
                        // e.g. "Fire" vs "Fire"
                        multiplier *= 0.5;
                        log.push(\`🛡️ RESIST: \${law.name} (x0.5)\`);
                    }
                }
            });

            return { damageMult: multiplier, log };
        };

        return { isReady, status, calculateClash, memory, laws, vectors };
    };

    // --- 4. SEMANTIC RADAR VISUALIZER ---
    const SemanticRadar = ({ laws, vectors, atkKey, defKey }) => {
        if (!atkKey || !defKey || !vectors[atkKey] || !vectors[defKey]) return null;
        
        const vAtk = vectors[atkKey];
        const vDef = vectors[defKey];
        
        return (
            <div className="flex flex-col gap-1 mt-2 bg-black/50 p-2 rounded text-[10px] font-mono border border-slate-700">
                <div className="text-center text-slate-400 font-bold mb-1">SEMANTIC INTERACTION FIELD</div>
                {laws.map((law, i) => {
                    // Project vectors onto this law's axis
                    const atkProj = dot(vAtk, law.axis);
                    const defProj = dot(vDef, law.axis);
                    
                    // Normalize for display (-1 to 1 mostly)
                    const dispAtk = Math.max(-1, Math.min(1, atkProj));
                    const dispDef = Math.max(-1, Math.min(1, defProj));
                    
                    const width = 100;
                    const center = width / 2;
                    const atkX = center + (dispAtk * (width/2));
                    const defX = center + (dispDef * (width/2));
                    
                    const isOpposite = Math.sign(atkProj) !== Math.sign(defProj) && Math.abs(atkProj) > 0.1 && Math.abs(defProj) > 0.1;
                    
                    return (
                        <div key={i} className="flex items-center gap-2">
                            <div className="w-16 text-right truncate text-slate-500" title={law.neg}>{law.neg.split(' ')[0]}</div>
                            <div className="relative w-[100px] h-4 bg-slate-800 rounded-full overflow-hidden border border-slate-600">
                                {/* Axis Line */}
                                <div className="absolute left-1/2 top-0 h-full w-px bg-slate-600"></div>
                                
                                {/* Connection Line if interacting */}
                                {Math.abs(atkProj) > 0.1 && Math.abs(defProj) > 0.1 && (
                                    <div 
                                        className={\`absolute top-1.5 h-1 \${isOpposite ? 'bg-red-500 animate-pulse' : 'bg-blue-500'}\`} 
                                        style={{ left: Math.min(atkX, defX), width: Math.abs(atkX - defX) }}
                                    ></div>
                                )}
                                
                                {/* Attacker Dot */}
                                <div className="absolute top-1 w-2 h-2 bg-green-400 rounded-full shadow-[0_0_5px_lime]" style={{ left: atkX - 2 }}></div>
                                {/* Defender Dot */}
                                <div className="absolute top-1 w-2 h-2 bg-red-500 rounded-full shadow-[0_0_5px_red]" style={{ left: defX - 2 }}></div>
                            </div>
                            <div className="w-16 truncate text-slate-500" title={law.pos}>{law.pos.split(' ')[0]}</div>
                        </div>
                    )
                })}
            </div>
        )
    };

    // --- MAIN UI ---
    // Variables injected by UIToolRunner: processedData, runtime
    
    const [phase, setPhase] = useState("STRATEGY");
    const [turn, setTurn] = useState(1);
    const [resources, setResources] = useState(RANCE_LORE.resources);
    const [territories, setTerritories] = useState(RANCE_LORE.territories);
    const [logs, setLogs] = useState(["Mission Start: Unite the nations."]);
    const [activeBattle, setActiveBattle] = useState(null);
    const [sceneImage, setSceneImage] = useState(null);
    const [generatingImg, setGeneratingImg] = useState(false);
    
    const physics = useSemanticEngine(runtime, RANCE_LORE);
    const focusLevel = processedData?.focusRatio || 0.5; 
    
    const addLog = (msg) => setLogs(prev => [msg, ...prev].slice(0, 50));

    const generateScene = async (prompt) => {
        if (generatingImg) return;
        setGeneratingImg(true);
        try {
            // Using standard cloud model selection via runtime abstraction
            const url = await runtime.ai.generateImage(prompt);
            if (url) setSceneImage(url);
        } catch(e) {
            console.error("Image Gen Failed", e);
        }
        setGeneratingImg(false);
    };

    const handleTurnEnd = async () => {
        const drain = 50000 + (turn * 20000);
        const newPop = Math.max(0, resources.Humanity.start - drain);
        
        setResources(prev => ({
            ...prev,
            Humanity: { ...prev.Humanity, start: newPop },
            AP: { ...prev.AP, start: prev.AP.max }
        }));
        setTurn(t => t + 1);
        addLog(\`📅 Turn \${turn} Ended. -\${drain} Humanity.\`);
        
        // Random Invasion Event
        const neutral = territories.filter(t => t.status === "Neutral");
        if (neutral.length > 0 && Math.random() > 0.5) {
            const target = neutral[Math.floor(Math.random() * neutral.length)];
            const newTerritories = territories.map(t => {
                if (t.id === target.id) return { ...t, status: "Contested" };
                return t;
            });
            setTerritories(newTerritories);
            addLog(\`⚠️ Demon Army is invading \${target.id}!\`);
            generateScene(target.desc + ", invasion, fire, smoke, demon army banner");
        }
    };

    const startBattle = async (territory) => {
        if (resources.AP.start < 2) { addLog("❌ Not enough AP."); return; }
        setResources(prev => ({ ...prev, AP: { ...prev.AP, start: prev.AP.start - 2 } }));
        
        let enemy = RANCE_LORE.enemies[3]; // Horde
        if (territory.status === "Enemy") {
            enemy = territory.id === "Monster Realm" ? RANCE_LORE.enemies[2] : RANCE_LORE.enemies[0];
        }
        
        setActiveBattle({
            territory,
            enemy,
            hp: enemy.power * (territory.status === "Enemy" ? 1.5 : 1.0),
            maxHp: enemy.power * (territory.status === "Enemy" ? 1.5 : 1.0),
            log: [],
            lastAtkKey: null,
            lastDefKey: \`ENEMY_\${enemy.id}\`
        });
        setPhase("BATTLE");
        generateScene(\`Anime battle scene, \${territory.desc}, facing \${enemy.desc}, epic composition, 8k\`);
    };

    const executeAttack = (card) => {
        if (!activeBattle) return;
        
        const atkKey = \`CARD_\${card.id}\`;
        const defKey = activeBattle.lastDefKey;
        
        // --- THE SEMANTIC CLASH ---
        // This is where the 384-dimensional math happens in the browser
        const { damageMult, log } = physics.calculateClash(atkKey, defKey, focusLevel);
        
        const dmg = Math.floor((150 + card.bond * 10) * damageMult);
        const newHp = activeBattle.hp - dmg;
        
        const battleLog = [...activeBattle.log, \`\${card.id} deals \${dmg} DMG (\${damageMult.toFixed(1)}x)\`];
        
        // Update State for Radar Visualization
        setActiveBattle(prev => ({ ...prev, lastAtkKey: atkKey }));

        if (newHp <= 0) {
            setActiveBattle(null);
            setPhase("STRATEGY");
            addLog(\`🏆 VICTORY in \${activeBattle.territory.id}!\`);
            
            const newTerritories = territories.map(t => {
                if (t.id === activeBattle.territory.id) return { ...t, status: "Allied" };
                return t;
            });
            setTerritories(newTerritories);
            physics.memory.index(\`Liberated \${activeBattle.territory.id} from \${activeBattle.enemy.id}.\`, "victory", ["win"], physics.vectors[atkKey]);
            
        } else {
            const enemyDmg = Math.floor(200 * (1.0 - (focusLevel * 0.5)));
            setResources(prev => ({ ...prev, Humanity: { ...prev.Humanity, start: prev.Humanity.start - enemyDmg } }));
            battleLog.push(\`💔 Enemy hits back! -\${enemyDmg} Humanity.\`);
            setActiveBattle(prev => ({ ...prev, hp: newHp, log: battleLog, lastAtkKey: atkKey }));
        }
    };

    // --- BOOT SCREEN ---
    if (!physics.isReady) return (
        <div className="flex h-full items-center justify-center bg-black text-green-500 font-mono flex-col">
            <div className="text-xl animate-pulse">BOOTING NEURO-QUEST BROWSER ENGINE...</div>
            <div className="text-xs mt-2">{physics.status}</div>
            {physics.status.includes('Critical') && <div className="text-red-500 mt-4 px-4 text-center">Ensure Embeddings Model (Transformers.js) is loading.</div>}
        </div>
    );

    return (
        <div className="flex flex-col h-full w-full bg-slate-900 text-slate-200 font-sans relative overflow-hidden">
            {/* Background Layer */}
            <div className="absolute inset-0 z-0 opacity-30">
                {sceneImage && <img src={sceneImage} className="w-full h-full object-cover transition-opacity duration-1000" />}
                <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-slate-900"></div>
            </div>

            {/* Header HUD */}
            <div className="relative z-10 flex justify-between items-center p-2 bg-slate-900/80 border-b border-slate-700">
                <div className="flex gap-4">
                    {Object.entries(resources).map(([k, v]) => (
                        <div key={k} className="flex flex-col items-center">
                            <span className="text-[9px] text-slate-500 uppercase">{k}</span>
                            <span className={\`text-sm font-bold \${k==='Humanity'?'text-red-400':'text-cyan-400'}\`}>{v.icon} {v.start.toLocaleString()}</span>
                        </div>
                    ))}
                </div>
                <div className="text-right">
                    <div className="text-[9px] text-slate-500">TURN {turn}</div>
                    <div className="text-xs font-mono text-green-400">FOCUS: {(focusLevel*100).toFixed(0)}%</div>
                </div>
            </div>

            {/* Main Game Area */}
            <div className="relative z-10 flex-grow p-4 flex gap-4 min-h-0">
                <div className="flex-grow bg-black/60 backdrop-blur border border-slate-700 rounded p-4 overflow-y-auto custom-scrollbar flex flex-col">
                    {phase === "STRATEGY" ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {territories.map(t => (
                                <div key={t.id} onClick={() => t.status !== 'Allied' && startBattle(t)} 
                                     className={\`p-3 rounded border relative cursor-pointer hover:scale-105 transition-transform \${t.status === 'Allied' ? 'bg-blue-900/30 border-blue-600' : t.status === 'Enemy' ? 'bg-red-900/30 border-red-600' : 'bg-yellow-900/30 border-yellow-600'}\`}>
                                    <div className="font-bold text-sm">{t.id}</div>
                                    <div className="text-[9px] uppercase tracking-wider opacity-70">{t.status}</div>
                                    <div className="text-[10px] mt-1 text-slate-400">{t.desc}</div>
                                    {t.status !== 'Allied' && <div className="absolute top-2 right-2 text-[8px] bg-black/50 px-1 rounded text-red-400">ATTACK</div>}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center">
                            <h2 className="text-3xl font-black text-red-500 drop-shadow-lg mb-2">{activeBattle.enemy.id}</h2>
                            
                            {/* Enemy Health Bar */}
                            <div className="w-full max-w-md h-4 bg-slate-800 rounded-full mb-4 overflow-hidden border border-slate-600">
                                <div className="h-full bg-red-600 transition-all duration-300" style={{width: \`\${(activeBattle.hp / activeBattle.maxHp) * 100}%\`}}></div>
                            </div>
                            <div className="text-xl font-mono text-white mb-8">{activeBattle.hp.toFixed(0)} / {activeBattle.maxHp.toFixed(0)} HP</div>
                            
                            {/* Deck / Actions */}
                            <div className="flex gap-2 overflow-x-auto w-full justify-center p-2 mb-4">
                                {RANCE_LORE.deck.map(c => (
                                    <button key={c.id} onClick={() => executeAttack(c)} className="w-24 h-32 bg-slate-800 border border-slate-600 hover:border-cyan-400 hover:bg-slate-700 rounded p-2 flex flex-col items-center justify-between transition-all group">
                                        <div className="text-[10px] font-bold truncate w-full text-center group-hover:text-cyan-300">{c.id}</div>
                                        <div className="text-2xl">⚔️</div>
                                        <div className="text-[8px] text-slate-500">{c.type}</div>
                                    </button>
                                ))}
                            </div>

                            {/* Battle Log */}
                            <div className="h-24 w-full bg-black/50 rounded border border-slate-700 p-2 overflow-y-auto text-left text-[10px] font-mono text-green-400 mb-2">
                                {activeBattle.log.map((l, i) => <div key={i}>{l}</div>)}
                            </div>
                            
                            {/* SEMANTIC RADAR VISUALIZER */}
                            {activeBattle.lastAtkKey && (
                                <SemanticRadar 
                                    laws={physics.laws} 
                                    vectors={physics.vectors} 
                                    atkKey={activeBattle.lastAtkKey} 
                                    defKey={activeBattle.lastDefKey} 
                                />
                            )}
                        </div>
                    )}
                </div>

                {/* Right Sidebar: Logs */}
                <div className="w-64 bg-black/60 backdrop-blur border border-slate-700 rounded flex flex-col">
                    <div className="p-2 bg-slate-800/50 text-[10px] font-bold border-b border-slate-700">SYSTEM LOG</div>
                    <div className="flex-grow overflow-y-auto p-2 space-y-1 text-[10px] font-mono text-slate-300 custom-scrollbar">
                        {logs.map((l, i) => <div key={i} className="border-b border-slate-800/50 pb-1">{l}</div>)}
                    </div>
                    {phase === "STRATEGY" && (
                        <button onClick={handleTurnEnd} className="m-2 py-2 bg-cyan-700 hover:bg-cyan-600 rounded font-bold text-xs shadow-lg transition-transform hover:scale-105">END TURN</button>
                    )}
                </div>
            </div>
        </div>
    );
`;

const NEURO_QUEST_BROWSER: ToolCreatorPayload = {
    name: 'Neuro Quest (Browser Edition)',
    description: 'A fully browser-based Generative RPG with a built-in Semantic Physics Engine and Client-Side Graph Memory (HippoRAG). Does not require Python backend.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To play a deep, semantic neuro-RPG entirely in the browser using cloud AI APIs.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time EEG/Bio metrics.', required: true },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    processingCode: `
    (eegData, sampleRate) => {
        // Simple Focus Calculation
        if (!eegData || Object.keys(eegData).length === 0) {
            const t = Date.now() / 3000;
            return { focusRatio: (Math.sin(t) + 1) / 2 };
        }
        // Heuristic: Last value of first channel
        const ch0 = Object.values(eegData)[0];
        if (Array.isArray(ch0) && ch0.length > 0) {
             const val = Math.abs(ch0[ch0.length-1]); 
             return { focusRatio: Math.min(1, val / 50) };
        }
        return { focusRatio: 0.5 }; 
    }
    `,
    implementationCode: NEURO_QUEST_BROWSER_IMPL
};

const NEURO_QUEST_NATIVE: ToolCreatorPayload = {
    name: 'Neuro Quest (Native V99)',
    description: 'The full Hybrid Engine experience. Deploys a dedicated Python process with PyGame, Stable Diffusion (LCM), and Qwen-VL for high-performance rendering and AI logic. Requires Local Server.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To run the flagship Action-RPG with local GPU acceleration.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time EEG/Bio metrics.', required: true },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    processingCode: `
    (eegData, sampleRate) => {
        // Just pass raw data through or calc basic focus
        return { focusRatio: 0.5 };
    }
    `,
    implementationCode: NEURO_QUEST_UI_IMPL.replace('%%PYTHON_CODE%%', JSON.stringify(NEURO_QUEST_PYTHON_CODE))
};

export const NEURO_QUEST_TOOLS = [NEURO_QUEST_BROWSER, NEURO_QUEST_NATIVE];
