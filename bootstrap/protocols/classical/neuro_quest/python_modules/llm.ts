
export const NQ_LLM_PY = `
# ==================================================================================
# 🧠 LLM GATEWAY
# ==================================================================================
import ast
import re
import json
import requests

# Standard OpenAI-style Tool Definitions (JSON Schema)
# This format is natively understood by Qwen, Llama 3, Mistral, etc.
TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "update_biome",
            "description": "Describe a new area/biome when the player travels. Max 30 words.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Visual description of the new environment."}
                },
                "required": ["description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_quest",
            "description": "Create a new Scientific Hypothesis (Quest) for the player to verify.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {"type": "string", "description": "The hypothesis/quest instruction presented to the player."},
                    "reward": {"type": "integer", "description": "Data/XP reward (50-100)."},
                    "verification_logic": {
                        "type": "string", 
                        "description": "HIDDEN CONTROL: The specific scientific criteria to verify this hypothesis. E.g. 'Player must trigger INTERACT on the artifact OR achieve >80% Focus.' Used by the Judge to prevent impossible quests."
                    }
                },
                "required": ["text", "reward", "verification_logic"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "describe_scene",
            "description": "Describe the visual scene based on input. Max 30 words.",
            "parameters": {
                "type": "object",
                "properties": {
                    "description": {"type": "string", "description": "Concise visual description."}
                },
                "required": ["description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_quest_progress",
            "description": "Update a quest's status text (e.g. 'Found 1/3 items').",
            "parameters": {
                "type": "object",
                "properties": {
                    "quest_id": {"type": "string", "description": "ID of the quest to update."},
                    "new_description": {"type": "string", "description": "New status text."}
                },
                "required": ["quest_id", "new_description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "complete_quest_action",
            "description": "Validate the hypothesis and complete the quest.",
            "parameters": {
                "type": "object",
                "properties": {
                    "quest_id": {"type": "string", "description": "ID of the quest to complete."},
                    "outcome_summary": {"type": "string", "description": "Summary of the verification event."}
                },
                "required": ["quest_id", "outcome_summary"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "mutate_world",
            "description": "Permanently change the world description after a major event.",
            "parameters": {
                "type": "object",
                "properties": {
                    "new_description": {"type": "string", "description": "The new description of the current biome."}
                },
                "required": ["new_description"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_summary",
            "description": "Write a narrative summary of the session.",
            "parameters": {
                "type": "object",
                "properties": {
                    "summary_text": {"type": "string", "description": "One sentence summary."}
                },
                "required": ["summary_text"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "grant_item",
            "description": "Give the player an item. REQUIRED when finding loot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string", "description": "Name of item."},
                    "visual_description": {"type": "string", "description": "Visual details for icon generation."}
                },
                "required": ["item_name", "visual_description"]
            }
        }
    }
]

def clean_llm_response(text):
    if not text: return ""
    # Remove thinking blocks (DeepSeek/R1)
    text = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL)
    # Remove markdown code blocks
    text = re.sub(r'\`{3}(json|python)?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\`{3}', '', text)
    return text.strip()

def extract_json(text):
    if not text: return None
    text = clean_llm_response(text)
    
    candidates = []
    # 1. Regex Scan for JSON objects/arrays
    matches = re.finditer(r'(\{.*\}|\[.*\])', text, re.DOTALL)
    for match in matches:
        candidates.append(match.group(0))
        
    if not candidates: candidates.append(text)
    
    # Sort by length descending (Greedy match)
    candidates.sort(key=len, reverse=True)
    
    for candidate in candidates:
        try:
            return json.loads(candidate)
        except: pass
        try:
            # Python literal fallback (for single quotes)
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
        log(f"Agent Configured: {self.model} @ {self.api_url}", "LLM")

    def process(self, system_role, user_content, allowed_tools=None):
        if not self.configured:
            potential_urls = [
                "http://127.0.0.1:8080/v1/chat/completions",
#                "http://127.0.0.1:11434/v1/chat/completions"
            ]
            for url in potential_urls:
                try:
                    base = url.split("/v1")[0]
                    requests.get(base, timeout=0.2)
                    self.api_url = url
                    self.configured = True
                    log(f"Auto-detected LLM at {url}", "LLM")
                    break
                except: continue

        # --- Filter Tools ---
        # Only pass the schema for tools that are allowed in this context
        active_tools_schema = None
        if allowed_tools:
            active_tools_schema = [t for t in TOOLS_SCHEMA if t['function']['name'] in allowed_tools]
        else:
            active_tools_schema = TOOLS_SCHEMA

        system_prompt = f"""
SYSTEM: {system_role}
CONTEXT: {ACTIVE_LORE}

INSTRUCTIONS:
You are a Game Master AI running a Scientific Discovery Engine.
Your goal is to generate and validate falsifiable hypotheses (Quests).
Use the provided tools to update the game state based on the user's action.
If a tool matches the action, CALL IT.
Do NOT output narrative text if a tool call covers the event.
"""
        log_content = str(user_content)
        
        payload = {
            "model": self.model, 
            "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
            "max_tokens": 300, 
            "temperature": 0.1,
            # PASS NATIVE TOOLS SCHEMA
            "tools": active_tools_schema,
            "tool_choice": "auto"
        }
        
        headers = {"Authorization": f"Bearer {self.api_key}"}
        try:
            r = requests.post(self.api_url, json=payload, headers=headers, timeout=5.0)
            if r.status_code != 200: 
                log(f"API Error {r.status_code}: {r.text}", "LLM_ERR")
                return None
            
            resp_json = r.json()
            choice = resp_json['choices'][0]
            message = choice['message']
            
            # --- MODIFIED LOGGING: Log Everything ---
            raw_content = message.get('content') or ""
            t_calls = message.get('tool_calls')
            
            if t_calls:
                # Log full JSON for debugging
                try:
                    tool_json_str = json.dumps(t_calls, indent=2)
                    raw_content += f"\\n\\n[TOOL CALLS FULL JSON]:\\n{tool_json_str}"
                except:
                    raw_content += f"\\n\\n[TOOL CALLS RAW]: {str(t_calls)}"
                
                # Explicit Verbose Log for each call
                for t in t_calls:
                    fname = t['function']['name']
                    fargs = t['function']['arguments']
                    log(f"🛠️ DETECTED TOOL: {fname} | ARGS: {fargs}", "LLM_TOOL")

            log_llm(system_role, log_content, raw_content) 
            # ----------------------------------------
            
            # --- STRATEGY 1: NATIVE TOOL CALLS ---
            if message.get('tool_calls'):
                tool_call = message['tool_calls'][0]
                name = tool_call['function']['name']
                args_str = tool_call['function']['arguments']
                
                # Parse arguments if string
                if isinstance(args_str, str):
                    try: args = json.loads(args_str)
                    except: 
                        log(f"Failed to parse tool args: {args_str}", "LLM_ERR")
                        return None
                else:
                    args = args_str
                
                # Validate against allowed
                if allowed_tools and name not in allowed_tools:
                    log(f"Tool '{name}' not allowed here. Skipping.", "LLM_WARN")
                    return None
                    
                return args

            # --- STRATEGY 2: TEXT FALLBACK (For models that ignore 'tools' param) ---
            # Try to extract JSON from the text content
            content = message.get('content', '')
            data = extract_json(content)
            
            if data:
                # Handle list of calls or single object
                calls = data if isinstance(data, list) else [data]
                for call in calls:
                    if isinstance(call, dict):
                        name = call.get('name')
                        args = call.get('arguments')
                        if allowed_tools and name not in allowed_tools: continue
                        if name and args is not None: return args

            # Reduce log noise if no tool was called (common in passive monitoring)
            log(f"No valid tool definitions found. Content preview: {content[:100]}...", "LLM_INFO")
            return None
            
        except Exception as e:
            log(f"Exception: {e}", "LLM_ERR")
            return None

tool_agent = ToolAgent()
`;
