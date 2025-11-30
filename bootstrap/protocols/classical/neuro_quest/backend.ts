
import { INPUT_SYSTEM_PYTHON } from './input_system';
import { NQ_CONFIG_PY } from './python_modules/config';
import { NQ_LLM_PY } from './python_modules/llm';
import { NQ_WORLD_PY } from './python_modules/world';
import { NQ_VISION_PY } from './python_modules/vision';
import { NQ_ENGINE_PY } from './python_modules/engine';
import { NQ_SERVER_PY } from './python_modules/server';

export const NEURO_QUEST_PYTHON_CODE = `
${NQ_CONFIG_PY}
${NQ_LLM_PY}
${NQ_WORLD_PY}
${INPUT_SYSTEM_PYTHON}
${NQ_VISION_PY}
${NQ_ENGINE_PY}
${NQ_SERVER_PY}
`;
