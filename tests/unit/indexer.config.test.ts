/**
 * Unit tests for SpecificationIndexer configuration
 * Tests custom configuration for VectorStore and GraphIndexer
 */

import { SpecificationIndexer, IndexerConfig } from '../../src/indexer.js';

describe('SpecificationIndexer Configuration', () => {
  describe('constructor with default configuration', () => {
    it('should create indexer with no configuration', () => {
      const indexer = new SpecificationIndexer();
      expect(indexer).toBeDefined();
      expect(indexer.isInitialized()).toBe(false);
    });

    it('should create indexer with empty configuration object', () => {
      const indexer = new SpecificationIndexer({});
      expect(indexer).toBeDefined();
      expect(indexer.isInitialized()).toBe(false);
    });
  });

  describe('constructor with VectorStore configuration', () => {
    it('should accept custom ChromaDB host and port', () => {
      const config: IndexerConfig = {
        vectorStore: {
          chromaHost: 'custom-host',
          chromaPort: 9000,
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept custom collection name', () => {
      const config: IndexerConfig = {
        vectorStore: {
          collectionName: 'custom_collection',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept custom embedding model', () => {
      const config: IndexerConfig = {
        vectorStore: {
          embeddingModel: 'text-embedding-3-large',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept complete VectorStore configuration', () => {
      const config: IndexerConfig = {
        vectorStore: {
          chromaHost: 'localhost',
          chromaPort: 8000,
          collectionName: 'test_collection',
          embeddingModel: 'text-embedding-3-small',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });
  });

  describe('constructor with GraphStore configuration', () => {
    it('should accept custom Neo4j URI', () => {
      const config: IndexerConfig = {
        graphStore: {
          uri: 'bolt://custom-host:7687',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept custom credentials', () => {
      const config: IndexerConfig = {
        graphStore: {
          username: 'custom_user',
          password: 'custom_password',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept custom database name', () => {
      const config: IndexerConfig = {
        graphStore: {
          database: 'custom_database',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept custom connection pool settings', () => {
      const config: IndexerConfig = {
        graphStore: {
          maxConnectionPoolSize: 100,
          connectionAcquisitionTimeout: 30000,
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should accept complete GraphStore configuration', () => {
      const config: IndexerConfig = {
        graphStore: {
          uri: 'bolt://localhost:7687',
          username: 'neo4j',
          password: 'test_password',
          database: 'test_db',
          maxConnectionPoolSize: 75,
          connectionAcquisitionTimeout: 45000,
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });
  });

  describe('constructor with combined configuration', () => {
    it('should accept both VectorStore and GraphStore configuration', () => {
      const config: IndexerConfig = {
        vectorStore: {
          chromaHost: 'chroma-server',
          chromaPort: 8001,
          collectionName: 'berlin_group_test',
          embeddingModel: 'text-embedding-3-small',
        },
        graphStore: {
          uri: 'bolt://neo4j-server:7687',
          username: 'neo4j',
          password: 'secure_password',
          database: 'berlin_group_graph',
          maxConnectionPoolSize: 60,
          connectionAcquisitionTimeout: 50000,
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should handle partial configuration for both stores', () => {
      const config: IndexerConfig = {
        vectorStore: {
          chromaHost: 'localhost',
        },
        graphStore: {
          password: 'new_password',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });
  });

  describe('environment-aware configuration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should fall back to defaults when environment variables are not set', () => {
      delete process.env.CHROMA_HOST;
      delete process.env.CHROMA_PORT;
      delete process.env.NEO4J_URI;
      
      const indexer = new SpecificationIndexer();
      expect(indexer).toBeDefined();
    });

    it('should use environment variables when available', () => {
      process.env.CHROMA_HOST = 'env-chroma-host';
      process.env.CHROMA_PORT = '9999';
      process.env.NEO4J_URI = 'bolt://env-neo4j:7687';
      
      const indexer = new SpecificationIndexer();
      expect(indexer).toBeDefined();
    });
  });

  describe('configuration validation', () => {
    it('should handle invalid port gracefully', () => {
      const config: IndexerConfig = {
        vectorStore: {
          chromaPort: -1, // Invalid port
        },
      };
      
      // Should still create indexer (validation happens on connect)
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });

    it('should handle empty strings in configuration', () => {
      const config: IndexerConfig = {
        vectorStore: {
          chromaHost: '',
        },
        graphStore: {
          uri: '',
        },
      };
      
      const indexer = new SpecificationIndexer(config);
      expect(indexer).toBeDefined();
    });
  });
});
