
import { INPUT_SYSTEM_PYTHON } from './python_modules/input_system';
import { NQ_CONFIG_PY } from './python_modules/config';
import { NQ_LLM_PY } from './python_modules/llm';
import { NQ_WORLD_PY } from './python_modules/world';
import { NQ_VISION_PY } from './python_modules/vision';
import { NQ_ENGINE_PY } from './python_modules/engine';
import { NQ_SERVER_PY } from './python_modules/server';
import { NQ_AUDIO_PY } from './python_modules/audio';
import { NQ_TTS_PY } from './python_modules/tts';
import { NQ_SENSORS_PY } from './python_modules/sensors';

export const NEURO_QUEST_PYTHON_CODE = `
${NQ_CONFIG_PY}
${NQ_LLM_PY}
${NQ_TTS_PY}
${NQ_WORLD_PY}
${INPUT_SYSTEM_PYTHON}
${NQ_SENSORS_PY}
${NQ_AUDIO_PY}
${NQ_VISION_PY}
${NQ_ENGINE_PY}
${NQ_SERVER_PY}
`;
