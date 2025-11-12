import type { ToolCreatorPayload } from '../types';

const RECORD_VALIDATED_SOURCE: ToolCreatorPayload = {
    name: 'RecordValidatedSource',
    description: 'Records the validated data of a scientific source after AI analysis.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To persist the summary, reliability score, and other metadata for a scientific source that has been successfully vetted.',
    parameters: [
        { name: 'uri', type: 'string', description: 'The canonical URI of the source.', required: true },
        { name: 'title', type: 'string', description: 'The title of the source.', required: true },
        { name: 'summary', type: 'string', description: 'A concise, AI-generated summary of the source content.', required: true },
        { name: 'reliabilityScore', type: 'number', description: 'A score from 0.0 to 1.0 indicating the perceived reliability and relevance of the source.', required: true },
        { name: 'justification', type: 'string', description: 'The justification for the assigned reliability score.', required: true },
    ],
    implementationCode: `
        const { uri, title, summary, reliabilityScore, justification } = args;
        const validatedSource = {
            uri,
            title,
            summary,
            reliabilityScore,
            justification,
            status: 'valid',
            origin: 'AI Validation',
        };
        return { success: true, validatedSource };
    `
};

const FLAG_INVALID_SOURCE: ToolCreatorPayload = {
    name: 'FlagInvalidSource',
    description: 'Flags a source URL as invalid for the research objective because it is not a scientific paper.',
    category: 'Functional',
    executionEnvironment: 'Client',
    purpose: 'To filter out irrelevant or non-scientific content like blogs, news, or product reviews from the research pipeline.',
    parameters: [
        { name: 'uri', type: 'string', description: 'The canonical URI of the source that was determined to be invalid.', required: true },
        { name: 'reason', type: 'string', description: 'A brief explanation of why the source is invalid (e.g., "Product review page", "Blog post", "News article").', required: true },
    ],
    implementationCode: `
        const { uri, reason } = args;
        runtime.logEvent(\`[Validator] Source flagged as invalid: \${uri}. Reason: \${reason}\`);
        return { success: true, sourceWasInvalid: true, reason: reason };
    `
};

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
    {
        name: 'RecordRefinedQueries',
        description: 'A data recording tool that accepts a list of refined search queries from an AI model.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a structured endpoint for an AI to submit generated search queries, avoiding the need for fragile JSON parsing from raw text.',
        parameters: [
            { name: 'queries', type: 'array', description: 'An array of search query strings.', required: true },
        ],
        implementationCode: `
            // This tool simply returns the arguments it received, acting as a data shuttle.
            return { success: true, queries: args.queries };
        `
    },
    {
        name: 'RecordConceptualQueries',
        description: 'A data recording tool that accepts a list of high-level conceptual queries from an AI model.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a structured endpoint for an AI to submit generated conceptual questions, avoiding fragile JSON parsing.',
        parameters: [
            { name: 'queries', type: 'array', description: 'An array of conceptual query strings.', required: true },
        ],
        implementationCode: `
            return { success: true, conceptual_queries: args.queries };
        `
    },
     {
        name: 'RecordProxyBuilders',
        description: 'A data recording tool that accepts a list of CORS proxy builder function strings.',
        category: 'Functional',
        executionEnvironment: 'Client',
        purpose: 'To provide a structured endpoint for an AI to submit newly discovered proxy strategies.',
        parameters: [
            { name: 'builderStrings', type: 'array', description: 'An array of strings, where each string is a JavaScript arrow function for a CORS proxy.', required: true },
        ],
        implementationCode: `
            return { success: true, newBuilderStrings: args.builderStrings };
        `
    },
    RECORD_VALIDATED_SOURCE,
    FLAG_INVALID_SOURCE,
];