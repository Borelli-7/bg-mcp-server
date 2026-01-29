/**
 * Neo4j Graph Store for Berlin Group OpenAPI Specifications
 * Provides connection management, CRUD operations, and Cypher query execution
 */

import neo4j, { Driver, Session, QueryResult, Record as Neo4jRecord } from 'neo4j-driver';
import {
  GraphNode,
  GraphRelationship,
  RelationshipType,
  GraphStatistics,
  RelatedSchemaResult,
  EndpointDependency,
  SpecificationGraph,
  GraphTraversalResult,
  PatternSearchResult,
  CreateSpecificationDTO,
  CreateEndpointDTO,
  CreateSchemaDTO,
  CreateParameterDTO,
  CreateResponseDTO,
  createSpecificationId,
  createEndpointId,
  createSchemaId,
  createParameterId,
  createResponseId,
  createTagId,
  extractSchemaRef,
} from './graphModels.js';

// ============================================================================
// Configuration
// ============================================================================

export interface GraphStoreConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionAcquisitionTimeout?: number;
}

const DEFAULT_CONFIG: Partial<GraphStoreConfig> = {
  database: 'neo4j',
  maxConnectionPoolSize: 50,
  connectionAcquisitionTimeout: 60000,
};

// ============================================================================
// In-Memory Fallback Store
// ============================================================================

interface InMemoryNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

interface InMemoryRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties: Record<string, any>;
}

class InMemoryGraphStore {
  private nodes: Map<string, InMemoryNode> = new Map();
  private relationships: Map<string, InMemoryRelationship> = new Map();
  private relationshipCounter: number = 0;

  async createNode(labels: string[], properties: Record<string, any>, nodeId?: string): Promise<GraphNode> {
    const id = nodeId || `node_${this.nodes.size + 1}`;
    const node: InMemoryNode = { id, labels, properties };
    this.nodes.set(id, node);
    return { id, labels, properties };
  }

  async createRelationship(
    startNodeId: string,
    endNodeId: string,
    type: string,
    properties?: Record<string, any>
  ): Promise<GraphRelationship> {
    const id = `rel_${++this.relationshipCounter}`;
    const relationship: InMemoryRelationship = {
      id,
      type,
      startNodeId,
      endNodeId,
      properties: properties || {},
    };
    this.relationships.set(id, relationship);
    return relationship;
  }

  async findNodeById(nodeId: string): Promise<GraphNode | null> {
    const node = this.nodes.get(nodeId);
    return node ? { ...node } : null;
  }

  async findNodesByLabel(label: string): Promise<GraphNode[]> {
    return Array.from(this.nodes.values())
      .filter(n => n.labels.includes(label))
      .map(n => ({ ...n }));
  }

  async findRelationshipsByType(type: string): Promise<GraphRelationship[]> {
    return Array.from(this.relationships.values())
      .filter(r => r.type === type)
      .map(r => ({ ...r }));
  }

  async getOutgoingRelationships(nodeId: string): Promise<Array<{ relationship: GraphRelationship; targetNode: GraphNode }>> {
    const results: Array<{ relationship: GraphRelationship; targetNode: GraphNode }> = [];
    for (const rel of this.relationships.values()) {
      if (rel.startNodeId === nodeId) {
        const targetNode = this.nodes.get(rel.endNodeId);
        if (targetNode) {
          results.push({ relationship: { ...rel }, targetNode: { ...targetNode } });
        }
      }
    }
    return results;
  }

  async getIncomingRelationships(nodeId: string): Promise<Array<{ relationship: GraphRelationship; sourceNode: GraphNode }>> {
    const results: Array<{ relationship: GraphRelationship; sourceNode: GraphNode }> = [];
    for (const rel of this.relationships.values()) {
      if (rel.endNodeId === nodeId) {
        const sourceNode = this.nodes.get(rel.startNodeId);
        if (sourceNode) {
          results.push({ relationship: { ...rel }, sourceNode: { ...sourceNode } });
        }
      }
    }
    return results;
  }

  async clear(): Promise<void> {
    this.nodes.clear();
    this.relationships.clear();
    this.relationshipCounter = 0;
  }

  async getStatistics(): Promise<GraphStatistics> {
    const nodesByLabel: Record<string, number> = {};
    const relationshipsByType: Record<string, number> = {};

    for (const node of this.nodes.values()) {
      for (const label of node.labels) {
        nodesByLabel[label] = (nodesByLabel[label] || 0) + 1;
      }
    }

    for (const rel of this.relationships.values()) {
      relationshipsByType[rel.type] = (relationshipsByType[rel.type] || 0) + 1;
    }

    const endpointCount = nodesByLabel['Endpoint'] || 0;
    const schemaCount = nodesByLabel['Schema'] || 0;
    const propertyCount = nodesByLabel['Property'] || 0;

    return {
      nodeCount: this.nodes.size,
      relationshipCount: this.relationships.size,
      nodesByLabel,
      relationshipsByType,
      specificationCount: nodesByLabel['Specification'] || 0,
      endpointCount,
      schemaCount,
      avgRelationshipsPerEndpoint: endpointCount > 0 
        ? (relationshipsByType[RelationshipType.HAS_PARAMETER] || 0) / endpointCount 
        : 0,
      avgPropertiesPerSchema: schemaCount > 0 ? propertyCount / schemaCount : 0,
    };
  }

