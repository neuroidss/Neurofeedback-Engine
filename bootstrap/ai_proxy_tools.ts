
import type { ToolCreatorPayload } from '../types';

// --- AI PROXY SOURCE CODE (Python Version) ---
// Using Python/FastAPI is more stable for stream forwarding in this environment than Node http adapters.
const AI_PROXY_MCP_PY = `
import os
import sys
import requests
from fastapi import FastAPI, Request, Response
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

# Config
PORT = int(os.environ.get("PORT", 8000))
DEFAULT_TARGET = "%%TARGET_URL%%".rstrip('/')
READ_TIMEOUT = int(%%TIMEOUT%%)

@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[AI Bridge] 🔍 Verifying default target: {DEFAULT_TARGET}...", flush=True)
    print(f"[AI Bridge] ⏱️ Configured Timeout: {READ_TIMEOUT} seconds", flush=True)
    try:
        r = requests.get(DEFAULT_TARGET, timeout=2)
        print(f"[AI Bridge] ✅ Default Target is UP! ({r.status_code})", flush=True)
    except Exception as e:
        print(f"[AI Bridge] ⚠️ Default Target check failed: {e}", flush=True)
        if "127.0.0.1" in DEFAULT_TARGET:
            print(f"[AI Bridge] Tip: Ensure your AI server (Ollama/LM Studio) is running.", flush=True)
    yield
    print("[AI Bridge] Shutting down...", flush=True)

app = FastAPI(lifespan=lifespan)

# Permissive CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/mcp_health")
def health():
    return {"status": "ok", "default_target": DEFAULT_TARGET, "mode": "universal_bridge", "timeout": READ_TIMEOUT}

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy(request: Request, path: str):
    # Dynamic Target Selection via Header
    target_base = DEFAULT_TARGET
    override = request.headers.get("X-Target-Override")
    
    if override:
        # Security: Only allow local overrides
        if "localhost" in override or "127.0.0.1" in override or "0.0.0.0" in override:
            target_base = override.rstrip('/')
            print(f"[AI Bridge] 🔀 OVERRIDE: Routing to {target_base}/{path}", flush=True)
        else:
            print(f"[AI Bridge] ⛔ Blocked non-local override: {override}", flush=True)

    url = f"{target_base}/{path}"
    if request.query_params:
        url += f"?{request.query_params}"
    
    # Only log generic requests if not overriding (override already logged above)
    if not override:
        print(f"[AI Bridge] {request.method} {url}", flush=True)

    try:
        body = await request.body()
        
        # Prepare headers
        headers = dict(request.headers)
        
        # Clean headers to bypass CORS/Origin checks on the upstream AI server
        for h in ["host", "content-length", "connection", "origin", "referer", "sec-fetch-site", "sec-fetch-mode", "sec-fetch-dest", "x-target-override"]:
            headers.pop(h, None)
        
        # Stream request with timeout
        req = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=body,
            stream=True,
            timeout=READ_TIMEOUT # Use configured timeout
        )
        
        def iter_content():
            try:
                for chunk in req.iter_content(chunk_size=4096):
                    if chunk:
                        yield chunk
            except Exception as e:
                print(f"[AI Bridge] Stream Error: {e}", flush=True)

        return StreamingResponse(
            iter_content(),
            status_code=req.status_code,
            media_type=req.headers.get("Content-Type"),
            headers={"Access-Control-Allow-Origin": "*"}
        )

    except Exception as e:
        print(f"[AI Bridge] Error connecting to {url}: {e}", flush=True)
        return JSONResponse(status_code=502, content={"error": f"Bridge failed to reach {url}. Is the server running? Error: {str(e)}"})

if __name__ == "__main__":
    print(f"[AI Bridge] Starting Universal Bridge on port {PORT} -> Default: {DEFAULT_TARGET}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")
`;

const BOOTSTRAP_AI_PROXY: ToolCreatorPayload = {
    name: 'Bootstrap Universal AI Bridge',
    description: 'Deploys a specialized Python proxy that bridges the browser to ANY local AI API (Ollama, LM Studio, LocalAI). Solves Mixed Content issues.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To provide a unified gateway for local inference services.',
    parameters: [
        { name: 'targetUrl', type: 'string', description: 'The default local URL (e.g., http://127.0.0.1:11434).', required: false, defaultValue: 'http://127.0.0.1:11434' },
        { name: 'bridgeId', type: 'string', description: 'Unique ID for this bridge instance.', required: false, defaultValue: 'external_ai_bridge' },
        { name: 'forceRestart', type: 'boolean', description: 'Force restart the service.', required: false, defaultValue: false },
        { name: 'timeout', type: 'number', description: 'Read timeout in seconds.', required: false, defaultValue: 3600 }
    ],
    implementationCode: `
        const { targetUrl = 'http://127.0.0.1:11434', bridgeId = 'external_ai_bridge', forceRestart, timeout = 3600 } = args;
        
        if (!runtime.isServerConnected()) throw new Error("Server not connected.");

        const MCP_SCRIPT = 'ai_bridge.py'; 

        // 1. Prepare and Deploy Code (Inject Default Target and Timeout)
        let source = ${JSON.stringify(AI_PROXY_MCP_PY)};
        source = source.replace('%%TARGET_URL%%', targetUrl);
        source = source.replace('%%TIMEOUT%%', String(timeout));

        runtime.logEvent(\`[System] Configuring AI Bridge (\${bridgeId}) for default target: \${targetUrl} with timeout \${timeout}s...\`);
        await runtime.tools.run('Server File Writer', {
            filePath: MCP_SCRIPT,
            content: source,
            baseDir: 'scripts'
        });

        // 2. Restart if requested
        if (forceRestart) {
            try { 
                await runtime.tools.run('Stop Process', { processId: bridgeId }); 
                await new Promise(r => setTimeout(r, 1000));
            } catch(e) {}
        }

        // 3. Start Python Process
        // Use 'venv_vision' for 'requests' + 'fastapi'
        runtime.logEvent(\`[System] Spawning AI Bridge (\${bridgeId})...\`);
        await runtime.tools.run('Start Python Process', { 
            processId: bridgeId, 
            scriptPath: MCP_SCRIPT,
            venv: 'venv_vision'
        });

        const routedUrl = 'http://localhost:3001/mcp/' + bridgeId;
        
        // 4. Verify Liveness
        let attempts = 0;
        let success = false;
        
        while(attempts < 5 && !success) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const healthCheck = await fetch(routedUrl + '/mcp_health');
                if (healthCheck.ok) {
                    success = true;
                    runtime.logEvent(\`[System] ✅ AI Bridge verified alive at \${routedUrl}\`);
                }
            } catch(e) {}
            attempts++;
        }
        
        return { success: true, proxyUrl: routedUrl };
    `
};

export const AI_PROXY_TOOLS = [BOOTSTRAP_AI_PROXY];
