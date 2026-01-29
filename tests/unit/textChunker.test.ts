import { TextChunker, createChunker, TextChunk, ChunkerOptions } from '../../src/textChunker.js';

describe('TextChunker', () => {
  let chunker: TextChunker;

  beforeEach(() => {
    chunker = new TextChunker({ chunkSize: 100, chunkOverlap: 20 });
  });

  describe('constructor', () => {
    it('should create a chunker with default options', () => {
      const defaultChunker = new TextChunker();
      expect(defaultChunker).toBeInstanceOf(TextChunker);
    });

    it('should create a chunker with custom options', () => {
      const customChunker = new TextChunker({ chunkSize: 500, chunkOverlap: 50 });
      expect(customChunker).toBeInstanceOf(TextChunker);
    });
  });

  describe('chunkText', () => {
    it('should return empty array for empty text', () => {
      const chunks = chunker.chunkText('', 'test.pdf');
      expect(chunks).toEqual([]);
    });

    it('should return single chunk for short text', () => {
      const text = 'This is a short text.';
      const chunks = chunker.chunkText(text, 'test.pdf');
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].metadata.fileName).toBe('test.pdf');
    });

    it('should split long text into multiple chunks', () => {
      const text = 'This is a paragraph. '.repeat(50);
      const chunks = chunker.chunkText(text, 'test.pdf');
      
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('should generate unique chunk IDs', () => {
      const text = 'This is some text. '.repeat(20);
      const chunks = chunker.chunkText(text, 'test.pdf');
      
      const ids = chunks.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should include proper metadata in chunks', () => {
      const text = 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.';
      const chunks = chunker.chunkText(text, 'document.pdf');
      
      for (const chunk of chunks) {
        expect(chunk.metadata.fileName).toBe('document.pdf');
        expect(chunk.metadata.chunkIndex).toBeGreaterThanOrEqual(0);
        expect(chunk.metadata.totalChunks).toBe(chunks.length);
      }
    });

    it('should respect chunk size limits', () => {
      const text = 'Word '.repeat(100);
      const largeChunker = new TextChunker({ chunkSize: 50, chunkOverlap: 10 });
      const chunks = largeChunker.chunkText(text, 'test.pdf');
      
      // Chunks should generally be around the target size (with some tolerance for overlap)
      for (const chunk of chunks) {
        expect(chunk.text.length).toBeLessThanOrEqual(70); // Allow 40% tolerance
      }
    });

    it('should handle text with multiple paragraphs', () => {
      const text = `
        # Introduction
        
        This is the introduction paragraph with some content.
        
        # Methods
        
        This is the methods section describing the approach.
        
        # Results
        
        Here are the results of the study.
      `;
      
      const chunks = chunker.chunkText(text, 'paper.pdf');
      expect(chunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should preserve text content without loss', () => {
      const text = 'Important data: 12345. More text here.';
      const chunks = chunker.chunkText(text, 'test.pdf');
      
      // At least one chunk should contain the important data
      const combinedText = chunks.map(c => c.text).join(' ');
      expect(combinedText).toContain('Important data: 12345');
    });
  });

  describe('extractSection', () => {
    it('should extract markdown headers', () => {
      const text = '# Section Title\n\nSome content here.';
      const chunks = chunker.chunkText(text, 'test.pdf');
      
      expect(chunks[0].metadata.section).toBe('Section Title');
    });

    it('should extract numbered section headers', () => {
      const text = '1. Introduction\n\nThis is the intro.';
      const chunks = chunker.chunkText(text, 'test.pdf');
      
      // The section extraction finds numbered patterns
      expect(chunks[0].metadata.section).toContain('1. Introduction');
    });
  });

  describe('getStats', () => {
    it('should return correct statistics for chunks', () => {
      const text = 'This is some sample text. '.repeat(20);
      const chunks = chunker.chunkText(text, 'test.pdf');
      const stats = chunker.getStats(chunks);
      
      expect(stats.totalChunks).toBe(chunks.length);
      expect(stats.avgChunkSize).toBeGreaterThan(0);
      expect(stats.minChunkSize).toBeLessThanOrEqual(stats.maxChunkSize);
    });

    it('should return zeros for empty chunks array', () => {
      const stats = chunker.getStats([]);
      
      expect(stats.totalChunks).toBe(0);
      expect(stats.avgChunkSize).toBe(0);
      expect(stats.minChunkSize).toBe(0);
      expect(stats.maxChunkSize).toBe(0);
    });
  });
});

describe('createChunker', () => {
  it('should create a chunker with default preset', () => {
    const chunker = createChunker('default');
    expect(chunker).toBeInstanceOf(TextChunker);
  });

  it('should create a chunker with small preset', () => {
    const chunker = createChunker('small');
    const text = 'Word '.repeat(50);
    const chunks = chunker.chunkText(text, 'test.pdf');
    
    // Small chunker should create more chunks for the same text
    const defaultChunker = createChunker('default');
    const defaultChunks = defaultChunker.chunkText(text, 'test.pdf');
    
    expect(chunks.length).toBeGreaterThanOrEqual(defaultChunks.length);
  });

  it('should create a chunker with large preset', () => {
    const chunker = createChunker('large');
    const text = 'Word '.repeat(100);
    const chunks = chunker.chunkText(text, 'test.pdf');
    
    // Large chunker should create fewer chunks
    const defaultChunker = createChunker('default');
    const defaultChunks = defaultChunker.chunkText(text, 'test.pdf');
    
    expect(chunks.length).toBeLessThanOrEqual(defaultChunks.length);
  });
});
