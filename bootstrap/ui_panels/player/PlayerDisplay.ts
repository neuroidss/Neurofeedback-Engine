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
  sandboxedTool
}) => {
    const isRunningThis = runningProtocol && selectedProtocol && runningProtocol.id === selectedProtocol.id;

    return (
      <>
        {selectedProtocol ? (
            <>
                <div className="mb-4 p-3 bg-slate-700/30 rounded-md border border-slate-600/50">
                    <h3 className="font-bold text-lg text-slate-200">{selectedProtocol.name}</h3>
                    <p className="text-sm text-slate-400 mt-1">{selectedProtocol.description}</p>
                </div>
                <div className="flex-grow bg-black rounded-md relative min-h-0">
                    {runningProtocol && runningProtocol.id === selectedProtocol.id ? (
                        <UIToolRunner 
                            tool={runningProtocol} 
                            props={{ 
                                processedData, 
                                runtime,
                                vibecoderHistory,
                                sandboxedTool
                            }} 
                        />
                    ) : (
                         <div className="h-full w-full flex items-center justify-center">
                           <p className="text-slate-500">Waiting for EEG data...</p>
                         </div>
                    )}
                </div>
                <div className="mt-4 flex flex-col gap-2 flex-shrink-0">
                   <div className="bg-black/40 rounded p-2 border border-slate-700">
                      <h4 className="text-xs font-mono text-slate-500">RAW DATA STREAM DEBUG</h4>
                      <p className="text-xs font-mono text-green-400 whitespace-pre-wrap overflow-y-auto max-h-12">
                        {(connectionStatus ? '[' + connectionStatus + '] ' : '') + (rawData ? (typeof rawData === 'string' ? rawData : JSON.stringify(rawData)) : "No data received yet...")}
                      </p>
                   </div>
                    <button 
                        onClick={() => handleRunProtocol(selectedProtocol)}
                        className={'w-full py-3 rounded-lg font-bold text-lg flex items-center justify-center gap-2 ' + (isRunningThis ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white')}
                    >
                        {isRunningThis ? <StopIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
                        {isRunningThis ? 'Stop Session' : 'Start Session'}
                    </button>
                </div>
            </>
        ) : (
            <div className="flex-grow flex items-center justify-center">
                <p className="text-slate-500">Select a protocol from the library to begin.</p>
            </div>
        )}
      </>
    );
  };
`