
import type { ToolCreatorPayload } from '../../../types';

export const DETECT_SPATIAL_FEATURES: ToolCreatorPayload = {
    name: 'detect_spatial_features',
    description: 'The ONLY valid tool for reporting visual observations in the Echoes protocol. Records detected objects and free spaces. Do NOT use "report_object" or any benchmark tools.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To provide structural environmental data to the agent via Visual-Language Model analysis.',
    parameters: [
        { 
            name: "objects", 
            type: "array", 
            description: 'List of detected items. Format: [{ "label": "dirty sock", "status": "Clutter", "box_2d": [ymin, xmin, ymax, xmax], "depth_estimate": 0-100 }]. Coordinates 0-1000.',
            required: true 
        },
        { 
            name: "free_spaces", 
            type: "array", 
            description: "List of open [x, y] coordinates (0-1000 scale) suitable for moving objects to.", 
            required: true 
        }
    ],
    implementationCode: `return { success: true, objects: args.objects, free_spaces: args.free_spaces };`
};

export const EVALUATE_HARMONY: ToolCreatorPayload = {
    name: 'evaluate_harmony',
    description: 'The cognitive judgment tool for the Feng Shui Agent. Decides if the current scene is ordered or chaotic and issues robotic commands.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To allow the agent to judge the environment and plan cleaning actions.',
    parameters: [
        { 
            name: 'judgment', 
            type: 'string', 
            description: 'Verdict on the scene. Must be "SATISFIED" (Orderly) or "DISSATISFIED" (Messy/Cluttered).',
            required: true
        },
        { 
            name: 'critique', 
            type: 'string', 
            description: 'The internal monologue explaining the judgment. E.g. "The cup disrupts the flow of Chi in the North sector."',
            required: true 
        },
        { 
            name: 'robotic_command', 
            type: 'string', 
            description: 'The physical action to take. If SATISFIED: "MAINTAIN_HARMONY". If DISSATISFIED: "RELOCATE [OBJECT_ID] -> [COORDINATES]".',
            required: true
        },
        {
            name: 'target_coordinates',
            type: 'array',
            description: 'The [x, y] destination coordinates (0-1000) for the object if relocating. Use a point from "free_spaces".',
            required: false
        }
    ],
    implementationCode: `return { success: true, judgment: args.judgment, critique: args.critique, command: args.robotic_command };`
};

export const ECHOES_TOOLS = [DETECT_SPATIAL_FEATURES, EVALUATE_HARMONY];
