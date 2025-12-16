
export const NQ_LORE_PY = `
# ==================================================================================
# 📜 SEMANTIC CARTRIDGES (GAME DEFINITIONS)
# ==================================================================================

GAMES = {
    "RANCE_10_MODE": {
        "title": "Operation: Rance 10 (Loop)",
        "start_prompt": "A tactical war room map of the floating continent, miniature flags representing humanity's last stand against the demon army, high fantasy, detailed, 8k",
        "atmosphere": "Desperation, Heroism, Dark Fantasy, Anime, Grand Strategy",
        
        "asset_map": {
            "Rance": "assets/rance10/rance_ref.png",
            "Sill Plain": "assets/rance10/sill_ref.png",
            "Kentaro": "assets/rance10/kentaro_ref.png",
            "Miki": "assets/rance10/miki_ref.png"
        },
        
        "grand_strategy": {
            "invader_name": "Demon Army",
            "home_base_id": "Monster Realm",
            "invasion_chance": 0.6,
            "status_progression": ["Neutral", "Contested", "Enemy"],
            "occupied_visual_suffix": " [OCCUPIED BY DEMONS]",
            "invasion_log": "🚨 INVASION! The {invader} marches on {target}!",
            "fall_log": "💀 CITY FALLEN! {target} has been conquered by the {invader}!",
            
            # --- SEMANTIC TAGGING STRATEGY ---
            # Kayblis is "System Authority".
            # Normal Weapons are "Physical". (Orthogonal to System -> No Damage).
            # Chaos is "System Crash". (Opposite to System -> Critical Damage).
            
            "occupied_boss_pool": [
                {"id": "Demon General Xavier", "desc": "A high-ranking apostle. Uses dark magic and gravity.", "tags": "Demon, Dark, Magic, Apostle"},
                {"id": "Demon General Nosferatu", "desc": "The Vampire Lord. Regenerates health, steals life.", "tags": "Vampire, Blood, Undead, Night"},
                {"id": "Demon General Kessel", "desc": "Massive brute strength. Crushes armor.", "tags": "Giant, Strength, Armor, Physical"},
                {"id": "Kayblis", "desc": "The Demon King. Absolute power, invincible field, despair.", "tags": "Demon King, System Authority, Absolute Order, Immutable Law, Fire"}
            ],
            "occupied_visual_signature": "Demonic Armor, Red Eyes, Dark Aura, Horns"
        },

        # --- THE LAWS OF PHYSICS (DIMENSIONS) ---
        # The Engine creates axes from these pairs.
        # Entities projected on these axes interact.
        "physics_laws": [
            ["System Authority", "System Crash"],    # The "Invincible Field" Axis
            ["Physical Matter", "Ethereal Ghost"],   # The "Physical Immunity" Axis
            ["Fire Heat", "Ice Cold"]                # Elemental Axis
        ],

        "mechanics": {
            "turn_duration": 4.0, 
            "base_damage": 150, 
            "resources": {
                "Humanity": {"start": 3000, "max": 10000, "icon": "🛡️"}, 
                "Gold":     {"start": 500, "icon": "💰"},
                "AP":       {"start": 6, "max": 8, "icon": "⚡"}, 
                "CP":       {"start": 0, "icon": "💎", "meta": True} 
            },
            "factions": ["Human Alliance", "Demon Army", "Dark Gods"],
            "difficulty_ramp": 0.3, 
            "social_multiplier": 3.0 
        },

        "meta_perks": [
            {"id": "xp_boost", "name": "Hyper-Learning", "cost": 1, "effect": "xp_gain_50", "desc": "Gain 50% more XP. Adapt faster to the demon vectors."},
            {"id": "start_sil", "name": "Ice Mage Support", "cost": 2, "effect": "unlock_card_sill", "desc": "Sill Plain joins immediately. High resonance with Order."},
            {"id": "limit_break", "name": "Population Boom", "cost": 5, "effect": "max_troops_up", "desc": "Humanity starts at +10,000. Essential for long runs."},
            {"id": "routes_revealed", "name": "Chaos Eye", "cost": 3, "effect": "reveal_bosses", "desc": "See the exact semantic weakness of Demon Generals."}
        ],

        "social_interactions": [
            { "id": "dinner", "name": "Food Ticket", "cost_ap": 1, "limit_per_turn": 5, "effect": "heal_troops_bond", "desc": "Distribute rations. Small Heal." },
            { "id": "h_scene", "name": "Deep Connection", "cost_ap": 2, "limit_per_turn": 1, "effect": "unlock_skill", "desc": "A moment of vulnerability. Synchronize vectors." },
            { "id": "training", "name": "Sparring", "cost_ap": 1, "limit_per_turn": 5, "effect": "xp_up", "desc": "Sharpen skills against the looming darkness." }
        ],

        "start_deck": [
            {
                "uid": "rance_lord_01",
                "character_id": "Rance",
                "variant_name": "The Hero",
                "rank": "UR", 
                "type": "Warrior", 
                "desc": "A chaotic but effective leader. Wields the demon sword Chaos. High physical attack, absolute confidence.",
                "semantic_tags": ["System Crash", "Glitch", "Chaos", "Rule Breaker", "Entropy"], 
                "visual_signature": "Green Armor, Demon Sword",
                "troops": 500,
                "bond": 0
            }
        ],

        "card_pool": [
            {
                "character_id": "Sill Plain", 
                "variant_name": "Absolute Zero", 
                "rank": "SSR", 
                "type": "Mage", 
                "desc": "Loyal ice mage. Protective, healing, calm demeanor.",
                "semantic_tags": ["Ice Cold", "Heal", "Protection", "Loyalty", "Calm", "Magic"],
                "visual_signature": "Blizzard, White Robe"
            },
            {
                "character_id": "Rick", 
                "variant_name": "General", 
                "rank": "SSR", 
                "type": "Knight", 
                "desc": "The strongest swordsman of Leazas. Honor, speed, precision.",
                "semantic_tags": ["Physical Matter", "Honor", "Sword", "Speed", "Knight", "Order"],
                "visual_signature": "Red Armor, Rapier"
            },
            {
                "character_id": "Magic", 
                "variant_name": "Zeth Queen", 
                "rank": "SSR", 
                "type": "Mage", 
                "desc": "Queen of the Magic Kingdom. Powerful offensive magic, lightning.",
                "semantic_tags": ["Magic", "Lightning", "Thunder", "Queen", "Intellect", "System"],
                "visual_signature": "Blue Dress, Lightning Staff"
            }
        ],

        "territories": [
            {
                "id": "Leazas", 
                "status": "Allied", 
                "difficulty": 0.1, 
                "desc": "The green kingdom. Rolling plains, massive stone castles, wealth, knights.",
                "semantic_anchor": "Order, Nature, Wealth, Defense, Knight"
            },
            {
                "id": "Helman", 
                "status": "Contested", 
                "difficulty": 0.6, 
                "desc": "The northern empire. Snow, mountains, steel, poverty, brutal warriors.",
                "semantic_anchor": "Cold, War, Iron, Revolution, Ice"
            },
            {
                "id": "Zeth", 
                "status": "Neutral", 
                "difficulty": 0.5, 
                "desc": "The magic kingdom. Floating islands, mage supremacy, golems.",
                "semantic_anchor": "Magic, Sky, Intellect, Construct, Lightning"
            },
            {
                "id": "Japan", 
                "status": "Neutral", 
                "difficulty": 0.6, 
                "desc": "The eastern island. Cherry blossoms, samurai, shrines, youkai.",
                "semantic_anchor": "Spirit, Blade, Flower, Tradition, Samurai"
            },
            {
                "id": "Free Cities", 
                "status": "Contested", 
                "difficulty": 0.4, 
                "desc": "Alliance of diverse states. Markets, mercenaries, chaos, deserts.",
                "semantic_anchor": "Trade, Sand, Diversity, Money, Mercenary"
            },
            {
                "id": "Monster Realm", 
                "status": "Enemy", 
                "difficulty": 3.0, 
                "boss_id": "Kayblis", 
                "desc": "The domain of demons. Lava, obsidian spikes, red skies, absolute despair.",
                "semantic_anchor": "Evil, Fire, Death, Chaos, Darkness, Demon King"
            }
        ],
        "global_forces": {}
    },
    
    "SCP_MODE": {
        "title": "Protocol: Echoes of Silence",
        "start_prompt": "A sterile containment facility corridor, flickering lights, black liquid leaking, horror",
        "atmosphere": "Clinical, Terrifying, Scientific",
        "grand_strategy": {
            "invader_name": "The Anomaly",
            "home_base_id": "The Staircase",
            "invasion_chance": 0.5,
            "status_progression": ["Safe", "Euclid", "Keter"],
            "occupied_visual_suffix": " [CONTAINMENT BREACH]",
            "invasion_log": "🚨 BREACH: {invader} in {target}!",
            "fall_log": "💀 SITE LOST! {target} is now a {invader} Nest!",
            "occupied_boss_pool": [
                {"id": "SCP-682", "desc": "Hard-to-Destroy Reptile.", "tags": "Reptile, Adaptive, Indestructible, Rage, Absolute Biology"},
                {"id": "The Shy Guy", "desc": "Unstoppable force when viewed.", "tags": "Rage, Speed, Unstoppable, Face"}
            ],
            "occupied_visual_signature": "Glitch, Rot, Darkness"
        },
        "physics_laws": [
            ["Biological Matter", "Chemical Acid"],
            ["Visual Cognition", "Blindness"]
        ],
        "mechanics": {
            "turn_duration": 5.0, 
            "base_damage": 100, 
            "resources": { "Sanity": {"start": 100}, "Power": {"start": 5} },
            "factions": ["Foundation", "Anomaly"],
            "difficulty_ramp": 0.2
        },
        "start_deck": [
            {
                "uid": "researcher_01", "character_id": "Dr. Clef", "rank": "UR", "type": "Specialist", 
                "desc": "Reality bender killer.", "semantic_tags": ["Deception", "Shotgun", "Reality", "Chemical Acid"],
                "bond": 0
            }
        ],
        "card_pool": [],
        "territories": [],
        "global_forces": {}
    }
}

LORE_PRESETS = GAMES
`;
