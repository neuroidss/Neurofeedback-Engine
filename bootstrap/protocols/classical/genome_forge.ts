
import type { ToolCreatorPayload } from '../../../types';

const GENOME_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;

    if (!R3F || !Drei || !THREE) return <div className="text-white p-10">Initializing Bio-Engine...</div>;
    const { Canvas, useFrame } = R3F;
    const { Sphere, Cylinder, Float, Text, Sparkles, Environment } = Drei;

    // --- 1. THE GENETIC DATABASE (Hard Science -> RPG Lore) ---
    const GENE_DB = [
        {
            id: 'ACTN3',
            rsid: 'rs1815739',
            name: 'The Titan\\'s Fiber',
            type: 'Physical',
            alleles: {
                'CC': { effect: 'Sprint Performance ++', lore: 'Your muscles twitch with explosive power. The blood of giants runs thick.', visual: '#ff4400' },
                'TT': { effect: 'Endurance ++', lore: 'The weary traveler. Your strength is a slow, unyielding river.', visual: '#44ff00' }
            }
        },
        {
            id: 'COMT',
            rsid: 'rs4680',
            name: 'The Warrior-Sage Paradox',
            type: 'Mental',
            alleles: {
                'Met/Met': { effect: 'Cognitive Peak / Stress Vulnerable', lore: 'The Sage. Brilliant, but the noise of the world shatters you easily.', visual: '#00ccff' },
                'Val/Val': { effect: 'Stress Resilience / Lower Peak', lore: 'The Warrior. Chaos fuels you. You thrive where others break.', visual: '#ff0055' }
            }
        },
        {
            id: 'BDNF',
            rsid: 'rs6265',
            name: 'Hydra\\'s Neural Web',
            type: 'Neuro',
            alleles: {
                'Val/Val': { effect: 'High Plasticity', lore: 'Your mind is a shapeshifting liquid. Memories crystallize instantly.', visual: '#a855f7' },
                'Met/Met': { effect: 'Stability', lore: 'Stone Mind. Hard to change, but impossible to erode.', visual: '#fbbf24' }
            }
        }
    ];

    // --- 2. 3D DNA COMPONENT ---
    const DNAStrand = ({ activeGenes, epigenetics }) => {
        const groupRef = useRef();
        
        useFrame((state, delta) => {
            if (groupRef.current) {
                // Rotation speed depends on "Metabolic Rate" (Epigenetics/Focus)
                const speed = 0.2 + (epigenetics * 0.5);
                groupRef.current.rotation.y += delta * speed;
            }
        });

        // Procedurally generate base pairs
        const pairs = useMemo(() => {
            const items = [];
            const count = 20;
            const height = 8;
            const gap = height / count;
            
            for(let i=0; i<count; i++) {
                const y = (i * gap) - (height/2);
                const rotation = i * 0.5;
                
                // Determine color based on active genes mapping to this segment
                const geneIndex = i % GENE_DB.length;
                const gene = GENE_DB[geneIndex];
                const activeAllele = activeGenes[gene.id];
                const color = activeAllele ? gene.alleles[activeAllele].visual : '#444';
                const isActive = !!activeAllele;

                items.push({ pos: [0, y, 0], rot: [0, rotation, 0], color, isActive });
            }
            return items;
        }, [activeGenes]);

        return (
            <group ref={groupRef}>
                {pairs.map((p, i) => (
                    <group key={i} position={p.pos} rotation={p.rot}>
                        {/* Backbone */}
                        <mesh position={[1, 0, 0]}>
                            <sphereGeometry args={[0.2, 16, 16]} />
                            <meshStandardMaterial color={epigenetics > 0.6 ? "#ffd700" : "#888"} emissive={epigenetics > 0.6 ? "#ffd700" : "#000"} emissiveIntensity={epigenetics} />
                        </mesh>
                        <mesh position={[-1, 0, 0]}>
                            <sphereGeometry args={[0.2, 16, 16]} />
                            <meshStandardMaterial color={epigenetics > 0.6 ? "#ffd700" : "#888"} emissive={epigenetics > 0.6 ? "#ffd700" : "#000"} emissiveIntensity={epigenetics} />
                        </mesh>
                        
                        {/* Base Pair Bridge */}
                        <mesh rotation={[0, 0, Math.PI / 2]}>
                            <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
                            <meshStandardMaterial 
                                color={p.color} 
                                emissive={p.color} 
                                emissiveIntensity={p.isActive ? 1 + epigenetics : 0.2} 
                            />
                        </mesh>
                        
                        {/* Glow effect for active genes */}
                        {p.isActive && (
                            <pointLight position={[0,0,0]} color={p.color} distance={2} intensity={2} />
                        )}
                    </group>
                ))}
            </group>
        );
    };

    // --- 3. MAIN UI COMPONENT ---
    const [selectedAlleles, setSelectedAlleles] = useState({});
    const [narrative, setNarrative] = useState("Initializing Genetic Sequencer... Waiting for Subject.");
    const [epigeneticHealth, setEpigeneticHealth] = useState(0.5); // Derived from Neurofeedback
    
    // Neurofeedback Link
    useEffect(() => {
        if (!runtime.neuroBus) return;
        const unsub = runtime.neuroBus.subscribe(frame => {
            if (frame.type === 'EEG') {
                // Mock calculation of 'Focus' to drive Epigenetics
                // In a real app, this comes from processedData directly
                const payload = frame.payload;
                // Simple variance check as proxy for activity
                setEpigeneticHealth(prev => (prev * 0.9) + (Math.random() * 0.1)); 
            }
        });
        
        // Polling simulation for standalone demo
        const interval = setInterval(() => {
             // Simulate "Breathing" epigenetic state if no EEG
             const t = Date.now() / 2000;
             const val = (Math.sin(t) + 1) / 2; 
             setEpigeneticHealth(val);
        }, 100);
        
        return () => { unsub(); clearInterval(interval); };
    }, []);

    const handleSelect = (geneId, alleleKey) => {
        const newSelection = { ...selectedAlleles, [geneId]: alleleKey };
        setSelectedAlleles(newSelection);
        
        // Generate Narrative via Logic (Simulation of AI)
        const gene = GENE_DB.find(g => g.id === geneId);
        const allele = gene.alleles[alleleKey];
        setNarrative(\`🧬 MUTATION CONFIRMED: \${gene.name}.\\nPHENOTYPE EXPRESSION: \${allele.lore}\`);
    };

    const handleManifest = async () => {
        setNarrative("⚡ SEQUENCING GENOME... UPLOADING TO AKASHIC RECORD...");
        // Here we would call the Python backend to save this profile
        // For now, we simulate an AI oracle reading the future
        
        const traits = Object.entries(selectedAlleles).map(([id, key]) => {
            const g = GENE_DB.find(x => x.id === id);
            return g.alleles[key].effect;
        }).join(', ');
        
        try {
            const prompt = "The user has genetically engineered a human with these traits: " + traits + ". Predict their destiny in a Cyberpunk RPG world. Max 1 sentence.";
            const response = await runtime.ai.generateText(prompt, "You are a Genetic Oracle.");
            setNarrative("🔮 DESTINY PREDICTION: " + response);
        } catch(e) {
            setNarrative("🔮 DESTINY UNCERTAIN. (AI Offline)");
        }
    };

    return (
        <div className="w-full h-full bg-slate-950 relative flex overflow-hidden font-mono">
            {/* 3D Viewport */}
            <div className="absolute inset-0 z-0">
                <Canvas camera={{ position: [0, 0, 6], fov: 45 }}>
                    <color attach="background" args={['#020617']} />
                    <ambientLight intensity={0.5} />
                    <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} intensity={1} />
                    <pointLight position={[-10, -10, -10]} color="cyan" intensity={0.5} />
                    
                    <Float speed={2} rotationIntensity={0.5} floatIntensity={0.2}>
                        <DNAStrand activeGenes={selectedAlleles} epigenetics={epigeneticHealth} />
                    </Float>
                    
                    <Sparkles count={100} scale={8} size={2} speed={0.4} opacity={0.2} color="#ffffff" />
                    <Environment preset="city" />
                </Canvas>
            </div>

            {/* UI Overlay */}
            <div className="z-10 w-full h-full flex flex-col p-6 pointer-events-none">
                {/* Header */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500 tracking-tighter">
                            PHENOTYPE FORGE
                        </h1>
                        <div className="text-xs text-slate-500">GENOMIC RPG ENGINE // V1.0</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-400">EPIGENETIC HEALTH</div>
                        <div className={"text-xl font-bold " + (epigeneticHealth > 0.5 ? "text-green-400" : "text-red-400")}>
                            {(epigeneticHealth * 100).toFixed(0)}%
                        </div>
                    </div>
                </div>

                {/* Main Content Split */}
                <div className="flex-grow flex gap-8 items-center">
                    
                    {/* Left: Gene Selection */}
                    <div className="w-1/3 space-y-4 pointer-events-auto overflow-y-auto max-h-[60vh] custom-scrollbar pr-2">
                        {GENE_DB.map(gene => (
                            <div key={gene.id} className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded p-3 hover:border-cyan-500 transition-colors group">
                                <div className="flex justify-between items-center mb-2">
                                    <h3 className="text-sm font-bold text-slate-200">{gene.name}</h3>
                                    <span className="text-[10px] bg-slate-800 px-1 rounded text-slate-500">{gene.rsid}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {Object.entries(gene.alleles).map(([key, data]) => {
                                        const isSelected = selectedAlleles[gene.id] === key;
                                        return (
                                            <button 
                                                key={key}
                                                onClick={() => handleSelect(gene.id, key)}
                                                className={\`text-[10px] p-2 rounded border text-left transition-all \${isSelected ? 'bg-cyan-900/50 border-cyan-400 text-white shadow-[0_0_10px_cyan]' : 'bg-black/50 border-slate-700 text-slate-400 hover:bg-slate-800'}\`}
                                                style={{ borderColor: isSelected ? data.visual : '' }}
                                            >
                                                <div className="font-bold mb-1">{key}</div>
                                                <div className="opacity-80 leading-tight">{data.effect}</div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Center: Gap for 3D Model */}
                    <div className="flex-grow"></div>

                    {/* Right: Narrative Output */}
                    <div className="w-1/4 flex flex-col gap-4 pointer-events-auto">
                        <div className="bg-black/60 backdrop-blur border-l-2 border-purple-500 p-4 rounded-r-lg">
                            <div className="text-[10px] text-purple-400 font-bold mb-1">ORACLE LOG</div>
                            <p className="text-xs text-slate-300 font-serif leading-relaxed animate-pulse">
                                {narrative}
                            </p>
                        </div>
                        
                        <button 
                            onClick={handleManifest}
                            disabled={Object.keys(selectedAlleles).length === 0}
                            className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-105"
                        >
                            MANIFEST DESTINY
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
`;

export const GENOME_FORGE_PROTOCOL: ToolCreatorPayload = {
    name: 'Phenotype Forge: Genomic RPG',
    description: 'A scientifically grounded character creation engine. Select real genetic variants (SNPs) to forge your RPG attributes. Visualized via a reactive 3D DNA helix.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To demonstrate the fusion of rigorous genomics and generative storytelling.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API', required: true }
    ],
    scientificDossier: {
        title: "Phenotypic Expression Mapping",
        hypothesis: "Gamifying real genomic data improves user engagement with biological self-knowledge.",
        mechanism: "SNP-to-Trait lookup table visualized via WebGL.",
        targetNeuralState: "Epigenetic awareness.",
        citations: ["Plomin, R., et al. (2009).", "Horvath, S. (2013)."],
        relatedKeywords: ["Genomics", "RPG", "Epigenetics", "Polygenic Scores"]
    },
    dataRequirements: { type: 'eeg', channels: [], metrics: [] },
    processingCode: `(d,r)=>({})`,
    implementationCode: GENOME_UI_IMPL
};
