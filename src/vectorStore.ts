/**
 * Vector Store for PDF Documents
 * ChromaDB integration for semantic search capabilities
 */

import { ChromaClient, Collection, IncludeEnum } from 'chromadb';
import { TextChunk, ChunkMetadata } from './textChunker.js';

export interface VectorSearchResult {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  relevanceScore: number;
  distance: number;
}

export interface VectorStoreConfig {
  collectionName: string;
  chromaHost?: string;
  chromaPort?: number;
  embeddingModel?: string;
}

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
  dimensions: number;
}

/**
 * Simple local embedding provider using basic TF-IDF-like approach
 * For production, replace with OpenAI, Cohere, or other embedding APIs
 */
export class LocalEmbeddingProvider implements EmbeddingProvider {
  public dimensions: number = 384;
  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private isInitialized: boolean = false;

  /**
   * Build vocabulary from corpus of texts
   */
  buildVocabulary(texts: string[]): void {
    const documentFrequency: Map<string, number> = new Map();
    const allTerms: Set<string> = new Set();

    // Count document frequency for each term
    for (const text of texts) {
      const terms = this.tokenize(text);
      const uniqueTerms = new Set(terms);
      
      for (const term of uniqueTerms) {
        allTerms.add(term);
        documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
      }
    }

    // Build vocabulary (limited to most common terms)
    const sortedTerms = Array.from(allTerms)
      .map(term => ({ term, freq: documentFrequency.get(term) || 0 }))
      .sort((a, b) => b.freq - a.freq)
      .slice(0, this.dimensions);

    this.vocabulary.clear();
    this.idfScores.clear();

    sortedTerms.forEach((item, index) => {
      this.vocabulary.set(item.term, index);
      // IDF score
      const idf = Math.log(texts.length / (item.freq + 1)) + 1;
      this.idfScores.set(item.term, idf);
    });

    this.isInitialized = true;
  }

  /**
   * Tokenize text into terms
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 2);
  }

  /**
   * Generate embedding for a single text
   */
  private generateEmbedding(text: string): number[] {
    const embedding = new Array(this.dimensions).fill(0);
    const terms = this.tokenize(text);
    const termFrequency: Map<string, number> = new Map();

    // Count term frequency
    for (const term of terms) {
      termFrequency.set(term, (termFrequency.get(term) || 0) + 1);
    }

    // Build TF-IDF vector
    for (const [term, tf] of termFrequency) {
      const index = this.vocabulary.get(term);
      if (index !== undefined) {
        const idf = this.idfScores.get(term) || 1;
        embedding[index] = (tf / terms.length) * idf;
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized) {
      this.buildVocabulary(texts);
    }
    return texts.map(text => this.generateEmbedding(text));
  }

  async embedQuery(query: string): Promise<number[]> {
    if (!this.isInitialized) {
      // Return zero vector if not initialized
      return new Array(this.dimensions).fill(0);
    }
    return this.generateEmbedding(query);
  }
}

/**
 * OpenAI Embedding Provider (requires API key)
 */
export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  public dimensions: number = 1536; // text-embedding-3-small
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'text-embedding-3-small') {
    this.apiKey = apiKey;
    this.model = model;
    
    if (model === 'text-embedding-3-large') {
      this.dimensions = 3072;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json() as { data: Array<{ embedding: number[] }> };
    return data.data.map(item => item.embedding);
  }

  async embedQuery(query: string): Promise<number[]> {
    const embeddings = await this.embed([query]);
    return embeddings[0];
  }
}

const DEFAULT_CONFIG: VectorStoreConfig = {
  collectionName: 'berlin_group_pdfs',
  chromaHost: 'localhost',
  chromaPort: 8000,
};

/**
 * VectorStore class for managing PDF document embeddings with ChromaDB
 */
export class VectorStore {
  private client: ChromaClient | null = null;
  private collection: Collection | null = null;
  private config: VectorStoreConfig;
  private embeddingProvider: EmbeddingProvider;
  private initialized: boolean = false;
  private useInMemory: boolean = false;
  private inMemoryStore: Map<string, { embedding: number[]; text: string; metadata: ChunkMetadata }> = new Map();

  constructor(
    config: Partial<VectorStoreConfig> = {},
    embeddingProvider?: EmbeddingProvider
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.embeddingProvider = embeddingProvider || new LocalEmbeddingProvider();
  }

