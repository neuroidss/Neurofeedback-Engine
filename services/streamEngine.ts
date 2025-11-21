
import { StreamGraph, NeuroFrame, StreamNode } from '../types';
import { neuroBus } from './neuroBus';

export class StreamEngine {
    private graph: StreamGraph | null = null;
    private compiledNodes: Map<string, Function> = new Map();
    private nodeStates: Map<string, any> = new Map();
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;
    private lastOutputs: Map<string, any> = new Map();
    private lastUpdates: Map<string, number> = new Map(); // Timestamp of last execution
    
    // A buffer to hold frames collected between ticks
    private frameBuffer: Map<string, NeuroFrame[]> = new Map();

    constructor() {
        // Subscribe to bus to collect input frames for Source nodes
        neuroBus.subscribe((frame) => {
            if (!this.isRunning) return;
            if (!this.frameBuffer.has(frame.sourceId)) {
                this.frameBuffer.set(frame.sourceId, []);
            }
            this.frameBuffer.get(frame.sourceId)!.push(frame);
        });
    }

    public loadGraph(graph: StreamGraph) {
        this.stop();
        
        // --- NORMALIZATION: ARRAY TO RECORD ---
        // The AI or tools might generate 'nodes' as an array of objects.
        // The engine internals expect a Record<string, Node> for O(1) lookup by ID.
        if (Array.isArray(graph.nodes)) {
            const nodeRecord: Record<string, StreamNode> = {};
            // @ts-ignore
            graph.nodes.forEach((node: StreamNode) => {
                if (node.id) {
                    nodeRecord[node.id] = node;
                }
            });
            graph.nodes = nodeRecord;
        }
        
        this.graph = graph;
        this.compiledNodes.clear();
        this.nodeStates.clear();
        this.frameBuffer.clear();
        this.lastOutputs.clear();
        this.lastUpdates.clear();

        // Compile nodes
        Object.values(graph.nodes).forEach(node => {
            // --- SANITIZATION DEFENSE ---
            // AI sometimes generates inputs as {"input1": "id"} instead of ["id"]
            if (node.inputs && !Array.isArray(node.inputs)) {
                if (typeof node.inputs === 'object') {
                    // @ts-ignore
                    node.inputs = Object.values(node.inputs);
                    console.warn(`[StreamEngine] Sanitized inputs for node ${node.id}: Converted object to array.`);
                } else {
                    node.inputs = [];
                }
            }
            // ----------------------------
            this.compileNode(node);
        });
        
        console.log(`[StreamEngine] Graph ${graph.id} loaded with ${this.compiledNodes.size} nodes.`);
    }

    private compileNode(node: StreamNode) {
        try {
            // Wrap implementation in an async function constructor
            // Signature: (inputs, config, state, bus) -> Promise<output>
            const impl = new Function('inputs', 'config', 'state', 'bus', `
                return (async () => {
                    ${node.implementation}
                })();
            `);
            this.compiledNodes.set(node.id, impl as Function);
            // Initialize state if not present, preserve if existing (hot-swapping)
            if (!this.nodeStates.has(node.id)) {
                this.nodeStates.set(node.id, node.state || {});
            }
        } catch (e) {
            console.error(`Failed to compile node ${node.id}:`, e);
        }
    }

    public hasNode(nodeId: string): boolean {
        return !!(this.graph && this.graph.nodes[nodeId]);
    }

    public addNode(node: StreamNode) {
        if (!this.graph) this.graph = { id: 'dynamic_graph', nodes: {}, edges: [] };
        
        // Check for idempotency: If node exists and implementation/config matches, skip re-compile
        const existing = this.graph.nodes[node.id];
        if (existing && existing.implementation === node.implementation && JSON.stringify(existing.config) === JSON.stringify(node.config)) {
            return; // Nothing changed, skip to avoid log spam and jitter
        }

        // --- SANITIZATION DEFENSE ---
        if (node.inputs && !Array.isArray(node.inputs)) {
            if (typeof node.inputs === 'object') {
                // @ts-ignore
                node.inputs = Object.values(node.inputs);
                console.warn(`[StreamEngine] Sanitized inputs for added node ${node.id}.`);
            } else {
                node.inputs = [];
            }
        }
        // ----------------------------

        this.graph.nodes[node.id] = node;
        this.compileNode(node);
        console.log(`[StreamEngine] Dynamic: Added/Updated node ${node.id}`);
    }

