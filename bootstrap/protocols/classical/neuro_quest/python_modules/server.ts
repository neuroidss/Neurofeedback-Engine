
export const NQ_SERVER_PY = `
# ==================================================================================
# 🚀 SERVER & ENTRY POINT
# ==================================================================================

engine = None
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def start_engine():
    global engine
    engine = NeuroEngine()
    log("Engine started. Waiting for session selection...", "SYS")
    threading.Thread(target=engine.render_loop, daemon=True).start()

@app.get("/video_feed")
def video_feed():
    def gen():
        header = b'--frame\\x0d\\x0aContent-Type: image/jpeg\\x0d\\x0a\\x0d\\x0a'
        footer = b'\\x0d\\x0a'
        while True:
            frame = stream_manager.get_frame()
            if frame: yield (header + frame + footer)
            time.sleep(0.05)
    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/sessions")
def list_sessions():
    return session_manager.list_sessions()

@app.post("/sessions/new")
async def new_session(request: Request):
    try:
        body = await request.json()
    except:
        body = {}
    
    lore = body.get("lore", None)
    
    sid = session_manager.create_session(lore=lore)
    if engine: engine.load_session(sid)
    return {"id": sid}

@app.post("/sessions/{session_id}/load")
def load_session_endpoint(session_id: str):
    if engine: engine.load_session(session_id)
    return {"status": "ok", "id": session_id}

@app.post("/action/save_and_quit")
def save_and_quit_endpoint():
    if engine: engine.save_and_quit()
    return {"status": "ok"}

@app.post("/action/toggle_hud")
def toggle_hud_endpoint():
    if engine:
        engine.show_hud = not engine.show_hud
        return {"status": "ok", "hud_visible": engine.show_hud}
    return {"status": "error", "message": "Engine not running"}

@app.post("/ingest/bio")
async def ingest_bio(request: Request):
    try:
        data = await request.json()
        if engine: engine.update_bio_metrics(data)
        return {"status": "ok"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.get("/presets/lore")
def get_lore_presets():
    return LORE_PRESETS

def run_server():
    port = int(os.environ.get("PORT", 8006))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")

if __name__ == "__main__":
    run_server()
`;
