
export const NQ_WORLD_PY = `
# ==================================================================================
# 🗂️ SESSION MANAGER & WORLD LOGIC
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
        final_lore = lore if lore else "A mysterious unknown world."
        path = os.path.join(self.root_dir, f"{sess_id}.json")
        data = {
            "biomes": [],
            "history": [],
            "inventory": [],
            "summary": "A fresh timeline begins.",
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
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f: 
                    data = json.load(f)
                    self.biomes = data.get('biomes', [])
                    self.history = data.get('history', [])
                    self.inventory = data.get('inventory', [])
                    self.summary = data.get('summary', "")
                    self.lore = data.get('lore', "Unknown")
            except: self.biomes = []
        if not self.biomes: self.bootstrap_world()
        
    def bootstrap_world(self):
        log(f"Bootstrapping World with Lore: '{self.lore}'", "DB")
        prompt = f"Lore: '{self.lore}'. Call update_biome(description=...) to create the starting location."
        args = tool_agent.process("World Architect", prompt, allowed_tools=['update_biome'])
        
        desc = None
        if args and 'description' in args:
            desc = args['description']
        else:
            log("❌ LLM Generation Failed or Parse Error. Using Fallback Biome.", "WARN")
            desc = "A strange mist surrounds you. The world is waiting to be shaped."
            
        self.create_biome(desc)
        
        # Initial Quest Generation
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
        active_quests = [q for b in self.biomes for q in b['quests'] if q['status'] == 'active']
        current_quest = active_quests[-1]['text'] if active_quests else "No active quest"
        prompt = f"LORE: {self.lore}{chr(10)}CURRENT QUEST: {current_quest}{chr(10)}RECENT HISTORY:{chr(10)}{history_str}{chr(10)}TASK: Write a 1-sentence summary of the current story state."
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
                
    def add_quest(self, biome_id, text, reward=100, verification_logic="Standard Interaction"):
        biome = self.get_biome_by_id(biome_id)
        if biome:
            # --- DEDUPLICATION & LIMIT LOGIC ---
            active_quests = [q for q in biome['quests'] if q['status'] == 'active']
            
            # 1. Hard Limit
            if len(active_quests) >= 3:
                log(f"Quest cap reached (3). Skipping new quest: {text[:20]}...", "GAME")
                return None

            # 2. Semantic/Fuzzy Deduplication
            # Tokenize new text
            new_tokens = set(re.findall(r'\\w+', text.lower()))
            new_tokens.discard('the'); new_tokens.discard('a'); new_tokens.discard('to'); new_tokens.discard('inspect'); new_tokens.discard('interact')
            
            for q in active_quests:
                # Exact match check
                if q['text'] == text: return q
                
                # Fuzzy Token Overlap check
                existing_tokens = set(re.findall(r'\\w+', q['text'].lower()))
                if not new_tokens or not existing_tokens: continue
                
                overlap = len(new_tokens.intersection(existing_tokens))
                similarity = overlap / min(len(new_tokens), len(existing_tokens))
                
                # If > 60% keywords overlap, reject
                if similarity > 0.6:
                    log(f"Duplicate detected ({int(similarity*100)}%). Skipping '{text}' vs '{q['text']}'", "GAME")
                    return q

            new_q = {
                "id": f"q_{int(time.time())}_{random.randint(0,100)}", 
                "text": text, 
                "status": "active", 
                "reward": reward,
                "verification_logic": verification_logic,
                "relevance": 1.0 
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
        
    def update_relevance(self, current_context_text, biome_id):
        """
        Calculates a simple RAG-Index (Keyword Overlap) for active quests against the current scene.
        This runs fast on every frame or throttle to sort the HUD.
        """
        biome = self.db.get_biome_by_id(biome_id)
        if not biome: return
        
        context_tokens = set(re.findall(r'\\w+', current_context_text.lower()))
        
        for q in biome['quests']:
            if q['status'] != 'active': continue
            
            # Extract significant words from quest text and logic
            q_text = q['text'] + " " + q.get('verification_logic', '')
            q_tokens = set(re.findall(r'\\w+', q_text.lower()))
            q_tokens.discard('the'); q_tokens.discard('and'); q_tokens.discard('to'); q_tokens.discard('a')
            
            if not q_tokens: 
                q['relevance'] = 0.1
                continue

            # Calculate overlap overlap
            matches = context_tokens.intersection(q_tokens)
            
            # Base relevance + boost for matches
            # 0.2 Base visibility
            # +0.2 per keyword match
            score = 0.2 + (len(matches) * 0.2)
            
            q['relevance'] = min(1.0, score)

    def get_active_quests(self, biome_id):
        biome = self.db.get_biome_by_id(biome_id)
        return [q for q in biome['quests'] if q['status'] == 'active'] if biome else []
    
    def _get_history_context(self):
        recent_history = self.db.history[-8:]
        history_txt = "No major events yet."
        if recent_history:
            history_txt = chr(10).join([f"- Completed: {h['text']}" for h in recent_history])
            
        inv_txt = "Empty."
        if self.db.inventory:
            inv_txt = ", ".join([i['name'] for i in self.db.inventory])
            
        return f"HISTORY:{chr(10)}{history_txt}{chr(10)}INVENTORY: {inv_txt}"

    def evaluate_combat_action(self, scene_desc, action_desc, active_quests, biome_id):
        # Include the HIDDEN verification logic in the prompt for the Judge
        quests_context = json.dumps([{
            "id": q['id'], 
            "hypothesis": q['text'], 
            "verification_metrics": q.get('verification_logic', 'None')
        } for q in active_quests]) if active_quests else "None"
        
        history_ctx = self._get_history_context()
        
        prompt = f"""
SCENE: {scene_desc}
PLAYER ACTION: {action_desc}
ACTIVE HYPOTHESES (QUESTS): {quests_context}
WORLD CONTEXT (RAG): 
{history_ctx}

DECISION LOGIC (SCIENTIFIC PEER REVIEW):
1. **Hypothesis Verification:** Compare the Player Action against the 'verification_metrics' of active quests. 
   - Does the action satisfy the *intent* of the metric?
   - **VALID ACTIONS**: ATTACK (Physical), INTERACT (Use), SKILL (Elemental Skill), ULTIMATE (Elemental Burst).
   - **CRITICAL**: If the player performs the required action (e.g. INTERACT) on the correct object/scene, you MUST verify the hypothesis.
   - Do NOT just update progress if the logic is satisfied. CALL 'complete_quest_action'.
   - Allow for "Scientific Serendipity" (Creative/Unexpected solutions that prove the hypothesis).

TOOLS:
- Found Item? -> 'grant_item'
- Hypothesis Proven? -> 'complete_quest_action' (PRIORITY)
- Just Progress? -> 'update_quest_progress'
"""
        args = tool_agent.process("Action Judge", prompt, allowed_tools=['complete_quest_action', 'update_quest_progress', 'grant_item'])
        if args:
            if 'item_name' in args:
                self.db.add_item(args['item_name'], args['visual_description'])
                return {"type": "ITEM_FOUND", "item": args}
            
            if 'quest_id' in args:
                if 'outcome_summary' in args:
                    # Completion takes precedence
                    self.complete_quest(biome_id, args['quest_id'], args.get('outcome_summary', 'Quest complete.'))
                    return "COMPLETE"
                elif 'new_description' in args:
                    self.db.update_quest_text(biome_id, args['quest_id'], args['new_description'])
                    return "PROGRESS"
        return None

    def evaluate_visual_context(self, scene_desc, biome_id, bio_metrics=None):
        """
        AI-Driven Passive Evaluation with Bio-Feedback.
        """
        active = self.get_active_quests(biome_id)
        
        # Expose the hidden logic to the judge
        quests_context = json.dumps([{
            "id": q['id'], 
            "hypothesis": q['text'], 
            "verification_metrics": q.get('verification_logic', 'None')
        } for q in active]) if active else "None"
        
        history_ctx = self._get_history_context()
        
        bio_ctx = ""
        if bio_metrics:
            focus = bio_metrics.get('focus', 0.5)
            if focus > 0.7:
                bio_ctx = "PLAYER STATE: HIGH LUCIDITY (Clear, Rational, Investigative). Prefer logical/observation quests."
            elif focus < 0.3:
                bio_ctx = "PLAYER STATE: DREAMING/CHAOTIC. Prefer surreal, abstract, or emotional quests."
        
        prompt = f"""
CURRENT SCENE: {scene_desc}
ACTIVE HYPOTHESES (QUESTS): {quests_context}
{bio_ctx}
WORLD LORE/HISTORY: 
{history_ctx}

TASK: Be the Peer Reviewer. Evaluate the visual context.
1. **CHECK PROGRESS**: Does the scene prove a hypothesis? 
   - Compare the visual evidence against the 'verification_metrics'.
   - If the scene matches the criteria (in essence/meaning), the quest is COMPLETE.
   
2. **NEW HYPOTHESIS**: If no relevant quests exist, generate one based on the scene.
   - If the scene is calm/scenic, suggest "Inspect the [Aspect]".
   - If the scene has distinct objects, suggest "Interact with [Object]".
   - **DO NOT** suggest 'Meditate' or 'Scan' as commands. The player can only 'INTERACT' or 'ATTACK'.
   - **DEDUPLICATION**: If a quest for this object already exists, DO NOT create another one.
   
TOOLS:
- 'complete_quest_action(quest_id, outcome_summary)' -> To finish a quest.
- 'create_quest(text, reward, verification_logic)' -> To start a new one.
"""
        # Call LLM
        args = tool_agent.process("Quest Judge", prompt, allowed_tools=['complete_quest_action', 'create_quest'])
        
        if args:
            if 'quest_id' in args and 'outcome_summary' in args:
                # Completion
                log(f"👀 Visual Context Triggered Completion: {args['quest_id']}", "GAME")
                self.complete_quest(biome_id, args['quest_id'], args['outcome_summary'])
                return True
                
            if 'text' in args:
                # New Quest Creation
                # First, check if we should auto-complete any generic "Explore" quests to make room
                for q in active:
                    if "explore" in q['text'].lower() or "look around" in q['text'].lower():
                        self.complete_quest(biome_id, q['id'], f"Explored: {scene_desc[:20]}...")
                
                # Pass the generated logic
                verification = args.get('verification_logic', 'Standard interaction.')
                added = self.db.add_quest(biome_id, args['text'], args.get('reward', 50), verification)
                if added:
                     log(f"📜 Visuals Inspired New Quest: {args['text']}", "GAME")
                     return True
                
        return False

    def generate_next_in_chain(self, scene_desc, biome_id):
        """
        Generates a quest when a new biome is entered or explore is finished.
        """
        history_ctx = self._get_history_context()
        
        prompt = f"""
CURRENT VISUALS: {scene_desc}
WORLD MEMORY (RAG):
{history_ctx}

TASK: Generate a Scientific Hypothesis (Quest) based on the Visuals and History.
1. **Hypothesis (Quest Text):** Actionable instruction (e.g., "Inspect the glowing moss").
2. **Verification Logic (Hidden Criteria):** EXACT conditions required to falsify/verify this hypothesis.
   
   **VALID PLAYER ACTIONS (STRICT):**
   - **ATTACK**: Physical strike.
   - **INTERACT**: Use/Examine object.
   - **SKILL**: Small Elemental Magic.
   - **ULTIMATE**: Large Elemental Magic.
   - **ELEMENTS**: FIRE, WATER, LIGHTNING, WIND.

   **LOGIC EXAMPLES:**
   - BAD: "Player uses SCAN." (Not an action).
   - BAD: "Player uses MEDITATE." (Not an action).
   - GOOD: "Player uses 'INTERACT' on the moss."
   - GOOD: "Player uses 'SKILL' with 'FIRE' element to light the torch."
   - GOOD: "Player uses 'ULTIMATE' with 'WIND' to clear the fog."
   - GOOD: "Player uses 'ATTACK' to break the wall."

- AVOID: "Explore surroundings". (Too abstract).
- PREFER: "Inspect the [Noun]", "Find the [Item]", "Speak to [Entity]".
- If an item was just found, the quest should be to USE it.
"""
        args = tool_agent.process("Quest Generator", prompt, allowed_tools=['create_quest'])
        if args and 'text' in args: 
            verification = args.get('verification_logic', 'Standard interaction.')
            added = self.db.add_quest(biome_id, args['text'], args.get('reward', 50), verification)
            if added:
                 log(f"📜 New Quest Generated: {args['text']}", "GAME")
                 return added
        
        return None

    def complete_quest(self, biome_id, quest_id, outcome):
        biome = self.db.get_biome_by_id(biome_id)
        for q in biome['quests']:
            if q['id'] == quest_id:
                q['status'] = 'completed'
                self.db.update_biome(biome)
                self.db.archive_quest(q)
                log(f"🏆 Quest Completed: {q['text']}", "QUEST")
                self.mutate_world_after_victory(biome_id, outcome)
                return True
        return False
        
    def mutate_world_after_victory(self, biome_id, outcome):
        current_desc = self.db.get_biome_by_id(biome_id)['description']
        prompt = f"OLD WORLD: {current_desc}{chr(10)}EVENT: {outcome}{chr(10)}TASK: Describe the world AFTER this event. The change MUST be permanent and visible (e.g. door opens, lights turn on). Call 'mutate_world'."
        args = tool_agent.process("World Architect", prompt, allowed_tools=['mutate_world'])
        if args and 'new_description' in args:
            self.db.update_biome_desc(biome_id, args['new_description'])
            log(f"🌍 World Mutated: {args['new_description']}", "WORLD")

class BiomeNavigator:
    def __init__(self, db: WorldDatabase):
        self.db = db
        if not self.db.biomes: self.db.create_biome("A loading void.")
        self.current_biome = self.db.biomes[-1]
        
    def travel(self, direction_desc):
        history_str = chr(10).join([f"- {h['text']}" for h in self.db.history[-5:]])
        prompt = f"Action: {direction_desc}. History: {history_str}. Describe NEW area. Call update_biome."
        args = tool_agent.process("Navigator", prompt, allowed_tools=['update_biome'])
        desc = args['description'] if args and 'description' in args else "A new, unknown area."
        self.current_biome = self.db.create_biome(desc)
        # Trigger quest generation for new biome
        quest_mgr = QuestManager(self.db)
        quest_mgr.generate_next_in_chain(desc, self.current_biome['id'])
        return self.current_biome
`;