  // Simple traversal for in-memory store
  async traverse(
    startNodeId: string,
    maxDepth: number = 3,
    relationshipTypes?: string[]
  ): Promise<GraphTraversalResult> {
    const visitedNodes = new Set<string>();
    const nodes: GraphNode[] = [];
    const relationships: GraphRelationship[] = [];
    const paths: GraphTraversalResult['paths'] = [];

    const queue: Array<{ nodeId: string; depth: number; path: string[]; relTypes: string[] }> = [
      { nodeId: startNodeId, depth: 0, path: [startNodeId], relTypes: [] }
    ];

    while (queue.length > 0) {
      const { nodeId, depth, path, relTypes } = queue.shift()!;
      
      if (visitedNodes.has(nodeId)) continue;
      visitedNodes.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        nodes.push({ ...node });
      }

      if (depth < maxDepth) {
        const outgoing = await this.getOutgoingRelationships(nodeId);
        for (const { relationship, targetNode } of outgoing) {
          if (!relationshipTypes || relationshipTypes.includes(relationship.type)) {
            relationships.push(relationship);
            const newPath = [...path, targetNode.id];
            const newRelTypes = [...relTypes, relationship.type];
            queue.push({
              nodeId: targetNode.id,
              depth: depth + 1,
              path: newPath,
              relTypes: newRelTypes,
            });

            paths.push({
              start: startNodeId,
              end: targetNode.id,
              length: depth + 1,
              nodeIds: newPath,
              relationshipTypes: newRelTypes,
            });
          }
        }
      }
    }

    return { nodes, relationships, paths };
  }
}

// ============================================================================
// Main Graph Store Class
// ============================================================================

export class GraphStore {
  private driver: Driver | null = null;
  private config: GraphStoreConfig;
  private inMemoryStore: InMemoryGraphStore;
  private isConnected: boolean = false;
  private useInMemory: boolean = false;

