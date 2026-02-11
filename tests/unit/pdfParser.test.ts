/**
 * Unit tests for PdfParser
 */

import { PdfParser, PDFDocument } from '../../src/pdfParser.js';
import { TextChunk } from '../../src/textChunker.js';
import fs from 'fs/promises';
import path from 'path';

// Mock fs and pdf-parse modules
jest.mock('fs/promises');
jest.mock('pdf-parse', () => {
  return jest.fn().mockImplementation((buffer: Buffer) => {
    const content = buffer.toString();
    if (content.includes('mock-error')) {
      throw new Error('PDF parsing error');
    }
    return Promise.resolve({
      text: content,
      numpages: 5,
      info: {
        Title: 'Mock PDF Title',
        Author: 'Test Author',
      },
    });
  });
});

describe('PdfParser', () => {
  let parser: PdfParser;

  beforeEach(() => {
    parser = new PdfParser();
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create parser with default options', () => {
      const newParser = new PdfParser();
      expect(newParser).toBeInstanceOf(PdfParser);
    });

    it('should create parser with custom chunker options', () => {
      const newParser = new PdfParser({ chunkSize: 2000, chunkOverlap: 400 });
      expect(newParser).toBeInstanceOf(PdfParser);
    });
  });

  describe('loadPdfFiles', () => {
    it('should load and parse PDF files from directory', async () => {
      const mockFiles = ['doc1.pdf', 'doc2.PDF', 'readme.txt', 'doc3.pdf'];
      const mockPdfContent = 'This is a test PDF document with sample content for testing purposes.';

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(mockPdfContent));

      await parser.loadPdfFiles('/test/pdf/dir');

      const documents = parser.getDocuments();
      expect(documents.size).toBe(3); // Only PDF files
      expect(documents.has('doc1.pdf')).toBe(true);
      expect(documents.has('doc2.PDF')).toBe(true);
      expect(documents.has('doc3.pdf')).toBe(true);
    });

    it('should handle directory read errors gracefully', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('Directory not found'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      await parser.loadPdfFiles('/nonexistent/dir');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(parser.getDocuments().size).toBe(0);
      
      consoleErrorSpy.mockRestore();
    });

    it('should handle PDF parsing errors gracefully', async () => {
      const mockFiles = ['valid.pdf', 'corrupt.pdf'];
      
      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('corrupt')) {
          return Promise.resolve(Buffer.from('mock-error'));
        }
        return Promise.resolve(Buffer.from('Valid PDF content'));
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await parser.loadPdfFiles('/test/dir');

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getDocuments', () => {
    it('should return empty map when no documents loaded', () => {
      const documents = parser.getDocuments();
      expect(documents).toBeInstanceOf(Map);
      expect(documents.size).toBe(0);
    });

    it('should return all loaded documents', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['test.pdf']);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('Test content'));

      await parser.loadPdfFiles('/test/dir');

      const documents = parser.getDocuments();
      expect(documents.size).toBe(1);
      expect(documents.has('test.pdf')).toBe(true);
      
      const doc = documents.get('test.pdf');
      expect(doc?.fileName).toBe('test.pdf');
      expect(doc?.title).toBe('Mock PDF Title');
      expect(doc?.pages).toBe(5);
    });
  });

  describe('getAllChunks', () => {
    it('should return empty array when no documents loaded', () => {
      const chunks = parser.getAllChunks();
      expect(chunks).toEqual([]);
    });

    it('should return all chunks from all documents', async () => {
      const longContent = 'Payment services section. ' + 'Account information is important. ';
      
      (fs.readdir as jest.Mock).mockResolvedValue(['doc1.pdf']);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(longContent));

      await parser.loadPdfFiles('/test/dir');

      const chunks = parser.getAllChunks();
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0]).toHaveProperty('id');
      expect(chunks[0]).toHaveProperty('text');
      expect(chunks[0]).toHaveProperty('metadata');
    });
  });

  describe('getDocumentChunks', () => {
    it('should return empty array for non-existent document', () => {
      const chunks = parser.getDocumentChunks('nonexistent.pdf');
      expect(chunks).toEqual([]);
    });

    it('should return chunks for specific document', async () => {
      const content = 'Document content for testing chunk retrieval with adequate length.';
      
      (fs.readdir as jest.Mock).mockResolvedValue(['target.pdf']);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(content));

      await parser.loadPdfFiles('/test/dir');

      const chunks = parser.getDocumentChunks('target.pdf');
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].metadata.fileName).toBe('target.pdf');
    });
  });

  describe('searchDocuments', () => {
    beforeEach(async () => {
      const mockContent = `Introduction to Payment Services
      
This document describes payment initiation services.
Payment services are regulated by PSD2.
Account information is protected by strong authentication.

Section 2: Technical Details
The API uses REST architecture.
Authentication requires OAuth 2.0.
Payment endpoints support various currencies.`;

      (fs.readdir as jest.Mock).mockResolvedValue(['payments.pdf', 'accounts.pdf']);
      (fs.readFile as jest.Mock).mockImplementation((filePath: string) => {
        if (filePath.includes('payments')) {
          return Promise.resolve(Buffer.from(mockContent));
        }
        return Promise.resolve(Buffer.from('Account information services documentation.'));
      });

      await parser.loadPdfFiles('/test/dir');
    });

    it('should find matches in documents', () => {
      const results = parser.searchDocuments('payment');
      
      expect(results.length).toBeGreaterThan(0);
      const paymentsResult = results.find(r => r.fileName === 'payments.pdf');
      expect(paymentsResult).toBeDefined();
      expect(paymentsResult?.matches).toBeDefined();
      expect(paymentsResult!.matches.length).toBeGreaterThan(0);
    });

    it('should be case insensitive', () => {
      const results = parser.searchDocuments('PAYMENT');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should include context around matches', () => {
      const results = parser.searchDocuments('OAuth');
      
      expect(results.length).toBeGreaterThan(0);
      const match = results[0].matches[0];
      expect(match).toContain('OAuth');
    });

    it('should return empty array when no matches found', () => {
      const results = parser.searchDocuments('nonexistent_term_xyz');
      expect(results).toEqual([]);
    });

    it('should limit matches per file', async () => {
      // Create content with many occurrences (12 lines with payment)
      const lines = [];
      for (let i = 0; i < 12; i++) {
        lines.push(`Line ${i} contains payment information`);
      }
      const content = lines.join('\n');
      
      (fs.readdir as jest.Mock).mockResolvedValue(['many.pdf']);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from(content));

      const newParser = new PdfParser();
      await newParser.loadPdfFiles('/test/dir');

      const results = newParser.searchDocuments('payment');
      expect(results.length).toBe(1);
      expect(results[0].matches.length).toBeLessThanOrEqual(10);
    });
  });

  describe('document metadata', () => {
    it('should extract PDF metadata', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['meta.pdf']);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('Content with metadata'));

      await parser.loadPdfFiles('/test/dir');

      const doc = parser.getDocuments().get('meta.pdf');
      expect(doc?.metadata).toBeDefined();
      expect(doc?.metadata.Title).toBe('Mock PDF Title');
      expect(doc?.metadata.Author).toBe('Test Author');
    });

    it('should use filename as title when PDF title is missing', async () => {
      const mockPdfParse = require('pdf-parse');
      mockPdfParse.mockImplementationOnce(() => Promise.resolve({
        text: 'Content',
        numpages: 1,
        info: {},
      }));

      (fs.readdir as jest.Mock).mockResolvedValue(['notitle.pdf']);
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('Content'));

      await parser.loadPdfFiles('/test/dir');

      const doc = parser.getDocuments().get('notitle.pdf');
      expect(doc?.title).toBe('notitle.pdf');
    });
  });
});
