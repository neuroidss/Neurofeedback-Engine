
import type { ToolCreatorPayload } from '../../../types';
import { NEURO_QUEST_UI_IMPL } from './neuro_quest/frontend';
import { NQ_CONFIG_PY } from './neuro_quest/python_modules/config';
import { NQ_LLM_PY } from './neuro_quest/python_modules/llm';
import { NQ_WORLD_PY } from './neuro_quest/python_modules/world';
import { NQ_VISION_PY } from './neuro_quest/python_modules/vision';
import { NQ_SERVER_PY } from './neuro_quest/python_modules/server';
import { NQ_AUDIO_PY } from './neuro_quest/python_modules/audio';
import { NQ_TTS_PY } from './neuro_quest/python_modules/tts';
import { NQ_SENSORS_PY } from './neuro_quest/python_modules/sensors';
import { NQ_AKASHIC_PY } from './neuro_quest/python_modules/akashic';
import { NQ_BRAIN_PY } from './neuro_quest/python_modules/brain';
import { NQ_AUTOPILOT_PY } from './neuro_quest/python_modules/autopilot';
import { INPUT_FUSION_PY } from './neuro_quest/python_modules/input_fusion';
import { INPUT_SYSTEM_PYTHON } from './neuro_quest/python_modules/input_system';
import { NQ_ENGINE_PY } from './neuro_quest/python_modules/engine';
import { NQ_LORE_PY } from './neuro_quest/python_modules/lore';

// --- OVERRIDES: HOLOCRATIC PHYSICS & LOGIC ---

const NQ_HOLO_PHYSICS_PY = `
import numpy as np
import time
import random

def normalize(v):
    norm = np.linalg.norm(v)
    return v / (norm + 1e-9) if norm > 0 else v

class SemanticPhysicsEngine:
    def __init__(self, embedder_func):
        self.embed = embedder_func
        self.initialized = False
        self.circles = {} # { "CircleName": { "center": Vector, "radius": 0.5, "members": [] } }
        self.world_atmosphere = np.zeros(384)
        self.global_forces = [] 
        self.game_logic = None 
        self.is_new_scene = False
        self.current_visual_prompt = "A void of shifting concepts"

    def load_game(self, config):
        self.game_logic = GenericGameLoop(config)
        self.game_logic.physics_engine_ref = self 
        self.init_world(config)

    def init_world(self, config):
        print(f"[HoloPhysics] 💠 Initializing Semantic Fields...", flush=True)
        
        # 1. Create Circles from Factions (Attractors)
        raw_factions = config.get("factions", {}) # List or Dict
        if isinstance(raw_factions, list): # Handle simple list case
            temp = {}
            for f in raw_factions: temp[f] = {"description": f}
            raw_factions = temp

        for fname, data in raw_factions.items():
            desc = data.get("description", fname)
            vec = self.embed(desc) if self.embed else np.random.rand(384)
            self.circles[fname] = {
                "id": fname,
                "center": normalize(vec),
                "tension": 0.0
            }
            print(f"[HoloPhysics] ⭕ Circle Created: {fname}", flush=True)

        self.initialized = True

    def calculate_semantic_clash(self, attacker_tags_list, defender_tags_list, focus_level=0.5):
        """
        In Holacracy mode, this calculates ALIGNMENT vs DISSONANCE.
        """
        # Embed
        v_atk = normalize(self.embed(" ".join(attacker_tags_list)))
        v_def = normalize(self.embed(" ".join(defender_tags_list)))
        
        # 1. Resonance (Dot Product)
        resonance = np.dot(v_atk, v_def) # -1 to 1
        
        # 2. Influence (Magnitude of effect)
        # Higher Focus = More precise influence (less noise)
        influence = 1.0 
        
        log_msg = []
        if resonance > 0.5:
            log_msg.append(f"✨ Harmonic Resonance ({resonance:.2f})")
            impact_type = "ALIGN"
        elif resonance < -0.3:
            log_msg.append(f"⚡ Dissonance Detected ({resonance:.2f})")
            impact_type = "DISRUPT"
        else:
            impact_type = "NEUTRAL"

        return {
            "similarity": float(resonance),
            "final_multiplier": float(abs(resonance) * 2.0), # Semantic Intensity
            "is_critical": abs(resonance) > 0.8,
            "is_resonance": resonance > 0.6,
            "logs": log_msg,
            "calc_details": [f"Mode: Holocratic Field", f"Resonance: {resonance:.3f}", f"Type: {impact_type}"]
        }

    def tick(self, player_control_vector, gaze_target_id, dt):
        if not self.initialized: return
        
        # Drift calculations could go here for continuous simulation
        pass

    def advance_game(self, player_focus, dt, is_autopilot=False):
        if self.game_logic:
            result = self.game_logic.process_turn(player_focus, dt, is_autopilot)
            if result:
                narrative, visual = result
                self.current_visual_prompt = visual
                self.is_new_scene = True
            else:
                self.is_new_scene = False

    def get_visual_prompt(self): return self.current_visual_prompt
    def get_active_asset_path(self): return None 
    def get_attention_queue(self): return []
`;

