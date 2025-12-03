
export const NQ_WORLD_PY = `
# ==================================================================================
# 🗂️ SESSION MANAGER & WORLD LOGIC (CHAOTIC)
# ==================================================================================
class SessionManager:
    def __init__(self, root_dir="sessions"):
        self.root_dir = root_dir
        if not os.path.exists(root_dir): os.makedirs(root_dir)

    def list_sessions(self):
        sessions = []
        for f in os.listdir(self.root_dir):
            if f.endswith(".json"):
                try:
                    with open(os.path.join(self.root_dir, f), 'r') as fp:
                        data = json.load(fp)
                        sessions.append({
                            "id": f.replace(".json", ""),
                            "summary": data.get("summary", "Unknown State"),
                            "lore": data.get("lore", "Unknown"),
                            "last_updated": data.get("last_updated", 0)
                        })
                except: pass
        return sorted(sessions, key=lambda x: x["last_updated"], reverse=True)

    def create_session(self, lore=None):
        sess_id = f"session_{int(time.time())}"
        set_current_session(sess_id)
        final_lore = lore if lore else "A chaotic dreamscape where thoughts become matter."
        path = os.path.join(self.root_dir, f"{sess_id}.json")
        data = {
            "biomes": [],
            "history": [],
            "inventory": [],
            "summary": "The dreamer awakens.",
            "last_updated": time.time(),
            "lore": final_lore
        }
        with open(path, 'w') as f: json.dump(data, f, indent=2)
        return sess_id

session_manager = SessionManager()

class WorldDatabase:
    def __init__(self, db_path):
        self.db_path = db_path
        self.biomes = []
        self.history = []
        self.inventory = []
        self.summary = ""
        self.lore = "Unknown"
        self.load_db()
        
    def load_db(self):
        global ACTIVE_LORE
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f: 
                    data = json.load(f)
                    self.biomes = data.get('biomes', [])
                    self.history = data.get('history', [])
                    self.inventory = data.get('inventory', [])
                    self.summary = data.get('summary', "")
                    self.lore = data.get('lore', "Unknown")
                    ACTIVE_LORE = self.lore # CRITICAL: Update global context for LLM
            except: self.biomes = []
        if not self.biomes: 
            ACTIVE_LORE = self.lore
            self.bootstrap_world()
        
    def bootstrap_world(self):
        log(f"Dreaming up initial world...", "DB")
        prompt = f"Lore: '{self.lore}'. Generate a starting location description that is unstable and reactive. STRICTLY follow the Lore. Call update_biome."
        args = tool_agent.process("Demiurge", prompt, allowed_tools=['update_biome'])
        
        desc = args['description'] if (args and 'description' in args) else "A void waiting for a mind to shape it."
        self.create_biome(desc)
        
        quest_mgr = QuestManager(self)
        quest_mgr.generate_next_in_chain(desc, self.biomes[-1]['id'])
        self.save_db()
        
    def save_db(self):
        with open(self.db_path, 'w') as f: 
            json.dump({
                "biomes": self.biomes, 
                "history": self.history, 
                "inventory": self.inventory,
                "summary": self.summary,
                "lore": self.lore,
                "last_updated": time.time()
            }, f, indent=2)
            
    def update_summary(self):
        if not tool_agent.configured: return
        history_str = chr(10).join([f"- {h['text']}" for h in self.history[-5:]])
        prompt = f"LORE: {self.lore}{chr(10)}HISTORY:{chr(10)}{history_str}{chr(10)}TASK: One sentence abstract summary of the dream so far."
        args = tool_agent.process("Chronicler", prompt, allowed_tools=['update_summary'])
        if args and 'summary_text' in args:
            self.summary = args['summary_text']
            self.save_db()
            
    def create_biome(self, text_desc):
        new_id = f"biome_{len(self.biomes) + 1}_{int(time.time())}"
        new_biome = {"id": new_id, "description": text_desc, "level": 1, "quests": []}
        self.biomes.append(new_biome)
        self.save_db()
        return new_biome
        
    def get_biome_by_id(self, b_id):
        return next((b for b in self.biomes if b['id'] == b_id), None)
        
    def update_biome_desc(self, b_id, new_desc):
        b = self.get_biome_by_id(b_id)
        if b:
            b['description'] = new_desc
            self.save_db()
            
    def update_biome(self, biome_data):
        for i, b in enumerate(self.biomes):
            if b['id'] == biome_data['id']:
                self.biomes[i] = biome_data
                self.save_db(); return
                
    def add_quest(self, biome_id, text, reward=100, verification_logic="Dream Logic", concrete_solution="Unknown", manifestation_visuals="", id_override=None, image_path=None):
        biome = self.get_biome_by_id(biome_id)
        if biome:
            # Less strict deduplication for chaotic fun
            active_quests = [q for q in biome['quests'] if q['status'] == 'active']
            if len(active_quests) >= 3: return None

            quest_id = id_override if id_override else f"q_{int(time.time())}_{random.randint(0,100)}"

            new_q = {
                "id": quest_id, 
                "text": text, 
                "status": "active", 
                "reward": reward,
                "verification_logic": verification_logic,
                "concrete_solution": concrete_solution,
                "manifestation_visuals": manifestation_visuals,
                "relevance": 1.0,
                "progress_report": None,
                "image_path": image_path
            }
            biome['quests'].append(new_q)
            self.update_biome(biome)
            return new_q
        
    def update_quest_text(self, biome_id, quest_id, new_text):
        biome = self.get_biome_by_id(biome_id)
        if biome:
            for q in biome['quests']:
                if q['id'] == quest_id:
                    q['text'] = new_text
                    self.update_biome(biome)
                    return True
        return False

    def update_quest_progress(self, biome_id, quest_id, report):
        biome = self.get_biome_by_id(biome_id)
        if biome:
            for q in biome['quests']:
                if q['id'] == quest_id:
                    q['progress_report'] = report
                    self.update_biome(biome)
                    return True
        return False

    def rewrite_quest_data(self, biome_id, quest_id, new_text, new_solution, new_manifestation):
        biome = self.get_biome_by_id(biome_id)
        if biome:
            for q in biome['quests']:
                if q['id'] == quest_id:
                    q['text'] = new_text
                    q['concrete_solution'] = new_solution
                    q['manifestation_visuals'] = new_manifestation
                    q['progress_report'] = None # Clear old progress
                    self.update_biome(biome)
                    return True
        return False
        
    def add_item(self, name, desc):
        self.inventory.append({"name": name, "description": desc, "acquired_at": time.time()})
        self.save_db()
        
    def archive_quest(self, quest):
        self.history.append({"text": quest['text'], "completed_at": time.time(), "id": quest['id']})
        if len(self.history) % 3 == 0:
            threading.Thread(target=self.update_summary).start()
        self.save_db()

class QuestManager:
    def __init__(self, db: WorldDatabase):
        self.db = db
        self.engine = None
        
    def attach_engine(self, engine_ref):
        self.engine = engine_ref
        
    def update_relevance(self, current_context_text, biome_id):
        biome = self.db.get_biome_by_id(biome_id)
        if not biome: return
        context_tokens = set(re.findall(r'\\w+', current_context_text.lower()))
        for q in biome['quests']:
            if q['status'] != 'active': continue
            q_text = q['text'] + " " + q.get('verification_logic', '')
            q_tokens = set(re.findall(r'\\w+', q_text.lower()))
            q_tokens.discard('the'); q_tokens.discard('to')
            if not q_tokens: q['relevance'] = 0.5; continue
            matches = context_tokens.intersection(q_tokens)
            q['relevance'] = min(1.0, 0.3 + (len(matches) * 0.3))

    def get_active_quests(self, biome_id):
        biome = self.db.get_biome_by_id(biome_id)
        return [q for q in biome['quests'] if q['status'] == 'active'] if biome else []
    
    def _get_history_context(self):
        recent_history = self.db.history[-8:]
        history_txt = "History is hazy."
        if recent_history:
            history_txt = chr(10).join([f"- {h['text']}" for h in recent_history])
        inv_txt = "Nothing."
        if self.db.inventory:
            inv_txt = ", ".join([i['name'] for i in self.db.inventory])
        return f"DREAM HISTORY:{chr(10)}{history_txt}{chr(10)}HELD ITEMS: {inv_txt}"

    def evaluate_combat_action(self, scene_desc, action_desc, active_quests, biome_id, engine_ref=None, visual_context=None):
        quests_context = json.dumps([{
            "id": q['id'], 
            "objective": q['text'],
            "concrete_solution": q.get('concrete_solution', 'Unknown'),
            "manifestation_visuals": q.get('manifestation_visuals', '')
        } for q in active_quests]) if active_quests else "None"
        
        history_ctx = self._get_history_context()
        
        prompt_text = f"""
SCENE: {scene_desc}
PLAYER ACTION: {action_desc}
OBJECTIVES: {quests_context}
CONTEXT: {history_ctx}

DECISION LOGIC (DREAM LOGIC):
1. **SOLVABILITY CHECK**: Is the objective currently solvable in this SCENE? If not, and the player is trying, use 'rewrite_quest' to change the objective.
2. **CREATIVITY**: Reward unexpected cool actions.
3. **QUESTS**: 
   - If action matches 'concrete_solution', COMPLETE it.
   - If action is relevant but partial (e.g. killed 1 of 5, or found door but no key), use 'update_quest_progress' to update status.

TOOLS:
- 'grant_item' (Loot)
- 'complete_quest_action' (Success)
- 'update_quest_progress' (Partial Success/Feedback)
- 'rewrite_quest' (Fix broken/impossible quests)
- 'trigger_reality_break' (Surprise/Chaos)
- 'mutate_world' (Permanent change)
- 'configure_perception' (Update Sensors)
- 'update_soundtrack' (Music Change)
"""
        user_content = prompt_text
        if visual_context:
            user_content = visual_context + [{"type": "text", "text": prompt_text}]

        args = tool_agent.process("Demiurge (Judge)", user_content, allowed_tools=['complete_quest_action', 'update_quest_progress', 'rewrite_quest', 'grant_item', 'trigger_reality_break', 'mutate_world', 'configure_perception', 'update_soundtrack'])
        
        if args:
            if '_thought' in args: log(f"🧠 THOUGHT: {args['_thought']}", "AI")

            tool_name = args.get('_tool_name')
            
            if 'visual_targets' in args or tool_name == 'configure_perception':
                if sensor_cortex:
                    sensor_cortex.configure(visual_targets=args.get('visual_targets'), audio_targets=args.get('audio_targets'), sensitivity=args.get('sensitivity', 'medium'))
            
            if ('prompt' in args and engine_ref) or tool_name == 'update_soundtrack':
                if 'prompt' in args: engine_ref.trigger_music_update(args['prompt'])

            if 'effect_type' in args:
                log(f"🔮 REALITY BREAK: {args['narrative_reason']}", "CHAOS")
                if engine_ref and engine_ref.gm:
                    engine_ref.gm.trigger_fx(f"{args['effect_type']} distortion, {args['narrative_reason']}", 3.0)
                return "CHAOS"

            if 'item_name' in args:
                self.db.add_item(args['item_name'], args['visual_description'])
                return {"type": "ITEM_FOUND", "item": args}
            
            if 'quest_id' in args:
                if 'outcome_summary' in args:
                    self.complete_quest(biome_id, args['quest_id'], args.get('outcome_summary', 'Reality shifted.'))
                    return "COMPLETE"
                elif 'progress_report' in args:
                    self.db.update_quest_progress(biome_id, args['quest_id'], args['progress_report'])
                    log(f"📝 Progress: {args['progress_report']}", "GAME")
                    return "PROGRESS"
                elif 'new_solution' in args:
                    self.db.rewrite_quest_data(biome_id, args['quest_id'], args['new_text'], args['new_solution'], args['new_manifestation'])
                    log(f"✏️ Quest Rewritten: {args['new_text']}", "GM")
                    return "REWRITE"
                    
            if 'new_description' in args:
                self.db.update_biome_desc(biome_id, args['new_description'])
                return "MUTATION"
                
        return None

    def evaluate_visual_context(self, scene_desc, biome_id, bio_metrics=None, engine_ref=None, visual_context=None):
        active = self.get_active_quests(biome_id)
        
        if not active:
            log("🌌 No active quests observed. Auto-generating...", "GM")
            self.generate_next_in_chain(scene_desc, biome_id)
            active = self.get_active_quests(biome_id)
        
        quests_context = json.dumps([{"id": q['id'], "text": q['text'], "progress": q.get('progress_report')} for q in active]) if active else "None"
        
        bio_ctx = ""
        if bio_metrics:
            focus = bio_metrics.get('focus', 0.5)
            if focus < 0.3: bio_ctx = "PLAYER IS DREAMING (Low Focus). Allow surreal connections."
            else: bio_ctx = "PLAYER IS LUCID (High Focus). Require logic."
        
        prompt_text = f"""
SCENE: {scene_desc}
QUESTS: {quests_context}
{bio_ctx}

TASK: Observe the dream.
1. CHECK QUESTS (AGGRESSIVE):
   - Is the target objective visible? If yes, call 'complete_quest_action' immediately.
   - If partial, call 'update_quest_progress' (e.g. "I see the target, moving closer").
   - DO NOT wait for interaction if the quest is "Find" or "Look at".
2. Is the scene boring? Create a new weird quest.
3. Update sensors/music if needed.

TOOLS: 'complete_quest_action', 'update_quest_progress', 'create_quest', 'configure_perception', 'update_soundtrack'
"""
        user_content = prompt_text
        if visual_context:
            user_content = visual_context + [{"type": "text", "text": prompt_text}]

        args = tool_agent.process("Demiurge (Observer)", user_content, allowed_tools=['complete_quest_action', 'update_quest_progress', 'create_quest', 'configure_perception', 'update_soundtrack'])
        
        if args:
            if '_thought' in args: log(f"🧠 THOUGHT: {args['_thought']}", "AI")

            tool_name = args.get('_tool_name')
            
            if 'visual_targets' in args or tool_name == 'configure_perception':
                if sensor_cortex:
                    sensor_cortex.configure(visual_targets=args.get('visual_targets'), audio_targets=args.get('audio_targets'), sensitivity=args.get('sensitivity', 'medium'))
            
            if ('prompt' in args and engine_ref) or tool_name == 'update_soundtrack':
                if 'prompt' in args: engine_ref.trigger_music_update(args['prompt'])

            if 'quest_id' in args:
                if 'outcome_summary' in args:
                    self.complete_quest(biome_id, args['quest_id'], args['outcome_summary'])
                    return True
                elif 'progress_report' in args:
                    self.db.update_quest_progress(biome_id, args['quest_id'], args['progress_report'])
                    return True

            if 'text' in args:
                for q in active:
                    if "explore" in q['text'].lower(): self.complete_quest(biome_id, q['id'], f"Explored: {scene_desc[:20]}")
                self.db.add_quest(
                    biome_id, 
                    args['text'], 
                    args.get('reward', 50), 
                    args.get('verification_logic', 'Dream Logic'), 
                    args.get('concrete_solution', 'Interact with the object.'),
                    args.get('manifestation_visuals', 'The object glowing with completed purpose.')
                )
                return True
        return False

    def generate_next_in_chain(self, scene_desc, biome_id):
        # Check readiness to avoid useless threads
        if not self.engine or not self.engine.is_ready:
            log(f"⏳ Quest Generation Postponed: Neuro Engine Loading... ({int((self.engine.loading_progress if self.engine else 0)*100)}%)", "SYS")
            return None

        # SPAWN THREAD TO PREVENT MAIN LOOP HANG
        threading.Thread(target=self._bg_generate_quest, args=(scene_desc, biome_id), daemon=True).start()
        return True

    def _bg_generate_quest(self, scene_desc, biome_id):
        """
        Background Worker for Quest Generation.
        Handles both LLM generation AND Image Generation.
        """
        log("🧙‍♂️ Dreaming of a new quest...", "QUEST")
        
        history_ctx = self._get_history_context()
        prompt = f"""
VISUALS: {scene_desc}
MEMORY: {history_ctx}

TASK: Generate a Surreal Objective.
**VISUAL VALIDATION REQUIRED:**
Before defining the quest, you MUST visualize the \`concrete_solution\`.
1. What does the target object look like? (e.g., "A glowing crimson root pulsating on the floor").
2. Is this object drawable?
3. If yes, put that EXACT description into \`manifestation_visuals\`.
4. If no (it's abstract like 'The Truth'), REJECT IT and pick a physical object instead.

RULES:
- \`concrete_solution\` MUST be a physical noun (e.g. "Crystal", "Door", "Ghost").
- \`manifestation_visuals\` MUST be a visual prompt for the renderer (e.g. "glowing red crystal, cinematic lighting").
"""
        args = tool_agent.process("Quest Generator", prompt, allowed_tools=['create_quest'])
        if args and 'text' in args: 
            
            quest_id = f"q_{int(time.time())}_{random.randint(0,100)}"
            visuals = args.get('manifestation_visuals', args.get('concrete_solution', ''))
            
            # Append Biome description to ensure the quest object "fits" in the world
            full_visual_prompt = f"{visuals}, {scene_desc.split('.')[0]}"
            
            # REMOVED: Reality Bleed injection (forced overlay). We now rely on GM Arbitrariness.
            
            saved_fantasy_path = None
            log(f"🖼️ GENERATING QUEST VISUAL (BG): '{visuals}' for {quest_id}", "ART")
            
            # --- RETRY LOOP ---
            max_attempts = 2
            for attempt in range(max_attempts):
                if not self.engine or not CURRENT_SESSION_ID: break
                
                q_dir = f"sessions/{CURRENT_SESSION_ID}/quests/{quest_id}"
                try:
                    os.makedirs(q_dir, exist_ok=True)
                    fantasy_path = f"{q_dir}/fantasy_vision.jpg"
                    
                    # BLOCKING RENDER CALL (Thread safe via Engine lock)
                    self.engine.render_fantasy(full_visual_prompt, fantasy_path)
                    
                    if os.path.exists(fantasy_path):
                        saved_fantasy_path = fantasy_path
                        log(f"✅ IMAGE SECURED: {fantasy_path}", "ART")
                        break # Success
                    else:
                        log(f"⚠️ RENDER ATTEMPT {attempt+1} FAILED (File Missing).", "ART")
                        
                except Exception as e:
                    log(f"⚠️ RENDER CRASH ATTEMPT {attempt+1}: {e}", "ART")
                
                time.sleep(0.5)

            if not saved_fantasy_path:
                log(f"❌ ALL RENDER ATTEMPTS FAILED. ABORTING QUEST.", "ART")
                try: os.rmdir(q_dir)
                except: pass
                return

            self.db.add_quest(
                biome_id, 
                args['text'], 
                args.get('reward', 50), 
                args.get('verification_logic', 'Dream Logic'), 
                args.get('concrete_solution', 'Glowing Anomaly'), 
                args.get('manifestation_visuals', visuals),
                id_override=quest_id,
                image_path=saved_fantasy_path
            )

    def _ensure_quest_dir(self, quest_id):
        if not CURRENT_SESSION_ID: return None
        path = f"sessions/{CURRENT_SESSION_ID}/quests/{quest_id}"
        os.makedirs(path, exist_ok=True)
        return path

    def complete_quest(self, biome_id, quest_id, outcome):
        biome = self.db.get_biome_by_id(biome_id)
        for q in biome['quests']:
            if q['id'] == quest_id:
                q['status'] = 'completed'
                self.db.update_biome(biome)
                self.db.archive_quest(q)
                log(f"🏆 Quest Completed: {q['text']}", "QUEST")
                
                # --- REALITY CAPTURE ---
                # Save the moment of victory to compare with the fantasy
                if self.engine:
                    q_dir = self._ensure_quest_dir(quest_id)
                    if q_dir:
                        snap_path = f"{q_dir}/reality_outcome.jpg"
                        self.engine.snapshot_moment(snap_path)
                        log(f"📸 REALITY captured at: {snap_path}", "DEBUG")

                self.mutate_world_after_victory(biome_id, outcome)
                return True
        return False
        
    def mutate_world_after_victory(self, biome_id, outcome):
        current_desc = self.db.get_biome_by_id(biome_id)['description']
        prompt = f"WORLD: {current_desc}{chr(10)}EVENT: {outcome}{chr(10)}TASK: How does the dream shift? Warp reality. Call 'mutate_world'."
        args = tool_agent.process("World Shifter", prompt, allowed_tools=['mutate_world'])
        if args and 'new_description' in args:
            self.db.update_biome_desc(biome_id, args['new_description'])
            log(f"🌍 Reality Warped: {args['new_description']}", "WORLD")

class BiomeNavigator:
    def __init__(self, db: WorldDatabase):
        self.db = db
        if not self.db.biomes: self.db.create_biome("A loading void.")
        self.current_biome = self.db.biomes[-1]
        
    def travel(self, direction_desc):
        prompt = f"Action: {direction_desc}. Generate new surreal biome description based on current lore."
        args = tool_agent.process("Navigator", prompt, allowed_tools=['update_biome'])
        desc = args['description'] if args and 'description' in args else "A new dream layer."
        self.current_biome = self.db.create_biome(desc)
        QuestManager(self.db).generate_next_in_chain(desc, self.current_biome['id'])
        return self.current_biome
`;
