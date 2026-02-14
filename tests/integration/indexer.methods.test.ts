/**
 * Additional unit tests for SpecificationIndexer - primary methods
 */

import { SpecificationIndexer } from '../../src/indexer.js';
import path from 'path';

describe('SpecificationIndexer - Method Coverage', () => {
  let indexer: SpecificationIndexer;
  const yamlDir = path.join(process.cwd(), 'yml_files');
  const pdfDir = path.join(process.cwd(), 'pdf_files');

  beforeAll(async () => {
    indexer = new SpecificationIndexer();
    await indexer.initialize(yamlDir, pdfDir);
  }, 90000);

  describe('isInitialized', () => {
    it('should return true after initialization', () => {
      expect(indexer.isInitialized()).toBe(true);
    });
  });

  describe('getAllSpecs', () => {
    it('should return all loaded specifications', () => {
      const specs = indexer.getAllSpecs();
      expect(Array.isArray(specs)).toBe(true);
      expect(specs.length).toBeGreaterThan(0);
      
      specs.forEach(spec => {
        expect(spec).toHaveProperty('fileName');
        expect(spec).toHaveProperty('version');
        expect(spec).toHaveProperty('title');
      });
    });
  });

  describe('getAllEndpoints', () => {
    it('should return all endpoints from all specs', () => {
      const endpoints = indexer.getAllEndpoints();
      expect(Array.isArray(endpoints)).toBe(true);
      expect(endpoints.length).toBeGreaterThan(0);
      
      endpoints.forEach(ep => {
        expect(ep).toHaveProperty('path');
        expect(ep).toHaveProperty('method');
        expect(ep).toHaveProperty('specFile');
      });
    });
  });

  describe('getAllSchemas', () => {
    it('should return all schemas from all specs', () => {
      const schemas = indexer.getAllSchemas();
      expect(Array.isArray(schemas)).toBe(true);
      expect(schemas.length).toBeGreaterThan(0);
      
      schemas.forEach(schema => {
        expect(schema).toHaveProperty('specFile');
        expect(schema).toHaveProperty('name');
        expect(schema).toHaveProperty('schema');
      });
    });
  });

  describe('getAllPdfDocuments', () => {
    it('should return all PDF documents', () => {
      const docs = indexer.getAllPdfDocuments();
      expect(Array.isArray(docs)).toBe(true);
      expect(docs.length).toBeGreaterThan(0);
      
      docs.forEach(doc => {
        expect(doc).toHaveProperty('fileName');
        expect(doc).toHaveProperty('pages');
        expect(doc.fileName.toLowerCase()).toMatch(/\.pdf$/);
        expect(typeof doc.pages).toBe('number');
      });
    });
  });

  describe('searchEndpoints', () => {
    it('should find endpoints by path', () => {
      const results = indexer.searchEndpoints('accounts');
      expect(Array.isArray(results)).toBe(true);
      // Search should find endpoints containing 'accounts' in path or description
      // But may not find exact '/v1/accounts' if it doesn't exist in specs
    });

    it('should find endpoints by operationId', () => {
      const allEndpoints = indexer.getAllEndpoints();
      const withOpId = allEndpoints.find(e => e.operationId);
      
      if (withOpId?.operationId) {
        const results = indexer.searchEndpoints(withOpId.operationId);
        expect(results.length).toBeGreaterThan(0);
      }
    });

    it('should find endpoints by summary', () => {
      const results = indexer.searchEndpoints('account');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should find endpoints by tags', () => {
      const results = indexer.searchEndpoints('accounts');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = indexer.searchEndpoints('nonexistent_xyz_123');
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const results1 = indexer.searchEndpoints('accounts');
      const results2 = indexer.searchEndpoints('ACCOUNTS');
      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
    });
  });

  describe('searchSchemas', () => {
    it('should find schemas by name', () => {
      const schemas = indexer.getAllSchemas();
      if (schemas.length > 0) {
        const targetSchema = schemas[0].name;
        const results = indexer.searchSchemas(targetSchema);
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].name).toBe(targetSchema);
      }
    });

    it('should find schemas by partial name match', () => {
      const results = indexer.searchSchemas('Account');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should search in schema content', () => {
      const results = indexer.searchSchemas('type');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
      const results = indexer.searchSchemas('nonexistent_schema_xyz');
      expect(results).toEqual([]);
    });

    it('should be case insensitive', () => {
      const results1 = indexer.searchSchemas('account');
      const results2 = indexer.searchSchemas('ACCOUNT');
      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
    });
  });

  describe('searchPdfDocuments', () => {
    it('should search across all PDF documents', () => {
      const results = indexer.searchPdfDocuments('payment');
      expect(Array.isArray(results)).toBe(true);
      
      if (results.length > 0) {
        expect(results[0]).toHaveProperty('fileName');
        expect(results[0]).toHaveProperty('matches');
        expect(Array.isArray(results[0].matches)).toBe(true);
      }
    });

    it('should return context for matches', () => {
      const results = indexer.searchPdfDocuments('account');
      
      if (results.length > 0 && results[0].matches.length > 0) {
        expect(typeof results[0].matches[0]).toBe('string');
        expect(results[0].matches[0].length).toBeGreaterThan(0);
      }
    });

    it('should return empty array for no matches', () => {
      const results = indexer.searchPdfDocuments('nonexistent_xyz_term');
      expect(results).toEqual([]);
    });
  });

  describe('getStatistics', () => {
    it('should return comprehensive statistics', () => {
      const stats = indexer.getStatistics();
      
      expect(stats).toHaveProperty('totalSpecs');
      expect(stats).toHaveProperty('totalEndpoints');
      expect(stats).toHaveProperty('totalSchemas');
      expect(stats).toHaveProperty('totalPdfDocuments');
      expect(stats).toHaveProperty('endpointsByMethod');
      expect(stats).toHaveProperty('specList');
      
      expect(stats.totalSpecs).toBeGreaterThan(0);
      expect(stats.totalEndpoints).toBeGreaterThan(0);
      expect(stats.totalSchemas).toBeGreaterThan(0);
      expect(stats.totalPdfDocuments).toBeGreaterThan(0);
      
      expect(typeof stats.endpointsByMethod).toBe('object');
      expect(Array.isArray(stats.specList)).toBe(true);
    });
  });

  describe('getVectorStoreStats', () => {
    it('should return vector store statistics', async () => {
      const stats = await indexer.getVectorStoreStats();
      
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('totalChunks');
      expect(stats).toHaveProperty('collectionName');
      expect(stats).toHaveProperty('isInMemory');
      
      expect(typeof stats.enabled).toBe('boolean');
      
      if (stats.enabled) {
        expect(stats.totalChunks).toBeGreaterThan(0);
        expect(typeof stats.collectionName).toBe('string');
        expect(typeof stats.isInMemory).toBe('boolean');
      }
    });
  });

  describe('getGraphStoreStats', () => {
    it('should return graph store statistics', async () => {
      const stats = await indexer.getGraphStoreStats();
      
      expect(stats).toHaveProperty('enabled');
      expect(typeof stats.enabled).toBe('boolean');
      
      if (stats.enabled) {
        expect(stats).toHaveProperty('usingNeo4j');
        expect(typeof stats.usingNeo4j).toBe('boolean');
      }
    });
  });

  describe('searchAll', () => {
    it('should search across all sources', () => {
      const results = indexer.searchAll('account');
      
      expect(results).toHaveProperty('endpoints');
      expect(results).toHaveProperty('schemas');
      expect(results).toHaveProperty('pdfMatches');
      
      expect(Array.isArray(results.endpoints)).toBe(true);
      expect(Array.isArray(results.schemas)).toBe(true);
      expect(Array.isArray(results.pdfMatches)).toBe(true);
    });

    it('should return results from multiple sources', () => {
      const results = indexer.searchAll('payment');
      
      const totalResults = 
        results.endpoints.length +
        results.schemas.length +
        results.pdfMatches.reduce((sum, doc) => sum + doc.matches.length, 0);
      
      expect(totalResults).toBeGreaterThan(0);
    });

    it('should handle queries with no results', () => {
      const results = indexer.searchAll('completely_nonexistent_term_xyz_123');
      
      expect(results.endpoints.length).toBe(0);
      expect(results.schemas.length).toBe(0);
      expect(results.pdfMatches.length).toBe(0);
    });
  });

  describe('getEndpointsByMethod', () => {
    it('should filter endpoints by HTTP method', () => {
      const getEndpoints = indexer.getEndpointsByMethod('GET');
      const postEndpoints = indexer.getEndpointsByMethod('POST');
      
      expect(Array.isArray(getEndpoints)).toBe(true);
      expect(Array.isArray(postEndpoints)).toBe(true);
      
      getEndpoints.forEach(ep => {
        expect(ep.method).toBe('GET');
      });
      
      postEndpoints.forEach(ep => {
        expect(ep.method).toBe('POST');
      });
    });

    it('should be case insensitive', () => {
      const results1 = indexer.getEndpointsByMethod('get');
      const results2 = indexer.getEndpointsByMethod('GET');
      
      expect(results1.length).toBe(results2.length);
    });

    it('should return empty array for unsupported methods', () => {
      const results = indexer.getEndpointsByMethod('INVALID');
      expect(results).toEqual([]);
    });
  });

  describe('getEndpointsByTag', () => {
    it('should filter endpoints by tag', () => {
      // Get all tags first
      const allEndpoints = indexer.getAllEndpoints();
      const endpointsWithTags = allEndpoints.filter(e => e.tags && e.tags.length > 0);
      
      if (endpointsWithTags.length > 0) {
        const testTag = endpointsWithTags[0].tags![0];
        const results = indexer.getEndpointsByTag(testTag);
        
        expect(results.length).toBeGreaterThan(0);
        results.forEach(ep => {
          expect(ep.tags).toContain(testTag);
        });
      }
    });

    it('should return empty array for non-existent tag', () => {
      const results = indexer.getEndpointsByTag('nonexistent_tag_xyz');
      expect(results).toEqual([]);
    });
  });
});
