import { SpecificationIndexer } from '../../src/indexer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('SpecificationIndexer - Semantic Search Integration', () => {
  let indexer: SpecificationIndexer;
  const testYamlDir = path.join(__dirname, '../../yml_files');
  const testPdfDir = path.join(__dirname, '../../pdf_files');

  beforeAll(async () => {
    indexer = new SpecificationIndexer();
    await indexer.initialize(testYamlDir, testPdfDir);
  }, 60000); // 60 second timeout for initialization

  describe('initialization', () => {
    it('should initialize successfully', () => {
      expect(indexer.isInitialized()).toBe(true);
    });

    it('should load specifications', () => {
      const stats = indexer.getStatistics();
      expect(stats.totalSpecs).toBeGreaterThan(0);
    });
  });

  describe('searchPdfSemantic', () => {
    it('should return semantic search results', async () => {
      const results = await indexer.searchPdfSemantic('payment', 5);
      
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return results with proper structure', async () => {
      const results = await indexer.searchPdfSemantic('authentication', 3);
      
      results.forEach(result => {
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('fileName');
        expect(result).toHaveProperty('relevanceScore');
      });
    });

    it('should respect topK parameter', async () => {
      const results = await indexer.searchPdfSemantic('account', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should handle empty query gracefully', async () => {
      const results = await indexer.searchPdfSemantic('', 5);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('searchPdfSemanticFiltered', () => {
    it('should filter results by fileName', async () => {
      const allResults = await indexer.searchPdfSemantic('banking', 10);
      
      if (allResults.length > 0) {
        const fileName = allResults[0].fileName;
        const filteredResults = await indexer.searchPdfSemanticFiltered(
          'banking',
          { fileName },
          10
        );
        
        filteredResults.forEach(result => {
          expect(result.fileName).toBe(fileName);
        });
      }
    });
  });

  describe('searchAllSemantic', () => {
    it('should return comprehensive search results', async () => {
      const results = await indexer.searchAllSemantic('consent', 5);
      
      expect(results).toHaveProperty('endpoints');
      expect(results).toHaveProperty('schemas');
      expect(results).toHaveProperty('pdfMatches');
      expect(Array.isArray(results.endpoints)).toBe(true);
      expect(Array.isArray(results.schemas)).toBe(true);
      expect(Array.isArray(results.pdfMatches)).toBe(true);
    });
  });

  describe('getVectorStoreStats', () => {
    it('should return vector store statistics', async () => {
      const stats = await indexer.getVectorStoreStats();
      
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('totalChunks');
      expect(stats).toHaveProperty('isInMemory');
    });
  });

  describe('getExtendedStatistics', () => {
    it('should return extended statistics with vector store info', async () => {
      const stats = await indexer.getExtendedStatistics();
      
      expect(stats).toHaveProperty('totalSpecs');
      expect(stats).toHaveProperty('totalEndpoints');
      expect(stats).toHaveProperty('totalSchemas');
      expect(stats).toHaveProperty('totalPdfDocuments');
      expect(stats).toHaveProperty('totalPdfChunks');
      expect(stats).toHaveProperty('vectorStoreEnabled');
    });
  });

  describe('backward compatibility', () => {
    it('should still support keyword-based PDF search', () => {
      const results = indexer.searchPdfDocuments('payment');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should still support searchAll with keyword search', () => {
      const results = indexer.searchAll('account');
      
      expect(results).toHaveProperty('endpoints');
      expect(results).toHaveProperty('schemas');
      expect(results).toHaveProperty('pdfMatches');
    });

    it('should still support endpoint search', () => {
      const results = indexer.searchEndpoints('/accounts');
      expect(Array.isArray(results)).toBe(true);
    });

    it('should still support schema search', () => {
      const results = indexer.searchSchemas('Account');
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
