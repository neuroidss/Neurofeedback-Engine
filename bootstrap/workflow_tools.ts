import type { ToolCreatorPayload } from '../types';

export const WORKFLOW_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Execute Neurofeedback Generation Workflow',
        description: 'The primary workflow of the engine. Takes a research domain, finds the most relevant scientific paper, and then generates a new, executable neurofeedback UI tool based on its findings.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To automate the entire end-to-end process of neurofeedback R&D, from literature review to a runnable application.',
        parameters: [
            { name: 'researchDomain', type: 'string', description: 'A broad research area to investigate (e.g., "enhance focus", "promote sleep spindles", "reduce anxiety via alpha training").', required: true },
        ],
        implementationCode: `
            const { researchDomain } = args;
            runtime.logEvent(\`[Workflow] Starting Neurofeedback Generation for domain: "\${researchDomain}"\`);

            // Step 1: Refine search queries from the broad domain
            const { queries } = await runtime.tools.run('Refine Search Queries', { researchObjective: researchDomain, maxQueries: 3 });
            if (!queries || queries.length === 0) {
                throw new Error("Failed to generate search queries from the research domain.");
            }

            // Step 2: Conduct the search
            const { searchResults } = await runtime.tools.run('Federated Scientific Search', { query: queries.join('; '), maxResultsPerSource: 10 });
            if (!searchResults || searchResults.length === 0) {
                throw new Error("Federated search returned no results for the generated queries.");
            }

            // Step 3: Rank the search results
            const { rankedResults } = await runtime.tools.run('Rank Search Results', { searchResults, researchObjective: researchDomain });
            const topResult = rankedResults[0];
            if (!topResult) {
                throw new Error("Ranking failed to produce a top result.");
            }
            runtime.logEvent(\`[Workflow] Top ranked article: "\${topResult.title}"\`);

            // Step 4: Validate the single best source to get its abstract
            const { validatedSource } = await runtime.tools.run('Find and Validate Single Source', {
                searchResult: topResult,
                researchObjective: researchDomain
            });
            
            if (!validatedSource || !validatedSource.summary) {
                throw new Error("Failed to validate the top-ranked source or extract its summary.");
            }

            runtime.logEvent(\`[Workflow] Source validated. Abstract obtained. Proceeding to generate UI tool.\`);
            const paperAbstract = validatedSource.summary;
            
            // Step 5: Generate a protocol name from the title
            const { protocolName } = await runtime.tools.run('Generate Protocol Name from Title', { paperTitle: validatedSource.title });

            // Step 6: Generate the new neurofeedback UI tool
            const { newTool } = await runtime.tools.run('Generate Neurofeedback UI Tool', { 
                paperAbstract: paperAbstract,
                protocolName: protocolName,
            });

            if (!newTool) {
                throw new Error("The neurofeedback UI tool generation failed to return a new tool definition.");
            }

            runtime.logEvent(\`[Workflow] ✅ SUCCESS! New neurofeedback protocol '\${newTool.name}' has been created and is available in the Protocol Library.\`);
            
            return {
                success: true,
                message: \`Workflow complete. New protocol '\${newTool.name}' is now available.\`,
                newTool: newTool,
            };
        `
    },
];

export {};