    public connectNodes(sourceId: string, targetId: string) {
        if (!this.graph) return;
        const targetNode = this.graph.nodes[targetId];
        if (targetNode) {
            // Resilience: Ensure inputs array exists before checking inclusion
            if (!targetNode.inputs) {
                targetNode.inputs = [];
            }
            
            if (!targetNode.inputs.includes(sourceId)) {
                targetNode.inputs.push(sourceId);
                console.log(`[StreamEngine] Dynamic: Connected ${sourceId} -> ${targetId}`);
            }
        } else {
            console.warn(`[StreamEngine] Connect failed: Target node ${targetId} not found.`);
        }
    }

    public updateNodeConfig(nodeId: string, newConfig: Record<string, any>) {
        if (!this.graph || !this.graph.nodes[nodeId]) return;
        this.graph.nodes[nodeId].config = { ...this.graph.nodes[nodeId].config, ...newConfig };
        console.log(`[StreamEngine] Dynamic: Updated config for ${nodeId}`);
    }

    public start() {
        if (this.isRunning) return; // Prevent double start/multiple loops
        if (!this.graph && this.compiledNodes.size === 0) return; // Allow starting if nodes exist even without full graph object
        
        this.isRunning = true;
        this.tick();
        console.log('[StreamEngine] Started.');
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        console.log('[StreamEngine] Stopped.');
    }

    // Public accessor for UI visualizers
    public getDebugState() {
        if (!this.graph) return { nodes: [], edges: [] };
        
        const nodes = Object.values(this.graph.nodes).map(n => ({
            id: n.id,
            type: n.type,
            value: this.lastOutputs.get(n.id),
            lastUpdate: this.lastUpdates.get(n.id) || 0
        }));

        const edges = [];
        Object.values(this.graph.nodes).forEach(target => {
            // Check inputs existence safely
            if (target.inputs) {
                target.inputs.forEach(sourceId => {
                    edges.push({ source: sourceId, target: target.id, value: this.lastOutputs.get(sourceId) });
                });
            }
        });

        return { nodes, edges };
    }

    private async tick() {
        if (!this.isRunning || !this.graph) return;

        const nodesToProcess = this.getTopologicalSort();
        // Store outputs of this tick: NodeID -> ResultPayload
        const tickOutputs = new Map<string, any>();

        for (const nodeId of nodesToProcess) {
            const node = this.graph.nodes[nodeId];
            const compiledFn = this.compiledNodes.get(nodeId);
            
            if (!compiledFn) continue;

            // Gather inputs
            const inputs: Record<string, any> = {};
            if (node.inputs) {
                // --- SAFETY CHECK ---
                // Even with load-time sanitization, verify array before iterating
                if (Array.isArray(node.inputs)) {
                    node.inputs.forEach(inputId => {
                        inputs[inputId] = tickOutputs.get(inputId);
                    });
                }
            }

            // Inject the frame buffer for Source nodes that might want to read "System" or "Vision" inputs
            // Convert Map to Object for easier access in node code
            inputs['_frameBuffer'] = Object.fromEntries(this.frameBuffer);

            try {
                const state = this.nodeStates.get(nodeId);
                const result = await compiledFn(inputs, node.config, state, neuroBus);
                
                if (result && result.state) {
                     this.nodeStates.set(nodeId, result.state);
                }

                // Store output for downstream
                if (result && result.output !== undefined) {
                    tickOutputs.set(nodeId, result.output);
                    this.lastOutputs.set(nodeId, result.output);
                    this.lastUpdates.set(nodeId, Date.now());
                }
            } catch (e) {
                console.error(`Error executing node ${nodeId}:`, e);
            }
        }

        // Clear buffer after processing
        this.frameBuffer.clear();

        if (this.isRunning) {
            this.animationFrameId = requestAnimationFrame(() => this.tick());
        }
    }

    private getTopologicalSort(): string[] {
        if (!this.graph) return [];
        
        const visited = new Set<string>();
        const sorted: string[] = [];
        const nodes = this.graph.nodes;

        const visit = (nodeId: string) => {
            if (visited.has(nodeId)) return;
            
            const node = nodes[nodeId];
            if (node) {
                if (node.inputs && Array.isArray(node.inputs)) { // Safety Check
                    node.inputs.forEach(inputId => visit(inputId));
                }
                visited.add(nodeId);
                sorted.push(nodeId);
            }
        };

        Object.keys(nodes).forEach(id => visit(id));
        
        return sorted;
    }
}

export const streamEngine = new StreamEngine();