const NQ_HOLO_CORE_PY = `
import numpy as np
import time
import random

class GenericGameLoop:
    def __init__(self, config):
        self.config = config
        self.physics_engine_ref = None
        self.db = None # Placeholder for DB Injection
        
        # --- HOLOCRATIC STATE ---
        # Resources are abstract concepts now, but we add AP for Autopilot compatibility
        self.resources = { "Coherence": 100, "Influence": 50, "Entropy": 0, "AP": 4 }
        self.resources_max = { "Coherence": 100, "Influence": 100, "Entropy": 100, "AP": 4 }
        
        # --- UNIVERSAL ALIASES FOR AUTOPILOT ---
        self.RES_HP = "Coherence"
        self.RES_AP = "AP"
        self.RES_GOLD = "Influence"
        
        # Map: Nodes are "Holons" (Self-contained entities)
        self.territories = [] 
        raw_terr = config.get("territories", [])
        for t in raw_terr:
            new_t = t.copy()
            new_t['coherence'] = 1.0 # 1.0 = Stable, 0.0 = Chaos
            new_t['status'] = 'Neutral'
            self.territories.append(new_t)

        self.inventory = [c.copy() for c in config.get("start_deck", [])]
        
        self.current_phase = "STRATEGY"
        self.current_event = "Observation"
        self.active_battle = None # In Holo mode, this is a "Tension Event"
        self.logs = []
        self.game_over = False
        
        self.turn_count = 0
        self.entropy_level = 0.0
        self.last_turn_time = time.time()
        
        # For UI compatibility
        self.social_interactions = [
            {"id": "align", "name": "Align Vectors", "cost_ap": 1, "desc": "Smooth out dissonance."},
            {"id": "disrupt", "name": "Inject Entropy", "cost_ap": 2, "desc": "Destabilize the target."}
        ]
        self.active_perks = set()
        self.current_subject_id = None
        self.current_subject_desc = None

    def log_event(self, msg):
        print(f"[HoloGame] {msg}", flush=True)
        self.logs.append(msg)
        if len(self.logs) > 20: self.logs.pop(0)

    def consume_ap(self, amount=1):
        if self.resources.get("AP", 0) >= amount:
            self.resources["AP"] -= amount
            return True
        self.log_event(f"⚠️ Not enough AP!")
        return False

    def process_turn(self, player_focus, dt, is_autopilot=False):
        # Auto-resolve "battles" (Tension Events) based on vector drift
        if self.current_phase == "BATTLE" and self.active_battle:
            return self._resolve_tension_tick(player_focus)
        return None

    def _resolve_tension_tick(self, focus):
        # In Holacracy, "Battle" is resolving Semantic Tension
        battle = self.active_battle
        
        # 1. Decay Tension (Simulated resolution)
        resolution_rate = 10 * focus # High focus = faster resolution
        battle['tension'] -= resolution_rate
        
        self.log_event(f"🌊 Stabilizing Field... Tension: {int(battle['tension'])}")
        
        # 2. Check Outcome
        if battle['tension'] <= 0:
            self.current_phase = "STRATEGY"
            self.active_battle = None
            self.resources['Influence'] += 10
            
            target = battle['target']
            target['status'] = 'Aligned'
            target['coherence'] = 1.0
            
            return ("Harmony Restored", f"Order, geometry, light, {target['desc']}")
            
        return (f"Stabilizing... {int(battle['tension'])}%", f"Abstract geometric shapes, shifting colors, {battle['target']['desc']}")

    def trigger_battle(self, territory_id=None):
        # "Battle" -> "Intervention"
        if self.current_phase != "STRATEGY": return None
        if not self.consume_ap(2): return None

        target = next((t for t in self.territories if t['id'] == territory_id), None)
        if not target: return None
        
        self.current_phase = "BATTLE"
        self.active_battle = {
            "target": target,
            "tension": 100.0,
            "enemy_entity": { "character_id": "Entropy", "desc": "Chaos Field", "visual_signature": "Glitch, Noise" }, # UI Compat
            "hp": 100, "max_hp": 100, # UI Compat
            "enemy_hp": 100, "max_enemy_hp": 100, # UI Compat
            "log": [],
            "sim_history": [],
            "last_calc_log": []
        }
        self.log_event(f"⚠️ Intervention started in {target['id']}")
        return ("Intervention", f"Distortion, Glitch, {target['desc']}")

    def end_turn(self):
        self.turn_count += 1
        self.resources['Coherence'] = min(100, self.resources['Coherence'] + 5)
        self.resources['AP'] = self.resources_max['AP'] # REFILL AP
        self.log_event(f"🔄 Cycle {self.turn_count} complete. AP Refilled.")
        return ("Cycle Complete", "Abstract calm landscape")

    def trigger_social(self, uid, action_id):
        if not self.consume_ap(1): return None
        self.log_event(f"💬 Interaction ({action_id}) complete.")
        return ("Interaction", "Conversation, glowing lights")
        
    def trigger_farm(self):
        if not self.consume_ap(1): return None
        self.resources['Influence'] += 5
        self.log_event("✨ Gathered Influence.")
        return ("Meditation", "Energy gathering, particles")
        
    def buy_perk(self, pid): return False
    def init_run(self, config): self.__init__(config)
`;

