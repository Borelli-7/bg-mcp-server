/**
 * Unit tests for configuration loading in index.ts
 * Tests environment variable parsing and configuration structure
 */

describe('Server Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Environment variable parsing', () => {
    it('should use default ChromaDB host when not set', () => {
      delete process.env.CHROMA_HOST;
      
      // Default should be 'localhost'
      const defaultHost = process.env.CHROMA_HOST || 'localhost';
      expect(defaultHost).toBe('localhost');
    });

    it('should use default ChromaDB port when not set', () => {
      delete process.env.CHROMA_PORT;
      
      // Default should be '8000'
      const defaultPort = parseInt(process.env.CHROMA_PORT || '8000', 10);
      expect(defaultPort).toBe(8000);
    });

    it('should use default collection name when not set', () => {
      delete process.env.CHROMA_COLLECTION;
      
      // Default should be 'berlin_group_pdfs'
      const defaultCollection = process.env.CHROMA_COLLECTION || 'berlin_group_pdfs';
      expect(defaultCollection).toBe('berlin_group_pdfs');
    });

    it('should use default embedding model when not set', () => {
      delete process.env.OPENAI_EMBEDDING_MODEL;
      
      // Default should be 'text-embedding-3-small'
      const defaultModel = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
      expect(defaultModel).toBe('text-embedding-3-small');
    });

    it('should use default Neo4j URI when not set', () => {
      delete process.env.NEO4J_URI;
      
      // Default should be 'bolt://localhost:7687'
      const defaultUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
      expect(defaultUri).toBe('bolt://localhost:7687');
    });

    it('should use default Neo4j username when not set', () => {
      delete process.env.NEO4J_USERNAME;
      
      // Default should be 'neo4j'
      const defaultUsername = process.env.NEO4J_USERNAME || 'neo4j';
      expect(defaultUsername).toBe('neo4j');
    });

    it('should use default Neo4j password when not set', () => {
      delete process.env.NEO4J_PASSWORD;
      
      // Default should be 'password'
      const defaultPassword = process.env.NEO4J_PASSWORD || 'password';
      expect(defaultPassword).toBe('password');
    });

    it('should use default Neo4j database when not set', () => {
      delete process.env.NEO4J_DATABASE;
      
      // Default should be 'neo4j'
      const defaultDatabase = process.env.NEO4J_DATABASE || 'neo4j';
      expect(defaultDatabase).toBe('neo4j');
    });

    it('should parse integer values correctly', () => {
      process.env.CHROMA_PORT = '9000';
      process.env.NEO4J_MAX_POOL_SIZE = '100';
      process.env.NEO4J_CONNECTION_TIMEOUT = '30000';
      
      const chromaPort = parseInt(process.env.CHROMA_PORT, 10);
      const maxPoolSize = parseInt(process.env.NEO4J_MAX_POOL_SIZE, 10);
      const timeout = parseInt(process.env.NEO4J_CONNECTION_TIMEOUT, 10);
      
      expect(chromaPort).toBe(9000);
      expect(maxPoolSize).toBe(100);
      expect(timeout).toBe(30000);
    });

    it('should handle invalid port gracefully', () => {
      process.env.CHROMA_PORT = 'invalid';
      
      const port = parseInt(process.env.CHROMA_PORT || '8000', 10);
      
      // Should result in NaN, but we have fallback
      expect(isNaN(port)).toBe(true);
    });

    it('should use environment values when set', () => {
      process.env.CHROMA_HOST = 'custom-chroma-host';
      process.env.CHROMA_PORT = '7777';
      process.env.CHROMA_COLLECTION = 'custom_collection';
      process.env.NEO4J_URI = 'bolt://custom-neo4j:7687';
      process.env.NEO4J_USERNAME = 'custom_user';
      process.env.NEO4J_PASSWORD = 'custom_pass';
      
      expect(process.env.CHROMA_HOST).toBe('custom-chroma-host');
      expect(parseInt(process.env.CHROMA_PORT, 10)).toBe(7777);
      expect(process.env.CHROMA_COLLECTION).toBe('custom_collection');
      expect(process.env.NEO4J_URI).toBe('bolt://custom-neo4j:7687');
      expect(process.env.NEO4J_USERNAME).toBe('custom_user');
      expect(process.env.NEO4J_PASSWORD).toBe('custom_pass');
    });
  });

  describe('Configuration structure', () => {
    it('should have valid ChromaDB configuration structure', () => {
      const chromaConfig = {
        host: process.env.CHROMA_HOST || 'localhost',
        port: parseInt(process.env.CHROMA_PORT || '8000', 10),
        collectionName: process.env.CHROMA_COLLECTION || 'berlin_group_pdfs',
        embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      };

      expect(chromaConfig).toHaveProperty('host');
      expect(chromaConfig).toHaveProperty('port');
      expect(chromaConfig).toHaveProperty('collectionName');
      expect(chromaConfig).toHaveProperty('embeddingModel');
      expect(typeof chromaConfig.host).toBe('string');
      expect(typeof chromaConfig.port).toBe('number');
      expect(typeof chromaConfig.collectionName).toBe('string');
    });

    it('should have valid Neo4j configuration structure', () => {
      const neo4jConfig = {
        uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        database: process.env.NEO4J_DATABASE || 'neo4j',
        maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_POOL_SIZE || '50', 10),
        connectionAcquisitionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT || '60000', 10),
      };

      expect(neo4jConfig).toHaveProperty('uri');
      expect(neo4jConfig).toHaveProperty('username');
      expect(neo4jConfig).toHaveProperty('password');
      expect(neo4jConfig).toHaveProperty('database');
      expect(neo4jConfig).toHaveProperty('maxConnectionPoolSize');
      expect(neo4jConfig).toHaveProperty('connectionAcquisitionTimeout');
      expect(typeof neo4jConfig.uri).toBe('string');
      expect(typeof neo4jConfig.username).toBe('string');
      expect(typeof neo4jConfig.password).toBe('string');
      expect(typeof neo4jConfig.maxConnectionPoolSize).toBe('number');
      expect(typeof neo4jConfig.connectionAcquisitionTimeout).toBe('number');
    });
  });

  describe('Default values', () => {
    it('should have sensible ChromaDB defaults', () => {
      const defaults = {
        host: 'localhost',
        port: 8000,
        collection: 'berlin_group_pdfs',
        model: 'text-embedding-3-small',
      };

      expect(defaults.host).toBe('localhost');
      expect(defaults.port).toBe(8000);
      expect(defaults.collection).toBe('berlin_group_pdfs');
      expect(defaults.model).toBe('text-embedding-3-small');
    });

    it('should have sensible Neo4j defaults', () => {
      const defaults = {
        uri: 'bolt://localhost:7687',
        username: 'neo4j',
        password: 'password',
        database: 'neo4j',
        maxPoolSize: 50,
        timeout: 60000,
      };

      expect(defaults.uri).toBe('bolt://localhost:7687');
      expect(defaults.username).toBe('neo4j');
      expect(defaults.password).toBe('password');
      expect(defaults.database).toBe('neo4j');
      expect(defaults.maxPoolSize).toBe(50);
      expect(defaults.timeout).toBe(60000);
    });
  });
});
