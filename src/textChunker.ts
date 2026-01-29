/**
 * Text Chunker for PDF Documents
 * Splits PDF text into smaller, semantically meaningful chunks for vector embedding
 */

export interface TextChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface ChunkMetadata {
  fileName: string;
  chunkIndex: number;
  totalChunks?: number;
  startLine?: number;
  endLine?: number;
  section?: string;
  pageEstimate?: number;
}

export interface ChunkerOptions {
  chunkSize: number;
  chunkOverlap: number;
  separators?: string[];
}

const DEFAULT_OPTIONS: ChunkerOptions = {
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', ', ', ' ', ''],
};

/**
 * TextChunker class for splitting text into semantic chunks
 * Uses recursive character splitting strategy similar to LangChain's RecursiveCharacterTextSplitter
 */
export class TextChunker {
  private options: ChunkerOptions;

  constructor(options: Partial<ChunkerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Split text into chunks using recursive character splitting
   * @param text - The text to split
   * @param fileName - The source file name for metadata
   * @returns Array of TextChunk objects
   */
  chunkText(text: string, fileName: string): TextChunk[] {
    const chunks: TextChunk[] = [];
    const rawChunks = this.recursiveSplit(text, this.options.separators!);

    for (let i = 0; i < rawChunks.length; i++) {
      const chunkText = rawChunks[i].trim();
      if (chunkText.length === 0) continue;

      chunks.push({
        id: this.generateChunkId(fileName, i),
        text: chunkText,
        metadata: {
          fileName,
          chunkIndex: i,
          totalChunks: rawChunks.length,
          section: this.extractSection(chunkText),
          pageEstimate: this.estimatePage(text, rawChunks[i]),
        },
      });
    }

    // Update totalChunks in metadata
    chunks.forEach(chunk => {
      chunk.metadata.totalChunks = chunks.length;
    });

    return chunks;
  }

  /**
   * Recursively split text by separators until chunk size is met
   */
  private recursiveSplit(text: string, separators: string[]): string[] {
    if (text.length <= this.options.chunkSize) {
      return [text];
    }

    const [currentSeparator, ...remainingSeparators] = separators;

    // If no more separators, force split by character
    if (currentSeparator === '' || separators.length === 0) {
      return this.splitBySize(text);
    }

    const splits = text.split(currentSeparator);
    const chunks: string[] = [];
    let currentChunk = '';

    for (const split of splits) {
      const potentialChunk = currentChunk
        ? currentChunk + currentSeparator + split
        : split;

      if (potentialChunk.length <= this.options.chunkSize) {
        currentChunk = potentialChunk;
      } else {
        // Current chunk is ready, process it
        if (currentChunk) {
          if (currentChunk.length > this.options.chunkSize && remainingSeparators.length > 0) {
            // Chunk is still too large, recurse with remaining separators
            chunks.push(...this.recursiveSplit(currentChunk, remainingSeparators));
          } else {
            chunks.push(currentChunk);
          }
        }

        // Start new chunk
        if (split.length > this.options.chunkSize && remainingSeparators.length > 0) {
          // Split is too large, recurse
          chunks.push(...this.recursiveSplit(split, remainingSeparators));
          currentChunk = '';
        } else {
          currentChunk = split;
        }
      }
    }

    // Don't forget the last chunk
    if (currentChunk) {
      if (currentChunk.length > this.options.chunkSize && remainingSeparators.length > 0) {
        chunks.push(...this.recursiveSplit(currentChunk, remainingSeparators));
      } else {
        chunks.push(currentChunk);
      }
    }

    // Apply overlap
    return this.applyOverlap(chunks);
  }

  /**
   * Force split text by size when no separators work
   */
  private splitBySize(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.options.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start = end - this.options.chunkOverlap;
      if (start < 0) start = end;
    }

    return chunks;
  }

  /**
   * Apply overlap between consecutive chunks
   */
  private applyOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1 || this.options.chunkOverlap === 0) {
      return chunks;
    }

    const overlappedChunks: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let chunk = chunks[i];

      // Add overlap from previous chunk
      if (i > 0 && this.options.chunkOverlap > 0) {
        const prevChunk = chunks[i - 1];
        const overlapText = prevChunk.slice(-this.options.chunkOverlap);
        // Only add if it doesn't exceed max size too much
        if ((overlapText + chunk).length <= this.options.chunkSize * 1.2) {
          chunk = overlapText + chunk;
        }
      }

      overlappedChunks.push(chunk);
    }

    return overlappedChunks;
  }

  /**
   * Generate a unique chunk ID
   */
  private generateChunkId(fileName: string, index: number): string {
    const sanitizedFileName = fileName
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    return `${sanitizedFileName}_chunk_${index.toString().padStart(4, '0')}`;
  }

  /**
   * Try to extract section header from chunk text
   */
  private extractSection(text: string): string | undefined {
    // Look for common section patterns
    const patterns = [
      /^#+\s*(.+)$/m,                    // Markdown headers
      /^([A-Z][A-Z\s]+)$/m,              // ALL CAPS HEADERS
      /^(\d+\.?\s+[A-Z][^.]+)/m,         // Numbered sections
      /^(Chapter|Section|Part)\s+\d+/im, // Chapter/Section headers
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim().slice(0, 100); // Limit section name length
      }
    }

    return undefined;
  }

  /**
   * Estimate which page a chunk is from based on position in document
   */
  private estimatePage(fullText: string, chunkText: string): number {
    const chunkPosition = fullText.indexOf(chunkText);
    if (chunkPosition === -1) return 1;

    // Rough estimate: ~3000 characters per page
    const charsPerPage = 3000;
    return Math.floor(chunkPosition / charsPerPage) + 1;
  }

  /**
   * Get chunker statistics
   */
  getStats(chunks: TextChunk[]): {
    totalChunks: number;
    avgChunkSize: number;
    minChunkSize: number;
    maxChunkSize: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        avgChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
      };
    }

    const sizes = chunks.map(c => c.text.length);
    return {
      totalChunks: chunks.length,
      avgChunkSize: Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
    };
  }
}

/**
 * Factory function for creating a TextChunker with common presets
 */
export function createChunker(preset: 'default' | 'small' | 'large' = 'default'): TextChunker {
  const presets: Record<string, Partial<ChunkerOptions>> = {
    default: { chunkSize: 1000, chunkOverlap: 200 },
    small: { chunkSize: 500, chunkOverlap: 100 },
    large: { chunkSize: 2000, chunkOverlap: 400 },
  };

  return new TextChunker(presets[preset]);
}
