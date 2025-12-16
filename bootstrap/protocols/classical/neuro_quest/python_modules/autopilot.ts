
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
    """
    def __init__(self, physics_engine):
        self.physics = physics_engine
        self.active = False
        
        # --- SIMULATED CNS (Central Nervous System) ---
        self.focus_level = 0.5
        self.fatigue = 0.0
        
        self.last_decision_time = 0
        self.decision_interval = 0.1 # DEMO MODE: Hyper-fast decisions (was 4.0)
        self.is_thinking = False

    def engage(self):
        self.active = True
        print("[Autopilot] 👻 Ghost Director (LLM) connected. Accessing Akashic Records...", flush=True)

    def disengage(self):
        self.active = False
        print("[Autopilot] 👻 Ghost Director disconnected.", flush=True)

    def update(self, dt):
        if not self.active: return None
        
        # 1. Physical Simulation (Always running for movement smoothing)
        chaos_vector = None
        for fvec, fpow in self.physics.global_forces:
             chaos_vector = fvec
             break
        chaos_level = 0.0
        if chaos_vector is not None:
            chaos_level = np.dot(self.physics.world_atmosphere, chaos_vector)
            
        self._simulate_neuro_dynamics(chaos_level, dt)
        
        # 2. Strategic Mind (LLM) - The "Cheat" Brain
        # Only runs periodically to save tokens and allow animations to play out
        meta_action = None
        
        if self.physics.game_logic and not self.is_thinking:
            logic = self.physics.game_logic
            
            # FORCE DECISION if we are stuck in Strategy Phase
            if logic.current_phase == "STRATEGY" and (time.time() - self.last_decision_time > self.decision_interval):
                self.is_thinking = True
                try:
                    current_ap = logic.resources.get("AP", 0)
                    max_ap = logic.resources_max.get("AP", 4)
                    
                    # --- CRITICAL PATCH: AUTO-END TURN LOGIC ---
                    if current_ap < 2:
                        print(f"[Ghost] ⚠️ Low AP ({current_ap}). Forcing End Turn.", flush=True)
                        meta_action = "end_turn"
                        
                        # Execute immediately to skip LLM
                        result = logic.end_turn()
                        if result:
                            self.physics.current_visual_prompt = result[1]
                            self.physics.is_new_scene = True
                        
                        # Set a slightly longer delay after ending turn to allow state updates
                        self.last_decision_time = time.time() + 0.5
                    
                    else:
                        # AP is sufficient. Consult the Brain.
                        decision = self._consult_strategic_mind(logic)
                        
                        # --- SAFEGUARD: Prevent Turn Skipping Loop ---
                        # If the brain returns None or invalid, AND we have Max AP, force an action.
                        if (not decision or not decision.get("action_type")) and current_ap >= max_ap:
                             print(f"[Ghost] ⚠️ Stalled with MAX AP. Forcing Social Action.", flush=True)
                             # Force a social interaction with the first card to burn AP
                             if logic.inventory:
                                 decision = {"action_type": "social", "target_id": logic.inventory[0]['character_id']}
                             else:
                                 # If no cards, force farm?
                                 decision = {"action_type": "farm"}

                        if decision:
                            meta_action = decision.get("action_type")
                            target = decision.get("target_id")
                            
                            thought = decision.get('_thought', 'No reasoning provided.')
                            print(f"[Ghost] 🧠 DECISION: {meta_action} -> {target} ({thought})", flush=True)
                            
                            if meta_action == "battle":
                                 # Logic handles auto-targeting if target_id is null/invalid
                                 pass
                                 
                            if meta_action == "social":
                                 card = next((c for c in logic.inventory if c['character_id'] == target), None)
                                 if card:
                                     # Prefer 'dinner' for healing/efficiency
                                     logic.trigger_social(card['uid'], 'dinner') 
                                     meta_action = None 

                            if meta_action == "farm":
                                logic.trigger_farm()
                                meta_action = None

                            if meta_action == "buy_perk":
                                logic.buy_perk(target)
                                meta_action = None
                            
                            self.last_decision_time = time.time()
                except Exception as e:
                    print(f"[Ghost] Brain Freeze: {e}", flush=True)
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
            action = "attack" # Speedrun mode: Aggression

        # 4. Movement Vector
        move_vec = self._calculate_movement(chaos_vector)

        return {
            "move_vec": move_vec,
            "action": action,
            "meta_action": meta_action,
            "eeg_focus": self.focus_level,
            "is_ghost": True
        }
        
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
        """
        Constructs a prompt containing Game State + Hidden Lore Rules + Memory.
        """
        if not tool_agent.configured: return None
        
        # UNIVERSAL RESOURCE LOOKUP (Fix for SCP Mode Crash)
        hp_key = logic.RES_HP
        hp_cur = logic.resources.get(hp_key, 0)
        hp_max = logic.resources_max.get(hp_key, 100)
        
        res = logic.resources
        inv = [f"{c['character_id']} (Bond: {c.get('bond', 0)})" for c in logic.inventory]
        
        territories = [
            f"{t['id']} (Diff: {t['difficulty']}, Status: {t['status']}, Anchor: {t.get('semantic_anchor','')})" 
            for t in logic.territories if t['status'] != 'Allied'
        ]
        
        rules = logic.config.get("semantic_rules", [])
        rules_desc = json.dumps(rules, indent=2)
        
        memory_context = "No previous memories."
        if hasattr(logic.db, 'akashic_ref') and logic.db.akashic_ref:
            mems = logic.db.akashic_ref.retrieve("Battle Strategy Defeat Victory Weakness")
            if mems:
                memory_context = "\\n".join([m.content for m in mems])

        prompt = f"""
        ROLE: You are the Ghost Player, a TAS (Tool-Assisted Speedrun) AI.
        GOAL: Win the game efficiently. 
        
        STATE:
        - {hp_key}: {hp_cur}/{hp_max}
        - AP: {res.get('AP')}
        - Cards: {inv}
        - Enemies: {json.dumps(territories)}
        
        HIDDEN SEMANTIC PHYSICS (EXPLOIT THESE):
        {rules_desc}
        
        MEMORY OF PAST RUNS:
        {memory_context}
        
        INSTRUCTIONS:
        1. If AP is low (<2), END TURN.
        2. If {hp_key} is critical (<20%), use SOCIAL (Heal).
        3. If there is a unit with Bond 0 (New Recruit), use SOCIAL to integrate them.
        4. OTHERWISE, ATTACK. Pick the Enemy that is WEAKEST to your current Cards based on Semantic Rules.
           - Example: If Enemy has "Invincible Field", you MUST have a "Chaos Sword" (Rance) or "Breaker".
           - If you don't have the counter, recruit/bond with someone who does.
           - DO NOT attack a hard target without a counter. Use SOCIAL/FARM instead to build strength.
        
        DECISION:
        """
        
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
`
