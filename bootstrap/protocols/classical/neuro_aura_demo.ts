
// bootstrap/protocols/classical/neuro_aura_demo.ts
import type { ToolCreatorPayload } from '../../../types';
import { AURA_LOGIC_IMPL } from '../../common_node_impls';

// --- 2. THE MIRROR UI (React Component) ---
const AURA_UI_IMPL = `
    const { useState, useEffect, useRef, useMemo } = React;
    const R3F = window.ReactThreeFiber;
    const Drei = window.ReactThreeDrei;
    const THREE = window.THREE;
    
    if (!R3F || !Drei || !THREE) return <div className="p-10 text-white">Loading Holographic Core...</div>;
    const { Canvas, useFrame, useThree } = R3F;
    const { Sparkles } = Drei;

    // --- STATE ---
    const [visState, setVisState] = useState({ color: '#22d3ee', intensity: 0.2, text: 'SYSTEM IDLE' });

    // --- GRAPH DEPLOYMENT HANDLER ---
    const initializeSystem = async () => {
        try {
            setVisState(prev => ({ ...prev, text: 'INITIALIZING SENSORS...' }));
            
            // 1. Force Camera Access
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            window.localCameraStream = stream; 
            
            if (!runtime.streamEngine) throw new Error("Stream Engine not ready");

            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph({ id: 'neuro_aura_graph', nodes: {}, edges: [] });
            
            // Sources
            await runtime.tools.run('Create_Vision_Source', {});
            await runtime.tools.run('Create_Audio_Source', {});
            
            // EEG Source
            await runtime.tools.run('Create_EEG_Source', { 
                nodeId: 'eeg_source_1', 
                channel: 'Fz', 
                config: { simulationRange: [0, 0] } 
            });
            
            // Fusion Brain (Updated to Create_Custom_Node with imported logic)
            await runtime.tools.run('Create_Custom_Node', {
                nodeId: 'aura_engine',
                inputs: ['vision_source_1', 'audio_source_1', 'eeg_source_1'],
                jsLogic: ${JSON.stringify(AURA_LOGIC_IMPL)},
                config: { mode: 'EXPRESSED' } 
            });
            
            runtime.streamEngine.start();
            setVisState(prev => ({ ...prev, text: 'NEURO-LINK: SEARCHING...' }));

        } catch (e) {
            console.error("Init Failed:", e);
            setVisState(prev => ({ ...prev, text: 'SYSTEM FAILURE' }));
        }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (runtime.streamEngine) runtime.streamEngine.stop();
        };
    }, []);

    useEffect(() => {
        const unsub = runtime.neuroBus.subscribe(f => {
            if (f.type === 'System' && f.payload?.visualUpdate) {
                setVisState(prev => ({ 
                    ...prev, 
                    color: f.payload.visualUpdate.globalColor || prev.color,
                    intensity: f.payload.visualUpdate.intensity || prev.intensity,
                    text: f.payload.visualUpdate.textOverlay || prev.text
                }));
            }
        });
        return unsub;
    }, []);

    return (
        <div className="w-full h-full bg-black relative overflow-hidden flex flex-col items-center justify-center">
            <button 
                onClick={initializeSystem}
                className="z-50 px-8 py-4 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg shadow-[0_0_30px_cyan]"
            >
                INITIALIZE SYSTEM
            </button>
            
            <div className="absolute bottom-10 text-center z-50 pointer-events-none">
                <h1 className="text-3xl font-black text-white" style={{ textShadow: '0 0 20px ' + visState.color }}>
                    {visState.text}
                </h1>
            </div>

            <Canvas camera={{ position: [0, 0, 6], fov: 50 }}>
                <color attach="background" args={['#050505']} />
                <Sparkles count={50} scale={6} size={4} speed={0.4} opacity={0.5} color={visState.color} />
            </Canvas>
        </div>
    );
`;

export const NEURO_AURA_DEMO_PROTOCOL: ToolCreatorPayload = {
    name: 'Neuro-Aura / Empathy Mirror',
    description: 'A "Magic Mirror" installation.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'Experience.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'N/A', required: false },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    dataRequirements: { type: 'eeg', channels: ['Fz'], metrics: [] },
    processingCode: `(d, r) => ({})`, 
    implementationCode: AURA_UI_IMPL
};