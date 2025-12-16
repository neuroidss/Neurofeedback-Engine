
export const NQ_PHYSICS_PY = `
import numpy as np
import networkx as nx
import time
import heapq

def normalize(v):
    norm = np.linalg.norm(v)
    return v / (norm + 1e-9) if norm > 0 else v

class SemanticPhysicsEngine:
    def __init__(self, embedder_func):
        self.embed = embedder_func
        self.vectors = {} 
        self.initialized = False
        
        # UNIVERSAL LAWS (Basis Vectors)
        self.active_laws = []
        
        self.factions = {} 
        self.world_atmosphere = np.zeros(384)
        self.global_forces = [] 
        
        self.game_logic = None 
        self.is_new_scene = False
        self.current_visual_prompt = "A void"

    def load_game(self, config):
        """Loads a game configuration and initializes the logic loop."""
        self.game_logic = GenericGameLoop(config)
        self.game_logic.physics_engine_ref = self 
        self.init_world(config)
        self.current_visual_prompt = config.get("start_prompt", "A blank world")

    def init_world(self, config):
        print(f"[Physics] ⚛️ Booting 384D Superposition Kernel...", flush=True)
        
        # 1. COMPILE PHYSICAL LAWS from Lore
        self.active_laws = []
        raw_laws = config.get("physics_laws", [])
        
        if self.embed:
            for law in raw_laws:
                if len(law) == 2:
                    pos_concept, neg_concept = law
                    v_pos = self.embed(pos_concept)
                    v_neg = self.embed(neg_concept)
                    axis_vec = normalize(v_pos - v_neg)
                    self.active_laws.append({
                        "name": f"{pos_concept}<>{neg_concept}",
                        "vector": axis_vec,
                        "positive": pos_concept,
                        "negative": neg_concept
                    })
                    print(f"[Physics] ⚖️ Law Established: {pos_concept} vs {neg_concept}", flush=True)

        # 2. Load Factions
        self.factions = {}
        raw_factions = config.get("factions", {})
        if isinstance(raw_factions, dict):
            for fname, data in raw_factions.items():
                desc = data.get("description", fname)
                vec = self.embed(desc) if self.embed else np.random.rand(384)
                self.factions[fname] = { "vector": normalize(vec), "description": desc }

        # 3. Load Global Forces
        self.global_forces = []
        gforces = config.get("global_forces", {})
        for name, data in gforces.items():
            vec = self.embed(data["desc"]) if self.embed else np.random.rand(384)
            self.global_forces.append((normalize(vec), data["power"]))
            
        self.initialized = True

    def calculate_semantic_clash(self, attacker_tags_list, defender_tags_list, focus_level=0.5):
        """
        Calculates damage based on PROJECTION onto ACTIVE LAWS.
        Returns detailed math logs.
        """
        calc_log = []
        calc_log.append(f"--- PHYSICS FRAME ---")
        calc_log.append(f"ATK: {attacker_tags_list[:2]}")
        calc_log.append(f"DEF: {defender_tags_list[:2]}")

        # 1. Embed Concepts
        attacker_str = " ".join(attacker_tags_list).lower()
        defender_str = " ".join(defender_tags_list).lower()
        
        v_atk = self.embed(attacker_str)
        v_def = self.embed(defender_str)
        
        # 2. Apply Neural Noise (Focus)
        entropy = max(0.0, 1.0 - focus_level)
        noise_magnitude = entropy * 0.4
        noise = np.random.normal(0, noise_magnitude, v_atk.shape)
        v_atk_noisy = normalize(v_atk + noise)
        v_def_norm = normalize(v_def)

        # 3. CALCULATE INTERACTIONS
        
        # A. Base Physicality (The "Matter" Layer)
        raw_sim = np.dot(v_atk_noisy, v_def_norm)
        calc_log.append(f"Base Vector Sim: {raw_sim:.3f}")
        
        base_impact = 1.0 - raw_sim
        base_impact = max(0.2, base_impact) 
        
        total_impact = base_impact
        log_msg = []
        
        strongest_axis_val = 0.0
        active_axis_name = None
        max_conflict_score = 0.0 
        
        # B. Universal Laws (The "Magic/Logic" Layer)
        for law in self.active_laws:
            # Project onto Law Axis
            atk_proj = np.dot(v_atk_noisy, law["vector"])
            def_proj = np.dot(v_def_norm, law["vector"])
            
            # Determine alignment
            alignment_product = atk_proj * def_proj
            involvement = abs(atk_proj) + abs(def_proj)
            
            # Only log significant interactions
            if involvement > 0.3:
                law_name = law["name"]
                calc_log.append(f"Axis: {law_name}")
                calc_log.append(f"  > Atk Proj: {atk_proj:.2f}")
                calc_log.append(f"  > Def Proj: {def_proj:.2f}")
                
                if alignment_product < -0.05:
                    tension = abs(atk_proj - def_proj)
                    calc_log.append(f"  > ❌ POLARITY CLASH (Tension: {tension:.2f})")
                    
                    if involvement > abs(strongest_axis_val):
                        strongest_axis_val = -1.0 * min(1.0, tension)
                        active_axis_name = law["name"]
                        total_impact += tension * 2.0
                        max_conflict_score = max(max_conflict_score, tension)
                        
                elif alignment_product > 0.05:
                    calc_log.append(f"  > 🛡️ ALIGNED (Resisted)")
                    resonance = (abs(atk_proj) + abs(def_proj)) / 2.0
                    if involvement > abs(strongest_axis_val):
                        strongest_axis_val = min(1.0, resonance)
                        active_axis_name = law["name"]
                        total_impact *= 0.5
                        log_msg.append(f"🛡️ RESISTED by {law['name']}")
                else:
                     calc_log.append(f"  > Orthogonal (No effect)")

        # 4. Result Synthesis
        is_critical = (max_conflict_score > 0.8)
        is_resonance = (strongest_axis_val > 0.6)
        
        final_multiplier = total_impact
        
        if is_critical: 
            final_multiplier *= 1.5
            calc_log.append(f"⚡ CRITICAL HIT CONFIRMED")
            log_msg.append(f"⚡ CRIT! Axis: {active_axis_name}")
            
        if raw_sim > 0.7:
             is_resonance = True
             final_multiplier *= 0.1
             log_msg.append("💖 RESONANCE. Concepts are too similar.")
        
        calc_log.append(f"Final Multiplier: {final_multiplier:.2f}x")

        radar_value = 0.0
        if abs(strongest_axis_val) > 0.15:
            radar_value = strongest_axis_val
        else:
            radar_value = float(raw_sim)
            
        return {
            "similarity": float(radar_value),
            "final_multiplier": float(final_multiplier),
            "is_critical": is_critical,
            "is_resonance": is_resonance,
            "logs": log_msg,
            "calc_details": calc_log # Detailed log for UI
        }

    def tick(self, player_control_vector, gaze_target_id, dt):
        if not self.initialized: return
        for fvec, power in self.global_forces:
            self.world_atmosphere += fvec * power * dt
        self.world_atmosphere = normalize(self.world_atmosphere)

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
    
    def get_active_asset_path(self):
        if self.game_logic and self.game_logic.current_subject_id:
            mapping = self.game_logic.config.get("asset_map", {})
            return mapping.get(self.game_logic.current_subject_id)
        return None

    def get_attention_queue(self):
        pq = []
        if self.game_logic and self.game_logic.current_phase == "BATTLE":
            battle = self.game_logic.active_battle
            if battle:
                enemy_ent = battle.get("enemy_entity")
                if enemy_ent:
                    class MockEnt:
                        def __init__(self, e): 
                            self.archetype = e.get('desc', 'Enemy')
                            self.current_vector = np.zeros(384)
                            self.current_stress = 0.5
                            self.id = e.get('character_id')
                        def __lt__(self, o): return False
                    heapq.heappush(pq, (-1.0, MockEnt(enemy_ent))) 
        return pq
`