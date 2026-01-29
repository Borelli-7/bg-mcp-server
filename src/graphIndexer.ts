/**
 * Graph Indexer for Berlin Group OpenAPI Specifications
 * Transforms YAML/OpenAPI specifications into graph nodes and relationships
 */

import { YamlParser, OpenAPISpec, EndpointInfo } from './yamlParser.js';
import {
  GraphStore,
  createGraphStore,
  GraphStoreConfig,
} from './graphStore.js';
import {
  RelationshipType,
  GraphStatistics,
  RelatedSchemaResult,
  EndpointDependency,
  SpecificationGraph,
  GraphTraversalResult,
  PatternSearchResult,
  createSpecificationId,
  createEndpointId,
  createSchemaId,
  createTagId,
  extractSchemaRef,
} from './graphModels.js';

// ============================================================================
// Interfaces
// ============================================================================

export interface IndexingProgress {
  phase: 'specifications' | 'endpoints' | 'schemas' | 'relationships';
  current: number;
  total: number;
  currentItem?: string;
}

export interface IndexingResult {
  success: boolean;
  specificationsIndexed: number;
  endpointsIndexed: number;
  schemasIndexed: number;
  relationshipsCreated: number;
  errors: string[];
  duration: number;
}

export type ProgressCallback = (progress: IndexingProgress) => void;

// ============================================================================
// Graph Indexer Class
// ============================================================================

export class GraphIndexer {
  private graphStore: GraphStore;
  private yamlParser: YamlParser;
  private initialized: boolean = false;
  private indexed: boolean = false;
  private indexingResult: IndexingResult | null = null;

  constructor(graphStoreConfig?: Partial<GraphStoreConfig>) {
    this.graphStore = createGraphStore(graphStoreConfig);
    this.yamlParser = new YamlParser();
  }

  /**
   * Initialize the graph indexer
   */
  async initialize(): Promise<void> {
    await this.graphStore.initialize();
    this.initialized = true;
  }

  /**
   * Load YAML files and index them into the graph
   */
  async loadAndIndex(
    yamlDir: string,
    onProgress?: ProgressCallback
  ): Promise<IndexingResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    const errors: string[] = [];
    let specificationsIndexed = 0;
    let endpointsIndexed = 0;
    let schemasIndexed = 0;
    let relationshipsCreated = 0;

    try {
      // Load YAML files
      await this.yamlParser.loadYamlFiles(yamlDir);
      const specs = this.yamlParser.getSpecs();
      const totalSpecs = specs.size;

      // Phase 1: Index Specifications
      let specIndex = 0;
      for (const [fileName, spec] of specs) {
        onProgress?.({
          phase: 'specifications',
          current: specIndex + 1,
          total: totalSpecs,
          currentItem: fileName,
        });

        try {
          await this.indexSpecification(spec);
          specificationsIndexed++;
        } catch (error) {
          errors.push(`Failed to index specification ${fileName}: ${error}`);
        }
        specIndex++;
      }

      // Phase 2: Index Endpoints
      const endpoints = this.yamlParser.getEndpoints();
      const totalEndpoints = endpoints.length;

      for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];
        onProgress?.({
          phase: 'endpoints',
          current: i + 1,
          total: totalEndpoints,
          currentItem: `${endpoint.method} ${endpoint.path}`,
        });

