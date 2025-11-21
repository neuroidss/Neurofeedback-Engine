
export const USE_STREAM_ENGINE_CODE = `
const useStreamEngine = ({ runtime }) => {
    const [isEngineActive, setIsEngineActive] = useState(false);

    const startEngine = () => {
        if (runtime.streamEngine) {
            runtime.streamEngine.start();
            setIsEngineActive(true);
        }
    };

    const stopEngine = () => {
        if (runtime.streamEngine) {
            runtime.streamEngine.stop();
            setIsEngineActive(false);
        }
    };

    return { isEngineActive, startEngine, stopEngine };
};
`;
