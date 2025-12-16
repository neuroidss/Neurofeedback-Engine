
export const INNER_WORLD_RENDERER = `
const NodeLabel = ({ text, color, visible }) => {
    const texture = useMemo(() => {
        if (!text) return null;
        const canvas = document.createElement('canvas');
        canvas.width = 512; 
        canvas.height = 128; 
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const r = 20; 
        const border = 6;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(border, border, w - border*2, h - border*2, r);
        else ctx.rect(border, border, w - border*2, h - border*2);
        ctx.fill();
        
        ctx.strokeStyle = color;
        ctx.lineWidth = border;
        ctx.stroke();

        ctx.font = 'bold 40px "Courier New", monospace';
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.fillText(text, w/2, h/2);
        
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.LinearFilter;
        return tex;
    }, [text, color]);

    if (!texture || !visible) return null;
    return (
        <sprite position={[0, 1.2, 0]} scale={[3, 0.75, 1]}>
            <spriteMaterial map={texture} transparent depthTest={false} renderOrder={999} />
        </sprite>
    );
};

const InnerWorld = ({ graph, hudMode, activeLore }) => {
    const groupRef = useRef();
    const nodeRefs = useRef({}); 
    
    // Physics
    useFrame((state, delta) => {
        if (!graph.nodes || graph.nodes.length === 0) return;
        const repulsion = 15.0; 
        const centerPull = 0.005; 
        
        for (let i = 0; i < graph.nodes.length; i++) {
            const nodeA = graph.nodes[i];
            const force = new THREE.Vector3(0,0,0);
            
            if (nodeA.activation > 0.05) nodeA.activation *= 0.98;

            if (nodeA.type === 'archetype') {
                // Find matching archetype in current lore
                const arch = activeLore.archetypes.find(a => a.id === nodeA.id);
                if (arch) {
                    const targetPos = new THREE.Vector3(arch.pos[0]*1.5, arch.pos[1]*1.5, arch.pos[2]*1.5);
                    const dist = nodeA.position.distanceTo(targetPos);
                    const pull = new THREE.Vector3().subVectors(targetPos, nodeA.position).normalize().multiplyScalar(dist * 2.0);
                    force.add(pull);
                }
            } else {
                force.add(nodeA.position.clone().multiplyScalar(-centerPull));
            }

            for (let j = 0; j < graph.nodes.length; j++) {
                if (i === j) continue;
                const nodeB = graph.nodes[j];
                const diff = new THREE.Vector3().subVectors(nodeA.position, nodeB.position);
                let dist = diff.length();
                if (dist < 0.01) { diff.set(Math.random()-0.5, Math.random()-0.5, Math.random()-0.5).normalize(); dist = 0.01; }
                if (dist < 6.0) {
                    const push = repulsion / (dist * dist);
                    force.add(diff.normalize().multiplyScalar(push));
                }
            }
            
            nodeA.velocity.add(force.multiplyScalar(delta));
            nodeA.velocity.multiplyScalar(0.92); 
            nodeA.position.add(nodeA.velocity);
            
            const sceneObject = nodeRefs.current[nodeA.id];
            if (sceneObject) {
                sceneObject.position.copy(nodeA.position);
                const isArch = nodeA.type === 'archetype';
                const baseScale = isArch ? 0.5 : 0.15;
                const s = baseScale + (nodeA.activation * 0.3);
                sceneObject.scale.set(s, s, s);
            }
        }
        
        if (groupRef.current) {
            const targetRot = hudMode ? 0 : groupRef.current.rotation.y + (delta * 0.05);
            groupRef.current.rotation.y = hudMode ? THREE.MathUtils.lerp(groupRef.current.rotation.y, 0, delta * 3) : targetRot;
        }
    });

    return (
        <group ref={groupRef}>
            {!hudMode && <Stars radius={60} count={2000} factor={4} fade speed={0.2} />}
            {!hudMode && <gridHelper args={[20, 5, 0x222222, 0x050505]} position={[0, -3, 0]} />}

            {/* NODES */}
            {graph.nodes.map(n => {
                const isArch = n.type === 'archetype';
                
                let color = '#ffffff';
                if (isArch) {
                     // Lookup color from lore archetypes
                     const arch = activeLore.archetypes.find(a => a.id === n.id);
                     color = arch ? arch.color : '#ffd700';
                     // Status coloring
                     if (n.chi === activeLore.statusLabels.bad) color = activeLore.theme.secondary;
                } else {
                     if (n.chi === activeLore.statusLabels.bad) color = '#ffaa00';
                     else if (n.chi === activeLore.statusLabels.good) color = activeLore.theme.primary;
                }

                return (
                    <group 
                        key={n.id} 
                        ref={el => nodeRefs.current[n.id] = el}
                        position={n.position} 
                    >
                        <mesh>
                            {isArch ? <icosahedronGeometry args={[1, 1]} /> : <sphereGeometry args={[1, 8, 8]} />}
                            <meshBasicMaterial color={color} wireframe={true} transparent opacity={isArch ? 0.8 : 0.6} />
                        </mesh>
                        <mesh>
                            <sphereGeometry args={[0.5, 8, 8]} />
                            <meshBasicMaterial color={color} transparent opacity={0.3} />
                        </mesh>
                        
                        <NodeLabel text={n.label || n.content.substring(0,10)} color={color} visible={true} />
                    </group>
                );
            })}

            {/* EDGES */}
            {graph.edges.map((e, i) => {
                const src = graph.nodes.find(n => n.id === e.source);
                const trg = graph.nodes.find(n => n.id === e.target);
                if (!src || !trg || e.weight < 0.5) return null;

                return (
                    <group key={i}>
                        <Line 
                            points={[src.position, trg.position]} 
                            color={e.weight > 0.7 ? activeLore.theme.primary : "#333333"} 
                            transparent 
                            opacity={e.weight * (hudMode ? 0.2 : 0.3)} 
                            lineWidth={1} 
                        />
                    </group>
                );
            })}
        </group>
    );
};
`;