        try {
          const rels = await this.indexEndpoint(endpoint);
          endpointsIndexed++;
          relationshipsCreated += rels;
        } catch (error) {
          errors.push(`Failed to index endpoint ${endpoint.method} ${endpoint.path}: ${error}`);
        }
      }

      // Phase 3: Index Schemas
      const schemas = this.yamlParser.getAllSchemas();
      const totalSchemas = schemas.length;

      for (let i = 0; i < schemas.length; i++) {
        const schema = schemas[i];
        onProgress?.({
          phase: 'schemas',
          current: i + 1,
          total: totalSchemas,
          currentItem: schema.name,
        });

        try {
          const rels = await this.indexSchema(schema.specFile, schema.name, schema.schema);
          schemasIndexed++;
          relationshipsCreated += rels;
        } catch (error) {
          errors.push(`Failed to index schema ${schema.name}: ${error}`);
        }
      }

      // Phase 4: Create Cross-References
      onProgress?.({
        phase: 'relationships',
        current: 0,
        total: 1,
        currentItem: 'Creating schema references',
      });

      try {
        const refs = await this.createSchemaReferences(schemas);
        relationshipsCreated += refs;
      } catch (error) {
        errors.push(`Failed to create schema references: ${error}`);
      }

      onProgress?.({
        phase: 'relationships',
        current: 1,
        total: 1,
        currentItem: 'Complete',
      });

    } catch (error) {
      errors.push(`Indexing failed: ${error}`);
    }

    const duration = Date.now() - startTime;

    this.indexingResult = {
      success: errors.length === 0,
      specificationsIndexed,
      endpointsIndexed,
      schemasIndexed,
      relationshipsCreated,
      errors,
      duration,
    };

    this.indexed = true;
    return this.indexingResult;
  }

  /**
   * Index a single specification
   */
  private async indexSpecification(spec: OpenAPISpec): Promise<void> {
    await this.graphStore.createSpecification({
      fileName: spec.fileName,
      title: spec.title,
      version: spec.version,
      description: spec.description,
      openApiVersion: spec.version,
    });

    // Create tag nodes for this specification
    const tags = new Set<string>();
    for (const [_, pathItem] of Object.entries(spec.paths)) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete', 'options', 'head']) {
        if (pathItem[method]?.tags) {
          pathItem[method].tags.forEach((t: string) => tags.add(t));
        }
      }
    }

    for (const tag of tags) {
      await this.graphStore.createTag(tag);
    }
  }

  /**
   * Index a single endpoint
   */
  private async indexEndpoint(endpoint: EndpointInfo): Promise<number> {
    let relationshipsCreated = 0;

    const endpointNode = await this.graphStore.createEndpoint(
      {
        path: endpoint.path,
        method: endpoint.method,
        operationId: endpoint.operationId,
        summary: endpoint.summary,
        description: endpoint.description,
        specFile: endpoint.specFile,
      },
      endpoint.specFile
    );
    relationshipsCreated++; // DEFINES_ENDPOINT

    // Index parameters
    if (endpoint.parameters) {
      for (const param of endpoint.parameters) {
        await this.graphStore.createParameter(
          {
            name: param.name,
            in: param.in,
            required: param.required,
            description: param.description,
            type: param.schema?.type,
            format: param.schema?.format,
          },
          endpointNode.id
        );
        relationshipsCreated++; // HAS_PARAMETER

        // Link to schema if parameter references one
        if (param.schema?.$ref) {
          const schemaName = extractSchemaRef(param.schema.$ref);
          if (schemaName) {
            const schemaId = createSchemaId(endpoint.specFile, schemaName);
            try {
              await this.graphStore.linkEndpointSchema(endpointNode.id, schemaId, 'request');
              relationshipsCreated++;
            } catch (e) {
              // Schema might not exist yet
            }
          }
        }
      }
    }

    // Index responses
    if (endpoint.responses) {
      for (const [statusCode, response] of Object.entries(endpoint.responses)) {
        const responseNode = await this.graphStore.createResponse(
          {
            statusCode,
            description: response.description,
            mediaType: response.content ? Object.keys(response.content)[0] : undefined,
          },
          endpointNode.id
        );
        relationshipsCreated++; // HAS_RESPONSE

        // Link to response schema
        if (response.content) {
          for (const [mediaType, content] of Object.entries(response.content as Record<string, any>)) {
            if (content.schema?.$ref) {
              const schemaName = extractSchemaRef(content.schema.$ref);
              if (schemaName) {
                const schemaId = createSchemaId(endpoint.specFile, schemaName);
                try {
                  await this.graphStore.linkEndpointSchema(endpointNode.id, schemaId, 'response', mediaType);
                  relationshipsCreated++;
                } catch (e) {
                  // Schema might not exist yet
                }
              }
            }
          }
        }
      }
    }

    // Index request body schema
    if (endpoint.requestBody?.content) {
      for (const [mediaType, content] of Object.entries(endpoint.requestBody.content as Record<string, any>)) {
        if (content.schema?.$ref) {
          const schemaName = extractSchemaRef(content.schema.$ref);
          if (schemaName) {
            const schemaId = createSchemaId(endpoint.specFile, schemaName);
            try {
              await this.graphStore.linkEndpointSchema(endpointNode.id, schemaId, 'request', mediaType);
              relationshipsCreated++;
            } catch (e) {
              // Schema might not exist yet
            }
          }
        }
      }
    }

    // Tag the endpoint
    if (endpoint.tags) {
      for (const tag of endpoint.tags) {
        if (tag) {  // Skip undefined/null tags
          try {
            await this.graphStore.tagEndpoint(endpointNode.id, tag);
            relationshipsCreated++;
          } catch (e) {
            // Tag might not exist
          }
        }
      }
    }

    return relationshipsCreated;
  }

  /**
   * Index a single schema
   */
  private async indexSchema(
    specFile: string,
    schemaName: string,
    schemaDefinition: any
  ): Promise<number> {
    let relationshipsCreated = 0;

    await this.graphStore.createSchema({
      name: schemaName,
      type: schemaDefinition.type,
      description: schemaDefinition.description,
      required: schemaDefinition.required,
      specFile,
    });
    relationshipsCreated++; // DEFINES_SCHEMA

    // Index properties
    if (schemaDefinition.properties) {
      for (const [propName, propDef] of Object.entries(schemaDefinition.properties as Record<string, any>)) {
        const schemaId = createSchemaId(specFile, schemaName);
        
        // Create property node (simplified - stored as part of schema)
        // In a full implementation, you might want separate Property nodes
        
        // Track references in properties
        if (propDef.$ref) {
          const refSchemaName = extractSchemaRef(propDef.$ref);
          if (refSchemaName) {
            // Will be linked in createSchemaReferences phase
          }
        }
      }
    }

    return relationshipsCreated;
  }

  /**
   * Create schema reference relationships
   */
  private async createSchemaReferences(
    schemas: Array<{ specFile: string; name: string; schema: any }>
  ): Promise<number> {
    let relationshipsCreated = 0;

    for (const { specFile, name, schema } of schemas) {
      const sourceSchemaId = createSchemaId(specFile, name);
      const refs = this.extractAllRefs(schema);

      for (const ref of refs) {
        const targetSchemaName = extractSchemaRef(ref);
        if (targetSchemaName) {
          const targetSchemaId = createSchemaId(specFile, targetSchemaName);
          try {
            await this.graphStore.linkSchemaReference(sourceSchemaId, targetSchemaId, ref);
            relationshipsCreated++;
          } catch (e) {
            // Target schema might not exist
          }
        }
      }
    }

    return relationshipsCreated;
  }

  /**
   * Extract all $ref paths from a schema definition
   */
  private extractAllRefs(obj: any, refs: string[] = []): string[] {
    if (!obj || typeof obj !== 'object') return refs;

    if (obj.$ref && typeof obj.$ref === 'string') {
      refs.push(obj.$ref);
    }

    for (const value of Object.values(obj)) {
      this.extractAllRefs(value, refs);
    }

    return refs;
  }

  // ============================================================================
  // Query Methods (Delegated to GraphStore)
  // ============================================================================

  /**
   * Find schemas related to a given schema
   */
  async findRelatedSchemas(
    schemaName: string,
    specFile?: string,
    maxDepth: number = 3
  ): Promise<RelatedSchemaResult[]> {
    this.ensureIndexed();
    return this.graphStore.findRelatedSchemas(schemaName, specFile, maxDepth);
  }

  /**
   * Get endpoint dependencies
   */
  async getEndpointDependencies(
    path: string,
    method: string,
    specFile?: string
  ): Promise<EndpointDependency | null> {
    this.ensureIndexed();
    return this.graphStore.getEndpointDependencies(path, method, specFile);
  }

  /**
   * Traverse the graph from a starting point
   */
  async traverseGraph(
    startNodeType: string,
    startNodeFilter: Record<string, any>,
    relationshipTypes?: string[],
    maxDepth: number = 3
  ): Promise<GraphTraversalResult> {
    this.ensureIndexed();
    return this.graphStore.traverseGraph(startNodeType, startNodeFilter, relationshipTypes, maxDepth);
  }

  /**
   * Get the graph for a specific specification
   */
  async getSpecificationGraph(fileName: string): Promise<SpecificationGraph | null> {
    this.ensureIndexed();
    return this.graphStore.getSpecificationGraph(fileName);
  }

  /**
   * Search by pattern
   */
  async searchByPattern(
    nodeType: string,
    pattern: Record<string, any>,
    limit: number = 50
  ): Promise<PatternSearchResult> {
    this.ensureIndexed();
    return this.graphStore.searchByPattern(nodeType, pattern, limit);
  }

  /**
   * Get graph statistics
   */
  async getStatistics(): Promise<GraphStatistics> {
    this.ensureIndexed();
    return this.graphStore.getStatistics();
  }

  /**
   * Execute a custom Cypher query (Neo4j only)
   */
  async executeCypher(query: string, params?: Record<string, any>): Promise<any> {
    this.ensureIndexed();
    return this.graphStore.executeCypher(query, params);
  }

  // ============================================================================
  // State Methods
  // ============================================================================

  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if indexed
   */
  isIndexed(): boolean {
    return this.indexed;
  }

  /**
   * Check if using Neo4j or in-memory
   */
  isUsingNeo4j(): boolean {
    return this.graphStore.isNeo4jConnected();
  }

  /**
   * Get the last indexing result
   */
  getIndexingResult(): IndexingResult | null {
    return this.indexingResult;
  }

  /**
   * Get the underlying graph store
   */
  getGraphStore(): GraphStore {
    return this.graphStore;
  }

  /**
   * Clear all data
   */
  async clearAll(): Promise<void> {
    await this.graphStore.clearAll();
    this.indexed = false;
    this.indexingResult = null;
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    await this.graphStore.close();
    this.initialized = false;
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Ensure the indexer has been populated
   */
  private ensureIndexed(): void {
    if (!this.indexed) {
      throw new Error('Graph has not been indexed. Call loadAndIndex() first.');
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a GraphIndexer instance
 */
export function createGraphIndexer(config?: Partial<GraphStoreConfig>): GraphIndexer {
  return new GraphIndexer(config);
}
