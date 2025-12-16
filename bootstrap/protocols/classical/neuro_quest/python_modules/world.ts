
export const NQ_WORLD_PY = `
# ==================================================================================
# 🌌 NEURO QUEST WORLD: THE DIRECTOR (LLM-DRIVEN)
# ==================================================================================
import networkx as nx
import numpy as np
import random
import time
import os
import json
import threading
# from llm import tool_agent # REMOVED: Monolith Build

# Lazy load embeddings
sentence_model = None

def get_embedder():
    global sentence_model
    if sentence_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            sentence_model = SentenceTransformer('all-MiniLM-L6-v2')
        except:
            print("[World] WARN: SentenceTransformer not found. Using Random Vectors.", flush=True)
            sentence_model = "FALLBACK"
    return sentence_model

class GraphSimulation:
    def __init__(self, db_ref):
        self.db = db_ref
        self.G = nx.Graph()
        self.vectors = {} 
        self.initialized = False

    def init_world(self, config, genome_text=""):
        embedder = get_embedder()
        print(f"[World] 🏗️ Initializing Cosmology...", flush=True)
        
        topology = config.get("topology", [])
        
        # Ensure topology exists
        if len(self.db.biomes) < 1 and topology:
            print(f"[World] 🌍 Loading Topology ({len(topology)} nodes)...", flush=True)
            for node in topology:
                b = self.db.create_biome(node["desc"], name_override=node["id"])
                
                vec = np.zeros(384)
                if embedder != "FALLBACK":
                    vec = embedder.encode(node["desc"])
                else:
                    vec = np.random.rand(384)
                
                self.vectors[b['id']] = vec
                self.G.add_node(b['id'])
                
                for target_id in node.get("neighbors", []):
                    self.G.add_edge(b['id'], target_id)
        
        # Sync DB to Memory
        for b in self.db.biomes:
            if b['id'] not in self.vectors:
                if embedder != "FALLBACK":
                    self.vectors[b['id']] = embedder.encode(b['description'])
                else:
                    self.vectors[b['id']] = np.random.rand(384)
            self.G.add_node(b['id'])

        self.initialized = True

class SessionManager:
    def __init__(self, root_dir=None):
        # Use the global SESSIONS_DIR from config if available, otherwise default to relative "sessions"
        self.root_dir = root_dir if root_dir else globals().get("SESSIONS_DIR", "sessions")
        if not os.path.exists(self.root_dir): os.makedirs(self.root_dir)
        log(f"Session Manager initialized at: {self.root_dir}", "SESS")
    
    def list_sessions(self):
        sessions = []
        if not os.path.exists(self.root_dir): return []
        for f in os.listdir(self.root_dir):
            if f.endswith(".json"):
                try:
                    with open(os.path.join(self.root_dir, f), 'r') as fp:
                        data = json.load(fp)
                        sessions.append({"id": f.replace(".json", ""), "summary": data.get("summary", ""), "lore": "Active", "last_updated": data.get("last_updated", 0)})
                except: pass
        return sorted(sessions, key=lambda x: x["last_updated"], reverse=True)

    def create_session(self, lore_key=None, genome=None): 
        sess_id = f"session_{int(time.time())}"
        
        # CRITICAL FIX: Set global session ID immediately so logs have a place to go
        # This creates the folders and the 'write_test.txt'
        set_current_session(sess_id)
        
        path = os.path.join(self.root_dir, f"{sess_id}.json")
        
        final_config = {}
        log(f"Creating Session {sess_id}. Lore Key: {lore_key}", "SESS")
        
        # Logic to resolve configuration from LORE_PRESETS (GAMES)
        if isinstance(lore_key, dict): 
            final_config = lore_key
            log("Using Custom Lore Config", "SESS")
        elif isinstance(lore_key, str) and lore_key in LORE_PRESETS: 
            final_config = LORE_PRESETS[lore_key]
            log(f"Resolved Lore Preset: {lore_key}", "SESS")
        else: 
            keys = list(LORE_PRESETS.keys())
            if keys:
                final_config = LORE_PRESETS[keys[0]]
                log(f"Lore key '{lore_key}' not found. Fallback to {keys[0]}", "WARN")
            else:
                final_config = {}
                log("No Lore Presets available!", "ERR")

        genome_summary = "Standard"
        if genome: genome_summary = ", ".join([v.get('effect','') for v in genome.values()])

        data = {
            "biomes": [], "config": final_config, "genome": genome or {}, 
            "summary": "Start", "genome_summary": genome_summary, 
            "history": [], "inventory": [], "known_entities": {}, # NEW: Entity Registry
            "last_updated": time.time()
        }
        try:
            with open(path, 'w') as f: json.dump(data, f, indent=4)
            log(f"Session file created at {path}", "SESS")
        except Exception as e:
            log(f"Failed to write session file: {e}", "ERR")
            
        return sess_id

session_manager = SessionManager()

class WorldDatabase:
    def __init__(self, db_path_fragment):
        # We accept a fragment or ID, but ensure we load from SESSIONS_DIR
        self.db_path = db_path_fragment
        
        # If path is just an ID or filename, fix it to absolute path
        if not os.path.isabs(db_path_fragment):
             self.db_path = os.path.join(SESSIONS_DIR, db_path_fragment)
             
        self.biomes = []
        self.config = {} 
        self.genome = {}
        self.history = []
        self.inventory = []
        self.known_entities = {} # UUID -> Entity Data
        self.engine_ref = None # Circular ref to main engine for accessing Akashic
        self.akashic_ref = None # Direct ref to the memory engine
        
        log(f"Loading World DB from {self.db_path}", "DB")
        
        if os.path.exists(self.db_path):
            try:
                with open(self.db_path, 'r') as f:
                    d = json.load(f)
                    self.biomes = d.get('biomes', [])
                    self.config = d.get('config', {})
                    self.genome = d.get('genome', {})
                    self.history = d.get('history', [])
                    self.inventory = d.get('inventory', [])
                    self.known_entities = d.get('known_entities', {})
                log(f"DB Loaded. Config Title: {self.config.get('title', 'Unknown')}", "DB")
            except Exception as e: 
                log(f"DB Load Failed: {e}", "ERR")
        else:
            log(f"DB file not found: {self.db_path}", "WARN")
            
    def attach_engine(self, engine):
        self.engine_ref = engine
        # Initialize Akashic Engine for this session
        if engine.active_session_id:
            self.akashic_ref = AkashicEngine(engine.active_session_id)
            if self.genome:
                self.akashic_ref.update_genome_context(self.genome)
            
    def save_db(self):
        try:
            with open(self.db_path, 'w') as f:
                json.dump({
                    "biomes": self.biomes, "config": self.config, "genome": self.genome, 
                    "history": self.history, "inventory": self.inventory, 
                    "known_entities": self.known_entities,
                    "last_updated": time.time()
                }, f, indent=4)
        except Exception as e:
            log(f"DB Save Failed: {e}", "ERR")

    def create_biome(self, desc, name_override=None):
        bid = name_override if name_override else f"Zone_{len(self.biomes) + 1}"
        b = {"id": bid, "description": desc, "quests": []}
        self.biomes.append(b)
        self.save_db()
        return b
    
    def get_biome_by_id(self, bid):
        return next((b for b in self.biomes if b['id'] == bid), None)
        
    def add_quest(self, biome_id, text, **kwargs):
        b = self.get_biome_by_id(biome_id)
        if b:
            b['quests'] = [] 
            q = {"id": f"q_{int(time.time())}", "text": text, "status": "active", **kwargs}
            b['quests'].append(q)
            self.save_db()
            return q
            
    def update_biome(self, b): self.save_db()
    
    def archive_quest(self, q):
        self.history.append({"id": q['id'], "text": q['text'], "outcome": q.get('outcome'), "time": time.time()})
        self.save_db()
    
    def register_entity(self, entity_data):
        """Save a new unique entity to the world."""
        eid = entity_data.get('id')
        if eid:
            self.known_entities[eid] = entity_data
            self.save_db()
    
    def get_entity(self, eid):
        return self.known_entities.get(eid)

class QuestManager:
    """
    THE DIRECTOR.
    Uses LLM to interpret vector conflicts into Narrative Quests.
    """
    def __init__(self, db):
        self.db = db
        self.sim = GraphSimulation(db)
        self.engine = None
    
    def attach_engine(self, eng):
        self.engine = eng
        config = self.db.config
        genome = ""
        if self.db.genome:
             genome = ", ".join([v.get('effect','') for v in self.db.genome.values()])
        self.sim.init_world(config, genome)
        
    def get_active_quests(self, bid):
        b = self.db.get_biome_by_id(bid)
        return [q for q in b['quests'] if q['status'] == 'active'] if b else []

    def generate_next_in_chain(self, ctx, bid):
        """
        AI-DRIVEN QUEST GENERATION.
        Aggressive, conflict-oriented director.
        """
        biome = self.db.get_biome_by_id(bid)
        if not biome: return

        print(f"[Director] 🎬 FORCING CONFLICT in {bid}...", flush=True)
        
        # 1. Gather Context (The Symbolic)
        lore_context = json.dumps(self.db.config.get("factions", {}))
        biome_desc = biome['description']
        
        # --- MEMORY INJECTION ---
        memory_context = ""
        if self.db.akashic_ref:
            # Query the Akashic records for relevant history to the current location/situation
            memory_context = self.db.akashic_ref.get_context_string(f"{biome_desc} conflict")
            
        # 2. Prompt LLM (The Imaginary)
        # We ask the AI to "Hallucinate" a conflict based on the vector forces.
        prompt = f"""
        WORLD STATE:
        - Location: {biome_desc}
        - Active Factions (Lore Physics): {lore_context}
        - RELEVANT HISTORY (Neuro-Akashic Record): {memory_context}
        
        DIRECTOR TASK:
        The world is NOT stable. A new threat has just manifested.
        Identify which faction is attacking or corrupting the location RIGHT NOW.
        Create an immediate VISUAL ANOMALY that represents this attack.
        The player must interact/destroy it to survive.
        
        IF NO OBVIOUS CONFLICT EXISTS, INVENT ONE. Do not return "peace".
        """
        
        # 3. Call ToolAgent
        try:
            if tool_agent.configured:
                args = tool_agent.process("Aggressive Game Master", [{"type":"text", "text":prompt}], allowed_tools=['generate_quest_scenario'])
                
                if args and args.get('_tool_name') == 'generate_quest_scenario':
                    print(f"[Director] 🎬 Scene Generated: {args['title']}", flush=True)
                    
                    if self.engine and self.engine.gm:
                        self.engine.gm.queue_narrative(f"{args['title']}: {args['description']}", is_voiceover=False)
                        
                        voice_line = args.get('cinematic_voiceover')
                        if not voice_line: voice_line = args['title'] 
                        self.engine.gm.queue_narrative(voice_line, is_voiceover=True)
                        
                        self.engine.gm.update_focus(args['visual_problem'])

                    self.db.add_quest(
                        bid, 
                        args['title'],
                        manifestation_visuals=args['visual_problem'],
                        success_visual_desc=args['visual_success'],
                        reward="NARRATIVE_PROGRESS",
                        description=args['description']
                    )
                    
                    # Store the generated quest in Akashic for future reference
                    if self.db.akashic_ref:
                         self.db.akashic_ref.add_memory(f"New quest: {args['title']} - {args['description']}", tags={'quest_start': 1.0})
                    return
        except Exception as e:
            print(f"[Director] LLM Generation Failed: {e}.", flush=True)

    def complete_quest(self, biome_id, quest_id, outcome):
        b = self.db.get_biome_by_id(biome_id)
        if b:
            q = next((x for x in b['quests'] if x['id'] == quest_id), None)
            if q:
                q['status'] = 'completed'
                q['outcome'] = outcome
                self.db.archive_quest(q)
                b['quests'] = [x for x in b['quests'] if x['id'] != quest_id]
                self.db.update_biome(b)
                print(f"[Director] Cut! Print it: {q['text']}", flush=True)
                
                self.generate_next_in_chain(None, biome_id)

class BiomeNavigator:
    def __init__(self, db):
        self.db = db
        if self.db.biomes: self.current_biome = self.db.biomes[0]
        else: self.current_biome = None
    def travel_to(self, bid):
        b = self.db.get_biome_by_id(bid)
        if b: self.current_biome = b
`
