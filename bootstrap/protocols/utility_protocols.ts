
// bootstrap/protocols/utility_protocols.ts
import type { ToolCreatorPayload } from '../../types';

const EXPORT_PROTOCOLS: ToolCreatorPayload = {
    name: 'Export Neurofeedback Protocols',
    description: 'Exports all user-created or AI-generated neurofeedback protocols to a JSON string.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To allow users to save, share, and back up the protocols they have created.',
    parameters: [],
    implementationCode: `
        const allTools = runtime.tools.list();
        const protocolTools = allTools.filter(tool => 
            tool.category === 'UI Component' && 
            tool.name !== 'Neurofeedback Engine Main UI' && 
            tool.name !== 'Debug Log View'
        );

        const exportableProtocols = protocolTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            category: tool.category,
            executionEnvironment: tool.executionEnvironment,
            parameters: tool.parameters,
            implementationCode: tool.implementationCode,
            processingCode: tool.processingCode,
            purpose: tool.purpose,
            dataRequirements: tool.dataRequirements,
        }));

        const jsonString = JSON.stringify(exportableProtocols, null, 2);
        runtime.logEvent(\`[Export] Successfully prepared \${exportableProtocols.length} protocols for export.\`);

        return { success: true, protocolsJson: jsonString };
    `
};

const IMPORT_PROTOCOLS: ToolCreatorPayload = {
    name: 'Import Neurofeedback Protocols',
    description: 'Imports one or more neurofeedback protocols from a JSON string, creating them as new tools.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To allow users to load saved or shared neurofeedback protocols into their library.',
    parameters: [
        { name: 'protocolsJson', type: 'string', description: 'A JSON string containing an array of protocol definitions to import.', required: true },
    ],
    implementationCode: `
        const { protocolsJson } = args;
        let protocolsToImport;
        try {
            protocolsToImport = JSON.parse(protocolsJson);
            if (!Array.isArray(protocolsToImport)) {
                throw new Error("JSON data is not an array.");
            }
        } catch (e) {
            throw new Error(\`Invalid JSON format: \${e.message}\`);
        }

        let successfulImports = 0;
        let failedImports = 0;

        for (const protocolPayload of protocolsToImport) {
            try {
                // Basic validation
                if (!protocolPayload.name || !protocolPayload.description || !protocolPayload.implementationCode) {
                    throw new Error(\`Protocol missing required fields (name, description, implementationCode). Skipping.\`);
                }
                // Force category to be correct
                protocolPayload.category = 'UI Component';
                protocolPayload.executionEnvironment = 'Client';

                await runtime.tools.run('Tool Creator', protocolPayload);
                successfulImports++;
            } catch (e) {
                failedImports++;
                runtime.logEvent(\`[Import] Failed to import protocol '\${protocolPayload.name || 'Unknown'}': \${e.message}\`);
            }
        }
        
        const message = \`Import complete. Successfully imported \${successfulImports} protocols. Failed to import \${failedImports}.\`;
        runtime.logEvent(\`[Import] \${message}\`);
        return { success: true, message: message };
    `
};

const FACTORY_RESET_PROTOCOLS: ToolCreatorPayload = {
    name: 'Factory Reset Protocols',
    description: 'Deletes all user-created or AI-generated protocols and associated data from local storage and reloads the application to restore the default set.',
    category: 'Automation',
    executionEnvironment: 'Client',
    purpose: 'To provide a way for users to revert to a clean, default state.',
    parameters: [],
    implementationCode: `
        runtime.logEvent('[Reset] Clearing all protocol data from local storage...');
        
        // This is the key where the main app state (including tools) is stored
        const STORAGE_KEY = 'singularity-agent-factory-state';
        localStorage.removeItem(STORAGE_KEY);

        // This is the key for the map/dossier data
        const MAP_STORAGE_KEY = 'neurofeedback-engine-protocols-state';
        localStorage.removeItem(MAP_STORAGE_KEY);
        
        runtime.logEvent('[Reset] ✅ Storage cleared. Reloading application to apply factory defaults.');
        
        // Use a short timeout to ensure the log has a chance to be seen before the page reloads.
        setTimeout(() => {
            window.location.reload();
        }, 500);

        return { success: true, message: 'Factory reset initiated. The application will now reload.' };
    `
};

export const UTILITY_PROTOCOLS: ToolCreatorPayload[] = [
    EXPORT_PROTOCOLS,
    IMPORT_PROTOCOLS,
    FACTORY_RESET_PROTOCOLS,
];
