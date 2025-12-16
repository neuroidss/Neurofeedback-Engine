
export const AMEM_KERNEL = `
const useAgenticMemory = (runtime, heading, activeLore, modelsReady) => {
    const [graph, setGraph] = useState({ nodes: [], edges: [] });
    const nodesRef = useRef([]); 
    const edgesRef = useRef([]); 
    const [isIngesting, setIsIngesting] = useState(false);
    const bootingRef = useRef(false);
    const lastLoreIdRef = useRef(null);
    
    // --- 1. HIPPORAG BOOTSTRAP: Load Archetypes from Lore ---
    useEffect(() => {
        const boot = async () => {
            // Halt if models aren't ready yet!
            if (!modelsReady) return;

            // Detect Lore Switch and Reset
            if (lastLoreIdRef.current !== activeLore.id) {
                nodesRef.current = [];
                edgesRef.current = [];
                lastLoreIdRef.current = activeLore.id;
                bootingRef.current = false;
            }

            if (bootingRef.current) return;
            if (nodesRef.current.some(n => n.type === 'archetype')) return;
            
            bootingRef.current = true;
            
            try {
                runtime.logEvent(\`[A-MEM] 🧠 Seeding \${activeLore.name} Archetypes...\`);
                
                // Embed Archetypes
                const texts = activeLore.archetypes.map(a => \`\${a.name} \${a.tags.join(' ')}\`);
                
                let embeddings;
                try {
                    embeddings = await runtime.ai.generateEmbeddings(texts);
                } catch (e) {
                    console.error("Boot Embeddings Failed", e);
                    embeddings = texts.map(() => new Array(384).fill(0).map(()=>Math.random()));
                }
                
                const anchors = activeLore.archetypes.map((arch, i) => ({
                    id: arch.id,
                    label: arch.name,
                    content: \`Archetype of \${arch.name}. Associated with \${arch.tags.join(', ')}.\`,
                    type: 'archetype',
                    vector: embeddings[i],
                    visualVector: null, 
                    tags: arch.tags,
                    // Generic 'element' fallback if not using elemental lore
                    element: arch.tags[0] || 'Core',
                    chi: activeLore.statusLabels.neutral, // Use lore-specific label
                    activation: 0.1,
                    position: new THREE.Vector3(arch.pos[0] * 1.5, arch.pos[1] * 1.5, arch.pos[2] * 1.5),
                    velocity: new THREE.Vector3(0,0,0),
                    angle: arch.angle,
                    timestamp: Date.now()
                }));
                
                nodesRef.current = [...nodesRef.current, ...anchors];
                updateGraph();
                
            } catch (e) {
                console.error("A-MEM Boot Error:", e);
                bootingRef.current = false; 
            }
        };
        boot();
    }, [activeLore, modelsReady]); // Dependency on modelsReady ensures it waits

    // --- 2. SPATIAL ACTIVATION ---
    useEffect(() => {
        if (heading === null) return;
        nodesRef.current.forEach(n => {
            if (n.type === 'archetype' && n.angle !== -1) {
                const diff = Math.abs(n.angle - heading);
                const wrapDiff = Math.min(diff, 360 - diff);
                if (wrapDiff < 30) n.activation = Math.min(1.0, n.activation + 0.05);
            }
        });
    }, [heading]);

    // --- 3. A-MEM INGESTION ---
    const ingest = useCallback(async (noteData) => {
        if (!noteData || !noteData.content || !modelsReady) return;
        setIsIngesting(true);
        const { content, tags, element, chi, type = 'observation', visualVector = null, parentId = null } = noteData;
        
        const isReflection = type === 'reflection';
        if (isReflection) runtime.logEvent(\`[A-MEM] 💭 Thinking: "\${content}"\`);
        else runtime.logEvent(\`[A-MEM] 📥 Ingesting: "\${content.substring(0,30)}..."\`);
        
        const textToEmbed = \`\${content} \${tags?.join(' ') || ''} \${chi || ''}\`;
        
        let vectors;
        try {
            vectors = await runtime.ai.generateEmbeddings([textToEmbed]);
        } catch (embErr) {
            runtime.logEvent(\`[A-MEM] ⚠️ Embedding Glitch. Using fallback.\`);
            vectors = [new Array(384).fill(0).map(()=>Math.random())];
        }
        const vector = vectors[0];
        
        const newNode = {
            id: 'mem_' + Date.now(),
            label: isReflection ? 'Thought' : (content.substring(0, 15) + (content.length>15?'...':'')),
            content,
            type: type, 
            vector,
            visualVector,
            tags: tags || [],
            element: element || 'None',
            chi: chi || 'Neutral',
            activation: 1.0, 
            timestamp: Date.now(),
            position: new THREE.Vector3(0,0,0), 
            velocity: new THREE.Vector3(0,0,0),
            parentId
        };

        const newEdges = [];
        let strongestAnchor = null;
        let maxSim = -1;

        nodesRef.current.forEach(existing => {
            // A. Semantic Text Linking
            let dot = 0, magA = 0, magB = 0;
            for(let i=0; i<vector.length; i++) {
                dot += vector[i] * existing.vector[i];
                magA += vector[i] * vector[i];
                magB += existing.vector[i] * existing.vector[i];
            }
            const sim = dot / (Math.sqrt(magA) * Math.sqrt(magB) + 0.00001);
            
            // B. Visual Linking
            let visualSim = 0;
            if (visualVector && existing.visualVector) {
                 let vDot = 0, vMagA = 0, vMagB = 0;
                 for(let i=0; i<visualVector.length; i++) {
                    vDot += visualVector[i] * existing.visualVector[i];
                    vMagA += visualVector[i] * visualVector[i];
                    vMagB += existing.visualVector[i] * existing.visualVector[i];
                 }
                 visualSim = vDot / (Math.sqrt(vMagA) * Math.sqrt(vMagB) + 0.00001);
            }
            
            const threshold = existing.type === 'archetype' ? 0.25 : 0.65;
            
            if (sim > threshold || visualSim > 0.85) {
                const weight = Math.max(sim, visualSim);
                const linkType = visualSim > 0.85 ? 'visual' : 'semantic';
                
                newEdges.push({ source: newNode.id, target: existing.id, weight, type: linkType });
                existing.activation = Math.min(1.0, existing.activation + 0.5);
                
                if (existing.type === 'archetype' && sim > maxSim) {
                    maxSim = sim;
                    strongestAnchor = existing;
                }
            }
        });
        
        if (parentId) {
            newEdges.push({ source: newNode.id, target: parentId, weight: 1.0, type: 'causal' });
        }

        // Layout Physics Init
        if (strongestAnchor) {
            const jitter = new THREE.Vector3((Math.random()-0.5), (Math.random()-0.5), (Math.random()-0.5));
            newNode.position.copy(strongestAnchor.position).add(jitter);
        } else if (parentId) {
            const parent = nodesRef.current.find(n => n.id === parentId);
            if (parent) newNode.position.copy(parent.position).add(new THREE.Vector3(0, 0.5, 0));
        } else {
            newNode.position.set((Math.random()-0.5)*5, 5 + (Math.random()*2), (Math.random()-0.5)*5);
        }

        nodesRef.current.push(newNode);
        edgesRef.current.push(...newEdges);
        
        // Propagate Status
        const badStatus = activeLore.statusLabels.bad;
        if (strongestAnchor && type === 'observation') {
            if (newNode.chi === badStatus) strongestAnchor.chi = 'Warning';
        }

        updateGraph(); 
        setIsIngesting(false);
        return newNode;
    }, [runtime, activeLore, modelsReady]); 
    
    // --- 4. HYBRID RETRIEVAL ---
    const retrieve = useCallback(async (queryText, queryVisualVector = null) => {
        if (!modelsReady) return [];
        let queryVec = null;
        if (queryText) {
            try {
                const vectors = await runtime.ai.generateEmbeddings([queryText]);
                queryVec = vectors[0];
            } catch(e) { return []; }
        }
        
        const seeds = nodesRef.current.map(n => {
            let score = 0;
            if (queryVec) {
                let dot = 0, magA = 0, magB = 0;
                for(let i=0; i<queryVec.length; i++) {
                    dot += queryVec[i] * n.vector[i];
                    magA += queryVec[i] * queryVec[i];
                    magB += n.vector[i] * n.vector[i];
                }
                score += (dot / (Math.sqrt(magA) * Math.sqrt(magB) + 0.00001));
            }
            if (queryVisualVector && n.visualVector) {
                 let vDot = 0, vMagA = 0, vMagB = 0;
                 for(let i=0; i<queryVisualVector.length; i++) {
                    vDot += queryVisualVector[i] * n.visualVector[i];
                    vMagA += queryVisualVector[i] * queryVisualVector[i];
                    vMagB += n.visualVector[i] * n.visualVector[i];
                 }
                 const vSim = vDot / (Math.sqrt(vMagA) * Math.sqrt(vMagB) + 0.00001);
                 if (vSim > 0.85) score += 2.0; 
                 else if (vSim > 0.6) score += vSim;
            }
            return { node: n, score: score };
        })
        .filter(s => s.score > 0.35)
        .sort((a,b) => b.score - a.score)
        .slice(0, 5); 
        
        const contextNodes = new Set();
        seeds.forEach(s => {
            contextNodes.add(s.node);
            s.node.activation = 1.0; 
            edgesRef.current.forEach(e => {
                if (e.source === s.node.id) {
                    const target = nodesRef.current.find(n => n.id === e.target);
                    if (target) contextNodes.add(target);
                }
                if (e.target === s.node.id) {
                    const source = nodesRef.current.find(n => n.id === e.source);
                    if (source) contextNodes.add(source);
                }
            });
        });
        return Array.from(contextNodes);
    }, [runtime, modelsReady]);
    
    const retrieveRecentReflections = useCallback((limit = 3) => {
        return nodesRef.current
            .filter(n => n.type === 'reflection')
            .sort((a,b) => b.timestamp - a.timestamp)
            .slice(0, limit)
            .reverse();
    }, []);

    const updateGraph = () => {
        setGraph({ nodes: [...nodesRef.current], edges: [...edgesRef.current] });
    };

    return { graph, ingest, retrieve, retrieveRecentReflections, isIngesting };
};
`;
