
export const NQ_AKASHIC_PY = `
# ==================================================================================
# 🧠 NEURO-AKASHIC ENGINE V2.1 (Genome-Integrated)
# ==================================================================================
import os
import time
import json
import threading
import pickle
import numpy as np
import networkx as nx
from typing import List, Dict, Any

# Try to import heavy ML libs safely
try:
    from sentence_transformers import SentenceTransformer
    from sklearn.metrics.pairwise import cosine_similarity
except ImportError:
    SentenceTransformer = None
    cosine_similarity = None

def log(msg, tag="MEM"):
    print(f"[{time.strftime('%H:%M:%S')}] [{tag}] {msg}", flush=True)

class MemoryNode:
    def __init__(self, node_id, content, embedding, node_type="event", bio_tags=None, entities=None):
        self.id = node_id
        self.content = content
        self.embedding = embedding # Numpy array (384,)
        self.type = node_type # 'event', 'entity', 'concept', 'gene'
        self.bio_tags = bio_tags or {} # {'focus': 0.8, 'arousal': 0.2}
        self.entities = entities or []
        self.access_count = 0
        self.creation_time = time.time()
        self.last_access = time.time()

class AkashicEngine:
    def __init__(self, session_id):
        self.session_id = session_id
        self.graph = nx.Graph()
        self.nodes = {} # id -> MemoryNode
        
        # Use Global SESSIONS_DIR for absolute path
        root = globals().get("SESSIONS_DIR", "sessions")
        self.save_path = os.path.join(root, session_id, "akashic_v2.pkl")
        
        # --- MODEL LOADING (Lazy) ---
        self.embedder = None
        self.model_name = 'all-MiniLM-L6-v2' # Very fast, lightweight
        self.lock = threading.Lock()
        
        # Background worker for heavy embedding tasks
        self.queue = [] 
        self.is_running = True
        self.worker_thread = threading.Thread(target=self._worker_loop, daemon=True)
        self.worker_thread.start()
        
        # --- EPIGENETIC STATE ---
        self.active_genome = {} # { 'ACTN3': 'CC', ... }

        # Load existing
        if os.path.exists(self.save_path):
            self.load()
        else:
            log("Initializing new Neural Graph...", "MEM")
            # Create Self Node
            self._ensure_concept_node("concept_self", "The Player Character")

    def update_genome_context(self, genome):
        """
        Updates the genetic context. Creates permanent 'Gene Nodes' in the graph.
        This allows GraphRAG to route queries through biological traits.
        """
        with self.lock:
            self.active_genome = genome
            for gene_id, data in genome.items():
                node_id = f"gene_{gene_id}"
                desc = f"{gene_id} Allele {data.get('allele')}: {data.get('effect')}"
                
                # Create or Update Gene Node
                if node_id not in self.nodes:
                    emb = self._get_embedding(desc)
                    self.nodes[node_id] = MemoryNode(node_id, desc, emb, "gene")
                    self.graph.add_node(node_id)
                    log(f"🧬 Epigenetic Indexing: Added {node_id}", "MEM")
                
                # Strong Link to Self (The player IS their genes)
                if self.graph.has_node("concept_self"):
                    self.graph.add_edge("concept_self", node_id, weight=5.0, type='biological')

    def _load_model(self):
        if self.embedder is None and SentenceTransformer:
            log(f"Loading Embedding Model ({self.model_name})...", "MEM")
            self.embedder = SentenceTransformer(self.model_name)
            log("Embedding Model Ready.", "MEM")

    def _worker_loop(self):
        """A-MEM Style: Async processing of memories to avoid lagging the game loop."""
        while self.is_running:
            if self.queue:
                task = self.queue.pop(0)
                try:
                    self._process_memory_task(task)
                except Exception as e:
                    log(f"Memory Task Failed: {e}", "ERR")
            else:
                time.sleep(0.1)

    def _get_embedding(self, text):
        self._load_model()
        if self.embedder:
            return self.embedder.encode(text)
        return np.random.rand(384) # Fallback if libs missing
        
    def _ensure_concept_node(self, node_id, text):
        if node_id not in self.nodes:
            emb = self._get_embedding(text)
            self.nodes[node_id] = MemoryNode(node_id, text, emb, "concept")
            self.graph.add_node(node_id)

    def add_memory(self, text, bio_metrics=None, entities=None, importance=1.0):
        """
        Public non-blocking add method.
        """
        task = {
            "type": "add",
            "text": text,
            "bio": bio_metrics,
            "entities": entities,
            "importance": importance
        }
        self.queue.append(task)

    def _process_memory_task(self, task):
        """
        Internal logic combining A-MEM (Evolution) and HippoRAG (Graph linking).
        """
        text = task['text']
        bio = task['bio']
        entities = task['entities'] or []
        
        # 1. Embed
        emb = self._get_embedding(text)
        node_id = f"mem_{int(time.time()*1000)}"
        
        with self.lock:
            # 2. Create Node
            new_node = MemoryNode(node_id, text, emb, "event", bio, entities)
            self.nodes[node_id] = new_node
            self.graph.add_node(node_id)
            
            # 3. HippoRAG: Link to Entities (The "Association" Layer)
            for ent in entities:
                ent_id = f"ent_{ent.lower().replace(' ', '_')}"
                self._ensure_concept_node(ent_id, ent)
                self.graph.add_edge(node_id, ent_id, weight=2.0)

            # 4. GENOMIC ANCHORING
            # Automatically link new memories to active genes if semantic relevance is found
            if self.active_genome:
                for gene_id, data in self.active_genome.items():
                    gene_node_id = f"gene_{gene_id}"
                    if gene_node_id in self.nodes:
                        gene_node = self.nodes[gene_node_id]
                        # Calc similarity between Memory and Gene Effect
                        if cosine_similarity and gene_node.embedding is not None:
                            sim = cosine_similarity([emb], [gene_node.embedding])[0][0]
                            if sim > 0.3: # Low threshold for implicit association
                                self.graph.add_edge(node_id, gene_node_id, weight=sim*2.0, type='epigenetic')

            # 5. A-MEM: Evolution & Similarity Linking
            # Find similar existing nodes to link (Vector Search)
            all_ids = list(self.nodes.keys())
            scan_targets = all_ids[-500:] if len(all_ids) > 500 else all_ids
            
            for existing_id in scan_targets:
                if existing_id == node_id: continue
                existing_node = self.nodes[existing_id]
                if existing_node.type != 'event': continue
                
                # Compute Cosine Sim
                if cosine_similarity and existing_node.embedding is not None:
                    sim = cosine_similarity([emb], [existing_node.embedding])[0][0]
                else:
                    sim = 0
                
                if sim > 0.6: # Threshold for semantic link
                    self.graph.add_edge(node_id, existing_id, weight=sim)
            
            # 6. Temporal Link (Chain of Thought)
            events = [n for n in self.nodes.values() if n.type == 'event' and n.id != node_id]
            if events:
                last_event = max(events, key=lambda x: x.creation_time)
                self.graph.add_edge(last_event.id, node_id, weight=1.5, type='temporal')

            self.save_snapshot()
            log(f"🧠 Consolidating Memory: '{text[:30]}...' (Graph Size: {len(self.graph.nodes)})", "MEM")

    def retrieve(self, query_text, current_bio_metrics=None, top_k=5):
        """
        HippoRAG Implementation with BIOLOGICAL BIAS.
        """
        if not self.nodes: return []
        
        # 1. Identify "Seeds" via Vector Search
        query_emb = self._get_embedding(query_text)
        seeds = {}
        
        with self.lock:
            # A. Query Seeds
            for nid, node in self.nodes.items():
                if cosine_similarity and node.embedding is not None:
                    sim = cosine_similarity([query_emb], [node.embedding])[0][0]
                else: sim = 0
                
                if sim > 0.3: seeds[nid] = sim * 1.0

            # B. GENOMIC SEEDS (The "Biology Filter")
            # Always activate gene nodes slightly
            for gene_id in self.active_genome:
                gid = f"gene_{gene_id}"
                if gid in self.nodes:
                    seeds[gid] = seeds.get(gid, 0) + 0.2

        if not seeds: return []

        # 2. Run Personalized PageRank (The Hippocampal Algorithm)
        try:
            ppr_scores = nx.pagerank(self.graph, personalization=seeds, alpha=0.85)
        except Exception as e:
            ppr_scores = seeds

        # 3. Sort and Return
        sorted_nodes = sorted(ppr_scores.items(), key=lambda x: x[1], reverse=True)
        
        results = []
        with self.lock:
            for nid, score in sorted_nodes:
                if nid not in self.nodes: continue
                node = self.nodes[nid]
                if node.type == 'event': 
                    results.append(node)
                    if len(results) >= top_k: break
        
        return results

    def get_context_string(self, query, bio_metrics=None):
        memories = self.retrieve(query, bio_metrics)
        if not memories: return "No relevant memories."
        
        out = []
        for m in memories:
            tag = ""
            if m.bio_tags:
                f = m.bio_tags.get('focus', 0.5)
                if f > 0.7: tag = "[LUCID] "
                elif f < 0.4: tag = "[DREAM] "
            out.append(f"{tag}{m.content}")
            
        return "\\n".join(out)

    def save_snapshot(self):
        try:
            data = { "graph": self.graph, "nodes": self.nodes, "genome": self.active_genome }
            with open(self.save_path, 'wb') as f: pickle.dump(data, f)
        except Exception as e: log(f"Save Failed: {e}", "ERR")

    def load(self):
        try:
            with open(self.save_path, 'rb') as f:
                data = pickle.load(f)
                self.graph = data["graph"]
                self.nodes = data["nodes"]
                self.active_genome = data.get("genome", {})
            log(f"Loaded {len(self.nodes)} memories. Active Genes: {len(self.active_genome)}", "MEM")
        except: pass
`