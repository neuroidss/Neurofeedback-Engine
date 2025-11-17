export const PROTOCOL_LIBRARY_CODE = `
const renderProtocolLibrary = ({ 
  protocolLibrary, 
  selectedProtocol, 
  setSelectedProtocol,
  isImportExportVisible,
  setImportExportVisible,
  exportedJson,
  jsonToImport,
  setJsonToImport,
  handleExport,
  handleImport,
  runtime
}) => (
    <div className="bg-slate-800/50 p-4 rounded-lg flex flex-col flex-grow min-h-0">
        <h2 className="text-xl font-bold text-amber-300 mb-3">Protocol Library</h2>
        <div className="overflow-y-auto pr-2 flex-grow space-y-2">
            {protocolLibrary.map(protocol => (
                <button 
                    key={protocol.id} 
                    onClick={() => setSelectedProtocol(protocol)}
                    className={\`w-full text-left p-3 rounded-md transition-colors \${selectedProtocol?.id === protocol.id ? 'bg-amber-800/50 ring-2 ring-amber-400' : 'bg-slate-700/50 hover:bg-slate-600/50'}\`}
                >
                    <h4 className="font-semibold text-sm text-amber-200">{protocol.name}</h4>
                </button>
            ))}
            {protocolLibrary.length === 0 && (
                <p className="text-slate-500 text-center py-4">No protocols found.</p>
            )}
        </div>
        <div className="mt-4 flex flex-col gap-2">
            {isImportExportVisible ? (
                <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700">
                    <textarea 
                        value={jsonToImport || exportedJson}
                        onChange={(e) => { setJsonToImport(e.target.value); }}
                        placeholder="Paste JSON here to import..."
                        className="w-full h-24 bg-black/50 p-2 rounded-md text-xs font-mono border border-slate-600"
                    />
                    <div className="flex gap-2 mt-2">
                        <button onClick={handleImport} className="flex-1 text-sm px-3 py-2 bg-green-600 hover:bg-green-500 rounded-md">Import</button>
                        <button onClick={() => setImportExportVisible(false)} className="flex-1 text-sm px-3 py-2 bg-slate-600 hover:bg-slate-500 rounded-md">Cancel</button>
                    </div>
                </div>
            ) : (
                <button onClick={handleExport} className="w-full text-sm px-3 py-2 bg-slate-600/80 hover:bg-slate-500/80 rounded-md">Export / Import</button>
            )}
            <button 
                onClick={async () => {
                    if (confirm("This will reset all generated protocols to the factory defaults. Are you sure?")) {
                        await runtime.tools.run('Factory Reset Protocols', {});
                    }
                }} 
                className="w-full text-sm px-3 py-2 bg-red-800/70 hover:bg-red-700/70 text-red-300 rounded-md"
            >
                Factory Reset
            </button>
        </div>
    </div>
  );
`