  constructor(config?: Partial<GraphStoreConfig>) {
    this.config = {
      uri: config?.uri || process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: config?.username || process.env.NEO4J_USER || 'neo4j',
      password: config?.password || process.env.NEO4J_PASSWORD || 'password',
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.inMemoryStore = new InMemoryGraphStore();
  }

  /**
   * Initialize connection to Neo4j
   */
  async initialize(): Promise<void> {
    try {
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password),
        {
          maxConnectionPoolSize: this.config.maxConnectionPoolSize,
          connectionAcquisitionTimeout: this.config.connectionAcquisitionTimeout,
        }
      );

      // Verify connectivity
      await this.driver.verifyConnectivity();
      this.isConnected = true;
      this.useInMemory = false;
      console.log('Connected to Neo4j database');

      // Create constraints and indexes
      await this.createConstraints();
    } catch (error) {
      console.warn('Neo4j connection failed, using in-memory graph store:', error);
      this.useInMemory = true;
      this.isConnected = false;
    }
  }

  /**
   * Create database constraints and indexes
   */
  private async createConstraints(): Promise<void> {
    if (this.useInMemory || !this.driver) return;

    const constraints = [
      'CREATE CONSTRAINT spec_filename IF NOT EXISTS FOR (s:Specification) REQUIRE s.fileName IS UNIQUE',
      'CREATE CONSTRAINT schema_unique IF NOT EXISTS FOR (s:Schema) REQUIRE (s.specFile, s.name) IS UNIQUE',
      'CREATE CONSTRAINT tag_name IF NOT EXISTS FOR (t:Tag) REQUIRE t.name IS UNIQUE',
    ];

    const indexes = [
      'CREATE INDEX endpoint_path IF NOT EXISTS FOR (e:Endpoint) ON (e.path)',
      'CREATE INDEX endpoint_method IF NOT EXISTS FOR (e:Endpoint) ON (e.method)',
      'CREATE INDEX schema_name IF NOT EXISTS FOR (s:Schema) ON (s.name)',
      'CREATE INDEX parameter_name IF NOT EXISTS FOR (p:Parameter) ON (p.name)',
    ];

    const session = this.driver.session({ database: this.config.database });
    try {
      for (const constraint of constraints) {
        try {
          await session.run(constraint);
        } catch (e) {
          // Constraint might already exist
        }
      }
      for (const index of indexes) {
        try {
          await session.run(index);
        } catch (e) {
          // Index might already exist
        }
      }
    } finally {
      await session.close();
    }
  }

  /**
   * Get a session for transaction execution
   */
  private getSession(): Session | null {
    if (this.useInMemory || !this.driver) return null;
    return this.driver.session({ database: this.config.database });
  }

  /**
   * Close the driver connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.isConnected = false;
    }
  }

  /**
   * Check if connected to Neo4j or using in-memory fallback
   */
  isNeo4jConnected(): boolean {
    return this.isConnected && !this.useInMemory;
  }

  /**
   * Check if using in-memory store
   */
  isUsingInMemory(): boolean {
    return this.useInMemory;
  }

  // ============================================================================
  // Node Creation Methods
  // ============================================================================

  /**
   * Create a Specification node
   */
  async createSpecification(dto: CreateSpecificationDTO): Promise<GraphNode> {
    const nodeId = createSpecificationId(dto.fileName);

    // Ensure all properties have defaults for optional fields
    const safeDto = {
      ...dto,
      description: dto.description || '',
    };

    if (this.useInMemory) {
      return this.inMemoryStore.createNode(['Specification'], safeDto, nodeId);
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const result = await session.executeWrite(async (txc) => {
        return txc.run(
          `
          MERGE (s:Specification {fileName: $fileName})
          SET s.title = $title,
              s.version = $version,
              s.description = $description,
              s.openApiVersion = $openApiVersion,
              s.nodeId = $nodeId
          RETURN s
          `,
          { ...safeDto, nodeId }
        );
      });

      return this.recordToNode(result.records[0], 's');
    } finally {
      await session.close();
    }
  }

  /**
   * Create an Endpoint node and link to Specification
   */
  async createEndpoint(dto: CreateEndpointDTO, specFileName: string): Promise<GraphNode> {
    const nodeId = createEndpointId(specFileName, dto.path, dto.method);
    const specId = createSpecificationId(specFileName);

    // Ensure all properties have defaults for optional fields
    const safeDto = {
      ...dto,
      description: dto.description || '',
      deprecated: dto.deprecated ?? false,
      summary: dto.summary || '',
      operationId: dto.operationId || '',
    };

    if (this.useInMemory) {
      const node = await this.inMemoryStore.createNode(['Endpoint'], { ...safeDto, nodeId }, nodeId);
      await this.inMemoryStore.createRelationship(specId, nodeId, RelationshipType.DEFINES_ENDPOINT);
      return node;
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const result = await session.executeWrite(async (txc) => {
        return txc.run(
          `
          MATCH (spec:Specification {fileName: $specFileName})
          MERGE (e:Endpoint {nodeId: $nodeId})
          SET e.path = $path,
              e.method = $method,
              e.operationId = $operationId,
              e.summary = $summary,
              e.description = $description,
              e.deprecated = $deprecated,
              e.specFile = $specFile
          MERGE (spec)-[:DEFINES_ENDPOINT]->(e)
          RETURN e
          `,
          { ...safeDto, specFileName, nodeId }
        );
      });

      return this.recordToNode(result.records[0], 'e');
    } finally {
      await session.close();
    }
  }

  /**
   * Create a Schema node and link to Specification
   */
  async createSchema(dto: CreateSchemaDTO): Promise<GraphNode> {
    const nodeId = createSchemaId(dto.specFile, dto.name);

    // Ensure all properties have defaults for optional fields
    const safeDto = {
      ...dto,
      type: dto.type || 'object',
      description: dto.description || '',
    };

    if (this.useInMemory) {
      const node = await this.inMemoryStore.createNode(['Schema'], { ...safeDto, nodeId }, nodeId);
      const specId = createSpecificationId(safeDto.specFile);
      await this.inMemoryStore.createRelationship(specId, nodeId, RelationshipType.DEFINES_SCHEMA);
      return node;
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const result = await session.executeWrite(async (txc) => {
        return txc.run(
          `
          MATCH (spec:Specification {fileName: $specFile})
          MERGE (s:Schema {nodeId: $nodeId})
          SET s.name = $name,
              s.type = $type,
              s.description = $description,
              s.required = $required,
              s.specFile = $specFile
          MERGE (spec)-[:DEFINES_SCHEMA]->(s)
          RETURN s
          `,
          { ...safeDto, required: safeDto.required?.join(',') || '', nodeId }
        );
      });

      return this.recordToNode(result.records[0], 's');
    } finally {
      await session.close();
    }
  }

  /**
   * Create a Parameter node and link to Endpoint
   */
  async createParameter(dto: CreateParameterDTO, endpointId: string): Promise<GraphNode> {
    const nodeId = createParameterId(endpointId, dto.name, dto.in);

    if (this.useInMemory) {
      const node = await this.inMemoryStore.createNode(['Parameter'], { ...dto, nodeId }, nodeId);
      await this.inMemoryStore.createRelationship(endpointId, nodeId, RelationshipType.HAS_PARAMETER);
      return node;
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const result = await session.executeWrite(async (txc) => {
        return txc.run(
          `
          MATCH (e:Endpoint {nodeId: $endpointId})
          MERGE (p:Parameter {nodeId: $nodeId})
          SET p.name = $name,
              p.in = $in,
              p.required = $required,
              p.description = $description,
              p.type = $type,
              p.format = $format
          MERGE (e)-[:HAS_PARAMETER]->(p)
          RETURN p
          `,
          { ...dto, endpointId, nodeId }
        );
      });

      return this.recordToNode(result.records[0], 'p');
    } finally {
      await session.close();
    }
  }

  /**
   * Create a Response node and link to Endpoint
   */
  async createResponse(dto: CreateResponseDTO, endpointId: string): Promise<GraphNode> {
    const nodeId = createResponseId(endpointId, dto.statusCode);

    if (this.useInMemory) {
      const node = await this.inMemoryStore.createNode(['Response'], { ...dto, nodeId }, nodeId);
      await this.inMemoryStore.createRelationship(endpointId, nodeId, RelationshipType.HAS_RESPONSE);
      return node;
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const result = await session.executeWrite(async (txc) => {
        return txc.run(
          `
          MATCH (e:Endpoint {nodeId: $endpointId})
          MERGE (r:Response {nodeId: $nodeId})
          SET r.statusCode = $statusCode,
              r.description = $description,
              r.mediaType = $mediaType
          MERGE (e)-[:HAS_RESPONSE]->(r)
          RETURN r
          `,
          { ...dto, endpointId, nodeId }
        );
      });

      return this.recordToNode(result.records[0], 'r');
    } finally {
      await session.close();
    }
  }

  /**
   * Create a Tag node
   */
  async createTag(name: string, description?: string): Promise<GraphNode> {
    const nodeId = createTagId(name);

    if (this.useInMemory) {
      return this.inMemoryStore.createNode(['Tag'], { name, description, nodeId }, nodeId);
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const result = await session.executeWrite(async (txc) => {
        return txc.run(
          `
          MERGE (t:Tag {name: $name})
          SET t.description = $description,
              t.nodeId = $nodeId
          RETURN t
          `,
          { name, description, nodeId }
        );
      });

      return this.recordToNode(result.records[0], 't');
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // Relationship Creation Methods
  // ============================================================================

  /**
   * Create a relationship between two nodes
   */
  async createRelationship(
    startNodeId: string,
    endNodeId: string,
    type: RelationshipType,
    properties?: Record<string, any>
  ): Promise<GraphRelationship> {
    if (this.useInMemory) {
      return this.inMemoryStore.createRelationship(startNodeId, endNodeId, type, properties);
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const propsStr = properties
        ? Object.entries(properties)
            .map(([k, v]) => `r.${k} = $props.${k}`)
            .join(', ')
        : '';

      const query = `
        MATCH (start {nodeId: $startNodeId})
        MATCH (end {nodeId: $endNodeId})
        MERGE (start)-[r:${type}]->(end)
        ${propsStr ? `SET ${propsStr}` : ''}
        RETURN id(r) as relId, type(r) as relType
      `;

      const result = await session.executeWrite(async (txc) => {
        return txc.run(query, { startNodeId, endNodeId, props: properties || {} });
      });

      const record = result.records[0];
      return {
        id: record.get('relId').toString(),
        type: record.get('relType'),
        startNodeId,
        endNodeId,
        properties,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Link an endpoint to a tag
   */
  async tagEndpoint(endpointId: string, tagName: string): Promise<void> {
    const tagId = createTagId(tagName);
    await this.createRelationship(endpointId, tagId, RelationshipType.TAGGED_WITH);
  }

  /**
   * Link a schema to another schema (reference)
   */
  async linkSchemaReference(sourceSchemaId: string, targetSchemaId: string, refPath?: string): Promise<void> {
    await this.createRelationship(sourceSchemaId, targetSchemaId, RelationshipType.REFERENCES, { refPath });
  }

  /**
   * Link an endpoint to a schema (uses)
   */
  async linkEndpointSchema(
    endpointId: string,
    schemaId: string,
    context: 'request' | 'response',
    mediaType?: string
  ): Promise<void> {
    await this.createRelationship(endpointId, schemaId, RelationshipType.USES_SCHEMA, { context, mediaType });
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Find schemas related to a given schema (through references)
   */
  async findRelatedSchemas(schemaName: string, specFile?: string, maxDepth: number = 3): Promise<RelatedSchemaResult[]> {
    if (this.useInMemory) {
      const schemas = await this.inMemoryStore.findNodesByLabel('Schema');
      const targetSchema = schemas.find(s => 
        s.properties.name === schemaName && 
        (!specFile || s.properties.specFile === specFile)
      );

      if (!targetSchema) return [];

      const result = await this.inMemoryStore.traverse(targetSchema.id, maxDepth, [RelationshipType.REFERENCES]);
      return result.nodes
        .filter(n => n.labels.includes('Schema') && n.id !== targetSchema.id)
        .map((n, idx) => ({
          schemaName: n.properties.name,
          specFile: n.properties.specFile,
          relationshipType: RelationshipType.REFERENCES,
          depth: result.paths.find(p => p.end === n.id)?.length || 1,
          path: result.paths.find(p => p.end === n.id)?.nodeIds || [],
        }));
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const query = `
        MATCH (start:Schema {name: $schemaName${specFile ? ', specFile: $specFile' : ''}})
        CALL apoc.path.subgraphNodes(start, {
          relationshipFilter: 'REFERENCES>',
          maxLevel: $maxDepth
        }) YIELD node
        WHERE node <> start AND node:Schema
        WITH start, node, 
             shortestPath((start)-[:REFERENCES*]->(node)) as path
        RETURN node.name as schemaName, 
               node.specFile as specFile,
               'REFERENCES' as relationshipType,
               length(path) as depth,
               [n in nodes(path) | n.name] as pathNames
      `;

      const result = await session.executeRead(async (txc) => {
        return txc.run(query, { schemaName, specFile, maxDepth });
      });

      return result.records.map(r => ({
        schemaName: r.get('schemaName'),
        specFile: r.get('specFile'),
        relationshipType: r.get('relationshipType'),
        depth: r.get('depth').toNumber(),
        path: r.get('pathNames'),
      }));
    } catch (error) {
      // APOC might not be available, use simpler query
      const simpleQuery = `
        MATCH (start:Schema {name: $schemaName${specFile ? ', specFile: $specFile' : ''}})
        MATCH path = (start)-[:REFERENCES*1..${maxDepth}]->(related:Schema)
        RETURN DISTINCT related.name as schemaName,
               related.specFile as specFile,
               'REFERENCES' as relationshipType,
               length(path) as depth,
               [n in nodes(path) | n.name] as pathNames
      `;

      const result = await session.executeRead(async (txc) => {
        return txc.run(simpleQuery, { schemaName, specFile });
      });

      return result.records.map(r => ({
        schemaName: r.get('schemaName'),
        specFile: r.get('specFile'),
        relationshipType: r.get('relationshipType'),
        depth: typeof r.get('depth') === 'number' ? r.get('depth') : r.get('depth').toNumber(),
        path: r.get('pathNames'),
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Get all dependencies of an endpoint
   */
  async getEndpointDependencies(path: string, method: string, specFile?: string): Promise<EndpointDependency | null> {
    if (this.useInMemory) {
      const endpoints = await this.inMemoryStore.findNodesByLabel('Endpoint');
      const endpoint = endpoints.find(e => 
        e.properties.path === path && 
        e.properties.method.toUpperCase() === method.toUpperCase() &&
        (!specFile || e.properties.specFile === specFile)
      );

      if (!endpoint) return null;

      const outgoing = await this.inMemoryStore.getOutgoingRelationships(endpoint.id);
      const parameters = outgoing
        .filter(r => r.relationship.type === RelationshipType.HAS_PARAMETER)
        .map(r => ({
          name: r.targetNode.properties.name,
          in: r.targetNode.properties.in,
          required: r.targetNode.properties.required || false,
        }));

      const responses = outgoing
        .filter(r => r.relationship.type === RelationshipType.HAS_RESPONSE)
        .map(r => ({
          statusCode: r.targetNode.properties.statusCode,
          schemaRef: r.targetNode.properties.schemaRef,
        }));

      const relatedSchemas = outgoing
        .filter(r => r.relationship.type === RelationshipType.USES_SCHEMA)
        .map(r => r.targetNode.properties.name);

      return {
        endpointPath: endpoint.properties.path,
        method: endpoint.properties.method,
        specFile: endpoint.properties.specFile,
        parameters,
        responseSchemas: responses,
        relatedSchemas,
      };
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const query = `
        MATCH (e:Endpoint {path: $path, method: $method${specFile ? ', specFile: $specFile' : ''}})
        OPTIONAL MATCH (e)-[:HAS_PARAMETER]->(p:Parameter)
        OPTIONAL MATCH (e)-[:HAS_RESPONSE]->(r:Response)
        OPTIONAL MATCH (e)-[:USES_SCHEMA]->(s:Schema)
        RETURN e.path as path,
               e.method as method,
               e.specFile as specFile,
               collect(DISTINCT {name: p.name, in: p.in, required: p.required}) as parameters,
               collect(DISTINCT {statusCode: r.statusCode, schemaRef: r.schemaRef}) as responses,
               collect(DISTINCT s.name) as relatedSchemas
      `;

      const result = await session.executeRead(async (txc) => {
        return txc.run(query, { path, method: method.toUpperCase(), specFile });
      });

      if (result.records.length === 0) return null;

      const record = result.records[0];
      return {
        endpointPath: record.get('path'),
        method: record.get('method'),
        specFile: record.get('specFile'),
        parameters: record.get('parameters').filter((p: any) => p.name),
        responseSchemas: record.get('responses').filter((r: any) => r.statusCode),
        relatedSchemas: record.get('relatedSchemas').filter(Boolean),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a custom Cypher query for graph traversal
   */
  async traverseGraph(
    startNodeType: string,
    startNodeFilter: Record<string, any>,
    relationshipTypes?: string[],
    maxDepth: number = 3
  ): Promise<GraphTraversalResult> {
    if (this.useInMemory) {
      const nodes = await this.inMemoryStore.findNodesByLabel(startNodeType);
      const matchingNode = nodes.find(n => 
        Object.entries(startNodeFilter).every(([k, v]) => n.properties[k] === v)
      );

      if (!matchingNode) {
        return { nodes: [], relationships: [], paths: [] };
      }

      return this.inMemoryStore.traverse(matchingNode.id, maxDepth, relationshipTypes);
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const filterStr = Object.entries(startNodeFilter)
        .map(([k, _]) => `n.${k} = $filter.${k}`)
        .join(' AND ');

      const relFilter = relationshipTypes?.length
        ? `:${relationshipTypes.join('|')}`
        : '';

      const query = `
        MATCH (n:${startNodeType})
        WHERE ${filterStr}
        CALL {
          WITH n
          MATCH path = (n)-[${relFilter}*1..${maxDepth}]-(connected)
          RETURN path, connected
        }
        WITH n, collect(DISTINCT path) as paths, collect(DISTINCT connected) as connectedNodes
        RETURN n as startNode, paths, connectedNodes
      `;

      const result = await session.executeRead(async (txc) => {
        return txc.run(query, { filter: startNodeFilter });
      });

      const nodes: GraphNode[] = [];
      const relationships: GraphRelationship[] = [];
      const pathResults: GraphTraversalResult['paths'] = [];

      // Process results
      for (const record of result.records) {
        const startNode = record.get('startNode');
        nodes.push(this.neo4jNodeToGraphNode(startNode));

        const connectedNodes = record.get('connectedNodes');
        for (const cn of connectedNodes) {
          nodes.push(this.neo4jNodeToGraphNode(cn));
        }
      }

      return { nodes, relationships, paths: pathResults };
    } finally {
      await session.close();
    }
  }

  /**
   * Get the entire graph for a specification
   */
  async getSpecificationGraph(fileName: string): Promise<SpecificationGraph | null> {
    if (this.useInMemory) {
      const specs = await this.inMemoryStore.findNodesByLabel('Specification');
      const spec = specs.find(s => s.properties.fileName === fileName);
      if (!spec) return null;

      const endpoints = await this.inMemoryStore.findNodesByLabel('Endpoint');
      const schemas = await this.inMemoryStore.findNodesByLabel('Schema');

      const specEndpoints = endpoints.filter(e => e.properties.specFile === fileName);
      const specSchemas = schemas.filter(s => s.properties.specFile === fileName);

      return {
        specification: spec.properties as SpecificationGraph['specification'],
        endpoints: await Promise.all(specEndpoints.map(async (ep) => {
          const outgoing = await this.inMemoryStore.getOutgoingRelationships(ep.id);
          return {
            endpoint: ep.properties as any,
            tags: outgoing
              .filter(r => r.relationship.type === RelationshipType.TAGGED_WITH)
              .map(r => r.targetNode.properties.name),
            parameters: outgoing
              .filter(r => r.relationship.type === RelationshipType.HAS_PARAMETER)
              .map(r => r.targetNode.properties as any),
            responses: outgoing
              .filter(r => r.relationship.type === RelationshipType.HAS_RESPONSE)
              .map(r => r.targetNode.properties as any),
          };
        })),
        schemas: await Promise.all(specSchemas.map(async (s) => {
          const outgoing = await this.inMemoryStore.getOutgoingRelationships(s.id);
          return {
            schema: s.properties as any,
            properties: outgoing
              .filter(r => r.relationship.type === RelationshipType.HAS_PROPERTY)
              .map(r => r.targetNode.properties as any),
            references: outgoing
              .filter(r => r.relationship.type === RelationshipType.REFERENCES)
              .map(r => r.targetNode.properties.name),
          };
        })),
        statistics: {
          totalEndpoints: specEndpoints.length,
          totalSchemas: specSchemas.length,
          totalRelationships: (await this.inMemoryStore.getStatistics()).relationshipCount,
        },
      };
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const query = `
        MATCH (spec:Specification {fileName: $fileName})
        OPTIONAL MATCH (spec)-[:DEFINES_ENDPOINT]->(e:Endpoint)
        OPTIONAL MATCH (e)-[:TAGGED_WITH]->(t:Tag)
        OPTIONAL MATCH (e)-[:HAS_PARAMETER]->(p:Parameter)
        OPTIONAL MATCH (e)-[:HAS_RESPONSE]->(r:Response)
        OPTIONAL MATCH (spec)-[:DEFINES_SCHEMA]->(s:Schema)
        OPTIONAL MATCH (s)-[:HAS_PROPERTY]->(prop:Property)
        OPTIONAL MATCH (s)-[:REFERENCES]->(ref:Schema)
        RETURN spec,
               collect(DISTINCT e) as endpoints,
               collect(DISTINCT {endpoint: e, tag: t}) as endpointTags,
               collect(DISTINCT {endpoint: e, param: p}) as endpointParams,
               collect(DISTINCT {endpoint: e, resp: r}) as endpointResponses,
               collect(DISTINCT s) as schemas,
               collect(DISTINCT {schema: s, prop: prop}) as schemaProps,
               collect(DISTINCT {schema: s, ref: ref}) as schemaRefs
      `;

      const result = await session.executeRead(async (txc) => {
        return txc.run(query, { fileName });
      });

      if (result.records.length === 0) return null;

      const record = result.records[0];
      const specNode = record.get('spec');

      // Process endpoints with their related data
      const endpointMap = new Map<string, any>();
      for (const ep of record.get('endpoints')) {
        if (ep) {
          endpointMap.set(ep.properties.nodeId, {
            endpoint: ep.properties,
            tags: [],
            parameters: [],
            responses: [],
          });
        }
      }

      // Add tags
      for (const { endpoint, tag } of record.get('endpointTags')) {
        if (endpoint && tag) {
          const ep = endpointMap.get(endpoint.properties.nodeId);
          if (ep) ep.tags.push(tag.properties.name);
        }
      }

      // Add parameters
      for (const { endpoint, param } of record.get('endpointParams')) {
        if (endpoint && param) {
          const ep = endpointMap.get(endpoint.properties.nodeId);
          if (ep) ep.parameters.push(param.properties);
        }
      }

      // Add responses
      for (const { endpoint, resp } of record.get('endpointResponses')) {
        if (endpoint && resp) {
          const ep = endpointMap.get(endpoint.properties.nodeId);
          if (ep) ep.responses.push(resp.properties);
        }
      }

      // Process schemas
      const schemaMap = new Map<string, any>();
      for (const s of record.get('schemas')) {
        if (s) {
          schemaMap.set(s.properties.nodeId, {
            schema: s.properties,
            properties: [],
            references: [],
          });
        }
      }

      // Add properties
      for (const { schema, prop } of record.get('schemaProps')) {
        if (schema && prop) {
          const s = schemaMap.get(schema.properties.nodeId);
          if (s) s.properties.push(prop.properties);
        }
      }

      // Add references
      for (const { schema, ref } of record.get('schemaRefs')) {
        if (schema && ref) {
          const s = schemaMap.get(schema.properties.nodeId);
          if (s) s.references.push(ref.properties.name);
        }
      }

      return {
        specification: specNode.properties,
        endpoints: Array.from(endpointMap.values()),
        schemas: Array.from(schemaMap.values()),
        statistics: {
          totalEndpoints: endpointMap.size,
          totalSchemas: schemaMap.size,
          totalRelationships: 0, // Would need additional query
        },
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Search by pattern (property matching)
   */
  async searchByPattern(
    nodeType: string,
    pattern: Record<string, any>,
    limit: number = 50
  ): Promise<PatternSearchResult> {
    if (this.useInMemory) {
      const nodes = await this.inMemoryStore.findNodesByLabel(nodeType);
      const matches = nodes.filter(n => 
        Object.entries(pattern).every(([k, v]) => {
          const propValue = n.properties[k];
          if (typeof v === 'string' && v.includes('*')) {
            const regex = new RegExp(v.replace(/\*/g, '.*'), 'i');
            return regex.test(propValue);
          }
          return propValue === v;
        })
      ).slice(0, limit);

      return {
        pattern: JSON.stringify(pattern),
        matches: matches.map(n => ({
          nodes: [n],
          relationships: [],
          matchedProperties: n.properties,
        })),
        totalMatches: matches.length,
      };
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const whereConditions = Object.entries(pattern)
        .map(([k, v]) => {
          if (typeof v === 'string' && v.includes('*')) {
            return `n.${k} =~ $pattern.${k}`;
          }
          return `n.${k} = $pattern.${k}`;
        })
        .join(' AND ');

      // Convert wildcard patterns to regex
      const regexPattern: Record<string, any> = {};
      for (const [k, v] of Object.entries(pattern)) {
        if (typeof v === 'string' && v.includes('*')) {
          regexPattern[k] = `(?i)${v.replace(/\*/g, '.*')}`;
        } else {
          regexPattern[k] = v;
        }
      }

      const query = `
        MATCH (n:${nodeType})
        WHERE ${whereConditions}
        RETURN n
        LIMIT $limit
      `;

      const result = await session.executeRead(async (txc) => {
        return txc.run(query, { pattern: regexPattern, limit: neo4j.int(limit) });
      });

      return {
        pattern: JSON.stringify(pattern),
        matches: result.records.map(r => ({
          nodes: [this.neo4jNodeToGraphNode(r.get('n'))],
          relationships: [],
          matchedProperties: r.get('n').properties,
        })),
        totalMatches: result.records.length,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a custom Cypher query
   */
  async executeCypher(query: string, params?: Record<string, any>): Promise<QueryResult> {
    if (this.useInMemory) {
      throw new Error('Custom Cypher queries are not supported in in-memory mode');
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      return await session.run(query, params || {});
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // Statistics and Maintenance
  // ============================================================================

  /**
   * Get graph statistics
   */
  async getStatistics(): Promise<GraphStatistics> {
    if (this.useInMemory) {
      return this.inMemoryStore.getStatistics();
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      const query = `
        MATCH (n)
        WITH labels(n) as labels, count(*) as cnt
        UNWIND labels as label
        WITH label, sum(cnt) as nodeCount
        RETURN collect({label: label, count: nodeCount}) as nodesByLabel
        
        UNION ALL
        
        MATCH ()-[r]->()
        WITH type(r) as relType, count(*) as cnt
        RETURN collect({type: relType, count: cnt}) as relationshipsByType
      `;

      // Simpler approach
      const nodeCountResult = await session.run('MATCH (n) RETURN count(n) as total');
      const relCountResult = await session.run('MATCH ()-[r]->() RETURN count(r) as total');
      
      const nodesByLabelResult = await session.run(`
        MATCH (n)
        UNWIND labels(n) as label
        RETURN label, count(*) as count
      `);
      
      const relsByTypeResult = await session.run(`
        MATCH ()-[r]->()
        RETURN type(r) as type, count(*) as count
      `);

      const nodesByLabel: Record<string, number> = {};
      for (const record of nodesByLabelResult.records) {
        nodesByLabel[record.get('label')] = record.get('count').toNumber();
      }

      const relationshipsByType: Record<string, number> = {};
      for (const record of relsByTypeResult.records) {
        relationshipsByType[record.get('type')] = record.get('count').toNumber();
      }

      const endpointCount = nodesByLabel['Endpoint'] || 0;
      const schemaCount = nodesByLabel['Schema'] || 0;
      const propertyCount = nodesByLabel['Property'] || 0;

      return {
        nodeCount: nodeCountResult.records[0].get('total').toNumber(),
        relationshipCount: relCountResult.records[0].get('total').toNumber(),
        nodesByLabel,
        relationshipsByType,
        specificationCount: nodesByLabel['Specification'] || 0,
        endpointCount,
        schemaCount,
        avgRelationshipsPerEndpoint: endpointCount > 0
          ? (relationshipsByType[RelationshipType.HAS_PARAMETER] || 0) / endpointCount
          : 0,
        avgPropertiesPerSchema: schemaCount > 0 ? propertyCount / schemaCount : 0,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all data from the graph
   */
  async clearAll(): Promise<void> {
    if (this.useInMemory) {
      await this.inMemoryStore.clear();
      return;
    }

    const session = this.getSession();
    if (!session) throw new Error('No database session available');

    try {
      await session.executeWrite(async (txc) => {
        return txc.run('MATCH (n) DETACH DELETE n');
      });
    } finally {
      await session.close();
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Convert a Neo4j record field to a GraphNode
   */
  private recordToNode(record: Neo4jRecord, field: string): GraphNode {
    const node = record.get(field);
    return this.neo4jNodeToGraphNode(node);
  }

  /**
   * Convert a Neo4j node to GraphNode
   */
  private neo4jNodeToGraphNode(node: any): GraphNode {
    return {
      id: node.properties.nodeId || node.identity.toString(),
      labels: node.labels,
      properties: { ...node.properties },
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a GraphStore instance with optional configuration
 */
export function createGraphStore(config?: Partial<GraphStoreConfig>): GraphStore {
  return new GraphStore(config);
}