  /**
   * Initialize the vector store connection
   */
  async initialize(): Promise<void> {
    try {
      // Try to connect to ChromaDB server
      this.client = new ChromaClient({
        path: `http://${this.config.chromaHost}:${this.config.chromaPort}`,
      });

      // Test connection
      await this.client.heartbeat();

      // Get or create collection
      this.collection = await this.client.getOrCreateCollection({
        name: this.config.collectionName,
        metadata: {
          'hnsw:space': 'cosine',
          description: 'Berlin Group PDF documentation embeddings',
        },
      });

      this.useInMemory = false;
      this.initialized = true;
      console.log(`Connected to ChromaDB at ${this.config.chromaHost}:${this.config.chromaPort}`);
    } catch (error) {
      console.warn('ChromaDB server not available, using in-memory fallback');
      this.useInMemory = true;
      this.initialized = true;
    }
  }

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Add chunks to the vector store
   */
  async addChunks(chunks: TextChunk[]): Promise<void> {
    if (!this.initialized) {
      throw new Error('VectorStore not initialized. Call initialize() first.');
    }

    if (chunks.length === 0) return;

    // Build vocabulary for local embeddings
    if (this.embeddingProvider instanceof LocalEmbeddingProvider) {
      this.embeddingProvider.buildVocabulary(chunks.map(c => c.text));
    }

    // Generate embeddings
    const texts = chunks.map(c => c.text);
    const embeddings = await this.embeddingProvider.embed(texts);

    if (this.useInMemory) {
      // Store in memory
      for (let i = 0; i < chunks.length; i++) {
        this.inMemoryStore.set(chunks[i].id, {
          embedding: embeddings[i],
          text: chunks[i].text,
          metadata: chunks[i].metadata,
        });
      }
      console.log(`Added ${chunks.length} chunks to in-memory store`);
    } else {
      // Store in ChromaDB
      await this.collection!.add({
        ids: chunks.map(c => c.id),
        embeddings: embeddings,
        documents: texts,
        metadatas: chunks.map(c => ({
          fileName: c.metadata.fileName,
          chunkIndex: c.metadata.chunkIndex,
          totalChunks: c.metadata.totalChunks || 0,
          section: c.metadata.section || '',
          pageEstimate: c.metadata.pageEstimate || 0,
        })),
      });
      console.log(`Added ${chunks.length} chunks to ChromaDB`);
    }
  }

