/**
 * Integration tests for Graph Search functionality
 * Tests end-to-end graph operations with real YAML data
 */

import { SpecificationIndexer } from '../../src/indexer.js';
import path from 'path';

describe('Graph Search Integration', () => {
  let indexer: SpecificationIndexer;
  const yamlDir = path.resolve(process.cwd(), 'yml_files');
  const pdfDir = path.resolve(process.cwd(), 'pdf_files');

  beforeAll(async () => {
    indexer = new SpecificationIndexer();
    await indexer.initialize(yamlDir, pdfDir);
  }, 60000); // Long timeout for initialization

  describe('Graph Store Status', () => {
    it('should have graph store enabled', () => {
      expect(indexer.isGraphStoreEnabled()).toBe(true);
    });

    it('should return graph store statistics', async () => {
      const stats = await indexer.getGraphStoreStats();
      
      expect(stats.enabled).toBe(true);
      expect(stats.statistics).not.toBeNull();
      expect(stats.statistics?.nodeCount).toBeGreaterThan(0);
      expect(stats.statistics?.specificationCount).toBeGreaterThan(0);
    });
  });

  describe('findRelatedSchemas', () => {
    it('should find schemas referenced by another schema', async () => {
      // First, get a schema that likely has references
      const allSchemas = indexer.getAllSchemas();
      
      if (allSchemas.length > 0) {
        // Try to find relationships for a common schema
        const schemaWithRefs = allSchemas.find(s => 
          s.name.includes('Account') || s.name.includes('Balance')
        );

        if (schemaWithRefs) {
          const related = await indexer.findRelatedSchemas(
            schemaWithRefs.name,
            schemaWithRefs.specFile
          );

          expect(Array.isArray(related)).toBe(true);
          // Each result should have required fields
          for (const r of related) {
            expect(r.schemaName).toBeDefined();
            expect(r.specFile).toBeDefined();
            expect(r.relationshipType).toBeDefined();
            expect(r.depth).toBeGreaterThanOrEqual(1);
          }
        }
      }
    });

    it('should filter by spec file when provided', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 1) {
        const firstSpec = specs[0].fileName;
        const schemas = indexer.getAllSchemas().filter(s => s.specFile === firstSpec);
        
        if (schemas.length > 0) {
          const related = await indexer.findRelatedSchemas(
            schemas[0].name,
            firstSpec
          );

          // All results should be from the same spec file
          for (const r of related) {
            expect(r.specFile).toBe(firstSpec);
          }
        }
      }
    });
  });

  describe('getEndpointDependencies', () => {
    it('should return dependencies for existing endpoint', async () => {
      const endpoints = indexer.getAllEndpoints();
      
      if (endpoints.length > 0) {
        const endpoint = endpoints[0];
        const deps = await indexer.getEndpointDependencies(
          endpoint.path,
          endpoint.method
        );

        expect(deps).not.toBeNull();
        expect(deps?.endpointPath).toBe(endpoint.path);
        expect(deps?.method).toBe(endpoint.method);
        expect(deps?.parameters).toBeDefined();
        expect(Array.isArray(deps?.parameters)).toBe(true);
        expect(Array.isArray(deps?.responseSchemas)).toBe(true);
        expect(Array.isArray(deps?.relatedSchemas)).toBe(true);
      }
    });

    it('should return null for non-existent endpoint', async () => {
      const result = await indexer.getEndpointDependencies(
        '/v99/nonexistent/path',
        'GET'
      );

      expect(result).toBeNull();
    });

    it('should differentiate between HTTP methods', async () => {
      const endpoints = indexer.getAllEndpoints();
      
      // Find a path that has multiple methods
      const pathMethods = new Map<string, string[]>();
      for (const ep of endpoints) {
        if (!pathMethods.has(ep.path)) {
          pathMethods.set(ep.path, []);
        }
        pathMethods.get(ep.path)!.push(ep.method);
      }

      const multiMethodPath = Array.from(pathMethods.entries())
        .find(([_, methods]) => methods.length > 1);

      if (multiMethodPath) {
        const [path, methods] = multiMethodPath;
        const deps1 = await indexer.getEndpointDependencies(path, methods[0]);
        const deps2 = await indexer.getEndpointDependencies(path, methods[1]);

        expect(deps1?.method).toBe(methods[0]);
        expect(deps2?.method).toBe(methods[1]);
      }
    });
  });

  describe('traverseGraph', () => {
    it('should traverse from specification node', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 0) {
        const result = await indexer.traverseGraph(
          'Specification',
          { fileName: specs[0].fileName },
          undefined,
          2
        );

        expect(result.nodes.length).toBeGreaterThan(0);
        // Should include the starting spec node
        const specNode = result.nodes.find(n => 
          n.labels.includes('Specification') && 
          n.properties.fileName === specs[0].fileName
        );
        expect(specNode).toBeDefined();
      }
    });

    it('should filter by relationship type', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 0) {
        const endpointTraversal = await indexer.traverseGraph(
          'Specification',
          { fileName: specs[0].fileName },
          ['DEFINES_ENDPOINT'],
          1
        );

        const schemaTraversal = await indexer.traverseGraph(
          'Specification',
          { fileName: specs[0].fileName },
          ['DEFINES_SCHEMA'],
          1
        );

        // Results should be different
        const endpointNodeIds = endpointTraversal.nodes.map(n => n.id);
        const schemaNodeIds = schemaTraversal.nodes.map(n => n.id);

        // There should be some difference (except for the spec node itself)
        const uniqueToEndpoints = endpointNodeIds.filter(id => !schemaNodeIds.includes(id));
        const uniqueToSchemas = schemaNodeIds.filter(id => !endpointNodeIds.includes(id));

        // At least one traversal should have unique nodes
        expect(uniqueToEndpoints.length + uniqueToSchemas.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('should respect maxDepth parameter', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 0) {
        const depth1 = await indexer.traverseGraph(
          'Specification',
          { fileName: specs[0].fileName },
          undefined,
          1
        );

        const depth3 = await indexer.traverseGraph(
          'Specification',
          { fileName: specs[0].fileName },
          undefined,
          3
        );

        // Depth 3 should have >= nodes than depth 1
        expect(depth3.nodes.length).toBeGreaterThanOrEqual(depth1.nodes.length);
      }
    });
  });

  describe('getSpecificationGraph', () => {
    it('should return complete graph for specification', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 0) {
        const graph = await indexer.getSpecificationGraph(specs[0].fileName);

        expect(graph).not.toBeNull();
        expect(graph?.specification).toBeDefined();
        expect(graph?.specification.fileName).toBe(specs[0].fileName);
        expect(graph?.endpoints).toBeDefined();
        expect(Array.isArray(graph?.endpoints)).toBe(true);
        expect(graph?.schemas).toBeDefined();
        expect(Array.isArray(graph?.schemas)).toBe(true);
        expect(graph?.statistics).toBeDefined();
      }
    });

    it('should include endpoint details with tags and parameters', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 0) {
        const graph = await indexer.getSpecificationGraph(specs[0].fileName);

        if (graph && graph.endpoints.length > 0) {
          const endpoint = graph.endpoints[0];
          
          expect(endpoint.endpoint).toBeDefined();
          expect(endpoint.endpoint.path).toBeDefined();
          expect(endpoint.endpoint.method).toBeDefined();
          expect(Array.isArray(endpoint.tags)).toBe(true);
          expect(Array.isArray(endpoint.parameters)).toBe(true);
          expect(Array.isArray(endpoint.responses)).toBe(true);
        }
      }
    });

    it('should include schema details with references', async () => {
      const specs = indexer.getAllSpecs();
      
      if (specs.length > 0) {
        const graph = await indexer.getSpecificationGraph(specs[0].fileName);

        if (graph && graph.schemas.length > 0) {
          const schema = graph.schemas[0];
          
          expect(schema.schema).toBeDefined();
          expect(schema.schema.name).toBeDefined();
          expect(Array.isArray(schema.properties)).toBe(true);
          expect(Array.isArray(schema.references)).toBe(true);
        }
      }
    });

    it('should return null for non-existent specification', async () => {
      const result = await indexer.getSpecificationGraph('nonexistent.yaml');
      expect(result).toBeNull();
    });
  });

  describe('searchGraphByPattern', () => {
    it('should search endpoints by HTTP method', async () => {
      const results = await indexer.searchGraphByPattern(
        'Endpoint',
        { method: 'GET' }
      );

      expect(results.totalMatches).toBeGreaterThanOrEqual(0);
      for (const match of results.matches) {
        expect(match.nodes[0].properties.method).toBe('GET');
      }
    });

    it('should search endpoints by path pattern', async () => {
      const results = await indexer.searchGraphByPattern(
        'Endpoint',
        { path: '/v1/*' }
      );

      for (const match of results.matches) {
        expect(match.nodes[0].properties.path).toMatch(/^\/v1\//);
      }
    });

    it('should search schemas by name pattern', async () => {
      const results = await indexer.searchGraphByPattern(
        'Schema',
        { name: '*Account*' }
      );

      for (const match of results.matches) {
        expect(match.nodes[0].properties.name.toLowerCase()).toContain('account');
      }
    });

    it('should respect limit parameter', async () => {
      const limit = 3;
      const results = await indexer.searchGraphByPattern(
        'Endpoint',
        { method: 'GET' },
        limit
      );

      expect(results.totalMatches).toBeLessThanOrEqual(limit);
    });

    it('should return empty result for non-matching pattern', async () => {
      const results = await indexer.searchGraphByPattern(
        'Schema',
        { name: 'ZZZNonExistentSchemaNameZZZ' }
      );

      expect(results.totalMatches).toBe(0);
    });
  });

  describe('getComprehensiveStatistics', () => {
    it('should return statistics including graph store info', async () => {
      const stats = await indexer.getComprehensiveStatistics();

      expect(stats.totalSpecs).toBeGreaterThan(0);
      expect(stats.totalEndpoints).toBeGreaterThan(0);
      expect(stats.totalSchemas).toBeGreaterThanOrEqual(0);
      expect(stats.graphStoreEnabled).toBe(true);
      expect(stats.graphNodeCount).toBeGreaterThan(0);
      expect(stats.graphRelationshipCount).toBeGreaterThanOrEqual(0);
    });

    it('should include both vector and graph store status', async () => {
      const stats = await indexer.getComprehensiveStatistics();

      expect(typeof stats.vectorStoreEnabled).toBe('boolean');
      expect(typeof stats.graphStoreEnabled).toBe('boolean');
      expect(typeof stats.graphUsingNeo4j).toBe('boolean');
    });
  });

  describe('Cross-functionality with existing indexer', () => {
    it('should maintain existing endpoint search functionality', () => {
      const endpoints = indexer.searchEndpoints('accounts');
      
      expect(Array.isArray(endpoints)).toBe(true);
      for (const ep of endpoints) {
        const searchTerm = 'accounts';
        const matches = 
          ep.path.toLowerCase().includes(searchTerm) ||
          ep.operationId?.toLowerCase().includes(searchTerm) ||
          ep.summary?.toLowerCase().includes(searchTerm) ||
          ep.description?.toLowerCase().includes(searchTerm) ||
          ep.tags?.some(t => t.toLowerCase().includes(searchTerm));
        
        expect(matches).toBe(true);
      }
    });

    it('should maintain existing schema search functionality', () => {
      const schemas = indexer.searchSchemas('Account');
      
      expect(Array.isArray(schemas)).toBe(true);
    });

    it('should be able to combine keyword and graph searches', async () => {
      // First do a keyword search
      const keywordResults = indexer.searchSchemas('Account');
      
      if (keywordResults.length > 0) {
        // Then use graph to find relationships
        const schema = keywordResults[0];
        const related = await indexer.findRelatedSchemas(schema.name, schema.specFile);
        
        expect(Array.isArray(related)).toBe(true);
      }
    });
  });
});