// --- PYTHON SERVER AGGREGATION ---
// We overwrite the 'neuro_engine' modules with the Holo versions
const NQ_HOLO_SERVER_CODE = `
${NQ_CONFIG_PY}
${NQ_LORE_PY}
${NQ_LLM_PY}
${NQ_TTS_PY}
${NQ_AKASHIC_PY}
${NQ_WORLD_PY}
${NQ_HOLO_PHYSICS_PY}
${NQ_HOLO_CORE_PY}
${NQ_BRAIN_PY}
${NQ_AUTOPILOT_PY}
${INPUT_FUSION_PY}
${INPUT_SYSTEM_PYTHON}
${NQ_SENSORS_PY}
${NQ_AUDIO_PY}
${NQ_VISION_PY}
${NQ_ENGINE_PY}

# RE-IMPLEMENT NEURO ENGINE CLASS TO USE HOLO LOGIC (MUST BE BEFORE SERVER CODE)
class NeuroEngine_Holo(NeuroEngine):
    def __init__(self):
        print("[Engine] 💠 Initializing Holocratic Engine...", flush=True)
        self.pipe = None
        self.model_ready = False
        self.current_frame = Image.new('RGB', (512, 384), (0,0,0))
        self.render_lock = threading.Lock()
        self.ip_adapter_active = False
        
        # 1. Semantic Core
        try:
            from sentence_transformers import SentenceTransformer
            embedder = SentenceTransformer('all-MiniLM-L6-v2')
            self.embed = embedder.encode
        except:
            self.embed = lambda x: np.random.rand(384)
            
        # USE HOLO PHYSICS
        self.physics = SemanticPhysicsEngine(self.embed)
        self.brain = NeuralBrain(self)
        
        self.gamepad = VirtualGamepad()
        self.fusion = NeuroInputFusion(384)
        self.fusion.init_vectors(self.embed)
        self.ghost = GhostPlayer(self.physics)
        
        self.active_session_id = None 
        self.show_hud = True
        self.current_asset_filename = None 
        
        self.latest_game_stats = {}
        self.gm = GameMaster() 
        self.music = None 
        
        try:
            root = globals().get("SESSIONS_DIR", "sessions")
            default_path = os.path.join(root, "world_db.json")
            self.db = WorldDatabase(default_path) 
            self.nav = BiomeNavigator(self.db)
            self.quest_mgr = QuestManager(self.db)
            self.quest_mgr.attach_engine(self)
            if tool_agent: tool_agent.attach_engine(self)
        except Exception as e:
            print(f"[Engine] World/Quest Init Error: {e}", flush=True)

        threading.Thread(target=self._load_lcm, daemon=True).start()
        self.brain.start()

    def load_session(self, session_id):
        super().load_session(session_id)
        # Inject DB into game logic so Autopilot/Ghost can access Akashic records
        if self.physics.game_logic:
            self.physics.game_logic.db = self.db
            print(f"[HoloEngine] Injected World DB into Game Logic", flush=True)

# Override engine.ts content within the server file to use Holo classes
${NQ_SERVER_PY.replace('NeuroEngine()', 'NeuroEngine_Holo()')}
`;

