
export const NQ_LLM_PY = `
# ==================================================================================
# 🧠 LLM GATEWAY: TENSOR-AWARE SCHEMA (STRICT TOOLS ONLY)
# ==================================================================================
import requests
import json
import re
import ast
import os

TOOLS_SCHEMA = [
    {
        "type": "function",
        "function": {
            "name": "generate_quest_scenario",
            "description": "Create a mission based on the conflict between the World State and Faction Vectors.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Analysis of the vector tension."},
                    "title": {"type": "string", "description": "Cinematic Title."},
                    "description": {"type": "string", "description": "Visual scene description for the image generator (Max 40 words). No people, just environment. NO style tags."},
                    "cinematic_voiceover": {"type": "string", "description": "A short, dramatic line of dialogue for the narrator to speak. Max 10 words."},
                    "visual_problem": {"type": "string", "description": "Visual prompt for the THREAT/PROBLEM. Max 40 words. Concise."},
                    "visual_success": {"type": "string", "description": "Visual prompt for the RESOLUTION. Max 40 words. Concise."},
                    "solution_verb": {"type": "string", "description": "The key action to solve this (BURN, HACK, RUN)."}
                },
                "required": ["title", "description", "cinematic_voiceover", "visual_problem", "visual_success", "solution_verb"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "evaluate_outcome",
            "description": "Judge if the player's action achieved the Visual Goal.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Compare Current Visual vs Goal Visual."},
                    "outcome_narrative": {"type": "string", "description": "What happened? (Subtitle only)"},
                    "dramatic_voiceover": {"type": "string", "description": "A punchy line confirming success or failure."},
                    "is_success": {"type": "boolean", "description": "Did they solve the quest?"},
                    "new_visual_state": {"type": "string", "description": "The new visual prompt for the world. Max 40 words. Concise."}
                },
                "required": ["outcome_narrative", "dramatic_voiceover", "is_success", "new_visual_state"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "decide_heroic_action",
            "description": "As the Ghost Player (Protagonist), decide the optimal move to advance the plot aggressively.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Strategic analysis and reasoning."},
                    "action_type": {"type": "string", "enum": ["battle", "social", "farm", "end_turn", "buy_perk"], "description": "The meta-action to take."},
                    "target_id": {"type": "string", "description": "The ID of the Territory to attack, Character to bond with, or Perk to buy."},
                    "pacing_reason": {"type": "string", "description": "Why this fits the '2-minute movie' pacing."}
                },
                "required": ["action_type", "target_id", "_thought"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "resolve_social_outcome",
            "description": "Determine the result of a social interaction between the Player and a Target Character.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string", "description": "Analyze character relationship, past memories, and current mood."},
                    "narrative": {"type": "string", "description": "The dialogue or description of the event. Max 2 sentences."},
                    "visual_prompt": {"type": "string", "description": "Visual description of the characters' expressions/poses. Max 20 words."},
                    "bond_change": {"type": "integer", "description": "Change in relationship level (e.g., +1, -1, 0)."},
                    "resource_effects": {
                        "type": "object",
                        "description": "Changes to game resources.",
                        "properties": {
                            "HP": {"type": "integer"},
                            "Gold": {"type": "integer"},
                            "Sanity": {"type": "integer"}
                        }
                    },
                    "critical_success": {"type": "boolean", "description": "If true, grants a special bonus or insight."}
                },
                "required": ["narrative", "visual_prompt", "bond_change", "resource_effects"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "describe_scene",
            "description": "Describe visual hallucinations or environmental shifts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "_thought": {"type": "string"},
                    "description": {"type": "string", "description": "Max 40 words description."},
                    "cinematic_voiceover": {"type": "string", "description": "Optional spoken narration."}
                },
                "required": ["description"]
            }
        }
    }
]

def clean_llm_response(text):
    if not text: return ""
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    if not cleaned and text:
        return f"[Thought Only] {text[:50]}..."
    return cleaned

def extract_strict_json_tool(text):
    if not text: return None
    text = clean_llm_response(text)
    match = re.search(r'(\{.*\})', text, re.DOTALL)
    if not match: return None
    candidate = match.group(1)
    try:
        data = json.loads(candidate)
        if isinstance(data, dict): return data
    except: 
        try: return ast.literal_eval(candidate.replace("true","True").replace("false","False"))
        except: pass
    return None

class ToolAgent:
    def __init__(self):
        # NO DEFAULTS - STRICT CONFIGURATION ONLY
        self.api_url = os.environ.get("LLM_API_URL")
        self.api_key = os.environ.get("LLM_API_KEY")
        self.model = os.environ.get("LLM_MODEL")
        
        self.configured = bool(self.api_url and self.model)
        self.engine_ref = None 

    def configure(self, url, key, model):
        # Update config dynamically from frontend
        if url: self.api_url = url
        if key: self.api_key = key
        if model: self.model = model
        
        print(f"[ToolAgent] 🔄 CONFIG RECEIVED: Model={self.model} | URL={self.api_url}", flush=True)
        
        if self.api_url and self.model:
            self.configured = True
            return True
        else:
            self.configured = False
            return False
        
    def attach_engine(self, engine): self.engine_ref = engine

    def diagnostic_check(self):
        if not self.configured: 
            return "UNCONFIGURED"
        
        system = "You are the AI Game Master."
        prompt = "System init complete. State readiness (max 5 words)."
        
        payload = {
            "model": self.model, 
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
            "max_tokens": 40, 
            "stream": False
        }
        
        print(f"[LLM_DIAG] 📡 Pinging: {self.api_url} ({self.model})", flush=True)
        
        try:
            r = requests.post(self.api_url, json=payload, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=30)
            
            if r.status_code == 200:
                res = r.json()
                choice = res.get('choices', [{}])[0]
                content = choice.get('message', {}).get('content', '')
                if not content: return "Connected (Empty Response)"
                return clean_llm_response(content).strip()
            else:
                return f"HTTP_ERROR_{r.status_code}"
                
        except Exception as e:
            return f"CONNECTION_ERROR: {str(e)[:100]}"

    def process(self, system_role, user_content, allowed_tools=None, retry_count=0):
        if not self.configured: return None
        if retry_count > 1: return None
        
        active_schema = TOOLS_SCHEMA
        if allowed_tools:
            active_schema = [t for t in TOOLS_SCHEMA if t['function']['name'] in allowed_tools]

        strict_system = system_role + "\\n\\nSYSTEM: You are a JSON-Generating API. Call a tool. No chatter."

        payload = {
            "model": self.model, 
            "messages": [{"role": "system", "content": strict_system}, {"role": "user", "content": user_content}],
            "max_tokens": 512, 
            "temperature": 0.3,
            "tools": active_schema, 
            "tool_choice": "required",
            "stream": False
        }
        try:
            r = requests.post(self.api_url, json=payload, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=2)
            
            if r.status_code != 200: 
                return None
            
            resp = r.json()
            msg = resp['choices'][0]['message']
            result_args = None
            
            if msg.get('tool_calls'):
                tc = msg['tool_calls'][0]
                args_str = tc['function']['arguments']
                try: args = json.loads(args_str)
                except: args = {}
                args['_tool_name'] = tc['function']['name']
                result_args = args
            elif msg.get('content', ''):
                data = extract_strict_json_tool(msg.get('content', ''))
                if data and isinstance(data, dict):
                    if allowed_tools and len(allowed_tools) == 1 and '_tool_name' not in data:
                        data['_tool_name'] = allowed_tools[0]
                    result_args = data
            
            return result_args

        except Exception as e:
            return None

tool_agent = ToolAgent()
`;
