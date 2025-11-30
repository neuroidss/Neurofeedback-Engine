
import { StreamGraph, NeuroFrame, StreamNode } from '../types';
import { neuroBus } from './neuroBus';
import { NATIVE_NODE_LIBRARY } from './nodeLibrary';

export class StreamEngine {
    private graph: StreamGraph | null = null;
    private compiledNodes: Map<string, Function> = new Map();
    private nodeStates: Map<string, any> = new Map();
    private isRunning: boolean = false;
    private animationFrameId: number | null = null;
    private lastOutputs: Map<string, any> = new Map();
    private lastUpdates: Map<string, number> = new Map();
    
    private frameBuffer: Map<string, NeuroFrame[]> = new Map();

    constructor() {
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
        if (Array.isArray(graph.nodes)) {
            const nodeRecord: Record<string, StreamNode> = {};
            // @ts-ignore
            graph.nodes.forEach((node: StreamNode) => { if (node.id) nodeRecord[node.id] = node; });
            graph.nodes = nodeRecord;
        }
        
        this.graph = graph;
        this.compiledNodes.clear();
        this.nodeStates.clear();
        this.frameBuffer.clear();
        this.lastOutputs.clear();
        this.lastUpdates.clear();

        Object.values(graph.nodes).forEach(node => {
            if (node.inputs && !Array.isArray(node.inputs)) {
                if (typeof node.inputs === 'object') node.inputs = Object.values(node.inputs);
                else node.inputs = [];
            }
            this.compileNode(node);
        });
        
        console.log(`[StreamEngine] Graph ${graph.id} loaded with ${this.compiledNodes.size} nodes.`);
    }

    private compileNode(node: StreamNode) {
        try {
            // 1. Use Native Library if nodeType is provided and exists
            // This avoids eval() and reduces code size significantly
            if (node.nodeType && NATIVE_NODE_LIBRARY[node.nodeType]) {
                this.compiledNodes.set(node.id, NATIVE_NODE_LIBRARY[node.nodeType]);
            } 
            // 2. Fallback to 'type' matching standard library (backward compatibility)
            else if (node.type && NATIVE_NODE_LIBRARY[node.type]) {
                 this.compiledNodes.set(node.id, NATIVE_NODE_LIBRARY[node.type]);
            }
            // 3. Custom JS Implementation (Eval)
            else if (node.implementation) {
                const impl = new Function('inputs', 'config', 'state', 'bus', `
                    return (async () => { ${node.implementation} })();
                `);
                this.compiledNodes.set(node.id, impl as Function);
            } else {
                console.warn(`[StreamEngine] Node ${node.id} has no implementation or valid nodeType.`);
            }

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
        const existing = this.graph.nodes[node.id];
        if (existing && existing.implementation === node.implementation && existing.nodeType === node.nodeType && JSON.stringify(existing.config) === JSON.stringify(node.config)) {
            return;
        }
        if (node.inputs && !Array.isArray(node.inputs)) {
            if (typeof node.inputs === 'object') node.inputs = Object.values(node.inputs);
            else node.inputs = [];
        }
        this.graph.nodes[node.id] = node;
        this.compileNode(node);
    }

    public connectNodes(sourceId: string, targetId: string) {
        if (!this.graph) return;
        const targetNode = this.graph.nodes[targetId];
        if (targetNode) {
            if (!targetNode.inputs) targetNode.inputs = [];
            if (!targetNode.inputs.includes(sourceId)) {
                targetNode.inputs.push(sourceId);
            }
        }
    }

    public updateNodeConfig(nodeId: string, newConfig: Record<string, any>) {
        if (!this.graph || !this.graph.nodes[nodeId]) return;
        this.graph.nodes[nodeId].config = { ...this.graph.nodes[nodeId].config, ...newConfig };
    }

    public start() {
        if (this.isRunning) return;
        if (!this.graph && this.compiledNodes.size === 0) return;
        this.isRunning = true;
        this.tick();
    }

    public stop() {
        this.isRunning = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    public getDebugState() {
        if (!this.graph) return { nodes: [], edges: [] };
        
        const nodes = Object.values(this.graph.nodes).map(n => ({
            id: n.id,
            type: n.nodeType || n.type,
            value: this.lastOutputs.get(n.id),
            lastUpdate: this.lastUpdates.get(n.id) || 0
        }));

        const edges = [];
        Object.values(this.graph.nodes).forEach(target => {
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
        const tickOutputs = new Map<string, any>();

        for (const nodeId of nodesToProcess) {
            const node = this.graph.nodes[nodeId];
            const compiledFn = this.compiledNodes.get(nodeId);
            if (!compiledFn) continue;

            const inputs: Record<string, any> = {};
            if (node.inputs && Array.isArray(node.inputs)) {
                node.inputs.forEach(inputId => {
                    inputs[inputId] = tickOutputs.get(inputId);
                });
            }
            inputs['_frameBuffer'] = Object.fromEntries(this.frameBuffer);

            try {
                const state = this.nodeStates.get(nodeId);
                // Execute
                const result = await compiledFn(inputs, node.config || {}, state, neuroBus);
                
                if (result && result.state) this.nodeStates.set(nodeId, result.state);
                if (result && result.output !== undefined) {
                    tickOutputs.set(nodeId, result.output);
                    this.lastOutputs.set(nodeId, result.output);
                    this.lastUpdates.set(nodeId, Date.now());
                }
            } catch (e) {
                console.error(`Error executing node ${nodeId}:`, e);
            }
        }
        this.frameBuffer.clear();
        if (this.isRunning) this.animationFrameId = requestAnimationFrame(() => this.tick());
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
                if (node.inputs && Array.isArray(node.inputs)) node.inputs.forEach(inputId => visit(inputId));
                visited.add(nodeId);
                sorted.push(nodeId);
            }
        };
        Object.keys(nodes).forEach(id => visit(id));
        return sorted;
    }
}

export const streamEngine = new StreamEngine();
