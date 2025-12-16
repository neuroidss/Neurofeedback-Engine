
import type { ToolCreatorPayload } from '../types';

// --- AI PROXY SOURCE CODE (Python Version) ---
// Using Python/FastAPI is more stable for stream forwarding in this environment than Node http adapters.
const AI_PROXY_MCP_PY = `
import os
import sys
import requests
from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Config
PORT = int(os.environ.get("PORT", 8000))
TARGET = "%%TARGET_URL%%".rstrip('/')

app = FastAPI()

# Permissive CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def check_upstream():
    print(f"[AI Proxy] 🔍 Verifying upstream target: {TARGET}...", flush=True)
    try:
        # 1. Try Target as configured
        r = requests.get(TARGET, timeout=3)
        print(f"[AI Proxy] ✅ Target is UP! ({r.status_code}) Body: {r.text[:50]}", flush=True)
    except Exception as e:
        print(f"[AI Proxy] ⚠️ Target check failed: {e}", flush=True)
        # 2. If localhost, try switching 127.0.0.1 <-> localhost as fallback hints
        if "127.0.0.1" in TARGET:
            print(f"[AI Proxy] Tip: If connection failed, ensure Ollama is bound to 127.0.0.1 or try using 'localhost'.", flush=True)

@app.get("/mcp_health")
def health():
    return {"status": "ok", "target": TARGET, "mode": "python_fastapi"}

@app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
async def proxy(request: Request, path: str):
    url = f"{TARGET}/{path}"
    if request.query_params:
        url += f"?{request.query_params}"
    
    print(f"[AI Proxy] {request.method} {url}", flush=True)

    try:
        body = await request.body()
        
        # Prepare headers
        headers = dict(request.headers)
        
        # CRITICAL: Clean headers to look like a local curl request
        # This bypasses Ollama's CORS/Origin checks which cause 403s
        headers.pop("host", None)
        headers.pop("content-length", None)
        headers.pop("connection", None)
        headers.pop("origin", None)
        headers.pop("referer", None)
        headers.pop("sec-fetch-site", None)
        headers.pop("sec-fetch-mode", None)
        headers.pop("sec-fetch-dest", None)
        
        # Stream request
        req = requests.request(
            method=request.method,
            url=url,
            headers=headers,
            data=body,
            stream=True
        )
        
        def iter_content():
            for chunk in req.iter_content(chunk_size=4096):
                if chunk:
                    yield chunk

        return StreamingResponse(
            iter_content(),
            status_code=req.status_code,
            media_type=req.headers.get("Content-Type"),
            headers={"Access-Control-Allow-Origin": "*"}
        )

    except Exception as e:
        print(f"[AI Proxy] Error: {e}", flush=True)
        return JSONResponse(status_code=502, content={"error": str(e)})

if __name__ == "__main__":
    print(f"[AI Proxy] Starting Python Proxy on port {PORT} -> {TARGET}", flush=True)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")
`;

const BOOTSTRAP_AI_PROXY: ToolCreatorPayload = {
    name: 'Bootstrap AI Proxy Service',
    description: 'Deploys a specialized Python proxy for OpenAI/Ollama APIs. This allows a secure HTTPS frontend to communicate with local HTTP AI servers via the Kernel.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To bypass Mixed Content errors when accessing local AI (Ollama/LM Studio) from an HTTPS browser session.',
    parameters: [
        { name: 'targetUrl', type: 'string', description: 'The local URL of the AI provider (e.g., http://127.0.0.1:11434).', required: false, defaultValue: 'http://127.0.0.1:11434' },
        { name: 'forceRestart', type: 'boolean', description: 'Force restart the service.', required: false, defaultValue: false }
    ],
    implementationCode: `
        const { targetUrl = 'http://127.0.0.1:11434', forceRestart } = args;
        
        if (!runtime.isServerConnected()) throw new Error("Server not connected.");

        const MCP_ID = 'ai_proxy_v1';
        const MCP_SCRIPT = 'ai_proxy.py'; // Python script

        // 1. Prepare and Deploy Code (Inject Target URL)
        let source = ${JSON.stringify(AI_PROXY_MCP_PY)};
        source = source.replace('%%TARGET_URL%%', targetUrl);

        runtime.logEvent(\`[System] Configuring AI Proxy (Python) for target: \${targetUrl}...\`);
        await runtime.tools.run('Server File Writer', {
            filePath: MCP_SCRIPT,
            content: source,
            baseDir: 'scripts'
        });

        // 2. Restart if requested or needed
        try { 
            await runtime.tools.run('Stop Process', { processId: MCP_ID }); 
            await new Promise(r => setTimeout(r, 1000));
        } catch(e) {}

        // 3. Start Python Process
        // IMPORTANT: Use 'venv_vision' because it guarantees 'requests' and 'fastapi' are installed.
        runtime.logEvent('[System] Spawning AI Proxy (Python)...');
        await runtime.tools.run('Start Python Process', { 
            processId: MCP_ID, 
            scriptPath: MCP_SCRIPT,
            venv: 'venv_vision'
        });

        // The Kernel maps specific MCP IDs to ports internally.
        const routedUrl = 'http://localhost:3001/mcp/' + MCP_ID;
        
        // 4. Verify Liveness (Retrying Self-Test)
        let attempts = 0;
        let success = false;
        
        runtime.logEvent('[System] Verifying Proxy Liveness...');
        
        while(attempts < 8 && !success) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const healthCheck = await fetch(routedUrl + '/mcp_health');
                if (healthCheck.ok) {
                    success = true;
                    runtime.logEvent('[System] ✅ AI Proxy verified alive.');
                }
            } catch(e) {
                // ignore and retry
            }
            attempts++;
        }
        
        if (!success) {
             runtime.logEvent('[System] ⚠️ AI Proxy started but health check timed out. It might still be booting.');
        }

        runtime.logEvent('[System] 💡 TIP: Set your Ollama Base URL in Settings to: ' + routedUrl);
        
        return { success: true, proxyUrl: routedUrl };
    `
};

export const AI_PROXY_TOOLS = [BOOTSTRAP_AI_PROXY];
