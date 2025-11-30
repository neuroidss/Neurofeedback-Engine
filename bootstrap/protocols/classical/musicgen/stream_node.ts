export const MUSICGEN_NODE_IMPL = `
    if (!state.init) {
        state.init = true;
        state.lastFeed = 0;
    }

    const serverUrl = config.serverUrl;
    if (!serverUrl) return { output: { status: 'no_server' } };

    // Feed Brain Data to Server (Matrix)
    let matrix = null;
    
    // Check inputs for matrix data
    for (const val of Object.values(inputs)) {
        if (typeof val === 'object' && val?.matrix) {
            matrix = val.matrix;
            break;
        }
        // Fallback for simple numeric input (simulated coherence)
        if (typeof val === 'number') {
            matrix = [val];
        }
    }
    
    const now = Date.now();
    // Throttle updates to ~10fps to save bandwidth
    if (matrix && (now - state.lastFeed > 100)) {
        state.lastFeed = now;
        fetch(serverUrl + '/feed_brain_data', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ matrix })
        }).catch(e => {
            // Silently fail on connection errors to avoid graph crash
        });
    }

    return { output: { active: true, server: serverUrl } };
`;