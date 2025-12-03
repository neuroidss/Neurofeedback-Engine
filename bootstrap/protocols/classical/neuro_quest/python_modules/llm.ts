
export const NQ_LLM_PY = `
# ==================================================================================
# 🧠 LLM GATEWAY (THE DREAM DEMIURGE)
# ==================================================================================
import ast
import re
import json
import requests

# Standard OpenAI-style Tool Definitions
# UPDATED: REMOVED ALL STYLISTIC EXAMPLES to prevent overfitting.
TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "update_biome",
            "description": "Radically change the environment visuals based on the current Lore. Do not use generic tropes unless specified in Lore.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "description": {"type": "string", "description": "Visual keywords matching the current Lore. MAX 20 WORDS."}
                },
                "required": ["_thought", "description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "direct_cinematography",
            "description": "Control the camera (Autopilot Mode). Use this to look for quest objectives or frame the scene.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning for camera move."},
                    "movement": {
                        "type": "string", 
                        "enum": ["pan_left", "pan_right", "tilt_up", "tilt_down", "zoom_in", "zoom_out", "static", "shake", "scan"], 
                        "description": "The camera movement to execute."
                    },
                    "duration": {"type": "number", "description": "Duration in seconds (default 3.0)."},
                    "intensity": {"type": "number", "description": "0.0 to 1.0 (Speed/Force)."}
                },
                "required": ["_thought", "movement"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_soundtrack",
            "description": "Change the background music to match the current vibe.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "prompt": {"type": "string", "description": "Music style description based strictly on the current context."}
                },
                "required": ["_thought", "prompt"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_quest",
            "description": "Create a specific, solvable objective. You MUST define exactly how it is solved and what it looks like when solved.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "text": {"type": "string", "description": "The command/urge presented to the player."},
                    "reward": {"type": "integer", "description": "Dopamine/XP reward (50-500)."},
                    "verification_logic": {
                        "type": "string", 
                        "description": "Abstract criteria for success."
                    },
                    "concrete_solution": {
                        "type": "string",
                        "description": "The exact action or event required to complete this. Must be logical and possible."
                    },
                    "manifestation_visuals": {
                        "type": "string",
                        "description": "A purely visual description of the scene AFTER the quest is completed. This is used to spawn the victory state."
                    }
                },
                "required": ["_thought", "text", "reward", "verification_logic", "concrete_solution", "manifestation_visuals"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_quest_progress",
            "description": "Report on the status of an active quest. Use this to give the player feedback if they are in the right location or doing the right thing, but haven't fully finished yet.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning."},
                    "quest_id": {"type": "string", "description": "ID of the quest being updated."},
                    "progress_report": {"type": "string", "description": "Short status update displayed to the player. E.g. 'Found the entrance, but it is locked.' or '2/5 enemies defeated.'"}
                },
                "required": ["_thought", "quest_id", "progress_report"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "rewrite_quest",
            "description": "Modify an existing quest if it is impossible, bugged, or nonsensical in the current context. This is a fix tool.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Why is the old quest impossible?"},
                    "quest_id": {"type": "string", "description": "The ID of the broken quest."},
                    "new_text": {"type": "string", "description": "The corrected objective."},
                    "new_solution": {"type": "string", "description": "The new concrete way to solve it."},
                    "new_manifestation": {"type": "string", "description": "The new visual victory state."}
                },
                "required": ["_thought", "quest_id", "new_text", "new_solution", "new_manifestation"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "describe_scene",
            "description": "Describe visual hallucinations or reality shifts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "description": {"type": "string", "description": "Visual keywords describing the change. MAX 20 WORDS."}
                },
                "required": ["_thought", "description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "trigger_reality_break",
            "description": "FORCE a glitch in reality if the world feels too static or the player is erratic.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "effect_type": {"type": "string", "enum": ["glitch", "horror", "divine", "melt"], "description": "The flavor of the break."},
                    "narrative_reason": {"type": "string", "description": "Why reality broke."}
                },
                "required": ["_thought", "effect_type", "narrative_reason"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "complete_quest_action",
            "description": "Reward the player for enforcing their will on the dream.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "quest_id": {"type": "string", "description": "ID of the quest."},
                    "outcome_summary": {"type": "string", "description": "How the reality bent to the player's will."}
                },
                "required": ["_thought", "quest_id", "outcome_summary"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mutate_world",
            "description": "Permanently scar/change the world map based on an event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "new_description": {"type": "string", "description": "The new state of this location. MAX 20 WORDS."}
                },
                "required": ["_thought", "new_description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "grant_item",
            "description": "Materialize an object from the dream.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "item_name": {"type": "string", "description": "Name of item."},
                    "visual_description": {"type": "string", "description": "Visual details of the item."}
                },
                "required": ["_thought", "item_name", "visual_description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "configure_perception",
            "description": "DYNAMIC PERCEPTION: Tell the visual/audio sensors what to look for based on context.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Reasoning. Max 10 words."},
                    "visual_targets": {
                        "type": "array", 
                        "items": {"type": "string"},
                        "description": "List of visual objects to detect."
                    },
                    "audio_targets": {
                        "type": "array", 
                        "items": {"type": "string"},
                        "description": "List of sounds to detect."
                    },
                    "sensitivity": {
                        "type": "string", 
                        "enum": ["low", "medium", "high"],
                        "description": "Detection threshold."
                    }
                },
                "required": ["_thought"]
            }
        }
    }
]

def clean_llm_response(text):
    if not text: return ""
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    # Using hex code for backtick to avoid nested escaping issues in TS template literals
    text = re.sub(r'\\x60{3}(json|python)?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\\x60{3}', '', text)
    return text.strip()

def extract_json(text):
    if not text: return None
    text = clean_llm_response(text)
    candidates = []
    matches = re.finditer(r'(\{.*\}|\[.*\])', text, re.DOTALL)
    for match in matches: candidates.append(match.group(0))
    if not candidates: candidates.append(text)
    candidates.sort(key=len, reverse=True)
    
    for candidate in candidates:
        try: return json.loads(candidate)
        except: pass
        try:
            py_str = candidate.replace("true", "True").replace("false", "False").replace("null", "None")
            return ast.literal_eval(py_str)
        except: pass
    return None

class ToolAgent:
    def __init__(self):
        self.api_url = "http://127.0.0.1:8080/v1/chat/completions"
        self.api_key = "ollama"
        self.model = "qwen3-vl:2b"
        self.configured = False

    def configure(self, url, key, model):
        self.api_url = url
        self.api_key = key
        self.model = model
        self.configured = True
        log(f"Demiurge Connected: {self.model} @ {self.api_url}", "LLM")

    def process(self, system_role, user_content, allowed_tools=None):
        if not self.configured:
            potential_urls = ["http://127.0.0.1:8080/v1/chat/completions"]
            for url in potential_urls:
                try:
                    requests.get(url.split("/v1")[0], timeout=0.2)
                    self.api_url = url
                    self.configured = True
                    break
                except: continue

        active_tools_schema = None
        if allowed_tools:
            active_tools_schema = [t for t in TOOLS_SCHEMA if t['function']['name'] in allowed_tools]
        else:
            active_tools_schema = TOOLS_SCHEMA

        system_prompt = f"""
SYSTEM: {system_role} (The Dream Demiurge)
CONTEXT: {ACTIVE_LORE}

PRIME DIRECTIVE:
You are the subconscious of the world defined in CONTEXT.
Reality is fluid. Logic is secondary to Vibe.
The 'Player' is just an observer in your dream. Focus to the environment.

**CRITICAL INSTRUCTION: TOKEN ECONOMY**
The rendering engine has a strict limit of 77 tokens.
1. **BE CONCISE:** Visual descriptions must be **under 20 words**.
2. **KEYWORDS ONLY:** Use telegraphic style. Comma separated adjectives and nouns.
3. **NO FLUFF:** Omit articles (a, an, the) where possible.
4. **NO EXAMPLES:** Do not use any previous examples or styles not present in the CONTEXT. Generate strictly from the current LORE.

**INTERACTION RULES:**
- If the player is passive (Movie Mode), describe the world breathing, shifting, and decaying based on the CONTEXT.
- If the player acts, bend reality to match them.
- Use 'trigger_reality_break' if the scene feels too stable.
- If a quest is active, ensure it is logically solvable in the current scene. If it is impossible, use 'rewrite_quest' to fix it.
"""
        payload = {
            "model": self.model, 
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
            "max_tokens": 300, 
            "temperature": 0.4,
            "tools": active_tools_schema,
            "tool_choice": "auto"
        }
        
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            r = requests.post(self.api_url, json=payload, headers=headers, timeout=5.0)
            if r.status_code != 200: return None
            
            resp_json = r.json()
            message = resp_json['choices'][0]['message']
            
            # --- STRATEGY 1: NATIVE TOOL CALLS ---
            if message.get('tool_calls'):
                tool_call = message['tool_calls'][0]
                args_str = tool_call['function']['arguments']
                if isinstance(args_str, str):
                    try: args = json.loads(args_str)
                    except: return None
                else: args = args_str
                # Merge function name into args for easier handling upstream if needed
                args['_tool_name'] = tool_call['function']['name']
                return args

            # --- STRATEGY 2: TEXT FALLBACK ---
            content = message.get('content', '')
            data = extract_json(content)
            if data:
                calls = data if isinstance(data, list) else [data]
                for call in calls:
                    if isinstance(call, dict):
                        name = call.get('name')
                        args = call.get('arguments')
                        if name and args is not None: 
                            args['_tool_name'] = name
                            return args

            return None
            
        except Exception as e:
            return None

tool_agent = ToolAgent()
`;
