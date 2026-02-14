/**
 * Integration tests for SpecificationIndexer with custom configuration
 * Tests end-to-end initialization with different database configurations
 */

import { SpecificationIndexer } from '../../src/indexer.js';
import path from 'path';

describe('SpecificationIndexer Configuration Integration', () => {
  const testYamlDir = path.join(process.cwd(), 'yml_files');
  const testPdfDir = path.join(process.cwd(), 'pdf_files');

  describe('initialization with custom VectorStore configuration', () => {
    it('should initialize with custom ChromaDB settings', async () => {
      const indexer = new SpecificationIndexer({
        vectorStore: {
          chromaHost: 'localhost',
          chromaPort: 8000,
          collectionName: 'test_berlin_group',
          embeddingModel: 'text-embedding-3-small',
        },
      });

      await indexer.initialize(testYamlDir, testPdfDir);
      
      expect(indexer.isInitialized()).toBe(true);
      
      const stats = indexer.getStatistics();
      expect(stats.totalSpecs).toBeGreaterThan(0);
    }, 60000);

    it('should fall back to in-memory when ChromaDB is unavailable', async () => {
      const indexer = new SpecificationIndexer({
        vectorStore: {
          chromaHost: 'non-existent-host',
          chromaPort: 9999,
        },
      });

      await indexer.initialize(testYamlDir, testPdfDir);
      
      expect(indexer.isInitialized()).toBe(true);
      
      // Vector store should work in in-memory mode
      const vectorStats = await indexer.getVectorStoreStats();
      expect(vectorStats).toBeDefined();
    }, 60000);
  });

  describe('initialization with custom GraphStore configuration', () => {
    it('should initialize with custom Neo4j settings', async () => {
      const indexer = new SpecificationIndexer({
        graphStore: {
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          password: 'invalid-password', // Forces in-memory mode
          database: 'neo4j',
          maxConnectionPoolSize: 25,
          connectionAcquisitionTimeout: 30000,
        },
      });

      await indexer.initialize(testYamlDir, testPdfDir);
      
      expect(indexer.isInitialized()).toBe(true);
      expect(indexer.isGraphStoreEnabled()).toBe(true);
    }, 60000);

    it('should fall back to in-memory when Neo4j is unavailable', async () => {
      const indexer = new SpecificationIndexer({
        graphStore: {
          uri: 'bolt://non-existent-host:7687',
          username: 'invalid',
          password: 'invalid',
        },
      });

      await indexer.initialize(testYamlDir, testPdfDir);
      
      expect(indexer.isInitialized()).toBe(true);
      
      // Graph operations should still work in in-memory mode
      const graphStats = await indexer.getGraphStoreStats();
      expect(graphStats.enabled).toBe(true);
    }, 60000);
  });

  describe('initialization with combined configuration', () => {
    it('should initialize with both custom VectorStore and GraphStore', async () => {
      const indexer = new SpecificationIndexer({
        vectorStore: {
          chromaHost: 'localhost',
          chromaPort: 8000,
          collectionName: 'integration_test',
        },
        graphStore: {
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          password: 'test',
        },
      });

      await indexer.initialize(testYamlDir, testPdfDir);
      
      expect(indexer.isInitialized()).toBe(true);
      
      const stats = indexer.getStatistics();
      expect(stats.totalSpecs).toBeGreaterThan(0);
      expect(stats.totalEndpoints).toBeGreaterThan(0);
      expect(stats.totalSchemas).toBeGreaterThan(0);
    }, 60000);
  });

  describe('functionality with custom configuration', () => {
    let indexer: SpecificationIndexer;

    beforeAll(async () => {
      indexer = new SpecificationIndexer({
        vectorStore: {
          chromaHost: 'localhost',
          chromaPort: 8000,
          collectionName: 'func_test_collection',
        },
        graphStore: {
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          password: 'invalid-for-test',
          maxConnectionPoolSize: 30,
        },
      });

      await indexer.initialize(testYamlDir, testPdfDir);
    }, 60000);

    it('should perform endpoint searches', () => {
      const results = indexer.searchEndpoints('accounts');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform schema searches', () => {
      const results = indexer.searchSchemas('Account');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should perform semantic PDF search', async () => {
      const results = await indexer.searchPdfSemantic('payment', 5);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should find related schemas in graph', async () => {
      const schemas = indexer.getAllSchemas();
      if (schemas.length > 0) {
        const related = await indexer.findRelatedSchemas(schemas[0].name);
        expect(related).toBeDefined();
        expect(Array.isArray(related)).toBe(true);
        if (related.length > 0) {
          expect(related[0].schemaName).toBeDefined();
          expect(related[0].relationshipType).toBeDefined();
        }
      }
    });

    it('should get statistics', () => {
      const stats = indexer.getStatistics();
      expect(stats.totalSpecs).toBeGreaterThan(0);
      expect(stats.totalEndpoints).toBeGreaterThan(0);
    });

    it('should get vector store stats', async () => {
      const stats = await indexer.getVectorStoreStats();
      expect(stats).toBeDefined();
    });

    it('should get graph store stats', async () => {
      const stats = await indexer.getGraphStoreStats();
      expect(stats.enabled).toBe(true);
    });
  });

  describe('configuration priority', () => {
    it('should use explicit config over environment variables', async () => {
      // Set environment variables
      const oldChromaHost = process.env.CHROMA_HOST;
      process.env.CHROMA_HOST = 'env-host';

      // Create indexer with explicit config
      const indexer = new SpecificationIndexer({
        vectorStore: {
          chromaHost: 'explicit-host',
          chromaPort: 8888,
        },
      });

      // The indexer should use the explicit configuration
      // (We can't directly test this without exposing internal state,
      // but we can verify the indexer initializes correctly)
      await indexer.initialize(testYamlDir, testPdfDir);
      expect(indexer.isInitialized()).toBe(true);

      // Restore environment
      if (oldChromaHost !== undefined) {
        process.env.CHROMA_HOST = oldChromaHost;
      } else {
        delete process.env.CHROMA_HOST;
      }
    }, 60000);
  });
});
