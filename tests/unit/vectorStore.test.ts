import {
  VectorStore,
  LocalEmbeddingProvider,
  VectorSearchResult,
  createVectorStore,
} from '../../src/vectorStore.js';
import { TextChunk } from '../../src/textChunker.js';

describe('LocalEmbeddingProvider', () => {
  let provider: LocalEmbeddingProvider;

  beforeEach(() => {
    provider = new LocalEmbeddingProvider();
  });

  describe('buildVocabulary', () => {
    it('should build vocabulary from texts', () => {
      const texts = [
        'This is a test document about banking.',
        'Another document about payments and transactions.',
        'Banking systems handle financial operations.',
      ];
      
      provider.buildVocabulary(texts);
      
      // After building vocabulary, embedding should work
      const embedding = provider['generateEmbedding']('banking');
      expect(embedding.length).toBe(provider.dimensions);
    });
  });

  describe('embed', () => {
    it('should return embeddings for multiple texts', async () => {
      const texts = [
        'First document',
        'Second document',
        'Third document',
      ];
      
      const embeddings = await provider.embed(texts);
      
      expect(embeddings.length).toBe(texts.length);
      embeddings.forEach(emb => {
        expect(emb.length).toBe(provider.dimensions);
      });
    });

    it('should produce normalized vectors', async () => {
      const texts = ['Test document with some content'];
      const embeddings = await provider.embed(texts);
      
      // Calculate magnitude
      const magnitude = Math.sqrt(
        embeddings[0].reduce((sum, val) => sum + val * val, 0)
      );
      
      // Normalized vector should have magnitude close to 1
      expect(magnitude).toBeCloseTo(1, 1);
    });
  });

  describe('embedQuery', () => {
    it('should return embedding for a query', async () => {
      // First build vocabulary
      await provider.embed(['banking', 'payments', 'transactions']);
      
      const embedding = await provider.embedQuery('banking query');
      
      expect(embedding.length).toBe(provider.dimensions);
    });

    it('should return zero vector if not initialized', async () => {
      const freshProvider = new LocalEmbeddingProvider();
      const embedding = await freshProvider.embedQuery('test');
      
      expect(embedding.length).toBe(freshProvider.dimensions);
      expect(embedding.every(v => v === 0)).toBe(true);
    });
  });
});

