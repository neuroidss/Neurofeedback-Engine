
// bootstrap/visuals.ts

// 1. APERTURE (Focus Camera Lens)
const APERTURE = `
    const [focusRatio, setFocusRatio] = useState(1.0);
    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System' && f.payload?.visualUpdate?.focusRatio !== undefined) setFocusRatio(f.payload.visualUpdate.focusRatio);
        });
        return unsub;
    }, []);
    const isLocked = focusRatio > 1.2;
    const normalized = Math.min(1, Math.max(0, (focusRatio - 0.5) / 1.5)); 
    const size = 100 + (normalized * 150); 
    const color = isLocked ? '#fbbf24' : '#22d3ee'; 
    return (
        <div style={{width:'100%', height:'100%', background:'#0f172a', display:'flex', alignItems:'center', justifyContent:'center', position:'relative', overflow:'hidden'}}>
            <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,' + Math.max(0, 0.5 - normalized*0.5) + ')', backdropFilter: 'blur(' + Math.max(0, (1-normalized)*10) + 'px)', transition:'all 0.2s'}} />
            <div style={{width:size, height:size, borderRadius:'50%', border:'4px solid '+color, boxShadow:'0 0 30px '+color, transition:'all 0.1s', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10}}>
                {isLocked && <div style={{width:10, height:10, borderRadius:'50%', background:color, boxShadow:'0 0 10px '+color}} />}
            </div>
            <div style={{position:'absolute', bottom:40, color:color, fontWeight:'bold', zIndex:20}}>{isLocked ? 'LOCK ON' : 'ACQUIRING...'}</div>
        </div>
    );
`;

// 2. GRADIENT (Alpha Asymmetry)
const GRADIENT = `
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System' && f.payload?.visualUpdate?.asymmetryIndex !== undefined) setIndex(f.payload.visualUpdate.asymmetryIndex);
        });
        return unsub;
    }, []);
    const hue = 40 + (1 - ((index + 1) / 2)) * 200; 
    return (
        <div style={{width:'100%', height:'100%', transition:'background 0.1s', background:'radial-gradient(circle, hsl('+hue+',90%,60%) 0%, hsl('+(hue+20)+',80%,30%) 70%, #000 100%)', display:'flex', alignItems:'center', justifyContent:'center', color:'white'}}>
            <h2 style={{fontSize:'1.5rem', textShadow:'0 2px 10px rgba(0,0,0,0.5)'}}>{index > 0.2 ? 'POSITIVE' : (index < -0.2 ? 'NEGATIVE' : 'BALANCED')}</h2>
        </div>
    );
`;

// 3. PARTICLES (PAC / Memory)
const PARTICLES = `
    const [pacStrength, setStrength] = useState(0);
    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System' && f.payload?.visualUpdate?.pacStrength !== undefined) setStrength(f.payload.visualUpdate.pacStrength);
        });
        return unsub;
    }, []);
    const [phase, setPhase] = useState(0);
    useEffect(() => {
        let id;
        const loop = () => { setPhase(p => (p+0.04)%(2*Math.PI)); id = requestAnimationFrame(loop); };
        loop();
        return () => cancelAnimationFrame(id);
    }, []);
    const size = 50 + Math.sin(phase) * 20;
    return (
        <div style={{width:'100%', height:'100%', background:'#000', display:'flex', alignItems:'center', justifyContent:'center'}}>
            <div style={{width:size, height:size, background:'cyan', borderRadius:'50%', opacity:0.6+Math.sin(phase)*0.4, boxShadow:'0 0 30px cyan'}} />
            <div style={{position:'absolute', bottom:20, color:'white', fontFamily:'monospace'}}>PAC: {pacStrength.toFixed(2)}</div>
        </div>
    );
`;

// 4. CIRCLE (Simple Alpha)
const CIRCLE = `
    const [alphaRatio, setRatio] = useState(0);
    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System' && f.payload?.visualUpdate?.alphaRatio !== undefined) setRatio(f.payload.visualUpdate.alphaRatio);
        });
        return unsub;
    }, []);
    const sz = 50 + (alphaRatio * 150);
    return (
        <div style={{width:'100%', height:'100%', background:'rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column'}}>
            <div style={{width:sz, height:sz, borderRadius:'50%', background:'hsl(200, 100%, '+(30+alphaRatio*40)+'%)', boxShadow:'0 0 '+(alphaRatio*40)+'px rgba(100,200,255,0.8)', transition:'all 0.1s'}} />
            <p style={{marginTop:20, color:'white', fontWeight:'bold'}}>Alpha: {(alphaRatio*100).toFixed(1)}%</p>
        </div>
    );
`;

// 5. PULSING BRAIN (3D)
const BRAIN_3D = `
    const { useState, useEffect, useRef } = React;
    const [text, setText] = useState('Init...');
    const [beat, setBeat] = useState(10);
    
    useEffect(() => {
        const i = setInterval(() => {
            if (runtime.streamEngine) {
                const n = runtime.streamEngine.getDebugState().nodes.find(x => x.id === 'audio_out');
                if (n?.value?.beat) setBeat(n.value.beat);
            }
        }, 100);
        const u = runtime.neuroBus.subscribe(f => {
            if (f.payload?.visualUpdate?.textOverlay) setText(f.payload.visualUpdate.textOverlay);
        });
        return () => { clearInterval(i); u(); };
    }, []);

    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    if (!R3F || !Drei) return null;
    const { Canvas, useFrame } = R3F;
    const { Sphere, MeshDistortMaterial } = Drei;

    const Brain = ({ hz }) => {
        const ref = useRef();
        useFrame((state) => {
            if (ref.current) {
                const t = state.clock.getElapsedTime();
                const p = Math.sin(t * hz * Math.PI * 0.5);
                ref.current.scale.setScalar(1 + p * 0.05);
                ref.current.distort = 0.3 + p * 0.1;
            }
        });
        return <Sphere args={[1.5,64,64]} ref={ref}><MeshDistortMaterial color="#a855f7" speed={2} distort={0.4} radius={1} /></Sphere>;
    };

    return (
        <div style={{width:'100%', height:'100%', background:'black', position:'relative'}}>
            <div style={{position:'absolute', bottom:20, width:'100%', textAlign:'center', color:'white', zIndex:10, fontWeight:'bold', fontSize:'1.2rem'}}>{text}</div>
            <Canvas><ambientLight intensity={0.5} /><pointLight position={[10,10,10]} /><Brain hz={beat} /></Canvas>
        </div>
    );
`;

// Export dictionary instead of individual variables to allow index lookup
export const VISUAL_COMPONENTS = {
    APERTURE,
    GRADIENT,
    PARTICLES,
    CIRCLE,
    BRAIN_3D
};

// Backward compatibility exports
export const APERTURE_VIZ = APERTURE;
export const GRADIENT_BREATH_VIZ = GRADIENT;
export const PARTICLES_ORB_VIZ = PARTICLES;
export const CIRCLE_GROWTH_VIZ = CIRCLE;
export const PULSING_BRAIN_3D_VIZ = BRAIN_3D;
