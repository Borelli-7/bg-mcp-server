import { YamlParser, EndpointInfo, OpenAPISpec } from './yamlParser.js';
import { PdfParser, PDFDocument } from './pdfParser.js';
import { VectorStore, VectorSearchResult, createVectorStore } from './vectorStore.js';
import { TextChunk } from './textChunker.js';

export interface SpecificationIndex {
  specs: Map<string, OpenAPISpec>;
  endpoints: EndpointInfo[];
  schemas: Array<{ specFile: string; name: string; schema: any }>;
  pdfDocuments: Map<string, PDFDocument>;
}

export interface SemanticSearchResult {
  id: string;
  text: string;
  fileName: string;
  relevanceScore: number;
  section?: string;
  pageEstimate?: number;
}

export class SpecificationIndexer {
  private yamlParser: YamlParser;
  private pdfParser: PdfParser;
  private vectorStore: VectorStore;
  private initialized: boolean = false;
  private vectorStoreEnabled: boolean = false;

  constructor() {
    this.yamlParser = new YamlParser();
    this.pdfParser = new PdfParser();
    this.vectorStore = createVectorStore();
  }

  async initialize(yamlDir: string, pdfDir: string): Promise<void> {
    console.log('Loading Berlin Group specifications...');
    
    // Load YAML and PDF files in parallel
    await Promise.all([
      this.yamlParser.loadYamlFiles(yamlDir),
      this.pdfParser.loadPdfFiles(pdfDir),
    ]);

    // Initialize vector store and index PDF chunks
    try {
      await this.vectorStore.initialize();
      const chunks = this.pdfParser.getAllChunks();
      if (chunks.length > 0) {
        await this.vectorStore.addChunks(chunks);
        this.vectorStoreEnabled = true;
        console.log(`Indexed ${chunks.length} PDF chunks in vector store`);
      }
    } catch (error) {
      console.warn('Vector store initialization failed, semantic search will be unavailable:', error);
      this.vectorStoreEnabled = false;
    }

    this.initialized = true;
    console.log(`Loaded ${this.yamlParser.getSpecs().size} YAML specifications`);
    console.log(`Loaded ${this.pdfParser.getDocuments().size} PDF documents`);
    console.log(`Indexed ${this.yamlParser.getEndpoints().length} API endpoints`);
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  // Endpoint operations
  getAllEndpoints(): EndpointInfo[] {
    return this.yamlParser.getEndpoints();
  }

  searchEndpoints(query: string): EndpointInfo[] {
    return this.yamlParser.searchEndpoints(query);
  }

  getEndpointsByTag(tag: string): EndpointInfo[] {
    return this.yamlParser.getEndpoints().filter(
      ep => ep.tags?.some(t => t.toLowerCase() === tag.toLowerCase())
    );
  }

  getEndpointsByMethod(method: string): EndpointInfo[] {
    return this.yamlParser.getEndpoints().filter(
      ep => ep.method.toLowerCase() === method.toLowerCase()
    );
  }

  getEndpointsBySpec(specFile: string): EndpointInfo[] {
    return this.yamlParser.getEndpoints().filter(
      ep => ep.specFile === specFile
    );
  }

  // Schema operations
  getAllSchemas(): Array<{ specFile: string; name: string; schema: any }> {
    return this.yamlParser.getAllSchemas();
  }

  searchSchemas(query: string): Array<{ specFile: string; name: string; schema: any }> {
    return this.yamlParser.searchSchemas(query);
  }

  getSchema(specFile: string, schemaName: string): any {
    return this.yamlParser.getSchema(specFile, schemaName);
  }

  // Specification operations
  getAllSpecs(): Array<{ fileName: string; title: string; version: string; description?: string }> {
    return Array.from(this.yamlParser.getSpecs().values()).map(spec => ({
      fileName: spec.fileName,
      title: spec.title,
      version: spec.version,
      description: spec.description,
    }));
  }

  getSpecDetails(fileName: string): OpenAPISpec | undefined {
    return this.yamlParser.getSpecs().get(fileName);
  }

  // PDF operations
  getAllPdfDocuments(): Array<{ fileName: string; title?: string; pages: number }> {
    return this.pdfParser.getAllDocumentSummaries();
  }

  searchPdfDocuments(query: string): Array<{ fileName: string; matches: string[] }> {
    return this.pdfParser.searchDocuments(query);
  }

  getPdfDocumentText(fileName: string): string | undefined {
    return this.pdfParser.getDocumentText(fileName);
  }

  // Cross-search operations
  searchAll(query: string): {
    endpoints: EndpointInfo[];
    schemas: Array<{ specFile: string; name: string; schema: any }>;
    pdfMatches: Array<{ fileName: string; matches: string[] }>;
  } {
    return {
      endpoints: this.searchEndpoints(query),
      schemas: this.searchSchemas(query),
      pdfMatches: this.searchPdfDocuments(query),
    };
  }

  // Semantic search operations
  isSemanticSearchEnabled(): boolean {
    return this.vectorStoreEnabled;
  }

  /**
   * Perform semantic search across PDF documents
   * Returns results ranked by relevance score
   */
  async searchPdfSemantic(query: string, topK: number = 10): Promise<SemanticSearchResult[]> {
    if (!this.vectorStoreEnabled) {
      console.warn('Semantic search is not available, falling back to keyword search');
      // Fallback to keyword search
      const keywordResults = this.searchPdfDocuments(query);
      return keywordResults.flatMap(result =>
        result.matches.map((match, idx) => ({
          id: `${result.fileName}_match_${idx}`,
          text: match,
          fileName: result.fileName,
          relevanceScore: 0.5, // Default score for keyword matches
        }))
      ).slice(0, topK);
    }

    const results = await this.vectorStore.search(query, topK);
    return results.map(r => ({
      id: r.id,
      text: r.text,
      fileName: r.metadata.fileName,
      relevanceScore: r.relevanceScore,
      section: r.metadata.section,
      pageEstimate: r.metadata.pageEstimate,
    }));
  }

  /**
   * Perform semantic search with metadata filter
   */
  async searchPdfSemanticFiltered(
    query: string,
    filter: { fileName?: string; section?: string },
    topK: number = 10
  ): Promise<SemanticSearchResult[]> {
    if (!this.vectorStoreEnabled) {
      return this.searchPdfSemantic(query, topK);
    }

    const results = await this.vectorStore.searchWithFilter(query, filter, topK);
    return results.map(r => ({
      id: r.id,
      text: r.text,
      fileName: r.metadata.fileName,
      relevanceScore: r.relevanceScore,
      section: r.metadata.section,
      pageEstimate: r.metadata.pageEstimate,
    }));
  }

  /**
   * Cross-search with semantic capabilities
   */
  async searchAllSemantic(query: string, topK: number = 10): Promise<{
    endpoints: EndpointInfo[];
    schemas: Array<{ specFile: string; name: string; schema: any }>;
    pdfMatches: SemanticSearchResult[];
  }> {
    const [pdfMatches] = await Promise.all([
      this.searchPdfSemantic(query, topK),
    ]);

    return {
      endpoints: this.searchEndpoints(query),
      schemas: this.searchSchemas(query),
      pdfMatches,
    };
  }

  /**
   * Get vector store statistics
   */
  async getVectorStoreStats(): Promise<{
    enabled: boolean;
    totalChunks: number;
    collectionName: string;
    isInMemory: boolean;
  }> {
    if (!this.vectorStoreEnabled) {
      return {
        enabled: false,
        totalChunks: 0,
        collectionName: '',
        isInMemory: true,
      };
    }

    const stats = await this.vectorStore.getStats();
    return {
      enabled: true,
      ...stats,
    };
  }

  // Statistics
  getStatistics(): {
    totalSpecs: number;
    totalEndpoints: number;
    totalSchemas: number;
    totalPdfDocuments: number;
    endpointsByMethod: Record<string, number>;
    specList: string[];
  } {
    const endpoints = this.getAllEndpoints();
    const endpointsByMethod: Record<string, number> = {};

    for (const ep of endpoints) {
      endpointsByMethod[ep.method] = (endpointsByMethod[ep.method] || 0) + 1;
    }

    return {
      totalSpecs: this.yamlParser.getSpecs().size,
      totalEndpoints: endpoints.length,
      totalSchemas: this.getAllSchemas().length,
      totalPdfDocuments: this.pdfParser.getDocuments().size,
      endpointsByMethod,
      specList: Array.from(this.yamlParser.getSpecs().keys()),
    };
  }

  /**
   * Get extended statistics including vector store info
   */
  async getExtendedStatistics(): Promise<{
    totalSpecs: number;
    totalEndpoints: number;
    totalSchemas: number;
    totalPdfDocuments: number;
    totalPdfChunks: number;
    vectorStoreEnabled: boolean;
    endpointsByMethod: Record<string, number>;
    specList: string[];
  }> {
    const basicStats = this.getStatistics();
    const vectorStats = await this.getVectorStoreStats();

    return {
      ...basicStats,
      totalPdfChunks: vectorStats.totalChunks,
      vectorStoreEnabled: vectorStats.enabled,
    };
  }
}
