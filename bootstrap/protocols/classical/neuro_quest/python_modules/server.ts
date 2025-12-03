
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
    
    # TTS Disabled by user request
    # if not neural_voice.is_alive():
    #    neural_voice.start()
        
    log(f"Engine started (Version: {VERSION}). Waiting for session selection...", "SYS")
    threading.Thread(target=engine.render_loop, daemon=True).start()

@app.get("/")
def read_root():
    return {"status": f"Neuro World {VERSION} Online", "version": VERSION}

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

@app.post("/action/toggle_autopilot")
def toggle_autopilot_endpoint():
    if engine:
        if engine.ctrl.autopilot.active:
            engine.ctrl.autopilot.disengage()
            log("Autopilot Disengaged.", "SYS")
        else:
            engine.ctrl.autopilot.engage()
            log("Autopilot Engaged.", "SYS")
        return {"status": "ok", "autopilot": engine.ctrl.autopilot.active}
    return {"status": "error", "message": "Engine not running"}

@app.post("/action/speak")
async def action_speak(request: Request):
    # Stubbed endpoint
    return {"status": "disabled"}

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

# --- GAME STATE & IMAGINATION ENDPOINTS ---

@app.get("/session/state")
def get_session_state():
    if not engine or not engine.db: return {"status": "inactive"}
    
    biome = engine.nav.current_biome if engine.nav else {}
    quests = []
    
    # We iterate manually to check for file existence
    if biome:
        for q in biome.get('quests', []):
            if q['status'] == 'active':
                q_id = q['id']
                sess_id = engine.active_session_id
                img_path = f"sessions/{sess_id}/quests/{q_id}/fantasy_vision.jpg"
                has_img = os.path.exists(img_path)
                quests.append({
                    "id": q_id,
                    "text": q['text'],
                    "visual": q.get('manifestation_visuals', ''),
                    "has_image": has_img
                })
    
    return {
        "status": "active",
        "biome": biome.get("description", ""),
        "quests": quests,
        "session_id": engine.active_session_id
    }

@app.get("/sessions/{session_id}/quests/{quest_id}/image")
def get_quest_image(session_id: str, quest_id: str):
    path = f"sessions/{session_id}/quests/{quest_id}/fantasy_vision.jpg"
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse(status_code=404, content={"error": "Image not found"})

def run_server():
    port = int(os.environ.get("PORT", 8006))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")

if __name__ == "__main__":
    run_server()
`;
