
export const NQ_AUTOPILOT_PY = `
import time
import numpy as np
import math
import random
import json
# tool_agent is assumed global

class GhostPlayer:
    """
    LLM-Driven Autopilot. 
    It plays the game like a "Speedrunner" trying to create a 2-minute movie.
    It reads hidden semantic rules to exploit weaknesses.
    
    RESILIENCE UPGRADE: Includes Heuristic Fallback if LLM is offline.
    """
    def __init__(self, physics_engine):
        self.physics = physics_engine
        self.active = False
        
        # --- SIMULATED CNS (Central Nervous System) ---
        self.focus_level = 0.5
        self.fatigue = 0.0
        
        self.last_decision_time = 0
        self.decision_interval = 0.1 # Hyper-fast checks
        self.is_thinking = False

    def engage(self):
        self.active = True
        print("[Autopilot] 👻 Ghost Director connected.", flush=True)

    def disengage(self):
        self.active = False
        print("[Autopilot] 👻 Ghost Director disconnected.", flush=True)

    def update(self, dt):
        if not self.active: return None
        
        # 1. Physical Simulation
        chaos_vector = None
        for fvec, fpow in self.physics.global_forces:
             chaos_vector = fvec
             break
        chaos_level = 0.0
        if chaos_vector is not None:
            chaos_level = np.dot(self.physics.world_atmosphere, chaos_vector)
            
        self._simulate_neuro_dynamics(chaos_level, dt)
        
        # 2. Strategic Mind (Hybrid AI/Heuristic)
        meta_action = None
        
        if self.physics.game_logic and not self.is_thinking:
            logic = self.physics.game_logic
            
            # Decide if we need to act
            if logic.current_phase == "STRATEGY" and (time.time() - self.last_decision_time > self.decision_interval):
                self.is_thinking = True
                try:
                    current_ap = logic.resources.get("AP", 0)
                    max_ap = logic.resources_max.get("AP", 4)
                    
                    # A. CRITICAL INTERRUPT: Low AP -> End Turn
                    if current_ap < 2:
                        meta_action = "end_turn"
                        result = logic.end_turn()
                        if result:
                            self.physics.current_visual_prompt = result[1]
                            self.physics.is_new_scene = True
                        self.last_decision_time = time.time() + 0.5
                    
                    else:
                        # B. CONSULT LLM
                        decision = self._consult_strategic_mind(logic)
                        
                        # C. HEURISTIC FALLBACK (If LLM is offline/slow)
                        if not decision:
                            decision = self._heuristic_strategy(logic)
                            if decision: 
                                decision['_thought'] = "Heuristic Fallback"

                        # D. EXECUTE DECISION
                        if decision:
                            meta_action = decision.get("action_type")
                            target = decision.get("target_id")
                            thought = decision.get('_thought', 'Instinct.')
                            
                            # Only log if it's a real action to avoid spam
                            if meta_action:
                                print(f"[Ghost] 🧠 ACT: {meta_action} -> {target} ({thought})", flush=True)
                            
                            if meta_action == "battle":
                                 # Logic handles auto-targeting if target_id is null/invalid
                                 result = logic.trigger_battle(target)
                                 if result:
                                     self.physics.current_visual_prompt = result[1]
                                     self.physics.is_new_scene = True
                                 
                            if meta_action == "social":
                                 card = next((c for c in logic.inventory if c['character_id'] == target), None)
                                 if card:
                                     logic.trigger_social(card['uid'], 'dinner') 

                            if meta_action == "farm":
                                logic.trigger_farm()

                            if meta_action == "buy_perk":
                                logic.buy_perk(target)
                            
                            self.last_decision_time = time.time() + 1.0 # Add delay after action
                except Exception as e:
                    print(f"[Ghost] Error: {e}", flush=True)
                finally:
                    self.is_thinking = False
                    
            # --- HANDLE GAME OVER ---
            elif logic.game_over and (time.time() - self.last_decision_time > self.decision_interval):
                self.is_thinking = True
                try:
                    self._handle_game_over(logic)
                    self.last_decision_time = time.time()
                finally:
                    self.is_thinking = False

        # 3. Combat Micro-Control (If in Battle)
        action = None
        if self.physics.game_logic and self.physics.game_logic.current_phase == "BATTLE":
            action = "attack" # Aggressive

        # 4. Movement Vector
        move_vec = self._calculate_movement(chaos_vector)

        return {
            "move_vec": move_vec,
            "action": action,
            "meta_action": meta_action,
            "eeg_focus": self.focus_level,
            "is_ghost": True
        }
        
    def _heuristic_strategy(self, logic):
        """
        Rule-based logic when LLM is unavailable.
        """
        hp = logic.resources.get(logic.RES_HP, 0)
        max_hp = logic.resources_max.get(logic.RES_HP, 100)
        ap = logic.resources.get("AP", 0)
        
        # 1. Heal if critical
        if hp < (max_hp * 0.3) and logic.inventory:
            return {"action_type": "social", "target_id": logic.inventory[0]['character_id']}
            
        # 2. Buy Perks if rich
        cp = logic.resources.get("CP", 0)
        if cp > 5:
             perk = next((p for p in logic.config.get("meta_perks", []) if p['id'] not in logic.active_perks), None)
             if perk: return {"action_type": "buy_perk", "target_id": perk['id']}
             
        # 3. Recruit/Bond if weak deck
        if len(logic.inventory) < 2 and ap >= 2:
             # Try to trigger event? Or just farm to find cards?
             return {"action_type": "farm"}
             
        # 4. Default: ATTACK
        # Find easiest target
        valid_targets = [t for t in logic.territories if t['status'] != 'Allied']
        if valid_targets:
            # Sort by difficulty
            valid_targets.sort(key=lambda t: t['difficulty'])
            return {"action_type": "battle", "target_id": valid_targets[0]['id']}
            
        # 5. Farm if nothing else
        return {"action_type": "farm"}

    def _handle_game_over(self, logic):
        # 1. Buy Perks
        available_cp = logic.resources.get("CP", 0)
        pool = logic.config.get("meta_perks", [])
        owned = logic.active_perks
        
        # Greedy buy
        for perk in pool:
            if perk['id'] not in owned and available_cp >= perk['cost']:
                print(f"[Ghost] 💎 Buying Meta-Perk: {perk['name']}", flush=True)
                logic.buy_perk(perk['id'])
                available_cp -= perk['cost']
        
        # 2. Restart
        print("[Ghost] 🔄 Restarting Timeline...", flush=True)
        current_config = logic.config
        logic.init_run(current_config)
        self.physics.is_new_scene = True
        self.physics.current_visual_prompt = current_config.get("start_prompt", "Restarting...")

    def _consult_strategic_mind(self, logic):
        if not tool_agent.configured: return None
        
        hp_key = logic.RES_HP
        hp_cur = logic.resources.get(hp_key, 0)
        hp_max = logic.resources_max.get(hp_key, 100)
        res = logic.resources
        
        prompt = f"""
        STATE: {hp_key}: {hp_cur}/{hp_max}, AP: {res.get('AP')}
        GOAL: Win efficiently.
        """
        
        # Reduced prompt complexity to save tokens and time
        args = tool_agent.process("Ghost Director", [{"type":"text", "text":prompt}], allowed_tools=['decide_heroic_action'])
        return args

    def _simulate_neuro_dynamics(self, stress_factor, dt):
        target = 0.8 
        self.focus_level += (target - self.focus_level) * 0.1 * dt
        self.focus_level = max(0.01, min(0.99, self.focus_level))

    def _calculate_movement(self, chaos_vector):
        move = np.zeros(384)
        t = time.time()
        move[0] = math.cos(t) * 0.5
        move[1] = math.sin(t) * 0.5
        if chaos_vector is not None:
             move += chaos_vector * 0.2
        return move
`;
