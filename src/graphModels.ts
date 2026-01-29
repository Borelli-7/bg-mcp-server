/**
 * Graph Models for Neo4j integration
 * Defines TypeScript interfaces for graph nodes, relationships, and query results
 * representing Berlin Group OpenAPI specifications structure
 */

// ============================================================================
// Node Types
// ============================================================================

/**
 * Base interface for all graph nodes
 */
export interface GraphNode {
  id: string;
  labels: string[];
  properties: Record<string, any>;
}

/**
 * OpenAPI Specification node
 */
export interface SpecificationNode extends GraphNode {
  labels: ['Specification'];
  properties: {
    fileName: string;
    title: string;
    version: string;
    description?: string;
    openApiVersion: string;
  };
}

/**
 * API Endpoint node
 */
export interface EndpointNode extends GraphNode {
  labels: ['Endpoint'];
  properties: {
    path: string;
    method: string;
    operationId?: string;
    summary?: string;
    description?: string;
    deprecated?: boolean;
  };
}

/**
 * Schema/Model node
 */
export interface SchemaNode extends GraphNode {
  labels: ['Schema'];
  properties: {
    name: string;
    type?: string;
    description?: string;
    required?: string[];
    specFile: string;
  };
}

/**
 * Schema Property node
 */
export interface PropertyNode extends GraphNode {
  labels: ['Property'];
  properties: {
    name: string;
    type: string;
    format?: string;
    description?: string;
    required?: boolean;
    nullable?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    enum?: string[];
  };
}

/**
 * Parameter node
 */
export interface ParameterNode extends GraphNode {
  labels: ['Parameter'];
  properties: {
    name: string;
    in: 'query' | 'header' | 'path' | 'cookie';
    required?: boolean;
    description?: string;
    type?: string;
    format?: string;
  };
}

/**
 * Response node
 */
export interface ResponseNode extends GraphNode {
  labels: ['Response'];
  properties: {
    statusCode: string;
    description?: string;
    mediaType?: string;
  };
}

/**
 * Tag node for endpoint categorization
 */
export interface TagNode extends GraphNode {
  labels: ['Tag'];
  properties: {
    name: string;
    description?: string;
  };
}

/**
 * Security Scheme node
 */
export interface SecuritySchemeNode extends GraphNode {
  labels: ['SecurityScheme'];
  properties: {
    name: string;
    type: string;
    description?: string;
    scheme?: string;
    bearerFormat?: string;
    in?: string;
  };
}

// ============================================================================
// Relationship Types
// ============================================================================

/**
 * Base interface for all relationships
 */
export interface GraphRelationship {
  id: string;
  type: string;
  startNodeId: string;
  endNodeId: string;
  properties?: Record<string, any>;
}

/**
 * Relationship types enum for type safety
 */
export enum RelationshipType {
  DEFINES_ENDPOINT = 'DEFINES_ENDPOINT',
  DEFINES_SCHEMA = 'DEFINES_SCHEMA',
  DEFINES_SECURITY = 'DEFINES_SECURITY',
  HAS_PARAMETER = 'HAS_PARAMETER',
  HAS_RESPONSE = 'HAS_RESPONSE',
  HAS_PROPERTY = 'HAS_PROPERTY',
  USES_SCHEMA = 'USES_SCHEMA',
  REFERENCES = 'REFERENCES',
  TAGGED_WITH = 'TAGGED_WITH',
  RETURNS = 'RETURNS',
  REQUIRES_SECURITY = 'REQUIRES_SECURITY',
  EXTENDS = 'EXTENDS',
  COMPOSED_OF = 'COMPOSED_OF',
}

/**
 * Specification DEFINES_ENDPOINT Endpoint
 */
export interface DefinesEndpointRelationship extends GraphRelationship {
  type: RelationshipType.DEFINES_ENDPOINT;
}

/**
 * Specification DEFINES_SCHEMA Schema
 */
export interface DefinesSchemaRelationship extends GraphRelationship {
  type: RelationshipType.DEFINES_SCHEMA;
}

/**
 * Endpoint HAS_PARAMETER Parameter
 */
export interface HasParameterRelationship extends GraphRelationship {
  type: RelationshipType.HAS_PARAMETER;
}

/**
 * Endpoint HAS_RESPONSE Response
 */
export interface HasResponseRelationship extends GraphRelationship {
  type: RelationshipType.HAS_RESPONSE;
}

/**
 * Schema HAS_PROPERTY Property
 */
export interface HasPropertyRelationship extends GraphRelationship {
  type: RelationshipType.HAS_PROPERTY;
}

/**
 * Endpoint/Response USES_SCHEMA Schema
 */
export interface UsesSchemaRelationship extends GraphRelationship {
  type: RelationshipType.USES_SCHEMA;
  properties?: {
    context?: 'request' | 'response';
    mediaType?: string;
  };
}

/**
 * Schema REFERENCES Schema (for $ref relationships)
 */
export interface ReferencesRelationship extends GraphRelationship {
  type: RelationshipType.REFERENCES;
  properties?: {
    refPath?: string;
  };
}

