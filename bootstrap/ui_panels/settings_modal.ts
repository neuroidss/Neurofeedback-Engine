export const SETTINGS_MODAL_CODE = `
  const renderSettingsModal = () => {
    if (!isSettingsVisible) return null;

    const handleSave = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newConfig = {
            googleAIAPIKey: formData.get('googleAIAPIKey'),
            openAIAPIKey: formData.get('openAIAPIKey'),
            openAIBaseUrl: formData.get('openAIBaseUrl'),
            deepSeekAPIKey: formData.get('deepSeekAPIKey'),
            deepSeekBaseUrl: formData.get('deepSeekBaseUrl'),
            ollamaHost: formData.get('ollamaHost'),
            useQuantumSDR: formData.get('useQuantumSDR') === 'on',
        };
        setApiConfig(newConfig);
        setSettingsVisible(false);
        runtime.logEvent('[Settings] API configuration updated.');
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center animate-fade-in">
            <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl w-full max-w-2xl p-6 text-slate-200">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-slate-100">API Configuration</h2>
                    <button onClick={() => setSettingsVisible(false)} className="p-1 rounded-full hover:bg-slate-700">
                        <XCircleIcon className="h-8 w-8 text-slate-400" />
                    </button>
                </div>
                <form onSubmit={handleSave}>
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-3">
                        {/* Google Gemini */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Google Gemini API Key</label>
                            <input type="password" name="googleAIAPIKey" defaultValue={apiConfig.googleAIAPIKey} className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* OpenAI */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">OpenAI-Compatible API Key</label>
                            <input type="password" name="openAIAPIKey" defaultValue={apiConfig.openAIAPIKey} className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">OpenAI-Compatible Base URL</label>
                            <input type="text" name="openAIBaseUrl" defaultValue={apiConfig.openAIBaseUrl} placeholder="e.g., https://api.openai.com/v1" className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* Nebius / DeepSeek */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Nebius (DeepSeek) API Key</label>
                            <input type="password" name="deepSeekAPIKey" defaultValue={apiConfig.deepSeekAPIKey} className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Nebius (DeepSeek) Base URL</label>
                            <input type="text" name="deepSeekBaseUrl" defaultValue={apiConfig.deepSeekBaseUrl} placeholder="https://api.tokenfactory.nebius.com/v1/" className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* Ollama */}
                        <div>
                            <label className="block text-sm font-medium text-slate-300">Ollama Host URL</label>
                            <input type="text" name="ollamaHost" defaultValue={apiConfig.ollamaHost} placeholder="e.g., http://localhost:11434" className="mt-1 block w-full bg-slate-900 border border-slate-600 rounded-md p-2 text-slate-200 focus:ring-2 focus:ring-cyan-500 focus:outline-none" />
                        </div>
                        {/* Quantum Boost */}
                        <div className="pt-2">
                            <label className="flex items-center space-x-2 text-sm font-medium text-slate-300">
                                <input type="checkbox" name="useQuantumSDR" defaultChecked={apiConfig.useQuantumSDR} className="h-5 w-5 rounded bg-slate-900 border-slate-600 text-cyan-600 focus:ring-cyan-500" />
                                <span>Enable Quantum Computing Boost (via D-Wave Stubs)</span>
                            </label>
                            <p className="text-xs text-slate-500 ml-7">Enables specialized protocols that offload NP-hard problems to a quantum annealer simulation.</p>
                        </div>
                    </div>
                    <div className="mt-6 flex justify-end gap-3">
                        <button type="button" onClick={() => setSettingsVisible(false)} className="px-4 py-2 bg-slate-600 hover:bg-slate-500 text-white font-bold rounded-lg">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-lg">Save</button>
                    </div>
                </form>
            </div>
        </div>
    );
  };
`