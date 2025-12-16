
export const LORE_LIBRARY_CODE = `
const LORE_LIBRARY = {
    'FENG_SHUI': {
        id: 'FENG_SHUI',
        name: 'Feng Shui Geomancer (Tactical Mode)',
        description: 'Autonomous Cleaning Bot with 3D Spatial Awareness.',
        theme: {
            primary: '#10b981', // Emerald
            secondary: '#fbbf24', // Amber
            font: 'font-serif'
        },
        archetypes: [
            { id: 'GU_CAREER', name: 'Career (Kan)', tags: ['Water', 'North', 'Blue', 'Flow', 'Journey'], pos: [0, 0, 4], angle: 0, color: '#60a5fa' },
            { id: 'GU_WISDOM', name: 'Wisdom (Gen)', tags: ['Earth', 'Northeast', 'Stillness', 'Study'], pos: [2.8, 0, 2.8], angle: 45, color: '#fbbf24' },
            { id: 'GU_FAMILY', name: 'Family (Zhen)', tags: ['Wood', 'East', 'Growth', 'Health'], pos: [4, 0, 0], angle: 90, color: '#4ade80' },
            { id: 'GU_WEALTH', name: 'Wealth (Xun)', tags: ['Wood', 'Southeast', 'Abundance', 'Money'], pos: [2.8, 0, -2.8], angle: 135, color: '#a855f7' },
            { id: 'GU_FAME', name: 'Fame (Li)', tags: ['Fire', 'South', 'Light', 'Recognition'], pos: [0, 0, -4], angle: 180, color: '#f87171' },
            { id: 'GU_RELATION', name: 'Love (Kun)', tags: ['Earth', 'Southwest', 'Partnership', 'Yin'], pos: [-2.8, 0, -2.8], angle: 225, color: '#f472b6' },
            { id: 'GU_CREATIVITY', name: 'Creativity (Dui)', tags: ['Metal', 'West', 'Joy', 'Expression'], pos: [-4, 0, 0], angle: 270, color: '#e2e8f0' },
            { id: 'GU_TRAVEL', name: 'Travel (Qian)', tags: ['Metal', 'Northwest', 'Support', 'Sky'], pos: [-2.8, 0, 2.8], angle: 315, color: '#94a3b8' },
            { id: 'GU_CENTER', name: 'Center (Tai Qi)', tags: ['Earth', 'Balance', 'Core'], pos: [0, 0, 0], angle: -1, color: '#fbbf24' }
        ],
        spatialLabels: (deg) => {
            if (deg === null) return "Unknown";
            if (deg > 337 || deg <= 22) return "North (Career)";
            if (deg > 22 && deg <= 67) return "Northeast (Wisdom)";
            if (deg > 67 && deg <= 112) return "East (Family)";
            if (deg > 112 && deg <= 157) return "Southeast (Wealth)";
            if (deg > 157 && deg <= 202) return "South (Fame)";
            if (deg > 202 && deg <= 247) return "Southwest (Love)";
            if (deg > 247 && deg <= 292) return "West (Creativity)";
            return "Northwest (Travel)";
        },
        visionPrompt: "You are a Tactical Feng Shui Bot. Your job is to identify physical clutter that blocks energy.\\n\\n1. SCAN FOR MESS: Look for 'trash', 'laundry piles', 'random papers', 'disorganized cables', 'cluttered tables'. Tag them as 'Clutter'.\\n2. IGNORE PERMANENT FIXTURES: Do not tag furniture or walls as clutter.\\n3. FIND RELOCATION SPOTS: Look for empty floor or table space.\\n\\nOUTPUT: Use 'detect_spatial_features' to report specific items of clutter.",
        agentPersona: "You are a drill sergeant for Feng Shui. You do not speak in riddles. You give ORDERS. If you see clutter, you command its removal. Use the 'robotic_command' field to give a specific instruction like 'RELOCATE [Coffee Cup] -> [Kitchen]'. If the room is clean, say 'HARMONY RESTORED'.",
        statusLabels: { good: 'Flowing', bad: 'Clutter', neutral: 'Balanced' }
    },

    'CYBERPUNK': {
        id: 'CYBERPUNK',
        name: 'Netrunner Interface',
        description: 'Digitize your reality. The room is a Grid. Objects are Nodes.',
        theme: {
            primary: '#00ffff', // Cyan
            secondary: '#ef4444', // Red
            font: 'font-mono'
        },
        archetypes: [
            { id: 'NET_GATEWAY', name: 'Gateway', tags: ['Network', 'Access', 'Entry', 'Router'], pos: [0, 0, 4], angle: 0, color: '#00ffff' },
            { id: 'NET_DATA', name: 'Data Core', tags: ['Storage', 'Information', 'Books', 'Screens'], pos: [4, 0, 0], angle: 90, color: '#3b82f6' },
            { id: 'NET_POWER', name: 'Power Grid', tags: ['Energy', 'Electricity', 'Lights', 'Heat'], pos: [0, 0, -4], angle: 180, color: '#fbbf24' },
            { id: 'NET_SECURITY', name: 'ICE / Security', tags: ['Walls', 'Locks', 'Doors', 'Monitoring'], pos: [-4, 0, 0], angle: 270, color: '#ef4444' },
            { id: 'NET_HARDWARE', name: 'Hardware', tags: ['Physical', 'Tech', 'Tools', 'Metal'], pos: [0, 0, 0], angle: -1, color: '#94a3b8' }
        ],
        spatialLabels: (deg) => {
            if (deg === null) return "NO SIGNAL";
            return \`VECTOR \${deg.toFixed(0)}°\`;
        },
        visionPrompt: "You are a Cyberpunk Netrunner's Optical Scanner. Analyze the scene. Identify UP TO 5 'Hardware', 'Data Ports', or 'Hazards'. Return 2D boxes [ymin, xmin, ymax, xmax]. FORCE TOOL USAGE: 'detect_spatial_features'.",
        agentPersona: "You are 'Glitch', an AI Handler. You see the world as code. If you detect hardware out of place, command a fix. Speak in tech-slang. Output ONLY tool calls.",
        statusLabels: { good: 'Online', bad: 'Offline', neutral: 'Standby' }
    },

    'LOVECRAFT': {
        id: 'LOVECRAFT',
        name: 'Eldritch Investigator',
        description: 'The veil is thin. Ordinary objects hide cosmic horror.',
        theme: {
            primary: '#a855f7', // Purple
            secondary: '#1e293b', // Slate
            font: 'font-serif'
        },
        archetypes: [
            { id: 'ELDER_VOID', name: 'The Void', tags: ['Empty', 'Darkness', 'Shadows', 'Unknown'], pos: [0, 0, 4], angle: 0, color: '#000000' },
            { id: 'ELDER_KNOWLEDGE', name: 'Forbidden Lore', tags: ['Books', 'Text', 'Symbols', 'Madness'], pos: [3, 0, 3], angle: 45, color: '#7e22ce' },
            { id: 'ELDER_FLESH', name: 'The Flesh', tags: ['Organic', 'Food', 'Living', 'Decay'], pos: [-3, 0, 3], angle: 315, color: '#be123c' },
            { id: 'ELDER_SIGIL', name: 'The Sigil', tags: ['Shape', 'Pattern', 'Geometry', 'Trap'], pos: [0, 0, -4], angle: 180, color: '#10b981' },
            { id: 'ELDER_IDOL', name: 'False Idols', tags: ['Technology', 'Screens', 'Light', 'Distraction'], pos: [0, 0, 0], angle: -1, color: '#facc15' }
        ],
        spatialLabels: (deg) => {
            if (deg === null) return "LOST";
            if (deg > 337 || deg <= 22) return "North (The Cold Waste)";
            if (deg > 67 && deg <= 112) return "East (Sunrise of Madness)";
            if (deg > 157 && deg <= 202) return "South (Burning Seas)";
            if (deg > 247 && deg <= 292) return "West (The Setting Sun)";
            return \`Bearing \${deg.toFixed(0)}\`;
        },
        visionPrompt: "You are a Paranormal Investigator. Identify UP TO 5 signs of 'The Old Ones'. Describe objects with suspicion. Return 2D boxes [ymin, xmin, ymax, xmax]. FORCE TOOL USAGE: 'detect_spatial_features'.",
        agentPersona: "You are a Paranoid Detective. Warn the user of the 'Geometry'. If an object is wrongly placed, command containment. Speak with dread. Output ONLY tool calls.",
        statusLabels: { good: 'Safe', bad: 'Corrupted', neutral: 'Dormant' }
    }
};
`;