// --- FRONTEND ADAPTATION ---
// We reuse the exact UI but point it to the new process ID
// CRITICAL FIX: Replace %%PYTHON_CODE%% with the Holocratic server code to fix syntax error.
const NEURO_QUEST_HOLO_UI = NEURO_QUEST_UI_IMPL
    .replace("const PROCESS_ID = 'neuro_quest_v1';", "const PROCESS_ID = 'neuro_quest_holo';")
    .replace("Launch Native Engine...", "Launch Holocratic Engine...")
    .replace("LAUNCH GAME ENGINE", "ENTER HOLACRACY")
    .replace(/neuro_quest\.py/g, 'neuro_quest_holo.py') // Update script path in deployment logic
    .replace('%%PYTHON_CODE%%', JSON.stringify(NQ_HOLO_SERVER_CODE));

export const NEURO_QUEST_HOLACRACY: ToolCreatorPayload = {
    name: 'Neuro Quest: Holacracy Mode',
    description: 'A "Semantic Fork" of the Neuro Quest engine. Replaces HP/Damage mechanics with a pure Vector Field Simulation. Entities are "Holons" that drift towards semantic attractors. Conflict is resolved by alignment.',
    category: 'UI Component',
    executionEnvironment: 'Client',
    purpose: 'To experience a "Fuzzy" World Model where narrative logic is driven by high-dimensional vector math rather than arithmetic stats.',
    parameters: [
        { name: 'processedData', type: 'object', description: 'Real-time EEG/Bio metrics.', required: true },
        { name: 'runtime', type: 'object', description: 'Runtime API.', required: true }
    ],
    processingCode: `(d,r)=>({ focusRatio: 0.5 })`,
    implementationCode: `
        // 1. Deploy the Holocratic Backend Script
        const deploy = async () => {
            if (!runtime.isServerConnected()) return;
            const code = ${JSON.stringify(NQ_HOLO_SERVER_CODE)};
            await runtime.tools.run('Server File Writer', { 
                filePath: 'neuro_quest_holo.py', 
                content: code, 
                baseDir: 'scripts' 
            });
        };
        
        // Execute deployment on mount (idempotent-ish)
        React.useEffect(() => { deploy(); }, []);

        // Render the UI (which launches the process ID 'neuro_quest_holo')
        ${NEURO_QUEST_HOLO_UI}
    `
};