/**
 * Endpoint TAGGED_WITH Tag
 */
export interface TaggedWithRelationship extends GraphRelationship {
  type: RelationshipType.TAGGED_WITH;
}

// ============================================================================
// Query Result Types
// ============================================================================

/**
 * Result from finding related schemas
 */
export interface RelatedSchemaResult {
  schemaName: string;
  specFile: string;
  relationshipType: string;
  depth: number;
  path: string[];
}

/**
 * Result from endpoint dependency analysis
 */
export interface EndpointDependency {
  endpointPath: string;
  method: string;
  specFile: string;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    schemaRef?: string;
  }>;
  requestBodySchema?: string;
  responseSchemas: Array<{
    statusCode: string;
    schemaRef?: string;
  }>;
  relatedSchemas: string[];
}

/**
 * Result from specification graph export
 */
export interface SpecificationGraph {
  specification: SpecificationNode['properties'];
  endpoints: Array<{
    endpoint: EndpointNode['properties'];
    tags: string[];
    parameters: ParameterNode['properties'][];
    responses: ResponseNode['properties'][];
  }>;
  schemas: Array<{
    schema: SchemaNode['properties'];
    properties: PropertyNode['properties'][];
    references: string[];
  }>;
  statistics: {
    totalEndpoints: number;
    totalSchemas: number;
    totalRelationships: number;
  };
}

/**
 * Result from graph traversal
 */
export interface GraphTraversalResult {
  nodes: GraphNode[];
  relationships: GraphRelationship[];
  paths: Array<{
    start: string;
    end: string;
    length: number;
    nodeIds: string[];
    relationshipTypes: string[];
  }>;
}

/**
 * Pattern search result
 */
export interface PatternSearchResult {
  pattern: string;
  matches: Array<{
    nodes: GraphNode[];
    relationships: GraphRelationship[];
    matchedProperties: Record<string, any>;
  }>;
  totalMatches: number;
}

// ============================================================================
// Graph Statistics Types
// ============================================================================

/**
 * Statistics about the graph database
 */
export interface GraphStatistics {
  nodeCount: number;
  relationshipCount: number;
  nodesByLabel: Record<string, number>;
  relationshipsByType: Record<string, number>;
  specificationCount: number;
  endpointCount: number;
  schemaCount: number;
  avgRelationshipsPerEndpoint: number;
  avgPropertiesPerSchema: number;
}

// ============================================================================
// Node Creation DTOs
// ============================================================================

/**
 * DTO for creating a Specification node
 */
export interface CreateSpecificationDTO {
  fileName: string;
  title: string;
  version: string;
  description?: string;
  openApiVersion: string;
}

/**
 * DTO for creating an Endpoint node
 */
export interface CreateEndpointDTO {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  deprecated?: boolean;
  specFile: string;
}

/**
 * DTO for creating a Schema node
 */
export interface CreateSchemaDTO {
  name: string;
  type?: string;
  description?: string;
  required?: string[];
  specFile: string;
  properties?: Record<string, any>;
}

/**
 * DTO for creating a Parameter node
 */
export interface CreateParameterDTO {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  description?: string;
  type?: string;
  format?: string;
}

/**
 * DTO for creating a Response node
 */
export interface CreateResponseDTO {
  statusCode: string;
  description?: string;
  mediaType?: string;
  schemaRef?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique node ID
 */
export function generateNodeId(label: string, ...parts: string[]): string {
  const sanitizedParts = parts.map(p => 
    (p || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
  );
  return `${label.toLowerCase()}_${sanitizedParts.join('_')}`;
}

/**
 * Validate node properties
 */
export function validateNodeProperties<T extends Record<string, any>>(
  properties: T,
  requiredFields: (keyof T)[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  for (const field of requiredFields) {
    if (properties[field] === undefined || properties[field] === null) {
      errors.push(`Missing required field: ${String(field)}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Extract schema reference name from $ref path
 */
export function extractSchemaRef(refPath: string): string | null {
  const match = refPath.match(/#\/components\/schemas\/(.+)/);
  return match ? match[1] : null;
}

/**
 * Create a standard node ID for specifications
 */
export function createSpecificationId(fileName: string): string {
  return generateNodeId('spec', fileName);
}

/**
 * Create a standard node ID for endpoints
 */
export function createEndpointId(specFile: string, path: string, method: string): string {
  return generateNodeId('endpoint', specFile, path, method);
}

/**
 * Create a standard node ID for schemas
 */
export function createSchemaId(specFile: string, schemaName: string): string {
  return generateNodeId('schema', specFile, schemaName);
}

/**
 * Create a standard node ID for parameters
 */
export function createParameterId(endpointId: string, paramName: string, paramIn: string): string {
  return generateNodeId('param', endpointId, paramName, paramIn);
}

/**
 * Create a standard node ID for responses
 */
export function createResponseId(endpointId: string, statusCode: string): string {
  return generateNodeId('response', endpointId, statusCode);
}

/**
 * Create a standard node ID for tags
 */
export function createTagId(tagName: string): string {
  return generateNodeId('tag', tagName);
}
