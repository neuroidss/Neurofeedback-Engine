

// bootstrap/protocols/classical/neural_synchrony.ts
import type { ToolCreatorPayload } from '../../../types';

export const NEURAL_SYNCHRONY_PROTOCOL: ToolCreatorPayload = {
    name: "Neural Synchrony",
    description: "Measures overall neural synchrony (ciPLV) across all available channels from the selected devices. It does not require specific 10-20 locations, making it ideal for flexible hardware setups like FreeEEG8. The visualization adapts to show local coherence (for a single device) or group synchrony (for multiple devices).",
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: "To provide a robust, single protocol for training either focused concentration (local coherence) or creative/problem-solving states (inter-hemispheric synchrony), adapting to the user's hardware setup automatically.",
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time data containing the coherence mode and value.', required: true },
        { name: 'runtime', type: 'object', description: 'The application runtime API.', required: false }
    ],
    dataRequirements: { 
        type: 'eeg',
        channels: [], 
        metrics: ['value', 'engine', 'deviceCount', 'matrix', 'debugLog'] 
    },
    processingCode: `
(runtime) => {
    // This is an async factory, so we return an object with an async update method.
    return {
        update: async (eegData, sampleRate) => {
            const channelNames = Object.keys(eegData);
            if (channelNames.length < 2) {
                return { 
                    value: 0, 
                    matrix: {}, 
                    engine: 'N/A', 
                    deviceCount: channelNames.length, 
                    debugLog: ['[DSP] Error: Not enough channels to process. Received ' + channelNames.length + ', need at least 2.'] 
                };
            }
            
            // Infer number of devices from channel name prefixes (e.g., 'simulator-1:Cz')
            const hasPrefixes = channelNames.some(ch => ch.includes(':'));
            const numDevices = hasPrefixes
                ? new Set(channelNames.map(ch => ch.split(':')[0])).size
                : 1;

            try {
                const result = await runtime.tools.run('Calculate_Coherence_Matrix_Optimized', {
                    eegData: eegData,
                    sampleRate: sampleRate,
                    freqRange: [8, 12] // Alpha band
                });

                if (result.success === false) { // Handle graceful failure from DSP tool
                    return { value: 0, matrix: {}, engine: 'Error', deviceCount: numDevices, debugLog: result.debugLog || ['DSP tool failed.'] };
                }
                
                return { 
                    value: result.avg_coherence, 
                    matrix: result.coherence_matrix,
                    engine: result.engine,
                    deviceCount: numDevices,
                    debugLog: result.debugLog
                };
            } catch (e) {
                return { value: 0, matrix: {}, engine: 'Error', deviceCount: numDevices, debugLog: [e.message] };
            }
        }
    };
}
    `,
    implementationCode: `
    const { useState, useMemo } = React;
    const { value, deviceCount, engine, matrix, debugLog } = processedData || {};
    const [isDebugVisible, setIsDebugVisible] = useState(false);
    const coherence = typeof value === 'number' ? value : 0;
    const isMultiDevice = deviceCount > 1;

    // --- NEW: Coherence Circle Visualization ---
    const CoherenceCircle = ({ matrix, isMultiDevice }) => {
        const size = 250;
        const radius = size / 2 - 20;
        
        if (!matrix || Object.keys(matrix).length === 0) {
            return (
                <div style={{
                    width: size, height: size, borderRadius: '50%', border: '1px dashed #444',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#666', fontSize: '12px'
                }}>
                    Calculating...
                </div>
            );
        }

        const allChannels = useMemo(() => {
            const channelSet = new Set();
            Object.keys(matrix).forEach(key => {
                // Robust parsing: Supports 'ch1__ch2' (standard) and 'ch1-ch2' (legacy/mock)
                let parts = key.split('__');
                if (parts.length < 2 && key.includes('-')) {
                     // Basic fallback for dash, but ignore if it looks like a UUID or Simulator ID
                     const dashParts = key.split('-');
                     // Heuristic: If exactly 2 parts, treat as pair. 
                     if (dashParts.length === 2) parts = dashParts;
                }
                
                const [ch1, ch2] = parts;
                if (ch1) channelSet.add(ch1);
                if (ch2) channelSet.add(ch2);
            });
            return Array.from(channelSet).sort();
        }, [matrix]);

        const channelPositions = useMemo(() => {
            const positions = {};
            const angleStep = (2 * Math.PI) / allChannels.length;
            allChannels.forEach((channel, i) => {
                positions[channel] = {
                    x: size / 2 + radius * Math.cos(angleStep * i - Math.PI / 2),
                    y: size / 2 + radius * Math.sin(angleStep * i - Math.PI / 2),
                };
            });
            return positions;
        }, [allChannels]);

        const connections = useMemo(() => {
            return Object.entries(matrix)
                .map(([key, value]) => {
                    if (value < 0.1) return null; // Threshold
                    
                    // Re-apply robust parsing to match the channel extraction logic
                    let parts = key.split('__');
                    if (parts.length < 2 && key.includes('-')) {
                         const dashParts = key.split('-');
                         if (dashParts.length === 2) parts = dashParts;
                    }
                    const [ch1, ch2] = parts;

                    if (!channelPositions[ch1] || !channelPositions[ch2]) return null;
                    return {
                        p1: channelPositions[ch1],
                        p2: channelPositions[ch2],
                        value
                    };
                })
                .filter(Boolean);
        }, [matrix, channelPositions]);

        const getLineColor = (value) => {
            const hue = 20 + value * 40; // orange to yellow
            const lightness = 50 + value * 20;
            return \`hsl(\${hue}, 100%, \${lightness}%)\`;
        };
        
        const getLabel = (channel) => {
             // Parse format "DeviceID:ChannelName" or simple "ChannelName"
             const parts = channel.split(':');
             if (parts.length < 2) return channel; // Local single device case
             
             const devId = parts[0];
             const chName = parts[1];
             
             // Shorten ID for display: "simulator-free8-1" -> "Sim1"
             let shortId = devId;
             const simMatch = devId.match(/simulator.*-(\d+)$/);
             if (simMatch) shortId = 'S' + simMatch[1];
             else if (devId.toLowerCase().includes('freeeeg')) shortId = 'H' + devId.slice(-1);
             else shortId = devId.substring(0,3);
             
             return shortId + ':' + chName;
        };

        return (
            <svg width={size} height={size} viewBox={\`0 0 \${size} \${size}\`}>
                {/* Connections */}
                {connections.map((conn, i) => (
                    <line
                        key={i}
                        x1={conn.p1.x} y1={conn.p1.y}
                        x2={conn.p2.x} y2={conn.p2.y}
                        stroke={getLineColor(conn.value)}
                        strokeWidth={0.5 + conn.value * 2}
                        strokeOpacity={0.4 + conn.value * 0.6}
                    />
                ))}
                {/* Nodes */}
                {allChannels.map(channel => {
                    const pos = channelPositions[channel];
                    return (
                        <g key={channel}>
                            <circle cx={pos.x} cy={pos.y} r="8" fill="#0D9488" stroke="#14b8a6" strokeWidth="1" />
                            <text x={pos.x} y={pos.y} dy="3" textAnchor="middle" fontSize="7" fill="white" fontWeight="bold">
                                {getLabel(channel)}
                            </text>
                        </g>
                    );
                })}
            </svg>
        );
    };

    const containerStyle = {
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        position: 'relative',
        backgroundColor: '#0a0a10',
        fontFamily: 'sans-serif',
        color: 'white',
        overflow: 'hidden'
    };

    if (!processedData) {
        return <div style={containerStyle}>Waiting for EEG data...</div>;
    }

    const title = isMultiDevice ? 'Group Synchrony (' + deviceCount + ')' : 'Local Coherence';
    
    return (
        <div style={containerStyle}>
            <div style={{ zIndex: 10, textAlign: 'center', position: 'absolute', top: '20px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', textShadow: '0 0 5px #000' }}>
                    {title}
                </h2>
            </div>

            <CoherenceCircle matrix={matrix} isMultiDevice={isMultiDevice} />
            
            <div style={{ zIndex: 10, textAlign: 'center', position: 'absolute', bottom: '20px' }}>
                <p style={{ fontSize: '1rem', color: '#aaa' }}>Average Coherence</p>
                <p style={{ fontSize: '2.5rem', fontWeight: '200', margin: '5px 0', textShadow: '0 0 10px #000' }}>
                    { (coherence * 100).toFixed(1) }%
                </p>
            </div>
            
            {isDebugVisible && (
                <div style={{
                    position: 'absolute', bottom: 30, left: 10, right: 10, zIndex: 20,
                    maxHeight: '35%', overflowY: 'auto',
                    background: 'rgba(0,0,0,0.6)',
                    padding: '5px', borderRadius: '4px',
                    fontSize: '9px', fontFamily: 'monospace', color: '#999',
                    border: '1px solid #333'
                }}>
                    <p style={{margin: 0, paddingBottom: '3px', borderBottom: '1px solid #444', color: '#ccc'}}>DSP Debug Log</p>
                    {(debugLog || ['No log data.']).map((line, i) => <p key={i} style={{margin: 0, whiteSpace: 'pre-wrap'}}>{line}</p>)}
                </div>
            )}
            
            <div style={{ position: 'absolute', bottom: 10, right: 10, fontSize: '10px', color: '#666', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>DSP Engine: {engine}</span>
                 <button 
                    onClick={() => setIsDebugVisible(!isDebugVisible)}
                    style={{
                        background: 'rgba(100,100,100,0.2)',
                        border: '1px solid #555',
                        color: '#aaa',
                        padding: '2px 6px',
                        borderRadius: '3px',
                        cursor: 'pointer'
                    }}
                >
                    {isDebugVisible ? 'Hide Debug' : 'Show Debug'}
                </button>
            </div>
        </div>
    );
    `
};