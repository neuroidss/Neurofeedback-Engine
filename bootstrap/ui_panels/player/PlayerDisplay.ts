
export const PLAYER_DISPLAY_CODE = `
const renderPlayerDisplay = ({
  selectedProtocol,
  runningProtocol,
  processedData,
  rawData,
  connectionStatus,
  handleRunProtocol,
  runtime,
  vibecoderHistory,
  sandboxedTool,
  startSwarmTask,
  onEvolve // New Prop
}) => {
    const isRunningThis = runningProtocol && selectedProtocol && runningProtocol.id === selectedProtocol.id;

    // --- UNIVERSAL EVOLUTION LOGIC ---
    const handleUniversalEvolution = (e) => {
        e.preventDefault();
        e.stopPropagation(); 

        if (!selectedProtocol) {
            console.warn("No protocol selected for evolution");
            return;
        }
        
        // Delegate to parent handler if available
        if (onEvolve) {
            onEvolve(selectedProtocol);
        } else {
             // Fallback (Should not happen with updated parent)
             const goal = prompt("Evolution goal:");
             if(goal && startSwarmTask) {
                 startSwarmTask({
                    task: { userRequest: { text: "Evolve " + selectedProtocol.name + ": " + goal }, isScripted: true, script: [{ name: "Evolve Protocol Safely", arguments: { baseToolName: selectedProtocol.name, observedInterest: goal }}] },
                    systemPrompt: "Evolutionary Architect",
                    allTools: runtime.tools.list()
                 });
             }
        }
    };

    return (
      <div className="flex flex-col h-full w-full relative">
        {selectedProtocol ? (
            <>
                <div className="mb-2 p-2 bg-slate-700/30 rounded-md border border-slate-600/50 flex justify-between items-start shrink-0 relative z-[100]">
                    <div className="overflow-hidden mr-2">
                        <h3 className="font-bold text-sm text-slate-200 truncate">{selectedProtocol.name}</h3>
                        <p className="text-[10px] text-slate-400 line-clamp-1">{selectedProtocol.description}</p>
                        {selectedProtocol.scientificDossier && (
                             <span className="inline-block mt-1 text-[9px] bg-blue-900/50 text-blue-300 px-1.5 py-0.5 rounded border border-blue-800">
                                🔬 Scientifically Grounded
                             </span>
                        )}
                    </div>
                    
                    <button 
                        onClick={handleUniversalEvolution}
                        className="text-[10px] bg-purple-900/40 hover:bg-purple-800 border border-purple-500 text-purple-300 px-2 py-1 rounded transition-colors flex items-center gap-1 whitespace-nowrap relative cursor-pointer shadow-sm hover:shadow-purple-500/20 shrink-0 select-none active:scale-95"
                        title="Create a new version of this protocol based on new requirements."
                        style={{ zIndex: 101, pointerEvents: 'auto' }}
                    >
                        🧬 Evolve
                    </button>
                </div>
                
                <div className="flex-grow bg-black rounded-md relative min-h-0 border border-slate-800 overflow-hidden z-0">
                    {runningProtocol && runningProtocol.id === selectedProtocol.id ? (
                        <UIToolRunner 
                            tool={runningProtocol} 
                            props={{ 
                                processedData, 
                                runtime,
                                vibecoderHistory,
                                sandboxedTool,
                                startSwarmTask // Pass down to inner tool as well
                            }} 
                        />
                    ) : (
                         <div className="h-full w-full flex items-center justify-center">
                           <p className="text-slate-500 animate-pulse">Initializing...</p>
                         </div>
                    )}
                </div>
                
                <div className="mt-2 flex flex-col gap-1 flex-shrink-0 z-10">
                    <button 
                        onClick={() => handleRunProtocol(selectedProtocol)}
                        className={'w-full py-2 rounded font-bold text-xs flex items-center justify-center gap-2 transition-all ' + (isRunningThis ? 'bg-red-900/80 hover:bg-red-800 text-red-100 border border-red-700' : 'bg-cyan-700 hover:bg-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.3)]')}
                    >
                        {isRunningThis ? <StopIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
                        {isRunningThis ? 'TERMINATE SESSION' : 'ENGAGE PROTOCOL'}
                    </button>
                </div>
            </>
        ) : (
            <div className="flex-grow flex flex-col items-center justify-center text-slate-600">
                <BeakerIcon className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-xs">Select a protocol.</p>
            </div>
        )}
      </div>
    );
  };
`
