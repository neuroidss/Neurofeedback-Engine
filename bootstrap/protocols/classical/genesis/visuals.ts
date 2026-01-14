
export const GENESIS_VISUALS = `
    // --- VISUALS: THE VOID ---
    const TheVoid = ({ mode, intensity, isRecursive }) => {
        const meshRef = useRef();
        // MEMORY FIX: Create vector once and reuse it to prevent Garbage Collection thrashing in render loop
        const vec = useMemo(() => new THREE.Vector3(), []);
        
        useFrame((state, delta) => {
            if (meshRef.current) {
                meshRef.current.rotation.y += delta * (0.1 + intensity * 0.2);
                // Mutate the existing vector instead of creating 'new THREE.Vector3()' 60 times a second
                vec.set(1 + intensity, 1 + intensity, 1 + intensity);
                meshRef.current.scale.lerp(vec, 0.05);
            }
        });
        const color = isRecursive ? '#00ff00' : (mode === 'ACTING' ? '#06b6d4' : '#a855f7');
        return (
            <group>
                <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
                <Float speed={2} rotationIntensity={0.5} floatIntensity={1}>
                    <mesh ref={meshRef}>
                        <icosahedronGeometry args={[2, isRecursive ? 2 : 1]} />
                        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.2} wireframe={true} />
                    </mesh>
                </Float>
                <Sparkles count={200} scale={10} size={2} speed={0.4} opacity={0.5} color={color} />
            </group>
        );
    };

    // --- VISUALS: TRANSACTION TIMELINE RENDERER (FIXED LAYOUT) ---
    const FateGraphVis = ({ data, activeIndex }) => {
        const canvasRef = useRef(null);
        const containerRef = useRef(null);
        const [width, setWidth] = useState(800);
        
        // Track container resize to fit canvas exactly
        useEffect(() => {
            if (!containerRef.current) return;
            const resizeObserver = new ResizeObserver(entries => {
                // JITTER FIX: Wrap in RAF and add threshold
                window.requestAnimationFrame(() => {
                    for (let entry of entries) {
                        const newW = Math.floor(entry.contentRect.width);
                        // Prevent updates for minor pixel diffs (sub-pixel rendering jitter)
                        setWidth(prev => (Math.abs(prev - newW) > 2 ? newW : prev));
                    }
                });
            });
            resizeObserver.observe(containerRef.current);
            return () => resizeObserver.disconnect();
        }, []);

        useEffect(() => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const w = width;
            const h = 300;
            
            // 1. Setup & Background
            ctx.fillStyle = '#020617'; // Slate-950
            ctx.fillRect(0, 0, w, h);
            
            if (!data || !data.nodes || data.nodes.length === 0) {
                ctx.fillStyle = '#475569';
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText("Waiting for Fate Data...", w/2, h/2);
                return;
            }
            
            // 2. Layout Constants (Fixed Margins)
            const GRAPH_TOP = 100; // Space for angled labels
            const LEFT_MARGIN = 140; // Space for Entity Names
            const RIGHT_MARGIN = 40;
            const BOTTOM_MARGIN = 20;
            const USABLE_H = h - GRAPH_TOP - BOTTOM_MARGIN;
            const USABLE_W = w - LEFT_MARGIN - RIGHT_MARGIN;

            // 3. Identify Entities (Lanes)
            const allEntities = new Set();
            data.nodes.forEach(n => {
                if (n.entities && Array.isArray(n.entities)) {
                    n.entities.forEach(e => allEntities.add(e));
                }
            });
            let entityList = Array.from(allEntities).sort();
            if (entityList.length === 0) entityList = ["World", "Player"];
            
            const laneHeight = USABLE_H / Math.max(1, entityList.length);
            
            // 4. Calculate X Spacing (Clamped Fit)
            const nodeCount = data.nodes.length;
            let stepX = 0;
            
            if (nodeCount > 1) {
                const fitStep = USABLE_W / (nodeCount - 1);
                // CLAMP MAX SPACING: Prevents "gigantic distance" for few nodes.
                // But allows squeezing if many nodes.
                stepX = Math.min(100, fitStep); 
            } else {
                stepX = 0; // Single node centered
            }
            
            // Calculate total graph width with the current step
            const totalGraphWidth = stepX * (nodeCount - 1);
            
            // Center the graph horizontally in the usable area
            let startX = LEFT_MARGIN;
            if (totalGraphWidth < USABLE_W) {
                startX = LEFT_MARGIN + (USABLE_W - totalGraphWidth) / 2;
            }

            // 5. Draw Swimlanes (Horizontal)
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            
            entityList.forEach((ent, i) => {
                const y = GRAPH_TOP + (i * laneHeight) + (laneHeight / 2);
                
                // Lane Line
                ctx.strokeStyle = '#1e293b'; // Slate-800
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(LEFT_MARGIN, y);
                ctx.lineTo(w - RIGHT_MARGIN, y);
                ctx.stroke();
                
                // Label (Left Side)
                ctx.fillStyle = '#94a3b8'; // Slate-400
                ctx.fillText(ent.substring(0, 20), LEFT_MARGIN - 10, y);
            });

            // 6. Draw Transactions (Vertical Events)
            data.nodes.forEach((node, i) => {
                const x = startX + (i * stepX);
                const isActive = i === activeIndex;
                
                // Determine Participants Y coords
                let participants = node.entities || [];
                if (participants.length === 0) participants = entityList;
                
                const yPoints = [];
                participants.forEach(p => {
                    const idx = entityList.indexOf(p);
                    if (idx !== -1) yPoints.push(GRAPH_TOP + (idx * laneHeight) + (laneHeight / 2));
                });
                
                if (yPoints.length === 0) return;
                
                const minY = Math.min(...yPoints);
                const maxY = Math.max(...yPoints);
                
                // Vertical Connector Line
                ctx.beginPath();
                ctx.moveTo(x, minY);
                ctx.lineTo(x, maxY);
                ctx.lineWidth = isActive ? 2 : 1;
                ctx.strokeStyle = isActive ? '#facc15' : '#334155'; // Yellow active, Slate-700 inactive
                ctx.stroke();
                
                // Nodes on Lanes
                yPoints.forEach(y => {
                    ctx.beginPath();
                    ctx.arc(x, y, isActive ? 4 : 2, 0, Math.PI * 2);
                    ctx.fillStyle = isActive ? '#facc15' : '#0f172a'; // Yellow active, Slate-950 inactive
                    ctx.strokeStyle = isActive ? '#facc15' : '#475569';
                    ctx.lineWidth = 1;
                    ctx.fill();
                    ctx.stroke();
                });
                
                // Event Label (Angled at Top)
                ctx.save();
                ctx.translate(x, GRAPH_TOP - 10);
                ctx.rotate(-Math.PI / 4); // -45 degrees (Up-Right)
                ctx.textAlign = 'left';
                ctx.fillStyle = isActive ? '#facc15' : '#64748b'; // Yellow active, Slate-500 inactive
                ctx.font = isActive ? 'bold 10px monospace' : '9px monospace';
                
                const title = node.label || node.title || \`Evt \${i}\`;
                ctx.fillText(title.substring(0, 25), 0, 0);
                ctx.restore();
                
                // Active Marker (Vertical Laser Highlight)
                if (isActive) {
                    ctx.save();
                    ctx.globalAlpha = 0.1;
                    ctx.fillStyle = '#facc15';
                    // Highlight the column
                    const highlightW = Math.max(20, stepX);
                    ctx.fillRect(x - highlightW/2, GRAPH_TOP, highlightW, USABLE_H);
                    ctx.restore();
                }
            });
            
        }, [data, activeIndex, width]);
        
        return (
            <div 
                ref={containerRef}
                className="w-full bg-slate-950 border border-slate-800 rounded shadow-inner overflow-hidden"
                style={{ height: '300px' }} // Enforce container height
            >
                <canvas 
                    ref={canvasRef} 
                    width={width} 
                    height={300} 
                    style={{ display: 'block', width: '100%', height: '300px' }} // CSS lock to prevent layout shift
                />
            </div>
        );
    };
`;
