
export const NQ_SERVER_PY = `
# ==================================================================================
# 🚀 SERVER & ENTRY POINT (STABLE)
# ==================================================================================

engine = None
app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

def sanitize_for_json(obj):
    """
    Recursively converts NumPy arrays and other non-JSON types to standard Python types.
    Prevents 'TypeError: cannot convert dictionary update sequence element' in FastAPI.
    """
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [sanitize_for_json(v) for v in obj]
    elif isinstance(obj, tuple):
        return tuple(sanitize_for_json(v) for v in obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, (np.float32, np.float64)):
        return float(obj)
    elif isinstance(obj, (np.int32, np.int64)):
        return int(obj)
    elif hasattr(obj, '__dict__'):
        return sanitize_for_json(obj.__dict__)
    else:
        return obj

@app.on_event("startup")
def start_engine():
    global engine
    try:
        engine = NeuroEngine()
        log(f"Engine started (Version: {VERSION}). Waiting for session selection...", "SYS")
        threading.Thread(target=engine.render_loop, daemon=True).start()
    except Exception as e:
        log_exception(e)
        sys.exit(1)

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

@app.get("/session/asset/{subpath:path}")
def get_asset(subpath: str):
    if ".." in subpath: return JSONResponse(status_code=403, content={"error": "Invalid path"})
    clean_subpath = subpath
    if clean_subpath.startswith("assets/"): clean_subpath = clean_subpath[7:]
    
    # Use centralized SESSIONS_DIR
    root = globals().get("SESSIONS_DIR", "sessions")
    possible_paths = []
    
    possible_paths.append(subpath)
    if CURRENT_SESSION_ID:
        possible_paths.append(os.path.join(root, CURRENT_SESSION_ID, "assets", clean_subpath))
        possible_paths.append(os.path.join(root, CURRENT_SESSION_ID, "assets", os.path.basename(subpath)))
    
    possible_paths.append(os.path.join("assets", clean_subpath))
    possible_paths.append(os.path.join("assets", subpath))
    
    for path in possible_paths:
        if os.path.exists(path) and os.path.isfile(path):
            return FileResponse(path)
        
    return JSONResponse(status_code=404, content={"error": f"Asset not found: {subpath}"})

@app.get("/sessions")
def list_sessions():
    return session_manager.list_sessions()

@app.post("/sessions/new")
async def new_session(request: Request):
    try: body = await request.json()
    except: body = {}
    sid = session_manager.create_session(lore_key=body.get("lore"), genome=body.get("genome"))
    if engine: 
        engine.load_session(sid)
        engine.set_autopilot(body.get("autopilot", True))
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
        current_state = engine.gamepad.autopilot_enabled
        if current_state:
            engine.set_autopilot(False)
            log("Autopilot Disengaged (Manual Override).", "SYS")
        else:
            engine.set_autopilot(True)
            log("Autopilot Engaged (Manual Override).", "SYS")
        return {"status": "ok", "autopilot": engine.gamepad.autopilot_enabled}
    return {"status": "error", "message": "Engine not running"}

@app.post("/action/trigger_event")
def trigger_event_endpoint():
    """Manual Trigger for Battle or Next Phase."""
    if engine:
        if engine.physics.game_logic:
            # Force a tick even if timer isn't ready
            engine.physics.game_logic.process_turn(0.5, 5.0) 
        return {"status": "ok"}
    return {"status": "error", "message": "Engine not ready"}

@app.post("/action/end_turn")
def action_end_turn():
    """Manually End Strategy Turn."""
    if not engine or not engine.physics.game_logic:
        return {"status": "error", "message": "Game not loaded"}
    
    result = engine.physics.game_logic.end_turn()
    if result:
        narrative, visual = result
        engine.physics.current_visual_prompt = visual
        engine.physics.is_new_scene = True
        return {"status": "ok", "message": narrative}
    else:
        return {"status": "failed", "message": "Cannot end turn now"}

@app.post("/action/battle")
async def action_battle(request: Request):
    """Manually Start Battle."""
    if not engine or not engine.physics.game_logic:
        return {"status": "error", "message": "Game not loaded"}
    try:
        body = await request.json()
        target_id = body.get('target_id')
        result = engine.physics.game_logic.trigger_battle(target_id)
        if result:
            narrative, visual = result
            engine.physics.current_visual_prompt = visual
            engine.physics.is_new_scene = True
            return {"status": "ok", "message": narrative}
        return {"status": "failed", "message": "Battle failed to start (Check AP)"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/action/social")
async def action_social(request: Request):
    """Trigger a social event (Strategy Phase only)."""
    if not engine or not engine.physics.game_logic: 
        return {"status": "error", "message": "Game not loaded"}
    
    try:
        body = await request.json()
        card_uid = body.get('card_uid')
        action_id = body.get('action_id')
        
        result = engine.physics.game_logic.trigger_social(card_uid, action_id)
        if result:
            narrative, visual = result
            engine.physics.current_visual_prompt = visual
            engine.physics.is_new_scene = True
            return {"status": "ok", "message": narrative}
        else:
            return {"status": "failed", "message": "Not enough AP or invalid state"}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/action/farm")
def action_farm():
    """Trigger resource farming."""
    if not engine or not engine.physics.game_logic:
        return {"status": "error", "message": "Game not loaded"}
    
    result = engine.physics.game_logic.trigger_farm()
    if result:
        narrative, visual = result
        engine.physics.current_visual_prompt = visual
        engine.physics.is_new_scene = True
        return {"status": "ok", "message": narrative}
    else:
        return {"status": "failed", "message": "Not enough AP or invalid state"}

@app.post("/action/buy_perk")
async def action_buy_perk(request: Request):
    """Spend CP to buy perks."""
    if not engine or not engine.physics.game_logic: return {"status": "error"}
    try:
        body = await request.json()
        perk_id = body.get('perk_id')
        success = engine.physics.game_logic.buy_perk(perk_id)
        return {"status": "ok", "success": success}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/action/restart_run")
def action_restart_run():
    """Restart the run (preserving perks)."""
    if not engine or not engine.physics.game_logic: return {"status": "error"}
    
    # Re-init game loop using the existing config but keeping meta-data
    current_config = engine.physics.game_logic.config
    engine.physics.game_logic.init_run(current_config)
    engine.physics.is_new_scene = True
    engine.physics.current_visual_prompt = current_config.get("start_prompt", "Restarting...")
    
    return {"status": "ok", "message": "Run restarted."}

@app.post("/action/link_music")
async def link_music_endpoint(request: Request):
    if engine:
        try:
            body = await request.json()
            target_port = body.get("port")
            if target_port:
                engine.music.set_config(target_port)
                engine.music.set_active(True)
            else:
                new_state = not engine.music.active
                engine.music.set_active(new_state)
            return {"status": "ok", "music_active": engine.music.active}
        except: 
            return {"status": "error", "message": "Invalid JSON"}
    return {"status": "error", "message": "Engine not running"}

@app.post("/ingest/bio")
async def ingest_bio(request: Request):
    try:
        data = await request.json()
        if engine: engine.update_bio_metrics(data)
        return {"status": "ok"}
    except Exception as e: return {"status": "error", "message": str(e)}

@app.get("/presets/lore")
def get_lore_presets():
    return LORE_PRESETS

@app.get("/session/state")
def get_session_state():
    if not engine or not engine.db: return {"status": "inactive"}
    
    narrative_item = None
    if engine.gm:
        narrative_item = engine.gm.pop_latest_narrative()

    game_stats = getattr(engine, 'latest_game_stats', {})
    
    # Enrich stats with Phase info if available in game logic directly
    if engine.physics.game_logic:
        game_stats['phase'] = engine.physics.game_logic.current_phase
        game_stats['social_interactions'] = engine.physics.game_logic.social_interactions
        game_stats['game_over'] = engine.physics.game_logic.game_over
        # Sanitize sets/arrays to basic types
        game_stats['perks'] = list(engine.physics.game_logic.active_perks)
        game_stats['meta_perks_pool'] = engine.physics.game_logic.config.get("meta_perks", [])

    actor_image_url = None
    if engine.physics.game_logic and engine.physics.game_logic.current_subject_id:
        subject_id = engine.physics.game_logic.current_subject_id
        raw_path = engine.physics.get_active_asset_path()
        if not raw_path:
             root = globals().get("SESSIONS_DIR", "sessions")
             safe_id = "".join([c for c in subject_id if c.isalnum() or c in ('_')]).strip()
             raw_path = os.path.join(root, engine.active_session_id, "assets", f"{safe_id}.png")
        actor_image_url = f"/session/asset/{raw_path}"
    
    # CRITICAL: Sanitize entire payload to remove NumPy arrays before JSON serialization
    safe_game_stats = sanitize_for_json(game_stats)

    return {
        "status": "active",
        "session_id": engine.active_session_id,
        "latest_narrative": narrative_item, 
        "music_active": engine.music.active if engine.music else False,
        "game_stats": safe_game_stats, 
        "current_actor_image": actor_image_url,
        "autopilot": engine.gamepad.autopilot_enabled if engine.gamepad else True
    }

def run_server():
    try:
        port = int(os.environ.get("PORT", 8006))
        print(f"[NeuroGen] Server starting on port {port}", flush=True)
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="error")
    except Exception as e:
        log_exception(e)

if __name__ == "__main__":
    run_server()
`;
