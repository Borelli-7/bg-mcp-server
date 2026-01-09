import { YamlParser, EndpointInfo, OpenAPISpec } from './yamlParser.js';
import { PdfParser, PDFDocument } from './pdfParser.js';

export interface SpecificationIndex {
  specs: Map<string, OpenAPISpec>;
  endpoints: EndpointInfo[];
  schemas: Array<{ specFile: string; name: string; schema: any }>;
  pdfDocuments: Map<string, PDFDocument>;
}

export class SpecificationIndexer {
  private yamlParser: YamlParser;
  private pdfParser: PdfParser;
  private initialized: boolean = false;

  constructor() {
    this.yamlParser = new YamlParser();
    this.pdfParser = new PdfParser();
  }

  async initialize(yamlDir: string, pdfDir: string): Promise<void> {
    console.log('Loading Berlin Group specifications...');
    
    await Promise.all([
      this.yamlParser.loadYamlFiles(yamlDir),
      this.pdfParser.loadPdfFiles(pdfDir),
    ]);

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
}
