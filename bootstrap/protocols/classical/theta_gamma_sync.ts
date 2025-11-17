// bootstrap/protocols/classical/theta_gamma_sync.ts
import type { ToolCreatorPayload } from '../../../types';

export const THETA_GAMMA_MEMORY_SYNC: ToolCreatorPayload = {
    name: 'Theta-Gamma Memory Sync',
    description: "Abstract: Theta-gamma phase-amplitude coupling (PAC) in the prefrontal cortex is a key mechanism for working memory. In this process, the phase of the slower theta rhythm (4-8 Hz) modulates the amplitude of the faster gamma rhythm (30-50 Hz). This protocol provides feedback on the strength of this coupling. The metric is `pac_strength`. The visualization should represent the theta rhythm as a slow, pulsating central orb, and the gamma rhythm as bright, brief sparks that appear in sync with the orb's pulse. The higher the `pac_strength`, the more sparks appear precisely at the peak of the orb's pulse.",
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To improve working memory by strengthening theta-gamma phase-amplitude coupling.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time EEG data with `pac_strength`.', required: true },
    ],
    dataRequirements: {
        type: 'eeg',
        channels: ['Fz'],
        metrics: ['pac_strength']
    },
    processingCode: `
(eegData, sampleRate) => {
    // Simulate Phase-Amplitude Coupling strength. A value from 0 (no coupling) to 1 (perfect coupling).
    const strength = Math.random();
    return { 
        pac_strength: strength
    };
}
    `,
    implementationCode: `
        const { useState, useEffect, useMemo, useRef } = React;

        const pacStrength = processedData?.pac_strength || 0;
        const [phase, setPhase] = useState(0);
        const [sparks, setSparks] = useState([]);
        const lastSpawnTimeRef = useRef(0);

        // Animation loop for theta phase and spark management
        useEffect(() => {
            let animationFrameId;
            const animate = (time) => {
                // Theta phase cycles roughly every 166ms (at 6 Hz)
                setPhase(prev => (prev + 0.04) % (2 * Math.PI));

                // Spark spawning logic
                const sineOfPhase = Math.sin(phase);
                // The peak of the theta pulse
                if (sineOfPhase > 0.9 && (time - lastSpawnTimeRef.current) > 100) { 
                    // Higher pacStrength = higher chance of spawning a spark IN SYNC
                    if (Math.random() < pacStrength) {
                        setSparks(currentSparks => [
                            ...currentSparks.slice(-50), // Keep the list from growing too large
                            { 
                                id: time,
                                angle: Math.random() * 2 * Math.PI,
                                distance: 40 + Math.random() * 60,
                                opacity: 1,
                                size: 2 + Math.random() * 3
                            }
                        ]);
                        lastSpawnTimeRef.current = time;
                    }
                }
                
                // CHAOTIC sparks (low pacStrength = more chaos)
                // This runs more frequently than the sync check
                 if ((time - lastSpawnTimeRef.current) > 50) {
                     if (Math.random() < (1 - pacStrength) * 0.2) { // more chaos when pacStrength is low
                        setSparks(currentSparks => [
                            ...currentSparks.slice(-50),
                            { 
                                id: time,
                                angle: Math.random() * 2 * Math.PI,
                                distance: 40 + Math.random() * 60,
                                opacity: 0.6, // chaotic sparks are dimmer
                                size: 1 + Math.random() * 2
                            }
                        ]);
                        lastSpawnTimeRef.current = time;
                     }
                 }
                
                // Update and fade out all sparks
                setSparks(currentSparks => 
                    currentSparks
                        .map(s => ({ ...s, opacity: s.opacity - 0.03 }))
                        .filter(s => s.opacity > 0)
                );

                animationFrameId = requestAnimationFrame(animate);
            };
            animationFrameId = requestAnimationFrame(animate);
            return () => cancelAnimationFrame(animationFrameId);
        }, [phase, pacStrength]);

        const orbSize = 50 + Math.sin(phase) * 20;
        const orbOpacity = 0.6 + Math.sin(phase) * 0.4;
        
        if (!processedData) {
            return <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center'}}><p>Waiting for EEG data...</p></div>;
        }

        return (
            <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <div style={{
                    width: orbSize, height: orbSize,
                    backgroundColor: 'cyan',
                    borderRadius: '50%',
                    opacity: orbOpacity,
                    transition: 'all 0.1s linear',
                    boxShadow: '0 0 30px cyan, 0 0 60px cyan'
                }} />
                {sparks.map(spark => (
                    <div key={spark.id} style={{
                        position: 'absolute',
                        left: '50%', top: '50%',
                        width: spark.size, height: spark.size,
                        backgroundColor: 'white',
                        borderRadius: '50%',
                        transform: 'translate(-50%, -50%) translate(' + (Math.cos(spark.angle) * spark.distance) + 'px, ' + (Math.sin(spark.angle) * spark.distance) + 'px)',
                        opacity: spark.opacity,
                        boxShadow: '0 0 10px white'
                    }} />
                ))}
            </div>
        );
    `
};