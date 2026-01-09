import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';

export interface PDFDocument {
  fileName: string;
  title?: string;
  text: string;
  pages: number;
  metadata?: any;
}

export class PdfParser {
  private documents: Map<string, PDFDocument> = new Map();

  async loadPdfFiles(pdfDir: string): Promise<void> {
    try {
      const files = await fs.readdir(pdfDir);
      const pdfFiles = files.filter(f => f.toLowerCase().endsWith('.pdf'));

      for (const file of pdfFiles) {
        const filePath = path.join(pdfDir, file);
        await this.parsePdfFile(filePath, file);
      }
    } catch (error) {
      console.error(`Error reading PDF directory:`, error);
    }
  }

  private async parsePdfFile(filePath: string, fileName: string): Promise<void> {
    try {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      const doc: PDFDocument = {
        fileName,
        title: data.info?.Title || fileName,
        text: data.text,
        pages: data.numpages,
        metadata: data.info,
      };

      this.documents.set(fileName, doc);
    } catch (error) {
      console.error(`Error parsing ${fileName}:`, error);
    }
  }

  getDocuments(): Map<string, PDFDocument> {
    return this.documents;
  }

  searchDocuments(query: string): Array<{ fileName: string; matches: string[] }> {
    const lowerQuery = query.toLowerCase();
    const results: Array<{ fileName: string; matches: string[] }> = [];

    for (const [fileName, doc] of this.documents) {
      const lines = doc.text.split('\n');
      const matches: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          // Get context: 2 lines before and 2 lines after
          const start = Math.max(0, i - 2);
          const end = Math.min(lines.length, i + 3);
          const context = lines.slice(start, end).join('\n');
          matches.push(context);
        }
      }

      if (matches.length > 0) {
        results.push({ fileName, matches: matches.slice(0, 10) }); // Limit to 10 matches per file
      }
    }

    return results;
  }

  getDocumentText(fileName: string): string | undefined {
    return this.documents.get(fileName)?.text;
  }

  getAllDocumentSummaries(): Array<{ fileName: string; title?: string; pages: number }> {
    return Array.from(this.documents.values()).map(doc => ({
      fileName: doc.fileName,
      title: doc.title,
      pages: doc.pages,
    }));
  }
}
