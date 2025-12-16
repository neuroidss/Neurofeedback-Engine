
export const NQ_SEMANTIC_CORE_PY = `
import numpy as np
import heapq
import time
import random
import uuid
import json
# from config import log  # REMOVED for Monolith Build (functions available globally)
# from llm import tool_agent # REMOVED: Monolith Build (Assumed global)

class GenericGameLoop:
    def __init__(self, config):
        self.config = config
        self.mechanics = config.get("mechanics", {})
        self.db = None # Injected
        self.physics_engine_ref = None # Injected by Physics Engine on load
        
        # Meta-State
        self.run_count = 0
        self.active_perks = set()
        
        # Initialize resources
        self.resources = {k: v.get("start", 0) for k, v in self.mechanics.get("resources", {}).items()}
        self.resources_max = {k: v.get("max", 999999) for k, v in self.mechanics.get("resources", {}).items()}
        
        # Embedder reference (lazy load)
        self.embedder = None
        self.vectors = {} 
        
        self.init_run(config, first_boot=True)

    def _get_embedding(self, text):
        try:
            from sentence_transformers import SentenceTransformer
            if not self.embedder:
                self.embedder = SentenceTransformer('all-MiniLM-L6-v2')
            return self.embedder.encode(text)
        except:
            return np.random.rand(384)

    def _calculate_vector_resonance(self, vec_a, vec_b):
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)
        if norm_a == 0 or norm_b == 0: return 0.0
        return np.dot(vec_a, vec_b) / (norm_a * norm_b)

    def _commit_memory(self, text, entities=None, tags=None):
        if hasattr(self.db, 'akashic_ref') and self.db.akashic_ref:
             self.db.akashic_ref.add_memory(text, bio_metrics=tags, entities=entities)

    def init_run(self, config, first_boot=False):
        current_cp = 0
        if not first_boot and hasattr(self, 'resources'):
            current_cp = self.resources.get("CP", 0)
            
        self.resources = {k: v.get("start", 0) for k, v in self.mechanics.get("resources", {}).items()}
        self.resources_max = {k: v.get("max", 999999) for k, v in self.mechanics.get("resources", {}).items()}
        
        if not first_boot:
            self.resources["CP"] = current_cp
        
        keys = list(self.resources.keys())
        self.RES_AP = "AP" if "AP" in keys else (keys[0] if keys else "AP")
        self.RES_GOLD = next((k for k in keys if k in ["Gold", "Credits", "Clues"]), "Gold")
        self.RES_HP = next((k for k in keys if k not in [self.RES_AP, self.RES_GOLD, "CP"]), "Humanity")
        
        # Apply Perks
        if "limit_break" in self.active_perks: 
            self.resources_max[self.RES_HP] += 5000 
            self.resources[self.RES_HP] += 5000
            
        if "xp_boost" in self.active_perks:
            self.xp_multiplier = 1.5
        else:
            self.xp_multiplier = 1.0

        self.territories = [t.copy() for t in config.get("territories", [])]
        
        # Pre-calculate territory vectors
        for t in self.territories:
            desc = t.get('semantic_anchor', t.get('desc', 'Generic Land'))
            self.vectors[t['id']] = self._get_embedding(desc)

        # Deck Init
        self.inventory = [c.copy() for c in config.get("start_deck", [])]
        
        for c in self.inventory:
            desc = " ".join(c.get('semantic_tags', [])) + " " + c.get('desc', '')
            c['vector'] = self._get_embedding(desc)

        if "start_sil" in self.active_perks:
            sill = next((c for c in config.get("card_pool", []) if "Sill" in c["character_id"]), None)
            if sill:
                card_instance = sill.copy()
                if "uid" not in card_instance:
                    card_instance["uid"] = f"char_{card_instance['character_id'].replace(' ', '_').lower()}_{random.randint(1000,9999)}"
                desc = " ".join(card_instance.get('semantic_tags', [])) + " " + card_instance.get('desc', '')
                card_instance['vector'] = self._get_embedding(desc)
                
                self.inventory.append(card_instance)

        self.card_pool = config.get("card_pool", [])
        self.social_interactions = config.get("social_interactions", [])
        
        self.turn_usage = {} 
        self.current_phase = "STRATEGY"
        self.current_event = "Headquarters"
        self.active_battle = None
        self.game_over = False
        self.logs = []
        
        self.turn_count = 0
        self.entropy_level = 0.0
        self.last_turn_time = time.time()
        
        self.current_subject_id = None
        self.current_subject_desc = None
        
        self._commit_memory(f"A new timeline begins. Run #{self.run_count}. Leader: {self.inventory[0]['character_id']}.", entities=[self.inventory[0]['character_id']], tags={'focus': 1.0})

    def log_event(self, msg):
        log(msg, "GAME") 
        self.logs.append(msg) 
        if len(self.logs) > 20: self.logs.pop(0)

    def consume_ap(self, amount=1):
        if self.resources.get(self.RES_AP, 0) >= amount:
            self.resources[self.RES_AP] -= amount
            return True
        self.log_event(f"⚠️ Not enough {self.RES_AP}!")
        return False

    def recover_ap(self):
        max_ap = self.resources_max.get(self.RES_AP, 6)
        self.resources[self.RES_AP] = max_ap
        self.turn_usage = {} 
        self.log_event(f"🔄 Turn {self.turn_count} Ended. AP Refilled.")

    def end_turn(self):
        """
        Advance the timeline. Logic is now purely data-driven from 'grand_strategy'.
        1. Identify rules from config (invader name, progression steps).
        2. Determine valid targets (not final 'Occupied' state, not home base).
        3. Advance territory status (Neutral -> Contested -> Enemy).
        """
        if self.current_phase != "STRATEGY": 
            return ("Busy", "Cannot end turn during battle")
            
        self.turn_count += 1
        self.recover_ap()
        self.entropy_level += 0.05
        
        strat = self.config.get("grand_strategy", {})
        
        if self.territories and strat:
            invader_name = strat.get("invader_name", "The Enemy")
            home_base_id = strat.get("home_base_id", "Unknown")
            progression = strat.get("status_progression", ["Neutral", "Contested", "Enemy"])
            final_status = progression[-1]
            invasion_chance = strat.get("invasion_chance", 0.5)
            
            # 1. Identify Potential Targets
            # Ignore territories that are already fully occupied (Final Status) or are the Home Base.
            valid_targets = [t for t in self.territories if t['status'] != final_status and t['id'] != home_base_id]
            
            if valid_targets:
                # Prioritize based on progression index (Late-stage targets fall first)
                # Map statuses to indices
                status_rank = {s: i for i, s in enumerate(progression)}
                
                # Sort targets by rank (Highest rank = closest to falling)
                valid_targets.sort(key=lambda t: status_rank.get(t['status'], 0), reverse=True)
                
                # Pick top priority (most contested) or random if all equal
                top_rank = status_rank.get(valid_targets[0]['status'], 0)
                highest_priority_targets = [t for t in valid_targets if status_rank.get(t['status'], 0) == top_rank]
                
                # 50% chance to advance the "front line", otherwise expand to new "Neutral" areas
                if random.random() < invasion_chance and highest_priority_targets:
                    target = random.choice(highest_priority_targets)
                else:
                    target = random.choice(valid_targets)
                
                # ADVANCE STATUS
                current_idx = status_rank.get(target['status'], 0)
                next_idx = min(len(progression) - 1, current_idx + 1)
                new_status = progression[next_idx]
                
                target['status'] = new_status
                
                # LOGGING & EFFECTS
                if new_status == final_status:
                    # Territory Has Fallen
                    target['difficulty'] += 0.5 
                    target['desc'] += strat.get("occupied_visual_suffix", " [OCCUPIED]")
                    
                    loss = int(self.resources_max.get(self.RES_HP, 10000) * 0.15)
                    self.resources[self.RES_HP] = max(0, self.resources.get(self.RES_HP, 0) - loss)
                    
                    log_text = strat.get("fall_log", "City Fallen!").format(target=target['id'], invader=invader_name)
                    self.log_event(log_text)
                    self._commit_memory(f"{target['id']} fell to {invader_name}.", entities=[invader_name, target['id']], tags={'entropy': 1.0})
                    
                    return ("City Fallen", f"{target['id']} ruins, {invader_name} occupation, dark sky")
                
                else:
                    # Invasion / Escalation
                    log_text = strat.get("invasion_log", "Invasion!").format(target=target['id'], invader=invader_name)
                    self.log_event(log_text)
                    self._commit_memory(f"{invader_name} is advancing on {target['id']}.", entities=[invader_name, target['id']], tags={'entropy': 0.8})
                    
                    return ("Invasion", f"{invader_name} invading {target['id']}, war, conflict")

        return ("Turn Ended", f"Turn {self.turn_count} Begins.")

    def trigger_social(self, card_uid, interaction_id):
        if self.current_phase != "STRATEGY": return None
        card = next((c for c in self.inventory if c.get('uid') == card_uid), None)
        action = next((a for a in self.social_interactions if a['id'] == interaction_id), None)
        if not card or not action: return None
        if not self.consume_ap(action.get('cost_ap', 1)): return None
        
        self.turn_usage[interaction_id] = self.turn_usage.get(interaction_id, 0) + 1
        
        if interaction_id == 'dinner':
            heal_amt = int(self.resources_max.get(self.RES_HP, 10000) * 0.2)
            self.resources[self.RES_HP] = min(self.resources_max.get(self.RES_HP), self.resources.get(self.RES_HP, 0) + heal_amt)
            self.log_event(f"💚 Troops healed (+{heal_amt}).")
            
        card['bond'] = card.get('bond', 0) + 1
        self.log_event(f"💖 Bond increased with {card['character_id']}.")
        
        self.current_event = f"Social: {card['character_id']}"
        self.current_subject_id = card['character_id']
        self.current_subject_desc = card['desc']
        self._commit_memory(f"Bond deepened with {card['character_id']} during {action['name']}.", entities=[card['character_id']], tags={'bond': card['bond']})
        return (f"{action['name']} with {card['character_id']}.", f"{card['character_id']} smiling, {action['name']} scene")

    def buy_perk(self, perk_id):
        perk = next((p for p in self.config.get("meta_perks", []) if p["id"] == perk_id), None)
        if not perk: return False
        cost = perk["cost"]
        if self.resources.get("CP", 0) >= cost:
            self.resources["CP"] -= cost
            self.active_perks.add(perk_id)
            self.log_event(f"💎 Perk Acquired: {perk['name']}")
            return True
        return False

    def trigger_reset(self):
        survival_bonus = int(self.turn_count / 5)
        cp_gain = 1 + survival_bonus
        self.resources["CP"] = self.resources.get("CP", 0) + cp_gain
        self.run_count += 1
        self.log_event(f"💀 GAME OVER. Run {self.run_count} Ended. +{cp_gain} CP.")
        self.game_over = True
        self._commit_memory(f"Timeline collapsed. Gain: {cp_gain} CP.", tags={'failure': 1.0})
        return cp_gain

    def trigger_battle(self, territory_id=None):
        if self.current_phase != "STRATEGY": return None
        
        target = None
        strat = self.config.get("grand_strategy", {})
        
        if territory_id:
            target = next((t for t in self.territories if t['id'] == territory_id), None)
        else:
            deck_vec = np.zeros(384)
            count = 0
            for c in self.inventory:
                if 'vector' in c:
                    deck_vec += c['vector']
                    count += 1
            if count > 0: deck_vec /= count
            
            # Pick valid targets based on config progression
            progression = strat.get("status_progression", ["Neutral", "Contested", "Enemy"])
            valid_statuses = progression # All statuses are potentially valid for battle
            
            candidates = [t for t in self.territories if t['status'] in valid_statuses]
            if candidates:
                def score_target(t):
                    t_vec = self.vectors.get(t['id'], np.zeros(384))
                    res = self._calculate_vector_resonance(deck_vec, t_vec)
                    return res - (t['difficulty'] * 0.5) 
                candidates.sort(key=score_target, reverse=True)
                target = candidates[0]
                
        if not target: return None
        return self._start_battle(target)

    def _start_battle(self, territory):
        if self.active_battle: return None
        if not self.consume_ap(2): return None
        
        self.current_phase = "BATTLE"
        
        scaling = 1.0 + (self.turn_count * self.mechanics.get("difficulty_ramp", 0.1))
        
        # --- DYNAMIC ENEMY GENERATION (DATA DRIVEN) ---
        strat = self.config.get("grand_strategy", {})
        progression = strat.get("status_progression", ["Neutral", "Contested", "Enemy"])
        final_status = progression[-1]
        
        is_occupied = (territory['status'] == final_status)
        
        if is_occupied:
            # Use Occupied/Demon Pool from config
            boss_pool = strat.get("occupied_boss_pool", [{"id": "Unknown", "desc": "Unknown", "tags": "Unknown"}])
            boss_data = random.choice(boss_pool)
            boss_id = boss_data["id"]
            
            visual_sig = strat.get("occupied_visual_signature", "Dark Aura")
            
            # Use the description from the pool, or fallback to generic
            enemy_desc = boss_data.get("desc", f"A commander occupying {territory['id']}.")
            enemy_tags = boss_data.get("tags", visual_sig)
            
            # Occupied territories are harder
            scaling *= 1.2
        else:
            # Native defender (Human/Local) defined in the territory itself
            boss_id = territory.get("boss_id", f"Guardian of {territory['id']}")
            # Visuals come from the territory description or anchor
            visual_sig = territory.get('semantic_anchor', 'Warrior')
            enemy_desc = f"The protector of {territory['id']}."
            enemy_tags = visual_sig

        base_hp = (1000 * territory["difficulty"] * scaling)
        
        enemy_entity = {
            "character_id": boss_id, 
            "desc": enemy_desc, 
            "visual_signature": enemy_tags # Use tags for semantic physics calc
        }
        
        self.active_battle = {
            "target": territory,
            "enemy_entity": enemy_entity, 
            "enemy_hp": base_hp,
            "max_enemy_hp": base_hp,
            "turn": 0,
            "scaling": scaling,
            "sim_history": [],
            "last_calc_log": [] # NEW: Store detailed math log
        }
        self.current_event = f"Battle: {territory['id']}"
        self.log_event(f"⚔️ BATTLE START vs {boss_id} ({territory['status']}). HP: {int(base_hp)}")
        
        return ("Battle Start", f"{boss_id} battle, {territory['desc']}, {visual_sig}")

    def process_turn(self, player_focus, dt, is_autopilot=False):
        turn_dur = 0.2 if is_autopilot else self.mechanics.get("turn_duration", 4.0)
        if time.time() - self.last_turn_time < turn_dur: return None 
        self.last_turn_time = time.time()
        if self.game_over: return None

        if self.current_phase == "BATTLE" and self.active_battle:
            return self._process_battle_tick(player_focus)
        return None

    def _process_battle_tick(self, player_focus):
        battle = self.active_battle
        battle["turn"] += 1
        
        active_card = random.choice(self.inventory) if self.inventory else {"character_id": "Soldier", "desc": "Soldier", "bond": 0, "rank": "N"}
        self.current_subject_id = active_card.get('character_id')
        self.current_subject_desc = active_card.get('desc')
        
        # --- NEW SEMANTIC PHYSICS COLLISION ---
        if self.physics_engine_ref:
            # Player: Card tags (Strings)
            attacker_tags = active_card.get('semantic_tags', [])
            if not attacker_tags: attacker_tags = [active_card.get('desc', 'Soldier')]
            
            # Enemy: Visual tags (Strings)
            defender_tags_str = battle['enemy_entity'].get('visual_signature', '')
            defender_tags = [x.strip() for x in defender_tags_str.split(',')]
            
            clash_result = self.physics_engine_ref.calculate_semantic_clash(
                attacker_tags,
                defender_tags,
                focus_level=player_focus
            )
            
            # Use final multiplier (Axioms + Vectors)
            damage_mult = clash_result['final_multiplier']
            sim_score = clash_result['similarity']
            
            # Store detailed calculation logs for the UI
            battle['last_calc_log'] = clash_result.get('calc_details', [])
            
            # Log specific axiom events to main log
            for log_msg in clash_result.get('logs', []):
                self.log_event(log_msg)
            
            # Log for UI Radar
            if 'sim_history' not in battle: battle['sim_history'] = []
            battle['sim_history'].append(sim_score)
            if len(battle['sim_history']) > 20: battle['sim_history'].pop(0)

            # --- Base Damage Calculation ---
            base_dmg = self.mechanics.get("base_damage", 50)
            bond_mult = 1.0 + (active_card.get('bond', 0) * 0.2)
            
            total_dmg = base_dmg * bond_mult * damage_mult
            
            # GUARANTEED CHIP DAMAGE (Fix for 0 damage loops)
            total_dmg = max(1.0, total_dmg)
            
        else:
            # Fallback
            total_dmg = 50
            damage_mult = 1.0

        if active_card.get('type') == 'Heal':
            heal_amt = int(total_dmg)
            self.resources[self.RES_HP] = min(self.resources_max.get(self.RES_HP), self.resources.get(self.RES_HP, 0) + heal_amt)
            self.log_event(f"💚 {active_card['character_id']} healed {heal_amt}")
        else:
            battle["enemy_hp"] -= total_dmg
            self.log_event(f"💥 {active_card['character_id']} hits {int(total_dmg)} (Adv: {damage_mult:.2f}x)")

        if battle["enemy_hp"] <= 0:
            return self._resolve_victory(battle)

        # Enemy Attack
        enemy_dmg = 500 * self.active_battle['target']['difficulty'] * battle.get("scaling", 1.0)
        enemy_dmg *= (1.0 - (player_focus * 0.5)) 
        
        self.resources[self.RES_HP] -= enemy_dmg
        
        p_hp = max(0, int(self.resources.get(self.RES_HP, 0)))
        e_hp = max(0, int(battle["enemy_hp"]))
        self.log_event(f"🛡️ HP: {p_hp} | Enemy: {e_hp}")

        if self.resources[self.RES_HP] <= 0:
            self.trigger_reset()
            return ("DEFEAT", "Game Over Screen")

        return (f"Turn {battle['turn']}", f"{active_card['character_id']} attacking")

    def _resolve_victory(self, battle):
        self.active_battle = None
        self.current_phase = "STRATEGY"
        self.resources[self.RES_GOLD] += 200 
        self.log_event("🏆 Victory! Territory Liberated.")
        
        territory = battle["target"]
        
        # --- DATA DRIVEN STATUS RESET ---
        strat = self.config.get("grand_strategy", {})
        # progression = strat.get("status_progression", ["Neutral", "Contested", "Enemy"])
        allied_status = "Allied" # Hardcoded safe state for player owned
        
        territory["status"] = allied_status
        
        # Remove visual suffix if present
        suffix = strat.get("occupied_visual_suffix", "")
        if suffix and territory["desc"].endswith(suffix):
             territory["desc"] = territory["desc"][:-len(suffix)].strip()
        
        self._commit_memory(f"Liberated {territory['id']} from the {battle['enemy_entity']['character_id']}.", entities=[territory['id'], battle['enemy_entity']['character_id']], tags={'victory': 1.0})
        
        # --- CARD GET ---
        terr_vec = self.vectors.get(territory['id'], np.zeros(384))
        best_card = None
        best_score = -1.0
        owned_ids = set(c['character_id'] for c in self.inventory)
        
        for c in self.card_pool:
            if c['character_id'] in owned_ids: continue
            desc = " ".join(c.get('semantic_tags', [])) + " " + c.get('desc', '')
            c_vec = self._get_embedding(desc)
            score = self._calculate_vector_resonance(c_vec, terr_vec)
            if score > best_score:
                best_score = score
                best_card = c
        
        if best_card and best_score > 0.3:
            new_card = best_card.copy()
            new_card["uid"] = f"char_{new_card['character_id']}_{int(time.time())}"
            new_card["vector"] = self._get_embedding(new_card['desc']) 
            new_card["bond"] = 0 
            self.inventory.append(new_card)
            self.log_event(f"🃏 CARD GET: {new_card['character_id']} joined! (Resonance: {int(best_score*100)}%)")
            
        return ("Victory", "Victory pose")

    def trigger_farm(self):
        if not self.consume_ap(2): return None
        self.resources[self.RES_GOLD] += 100
        self.log_event(f"🚜 Farmed 100 {self.RES_GOLD}")
        return ("Farming", "Peaceful fields")
`