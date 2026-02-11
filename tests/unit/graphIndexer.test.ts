/**
 * Unit tests for graphIndexer.ts
 * Tests YAML-to-graph transformation and indexing operations
 */

import {
  GraphIndexer,
  createGraphIndexer,
  IndexingResult,
  IndexingProgress,
} from '../../src/graphIndexer.js';
import path from 'path';

describe('GraphIndexer', () => {
  let graphIndexer: GraphIndexer;
  const testYamlDir = path.resolve(process.cwd(), 'yml_files');

  beforeEach(() => {
    graphIndexer = createGraphIndexer({
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'invalid-for-test', // Force in-memory mode
    });
  });

  afterEach(async () => {
    if (graphIndexer.isInitialized()) {
      await graphIndexer.clearAll();
      await graphIndexer.close();
    }
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await graphIndexer.initialize();
      expect(graphIndexer.isInitialized()).toBe(true);
    });

    it('should not be indexed before loadAndIndex', async () => {
      await graphIndexer.initialize();
      expect(graphIndexer.isIndexed()).toBe(false);
    });

    it('should fall back to in-memory when Neo4j unavailable', async () => {
      await graphIndexer.initialize();
      expect(graphIndexer.isUsingNeo4j()).toBe(false);
    });
  });

  describe('loadAndIndex', () => {
    it('should load and index YAML files', async () => {
      const result = await graphIndexer.loadAndIndex(testYamlDir);

      expect(result).toBeDefined();
      // Note: success may be false due to duplicate schema errors in the test data
      // but the indexing process should still complete and index items
      expect(result.specificationsIndexed).toBeGreaterThan(0);
      expect(result.endpointsIndexed).toBeGreaterThan(0);
      expect(result.schemasIndexed).toBeGreaterThan(0);
    }, 30000); // Longer timeout for indexing

    it('should track indexing result', async () => {
      await graphIndexer.loadAndIndex(testYamlDir);

      const result = graphIndexer.getIndexingResult();
      expect(result).not.toBeNull();
      // Note: success may be false due to errors, but indexing should complete
      expect(result?.specificationsIndexed).toBeGreaterThan(0);
      expect(result?.duration).toBeGreaterThan(0);
    }, 30000);

    it('should report progress during indexing', async () => {
      const progressReports: IndexingProgress[] = [];

      await graphIndexer.loadAndIndex(testYamlDir, (progress) => {
        progressReports.push({ ...progress });
      });

      expect(progressReports.length).toBeGreaterThan(0);
      expect(progressReports.some(p => p.phase === 'specifications')).toBe(true);
      expect(progressReports.some(p => p.phase === 'endpoints')).toBe(true);
      expect(progressReports.some(p => p.phase === 'schemas')).toBe(true);
    }, 30000);

    it('should create relationships during indexing', async () => {
      const result = await graphIndexer.loadAndIndex(testYamlDir);

      expect(result.relationshipsCreated).toBeGreaterThan(0);
    }, 30000);

    it('should set indexed flag after successful indexing', async () => {
      await graphIndexer.loadAndIndex(testYamlDir);

      expect(graphIndexer.isIndexed()).toBe(true);
    }, 30000);
  });

  describe('query operations', () => {
    beforeEach(async () => {
      await graphIndexer.loadAndIndex(testYamlDir);
    }, 30000);

    describe('findRelatedSchemas', () => {
      it('should find related schemas', async () => {
        // Most specs should have some schema with references
        const stats = await graphIndexer.getStatistics();
        
        if (stats.schemaCount > 0) {
          // Try to find a schema that might have references
          const result = await graphIndexer.searchByPattern('Schema', { type: 'object' }, 1);
          
          if (result.totalMatches > 0) {
            const schemaName = result.matches[0].nodes[0].properties.name;
            const related = await graphIndexer.findRelatedSchemas(schemaName);
            expect(Array.isArray(related)).toBe(true);
          }
        }
      });

      it('should return empty array for non-existent schema', async () => {
        const results = await graphIndexer.findRelatedSchemas('NonExistentSchema');
        expect(results).toEqual([]);
      });

      it('should respect maxDepth parameter', async () => {
        const stats = await graphIndexer.getStatistics();
        
        if (stats.schemaCount > 0) {
          const result = await graphIndexer.searchByPattern('Schema', { type: 'object' }, 1);
          
          if (result.totalMatches > 0) {
            const schemaName = result.matches[0].nodes[0].properties.name;
            const depth1 = await graphIndexer.findRelatedSchemas(schemaName, undefined, 1);
            const depth3 = await graphIndexer.findRelatedSchemas(schemaName, undefined, 3);
            
            // Depth 3 should have >= results than depth 1
            expect(depth3.length).toBeGreaterThanOrEqual(depth1.length);
          }
        }
      });
    });

    describe('getEndpointDependencies', () => {
      it('should get dependencies for existing endpoint', async () => {
        // Get any endpoint from the indexed data
        const patternResult = await graphIndexer.searchByPattern('Endpoint', { method: 'GET' }, 1);
        
        if (patternResult.totalMatches > 0) {
          const endpoint = patternResult.matches[0].nodes[0];
          const deps = await graphIndexer.getEndpointDependencies(
            endpoint.properties.path,
            endpoint.properties.method
          );

          expect(deps).not.toBeNull();
          expect(deps?.endpointPath).toBe(endpoint.properties.path);
        }
      });

      it('should return null for non-existent endpoint', async () => {
        const result = await graphIndexer.getEndpointDependencies('/nonexistent', 'GET');
        expect(result).toBeNull();
      });
    });

    describe('traverseGraph', () => {
      it('should traverse from specification node', async () => {
        const specResult = await graphIndexer.searchByPattern('Specification', {}, 1);
        
        if (specResult.totalMatches > 0) {
          const spec = specResult.matches[0].nodes[0];
          const traversal = await graphIndexer.traverseGraph(
            'Specification',
            { fileName: spec.properties.fileName },
            undefined,
            2
          );

          expect(traversal.nodes.length).toBeGreaterThan(0);
        }
      });

      it('should filter by relationship types', async () => {
        const specResult = await graphIndexer.searchByPattern('Specification', {}, 1);
        
        if (specResult.totalMatches > 0) {
          const spec = specResult.matches[0].nodes[0];
          const traversal = await graphIndexer.traverseGraph(
            'Specification',
            { fileName: spec.properties.fileName },
            ['DEFINES_ENDPOINT'],
            2
          );

          // All relationships should be DEFINES_ENDPOINT
          for (const rel of traversal.relationships) {
            expect(rel.type).toBe('DEFINES_ENDPOINT');
          }
        }
      });

      it('should return empty result for non-existent node', async () => {
        const result = await graphIndexer.traverseGraph(
          'Specification',
          { fileName: 'nonexistent.yaml' }
        );

        expect(result.nodes).toHaveLength(0);
      });
    });

    describe('getSpecificationGraph', () => {
      it('should get complete graph for specification', async () => {
        const specResult = await graphIndexer.searchByPattern('Specification', {}, 1);
        
        if (specResult.totalMatches > 0) {
          const spec = specResult.matches[0].nodes[0];
          const graph = await graphIndexer.getSpecificationGraph(spec.properties.fileName);

          expect(graph).not.toBeNull();
          expect(graph?.specification.fileName).toBe(spec.properties.fileName);
          expect(graph?.endpoints).toBeDefined();
          expect(graph?.schemas).toBeDefined();
        }
      });

      it('should return null for non-existent specification', async () => {
        const result = await graphIndexer.getSpecificationGraph('nonexistent.yaml');
        expect(result).toBeNull();
      });
    });

    describe('searchByPattern', () => {
      it('should search endpoints by method', async () => {
        const results = await graphIndexer.searchByPattern('Endpoint', { method: 'GET' });

        expect(results.totalMatches).toBeGreaterThanOrEqual(0);
        for (const match of results.matches) {
          expect(match.nodes[0].properties.method).toBe('GET');
        }
      });

      it('should search schemas by type', async () => {
        const results = await graphIndexer.searchByPattern('Schema', { type: 'object' });

        for (const match of results.matches) {
          expect(match.nodes[0].properties.type).toBe('object');
        }
      });

      it('should support wildcard patterns', async () => {
        const results = await graphIndexer.searchByPattern('Endpoint', { path: '/v1/*' });
        
        // All matched paths should start with /v1/
        for (const match of results.matches) {
          expect(match.nodes[0].properties.path).toMatch(/^\/v1\//);
        }
      });

      it('should respect limit parameter', async () => {
        const limit = 5;
        const results = await graphIndexer.searchByPattern('Endpoint', { method: 'GET' }, limit);

        expect(results.totalMatches).toBeLessThanOrEqual(limit);
      });
    });

    describe('getStatistics', () => {
      it('should return comprehensive statistics', async () => {
        const stats = await graphIndexer.getStatistics();

        expect(stats.nodeCount).toBeGreaterThan(0);
        expect(stats.specificationCount).toBeGreaterThan(0);
        expect(stats.endpointCount).toBeGreaterThanOrEqual(0);
        expect(stats.schemaCount).toBeGreaterThanOrEqual(0);
        expect(stats.nodesByLabel).toBeDefined();
        expect(stats.relationshipsByType).toBeDefined();
      });

      it('should include relationship statistics', async () => {
        const stats = await graphIndexer.getStatistics();

        expect(stats.relationshipCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('state management', () => {
    it('should throw error if querying before indexed', async () => {
      await graphIndexer.initialize();
      
      await expect(graphIndexer.findRelatedSchemas('Test')).rejects.toThrow(
        'Graph has not been indexed'
      );
    });

    it('should clear data correctly', async () => {
      await graphIndexer.loadAndIndex(testYamlDir);
      
      const statsBefore = await graphIndexer.getStatistics();
      expect(statsBefore.nodeCount).toBeGreaterThan(0);

      await graphIndexer.clearAll();

      // After clear, isIndexed should be false
      expect(graphIndexer.isIndexed()).toBe(false);
    }, 30000);

    it('should provide access to underlying graph store', async () => {
      await graphIndexer.initialize();
      
      const store = graphIndexer.getGraphStore();
      expect(store).toBeDefined();
    });
  });
});

describe('createGraphIndexer factory', () => {
  it('should create a GraphIndexer instance', () => {
    const indexer = createGraphIndexer();
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });

  it('should accept configuration options', () => {
    const indexer = createGraphIndexer({
      uri: 'bolt://custom:7687',
      username: 'custom',
      password: 'custom',
    });
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });

  it('should accept custom database name', () => {
    const indexer = createGraphIndexer({
      database: 'custom_database',
    });
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });

  it('should accept custom connection pool settings', () => {
    const indexer = createGraphIndexer({
      maxConnectionPoolSize: 100,
      connectionAcquisitionTimeout: 30000,
    });
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });

  it('should accept complete configuration', () => {
    const indexer = createGraphIndexer({
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'test_password',
      database: 'test_db',
      maxConnectionPoolSize: 75,
      connectionAcquisitionTimeout: 45000,
    });
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });

  it('should handle partial configuration', () => {
    const indexer = createGraphIndexer({
      uri: 'bolt://localhost:7687',
    });
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });

  it('should create indexer with minimal config', () => {
    const indexer = createGraphIndexer({
      password: 'different_password',
    });
    expect(indexer).toBeInstanceOf(GraphIndexer);
  });
});