  /**
   * Perform semantic search
   */
  async search(query: string, topK: number = 10): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      throw new Error('VectorStore not initialized. Call initialize() first.');
    }

    const queryEmbedding = await this.embeddingProvider.embedQuery(query);

    if (this.useInMemory) {
      return this.inMemorySearch(queryEmbedding, topK);
    }

    // Query ChromaDB
    const results = await this.collection!.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
    });

    if (!results.documents?.[0]) {
      return [];
    }

    return results.documents[0].map((doc, i) => ({
      id: results.ids[0][i],
      text: doc || '',
      metadata: {
        fileName: String(results.metadatas?.[0]?.[i]?.fileName || ''),
        chunkIndex: Number(results.metadatas?.[0]?.[i]?.chunkIndex || 0),
        totalChunks: Number(results.metadatas?.[0]?.[i]?.totalChunks || 0),
        section: String(results.metadatas?.[0]?.[i]?.section || ''),
        pageEstimate: Number(results.metadatas?.[0]?.[i]?.pageEstimate || 0),
      },
      distance: results.distances?.[0]?.[i] || 0,
      relevanceScore: 1 - (results.distances?.[0]?.[i] || 0),
    }));
  }

  /**
   * In-memory cosine similarity search
   */
  private inMemorySearch(queryEmbedding: number[], topK: number): VectorSearchResult[] {
    const results: Array<{
      id: string;
      distance: number;
      text: string;
      metadata: ChunkMetadata;
    }> = [];

    for (const [id, item] of this.inMemoryStore) {
      const distance = this.cosineDistance(queryEmbedding, item.embedding);
      results.push({
        id,
        distance,
        text: item.text,
        metadata: item.metadata,
      });
    }

    // Sort by distance (ascending) and take top K
    results.sort((a, b) => a.distance - b.distance);
    
    return results.slice(0, topK).map(r => ({
      id: r.id,
      text: r.text,
      metadata: r.metadata,
      distance: r.distance,
      relevanceScore: 1 - r.distance,
    }));
  }

  /**
   * Calculate cosine distance between two vectors
   */
  private cosineDistance(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    return 1 - similarity; // Convert to distance
  }

  /**
   * Search with metadata filters
   */
  async searchWithFilter(
    query: string,
    filter: Partial<ChunkMetadata>,
    topK: number = 10
  ): Promise<VectorSearchResult[]> {
    if (!this.initialized) {
      throw new Error('VectorStore not initialized. Call initialize() first.');
    }

    const queryEmbedding = await this.embeddingProvider.embedQuery(query);

    if (this.useInMemory) {
      // Filter in-memory results
      const allResults = this.inMemorySearch(queryEmbedding, this.inMemoryStore.size);
      return allResults
        .filter(r => {
          if (filter.fileName && r.metadata.fileName !== filter.fileName) return false;
          if (filter.section && r.metadata.section !== filter.section) return false;
          return true;
        })
        .slice(0, topK);
    }

    // Build ChromaDB where clause
    const whereClause: Record<string, any> = {};
    if (filter.fileName) {
      whereClause.fileName = filter.fileName;
    }
    if (filter.section) {
      whereClause.section = filter.section;
    }

    const results = await this.collection!.query({
      queryEmbeddings: [queryEmbedding],
      nResults: topK,
      where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      include: [IncludeEnum.Documents, IncludeEnum.Metadatas, IncludeEnum.Distances],
    });

    if (!results.documents?.[0]) {
      return [];
    }

    return results.documents[0].map((doc, i) => ({
      id: results.ids[0][i],
      text: doc || '',
      metadata: {
        fileName: String(results.metadatas?.[0]?.[i]?.fileName || ''),
        chunkIndex: Number(results.metadatas?.[0]?.[i]?.chunkIndex || 0),
        totalChunks: Number(results.metadatas?.[0]?.[i]?.totalChunks || 0),
        section: String(results.metadatas?.[0]?.[i]?.section || ''),
        pageEstimate: Number(results.metadatas?.[0]?.[i]?.pageEstimate || 0),
      },
      distance: results.distances?.[0]?.[i] || 0,
      relevanceScore: 1 - (results.distances?.[0]?.[i] || 0),
    }));
  }

  /**
   * Get collection statistics
   */
  async getStats(): Promise<{
    totalChunks: number;
    collectionName: string;
    isInMemory: boolean;
  }> {
    if (!this.initialized) {
      return {
        totalChunks: 0,
        collectionName: this.config.collectionName,
        isInMemory: this.useInMemory,
      };
    }

    const count = this.useInMemory
      ? this.inMemoryStore.size
      : await this.collection!.count();

    return {
      totalChunks: count,
      collectionName: this.config.collectionName,
      isInMemory: this.useInMemory,
    };
  }

  /**
   * Clear all data from the collection
   */
  async clear(): Promise<void> {
    if (!this.initialized) return;

    if (this.useInMemory) {
      this.inMemoryStore.clear();
    } else {
      // Delete and recreate collection
      await this.client!.deleteCollection({ name: this.config.collectionName });
      this.collection = await this.client!.createCollection({
        name: this.config.collectionName,
        metadata: {
          'hnsw:space': 'cosine',
          description: 'Berlin Group PDF documentation embeddings',
        },
      });
    }
  }

  /**
   * Delete specific chunks by IDs
   */
  async deleteChunks(ids: string[]): Promise<void> {
    if (!this.initialized || ids.length === 0) return;

    if (this.useInMemory) {
      for (const id of ids) {
        this.inMemoryStore.delete(id);
      }
    } else {
      await this.collection!.delete({ ids });
    }
  }
}

/**
 * Factory function to create VectorStore with configuration from environment
 */
export function createVectorStore(config?: Partial<VectorStoreConfig>): VectorStore {
  const envConfig: Partial<VectorStoreConfig> = {
    chromaHost: process.env.CHROMA_HOST || 'localhost',
    chromaPort: parseInt(process.env.CHROMA_PORT || '8000', 10),
    collectionName: process.env.CHROMA_COLLECTION || 'berlin_group_pdfs',
  };

  // Use OpenAI embeddings if API key is available
  let embeddingProvider: EmbeddingProvider | undefined;
  if (process.env.OPENAI_API_KEY) {
    embeddingProvider = new OpenAIEmbeddingProvider(
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'
    );
  }

  return new VectorStore({ ...envConfig, ...config }, embeddingProvider);
}