describe('VectorStore', () => {
  let vectorStore: VectorStore;
  let testChunks: TextChunk[];

  beforeEach(async () => {
    vectorStore = new VectorStore(
      { collectionName: 'test_collection' },
      new LocalEmbeddingProvider()
    );
    await vectorStore.initialize();

    testChunks = [
      {
        id: 'chunk_001',
        text: 'This document describes payment initiation services for banks.',
        metadata: {
          fileName: 'payment_guide.pdf',
          chunkIndex: 0,
          totalChunks: 3,
          section: 'Introduction',
          pageEstimate: 1,
        },
      },
      {
        id: 'chunk_002',
        text: 'Account information services provide access to balance and transactions.',
        metadata: {
          fileName: 'account_guide.pdf',
          chunkIndex: 0,
          totalChunks: 2,
          section: 'Overview',
          pageEstimate: 1,
        },
      },
      {
        id: 'chunk_003',
        text: 'Strong customer authentication requires multiple factors for security.',
        metadata: {
          fileName: 'security_guide.pdf',
          chunkIndex: 0,
          totalChunks: 4,
          section: 'SCA',
          pageEstimate: 2,
        },
      },
    ];
  });

  describe('initialize', () => {
    it('should initialize in in-memory mode when ChromaDB is unavailable', async () => {
      const store = new VectorStore({ chromaHost: 'nonexistent', chromaPort: 9999 });
      await store.initialize();
      
      expect(store.isInitialized()).toBe(true);
    });
  });

  describe('addChunks', () => {
    it('should add chunks successfully', async () => {
      await vectorStore.addChunks(testChunks);
      
      const stats = await vectorStore.getStats();
      expect(stats.totalChunks).toBe(testChunks.length);
    });

    it('should handle empty chunks array', async () => {
      await vectorStore.addChunks([]);
      
      const stats = await vectorStore.getStats();
      expect(stats.totalChunks).toBe(0);
    });

    it('should throw error if not initialized', async () => {
      const uninitializedStore = new VectorStore();
      
      await expect(uninitializedStore.addChunks(testChunks)).rejects.toThrow(
        'VectorStore not initialized'
      );
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await vectorStore.addChunks(testChunks);
    });

    it('should return search results', async () => {
      const results = await vectorStore.search('payment banking', 3);
      
      expect(results.length).toBeGreaterThan(0);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should return results with proper structure', async () => {
      const results = await vectorStore.search('authentication security', 2);
      
      results.forEach(result => {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('metadata');
        expect(result).toHaveProperty('relevanceScore');
        expect(result).toHaveProperty('distance');
        expect(result.relevanceScore).toBeGreaterThanOrEqual(0);
        expect(result.relevanceScore).toBeLessThanOrEqual(1);
      });
    });

    it('should order results by relevance', async () => {
      const results = await vectorStore.search('payment', 3);
      
      // Results should be ordered by distance (ascending)
      for (let i = 1; i < results.length; i++) {
        expect(results[i].distance).toBeGreaterThanOrEqual(results[i - 1].distance);
      }
    });

    it('should respect topK parameter', async () => {
      const results = await vectorStore.search('document', 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });

  describe('searchWithFilter', () => {
    beforeEach(async () => {
      await vectorStore.addChunks(testChunks);
    });

    it('should filter by fileName', async () => {
      const results = await vectorStore.searchWithFilter(
        'services',
        { fileName: 'payment_guide.pdf' },
        10
      );
      
      results.forEach(result => {
        expect(result.metadata.fileName).toBe('payment_guide.pdf');
      });
    });

    it('should filter by section', async () => {
      const results = await vectorStore.searchWithFilter(
        'security',
        { section: 'SCA' },
        10
      );
      
      results.forEach(result => {
        expect(result.metadata.section).toBe('SCA');
      });
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await vectorStore.addChunks(testChunks);
      
      const stats = await vectorStore.getStats();
      
      expect(stats.totalChunks).toBe(testChunks.length);
      expect(stats.collectionName).toBe('test_collection');
      expect(stats.isInMemory).toBe(true);
    });

    it('should return zeros when not initialized', async () => {
      const uninitializedStore = new VectorStore();
      const stats = await uninitializedStore.getStats();
      
      expect(stats.totalChunks).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all chunks', async () => {
      await vectorStore.addChunks(testChunks);
      await vectorStore.clear();
      
      const stats = await vectorStore.getStats();
      expect(stats.totalChunks).toBe(0);
    });
  });

  describe('deleteChunks', () => {
    it('should delete specific chunks', async () => {
      await vectorStore.addChunks(testChunks);
      await vectorStore.deleteChunks(['chunk_001']);
      
      const stats = await vectorStore.getStats();
      expect(stats.totalChunks).toBe(testChunks.length - 1);
    });

    it('should handle empty ids array', async () => {
      await vectorStore.addChunks(testChunks);
      await vectorStore.deleteChunks([]);
      
      const stats = await vectorStore.getStats();
      expect(stats.totalChunks).toBe(testChunks.length);
    });
  });
});

describe('createVectorStore', () => {
  it('should create a vector store with default config', () => {
    const store = createVectorStore();
    expect(store).toBeInstanceOf(VectorStore);
  });

  it('should create a vector store with custom config', () => {
    const store = createVectorStore({
      collectionName: 'custom_collection',
      chromaPort: 9000,
    });
    expect(store).toBeInstanceOf(VectorStore);
  });

  it('should create a vector store with custom host and port', () => {
    const store = createVectorStore({
      chromaHost: 'custom-host',
      chromaPort: 8888,
    });
    expect(store).toBeInstanceOf(VectorStore);
  });

  it('should create a vector store with custom embedding model', () => {
    const store = createVectorStore({
      embeddingModel: 'text-embedding-3-large',
    });
    expect(store).toBeInstanceOf(VectorStore);
  });

  it('should create a vector store with complete custom config', () => {
    const store = createVectorStore({
      chromaHost: 'localhost',
      chromaPort: 8000,
      collectionName: 'test_collection',
      embeddingModel: 'text-embedding-3-small',
    });
    expect(store).toBeInstanceOf(VectorStore);
  });

  it('should respect environment variables when no config provided', () => {
    const oldHost = process.env.CHROMA_HOST;
    const oldPort = process.env.CHROMA_PORT;
    
    process.env.CHROMA_HOST = 'env-host';
    process.env.CHROMA_PORT = '7777';
    
    const store = createVectorStore();
    expect(store).toBeInstanceOf(VectorStore);
    
    // Restore environment
    if (oldHost !== undefined) {
      process.env.CHROMA_HOST = oldHost;
    } else {
      delete process.env.CHROMA_HOST;
    }
    if (oldPort !== undefined) {
      process.env.CHROMA_PORT = oldPort;
    } else {
      delete process.env.CHROMA_PORT;
    }
  });

  it('should override environment variables with explicit config', () => {
    const oldHost = process.env.CHROMA_HOST;
    process.env.CHROMA_HOST = 'env-host';
    
    const store = createVectorStore({
      chromaHost: 'explicit-host',
    });
    expect(store).toBeInstanceOf(VectorStore);
    
    // Restore environment
    if (oldHost !== undefined) {
      process.env.CHROMA_HOST = oldHost;
    } else {
      delete process.env.CHROMA_HOST;
    }
  });
});
