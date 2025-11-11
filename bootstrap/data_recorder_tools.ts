import type { ToolCreatorPayload } from '../types';

export const DATA_RECORDER_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'RecordErrorAnalysis',
        description: 'Records the structured analysis of a tool execution error, as determined by the diagnostic supervisor agent.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a clear, structured log entry detailing the root cause and suggested fix for a system error, enabling better debugging and future self-healing capabilities.',
        parameters: [
            { name: 'failedToolName', type: 'string', description: 'The name of the tool or process that failed.', required: true },
            { name: 'errorCategory', type: 'string', description: "The category of the error. Must be one of: 'MODEL_INCAPABLE', 'TOOL_BUG', 'PROMPT_AMBIGUITY', 'AGENT_LOGIC_ERROR'.", required: true },
            { name: 'diagnosis', type: 'string', description: 'A detailed explanation of the reasoning behind the diagnosis.', required: true },
            { name: 'suggestedAction', type: 'string', description: "The suggested recovery action. Must be one of: 'RETRY_WITH_STRONGER_MODEL', 'MODIFY_TOOL_CODE', 'REWRITE_PROMPT', 'SIMPLIFY_TASK'.", required: true },
            { name: 'actionParameters', type: 'object', description: 'A JSON object containing the specific parameters for the suggested action (e.g., {"suggestedModelId": "gemini-2.5-pro"}).', required: true },
        ],
        implementationCode: `
            const { failedToolName, errorCategory, diagnosis, suggestedAction, actionParameters } = args;
            
            const logMessage = \`
[SUPERVISOR] 💡 Diagnostic Report for '\${failedToolName}':
- Category: \${errorCategory}
- Action: \${suggestedAction}
- Parameters: \${JSON.stringify(actionParameters)}
- Diagnosis: \${diagnosis}
            \`;
            
            runtime.logEvent(logMessage);
            
            return {
                success: true,
                analysis: { failedToolName, errorCategory, diagnosis, suggestedAction, actionParameters }
            };
        `
    },
];
export {};