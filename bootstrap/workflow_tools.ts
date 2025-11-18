import type { ToolCreatorPayload } from '../types';

export const WORKFLOW_TOOLS: ToolCreatorPayload[] = [
    {
        name: 'Execute Research Workflow',
        description: 'The primary research phase of the engine. Takes a research domain, finds the most relevant scientific papers, validates them, and adds them to the Research Dossier for manual generation.',
        category: 'Automation',
        executionEnvironment: 'Client',
        purpose: 'To automate the literature review and validation, providing a curated list of sources for the user to then turn into protocols.',
        parameters: [
            { name: 'researchDomain', type: 'string', description: 'A broad research area to investigate (e.g., "enhance focus", "promote sleep spindles", "reduce anxiety via alpha training").', required: true },
        ],
        implementationCode: `
            const { researchDomain } = args;
            runtime.logEvent('[Workflow] Starting Research Phase for domain: "' + researchDomain + '"');
            const { setValidatedSources } = runtime.getState();

            // Step 1: Refine search queries from the broad domain
            runtime.reportProgress({ text: 'Step 1: Refining search queries...', current: 1, total: 4 });
            const { queries } = await runtime.tools.run('Refine Search Queries', { researchObjective: researchDomain, maxQueries: 3 });
            if (!queries || queries.length === 0) {
                throw new Error("Failed to generate search queries from the research domain.");
            }

            // Step 2: Conduct the search
            runtime.reportProgress({ text: 'Step 2: Searching scientific databases...', current: 2, total: 4 });
            const { searchResults } = await runtime.tools.run('Federated Scientific Search', { query: queries.join('; '), maxResultsPerSource: 15 });
            if (!searchResults || searchResults.length === 0) {
                throw new Error("Federated search returned no results for the generated queries.");
            }

            // Step 3: Rank the search results
            runtime.reportProgress({ text: 'Step 3: Ranking search results...', current: 3, total: 4 });
            const { rankedResults } = await runtime.tools.run('Rank Search Results', { searchResults, researchObjective: researchDomain });
            if (!rankedResults || rankedResults.length === 0) {
                throw new Error("Ranking failed to produce any results.");
            }
            
            // Step 4: Iterate through results, validating and adding to the dossier.
            let relevantCount = 0;
            let irrelevantCount = 0;
            let failedCount = 0;
            
            runtime.logEvent('[Workflow] Now processing up to ' + rankedResults.length + ' ranked sources...');
            for (let i = 0; i < rankedResults.length; i++) {
                const result = rankedResults[i];
                if (!runtime.getState().isSwarmRunning) {
                    runtime.logEvent('[Workflow] Workflow stopped by user during processing phase.');
                    break;
                }
                
                const progressText = 'Step 4: Validating (' + (i + 1) + '/' + rankedResults.length + ') - Found: ' + relevantCount + ', Skipped: ' + (irrelevantCount + failedCount);
                runtime.reportProgress({ text: progressText, current: i + 1, total: rankedResults.length });
                
                runtime.logEvent('[Workflow] [ ' + (i + 1) + '/' + rankedResults.length + ' ] Validating: "' + result.title.substring(0, 80) + '..."');
                
                try {
                    const validationResult = await runtime.tools.run('Find and Validate Single Source', {
                        searchResult: result,
                        researchObjective: researchDomain
                    });

                    if (validationResult && validationResult.validatedSource) {
                        const source = validationResult.validatedSource;
                        if (source.reliabilityScore >= 0.5) {
                            relevantCount++;
                            runtime.logEvent('--> ✅ [Workflow] Source is relevant (Score: ' + source.reliabilityScore + '). Added to dossier.');
                            // Add the new source to the shared state
                            setValidatedSources(prev => {
                                // Avoid duplicates
                                if (prev.find(s => s.uri === source.uri)) return prev;
                                return [...prev, source];
                            });
                        } else {
                            irrelevantCount++;
                            runtime.logEvent('--> ⚠️ [Workflow] Source was valid but deemed irrelevant (Score: ' + source.reliabilityScore + '). Skipping.');
                        }
                    }
                } catch (validationError) {
                    failedCount++;
                    runtime.logEvent('--> ❌ [Workflow] Validation failed for this source: ' + validationError.message + '. Skipping.');
                }
            }

            runtime.reportProgress(null); // Clear progress bar
            
            const summaryMessage = '📊 Research Phase Summary: Processed ' + rankedResults.length + ' sources. Found ' + relevantCount + ' relevant papers. Skipped ' + irrelevantCount + ' as irrelevant and ' + failedCount + ' due to validation errors.';
            runtime.logEvent('[Workflow] ' + summaryMessage);

            if (relevantCount === 0) {
                throw new Error('Workflow finished but failed to find any relevant protocols. Check logs for validation errors.');
            }
            
            const finalMessage = 'Research phase complete. Found ' + relevantCount + ' relevant sources. You can now generate protocols from the Research Dossier.';
            runtime.logEvent('✅ [Workflow] ' + finalMessage);
            
            return {
                success: true,
                message: finalMessage,
            };
        `
    },
];

export {};