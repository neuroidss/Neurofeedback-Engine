
// bootstrap/visuals.ts

// 1. PULSING BRAIN (3D) - Kept for MusicGen / Generic Visualization
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
    BRAIN_3D
};

// Backward compatibility exports (Empty strings for deleted ones to prevent crash if referenced, though functionality is gone)
export const APERTURE_VIZ = "";
export const GRADIENT_BREATH_VIZ = "";
export const PARTICLES_ORB_VIZ = "";
export const CIRCLE_GROWTH_VIZ = "";
export const PULSING_BRAIN_3D_VIZ = BRAIN_3D;
