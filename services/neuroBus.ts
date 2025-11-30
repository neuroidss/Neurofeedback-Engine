

import { NeuroFrame } from '../types';

type Subscriber = (frame: NeuroFrame) => void;

export class NeuroBusService {
    private subscribers: Set<Subscriber> = new Set();
    private history: NeuroFrame[] = [];
    private maxHistory = 100;

    public publish(frame: NeuroFrame) {
        // Add to short-term history for debugging/replay
        this.history.push(frame);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }

        // Notify subscribers
        this.subscribers.forEach(sub => {
            try {
                sub(frame);
            } catch (e) {
                console.error("Error in NeuroBus subscriber:", e);
            }
        });
    }

    public subscribe(callback: Subscriber): () => void {
        this.subscribers.add(callback);
        return () => this.subscribers.delete(callback);
    }

    public getHistory(typeFilter?: string): NeuroFrame[] {
        if (typeFilter) {
            return this.history.filter(f => f.type === typeFilter);
        }
        return [...this.history];
    }
    
    public clearHistory() {
        this.history = [];
    }
}

// Singleton instance
export const neuroBus = new NeuroBusService();