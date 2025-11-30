
import React, { useState, useEffect, useRef } from 'react';
import { VISUAL_COMPONENTS } from '../bootstrap/visuals';

interface GraphRendererProps {
    runtime: any;
    nodes: any[];
    visualComponent: string;
}

const UniversalGraphRenderer: React.FC<GraphRendererProps> = ({ runtime, nodes, visualComponent }) => {
    const [graphNodes, setGraphNodes] = useState<any[]>([]);
    
    // Access global 3D libraries injected by index.tsx
    const R3F = (window as any).ReactThreeFiber;
    const Drei = (window as any).ReactThreeDrei;
    const THREE = (window as any).THREE;

    // Define or retrieve the visual component
    // We use eval here only for custom components passed as strings that aren't in the library.
    const Visuals = React.useMemo(() => {
        if (VISUAL_COMPONENTS[visualComponent]) {
            const compCode = VISUAL_COMPONENTS[visualComponent];
            // Wrap the string body in a function component
            try {
                const func = new Function('React', 'runtime', 'R3F', 'Drei', 'THREE', 'useState', 'useEffect', 'useRef', 'useMemo', `
                    return (props) => {
                        ${compCode}
                    }
                `);
                return func(React, runtime, R3F, Drei, THREE, React.useState, React.useEffect, React.useRef, React.useMemo);
            } catch (e) {
                console.error("Failed to compile Visual Component:", e);
                return () => <div className="text-red-500">Visual Error</div>;
            }
        }
        // Fallback or direct string code
        return () => <div className="text-gray-500">No Visuals</div>;
    }, [visualComponent]);

    useEffect(() => {
        if (!runtime.streamEngine) return;
        
        const deploy = async () => {
            // Reset engine
            runtime.streamEngine.stop();
            runtime.streamEngine.loadGraph({ id: 'protocol_graph', nodes: {}, edges: [] });
            
            for (const n of nodes) {
                // Create nodes using the runtime API tools
                if (n.type === 'Source' && n.id.startsWith('eeg_')) {
                     await runtime.tools.run('Create_EEG_Source', { nodeId: n.id, channel: n.config.channel, config: n.config });
                } else if (n.nodeType) {
                     await runtime.tools.run('Create_Standard_Node', { nodeId: n.id, nodeType: n.nodeType, inputs: n.inputs, config: n.config });
                } else if (n.id.startsWith('bind_')) {
                     await runtime.tools.run('Bind_To_Visuals', { nodeId: n.id, inputNodeId: n.inputs[0], parameter: n.config.parameter || n.parameter, property: n.config.property });
                } else {
                     // Custom or fallback
                     runtime.streamEngine.addNode(n);
                }
            }
            runtime.streamEngine.start();
        };
        
        deploy();
        
        const interval = setInterval(() => {
             if(runtime.streamEngine && runtime.streamEngine.getDebugState) {
                 setGraphNodes(runtime.streamEngine.getDebugState().nodes);
             }
        }, 200);
        
        return () => {
            clearInterval(interval);
            if (runtime.streamEngine) runtime.streamEngine.stop();
        };
    }, [nodes]); // Re-deploy if nodes definition changes

    if (!R3F || !Drei) return <div className="text-white p-4">Loading 3D...</div>;
    const { Canvas } = R3F;

    return (
        <div style={{width: '100%', height: '100%', position: 'relative', background: 'black'}}>
            {/* Debug Overlay */}
            <div style={{position:'absolute', inset:0, pointerEvents:'none', padding:'40px', paddingTop: '80px', zIndex:5, overflow: 'hidden'}}>
                <div style={{display:'flex', flexWrap:'wrap', gap:'10px', justifyContent: 'center', opacity: 0.5}}>
                    {graphNodes.map(n => (
                        <div key={n.id} style={{background:'rgba(0,0,0,0.7)', border:'1px solid #444', padding:'4px', borderRadius:'4px', fontSize:'8px', color: '#aaa'}}>
                            <b>{n.id}</b>: {typeof n.value === 'number' ? n.value.toFixed(2) : '...'}
                        </div>
                    ))}
                </div>
            </div>
            
            <Canvas camera={{ position: [0, 0, 10] }} gl={{ antialias: false }}>
                {/* @ts-ignore */}
                <color attach="background" args={['black']} />
                <Visuals />
            </Canvas>
        </div>
    );
};

export default UniversalGraphRenderer;
