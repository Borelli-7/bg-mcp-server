/**
 * Unit tests for graphStore.ts
 * Tests Neo4j connection, node/relationship CRUD, and query operations
 */

import {
  GraphStore,
  createGraphStore,
  GraphStoreConfig,
} from '../../src/graphStore.js';
import {
  RelationshipType,
  GraphNode,
  createSpecificationId,
  createEndpointId,
  createSchemaId,
} from '../../src/graphModels.js';

describe('GraphStore', () => {
  let graphStore: GraphStore;

  beforeEach(async () => {
    // Create a new graph store instance with in-memory fallback
    // (Neo4j won't be available in unit tests)
    graphStore = createGraphStore({
      uri: 'bolt://localhost:7687',
      username: 'neo4j',
      password: 'invalid-password-for-test', // Force in-memory fallback
    });
    await graphStore.initialize();
  });

  afterEach(async () => {
    await graphStore.clearAll();
    await graphStore.close();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const store = createGraphStore();
      await store.initialize();
      // Should either connect to Neo4j or fall back to in-memory
      // Both scenarios are valid depending on the environment
      expect(store.isUsingInMemory() || store.isNeo4jConnected()).toBe(true);
      await store.close();
    });

    it('should use in-memory store when Neo4j is unavailable', () => {
      // Our test setup uses invalid password to force in-memory fallback
      expect(graphStore.isUsingInMemory()).toBe(true);
      expect(graphStore.isNeo4jConnected()).toBe(false);
    });
  });

  describe('createSpecification', () => {
    it('should create a specification node', async () => {
      const node = await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test Specification',
        version: '1.0.0',
        description: 'Test description',
        openApiVersion: '3.0.0',
      });

      expect(node).toBeDefined();
      expect(node.id).toContain('spec_');
      expect(node.labels).toContain('Specification');
      expect(node.properties.fileName).toBe('test.yaml');
      expect(node.properties.title).toBe('Test Specification');
    });

    it('should create specification without optional fields', async () => {
      const node = await graphStore.createSpecification({
        fileName: 'minimal.yaml',
        title: 'Minimal',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      expect(node.properties.fileName).toBe('minimal.yaml');
      // Description defaults to empty string when not provided
      expect(node.properties.description).toBe('');
    });

    it('should handle special characters in filename', async () => {
      const node = await graphStore.createSpecification({
        fileName: 'BG_oFA_AIS_Version_2.3_20250818.openapi.yaml',
        title: 'AIS Spec',
        version: '2.3',
        openApiVersion: '3.0.3',
      });

      expect(node.id).toBeDefined();
      expect(node.properties.fileName).toBe('BG_oFA_AIS_Version_2.3_20250818.openapi.yaml');
    });
  });

  describe('createEndpoint', () => {
    beforeEach(async () => {
      // Create a specification first
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });
    });

    it('should create an endpoint node linked to specification', async () => {
      const node = await graphStore.createEndpoint(
        {
          path: '/v1/accounts',
          method: 'GET',
          operationId: 'getAccounts',
          summary: 'Get all accounts',
          specFile: 'test.yaml',
        },
        'test.yaml'
      );

      expect(node).toBeDefined();
      expect(node.labels).toContain('Endpoint');
      expect(node.properties.path).toBe('/v1/accounts');
      expect(node.properties.method).toBe('GET');
    });

    it('should create endpoint with all optional fields', async () => {
      const node = await graphStore.createEndpoint(
        {
          path: '/v1/accounts/{accountId}',
          method: 'DELETE',
          operationId: 'deleteAccount',
          summary: 'Delete account',
          description: 'Deletes a specific account',
          deprecated: true,
          specFile: 'test.yaml',
        },
        'test.yaml'
      );

      expect(node.properties.deprecated).toBe(true);
      expect(node.properties.description).toBe('Deletes a specific account');
    });

    it('should handle path parameters in endpoint path', async () => {
      const node = await graphStore.createEndpoint(
        {
          path: '/v1/accounts/{accountId}/balances/{date}',
          method: 'GET',
          specFile: 'test.yaml',
        },
        'test.yaml'
      );

      expect(node.properties.path).toBe('/v1/accounts/{accountId}/balances/{date}');
    });
  });

  describe('createSchema', () => {
    beforeEach(async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });
    });

    it('should create a schema node linked to specification', async () => {
      const node = await graphStore.createSchema({
        name: 'AccountReference',
        type: 'object',
        description: 'Reference to an account',
        specFile: 'test.yaml',
      });

      expect(node).toBeDefined();
      expect(node.labels).toContain('Schema');
      expect(node.properties.name).toBe('AccountReference');
      expect(node.properties.type).toBe('object');
    });

    it('should handle schemas with required fields', async () => {
      const node = await graphStore.createSchema({
        name: 'Account',
        type: 'object',
        required: ['iban', 'currency'],
        specFile: 'test.yaml',
      });

      expect(node.properties.name).toBe('Account');
    });
  });

  describe('createParameter', () => {
    let endpointId: string;

    beforeEach(async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      const endpoint = await graphStore.createEndpoint(
        {
          path: '/v1/accounts',
          method: 'GET',
          specFile: 'test.yaml',
        },
        'test.yaml'
      );
      endpointId = endpoint.id;
    });

    it('should create a parameter node linked to endpoint', async () => {
      const node = await graphStore.createParameter(
        {
          name: 'accountId',
          in: 'path',
          required: true,
          description: 'Account identifier',
          type: 'string',
        },
        endpointId
      );

      expect(node).toBeDefined();
      expect(node.labels).toContain('Parameter');
      expect(node.properties.name).toBe('accountId');
      expect(node.properties.in).toBe('path');
      expect(node.properties.required).toBe(true);
    });

    it('should handle query parameters', async () => {
      const node = await graphStore.createParameter(
        {
          name: 'page',
          in: 'query',
          required: false,
          type: 'integer',
          format: 'int32',
        },
        endpointId
      );

      expect(node.properties.in).toBe('query');
      expect(node.properties.format).toBe('int32');
    });

    it('should handle header parameters', async () => {
      const node = await graphStore.createParameter(
        {
          name: 'X-Request-ID',
          in: 'header',
          required: true,
          type: 'string',
        },
        endpointId
      );

      expect(node.properties.in).toBe('header');
    });
  });

  describe('createResponse', () => {
    let endpointId: string;

    beforeEach(async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      const endpoint = await graphStore.createEndpoint(
        {
          path: '/v1/accounts',
          method: 'GET',
          specFile: 'test.yaml',
        },
        'test.yaml'
      );
      endpointId = endpoint.id;
    });

    it('should create a response node linked to endpoint', async () => {
      const node = await graphStore.createResponse(
        {
          statusCode: '200',
          description: 'OK',
          mediaType: 'application/json',
        },
        endpointId
      );

      expect(node).toBeDefined();
      expect(node.labels).toContain('Response');
      expect(node.properties.statusCode).toBe('200');
    });

    it('should handle error responses', async () => {
      const node = await graphStore.createResponse(
        {
          statusCode: '400',
          description: 'Bad Request',
        },
        endpointId
      );

      expect(node.properties.statusCode).toBe('400');
    });
  });

  describe('createTag', () => {
    it('should create a tag node', async () => {
      const node = await graphStore.createTag('accounts', 'Account operations');

      expect(node).toBeDefined();
      expect(node.labels).toContain('Tag');
      expect(node.properties.name).toBe('accounts');
      expect(node.properties.description).toBe('Account operations');
    });

    it('should create tag without description', async () => {
      const node = await graphStore.createTag('payments');

      expect(node.properties.name).toBe('payments');
    });
  });

  describe('createRelationship', () => {
    it('should create a relationship between nodes', async () => {
      const spec = await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      const schema = await graphStore.createSchema({
        name: 'Account',
        type: 'object',
        specFile: 'test.yaml',
      });

      const rel = await graphStore.createRelationship(
        schema.id,
        spec.id,
        RelationshipType.REFERENCES
      );

      expect(rel).toBeDefined();
      expect(rel.type).toBe(RelationshipType.REFERENCES);
      expect(rel.startNodeId).toBe(schema.id);
      expect(rel.endNodeId).toBe(spec.id);
    });

    it('should create relationship with properties', async () => {
      const spec = await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      const endpoint = await graphStore.createEndpoint(
        {
          path: '/v1/accounts',
          method: 'GET',
          specFile: 'test.yaml',
        },
        'test.yaml'
      );

      const schema = await graphStore.createSchema({
        name: 'Account',
        type: 'object',
        specFile: 'test.yaml',
      });

      const rel = await graphStore.createRelationship(
        endpoint.id,
        schema.id,
        RelationshipType.USES_SCHEMA,
        { context: 'response', mediaType: 'application/json' }
      );

      expect(rel.properties?.context).toBe('response');
      expect(rel.properties?.mediaType).toBe('application/json');
    });
  });

  describe('findRelatedSchemas', () => {
    beforeEach(async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      const accountSchema = await graphStore.createSchema({
        name: 'Account',
        type: 'object',
        specFile: 'test.yaml',
      });

      const balanceSchema = await graphStore.createSchema({
        name: 'Balance',
        type: 'object',
        specFile: 'test.yaml',
      });

      await graphStore.linkSchemaReference(accountSchema.id, balanceSchema.id);
    });

    it('should find related schemas', async () => {
      const results = await graphStore.findRelatedSchemas('Account', 'test.yaml');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('getEndpointDependencies', () => {
    beforeEach(async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      const endpoint = await graphStore.createEndpoint(
        {
          path: '/v1/accounts',
          method: 'GET',
          specFile: 'test.yaml',
        },
        'test.yaml'
      );

      await graphStore.createParameter(
        {
          name: 'page',
          in: 'query',
          type: 'integer',
        },
        endpoint.id
      );

      await graphStore.createResponse(
        {
          statusCode: '200',
          description: 'OK',
        },
        endpoint.id
      );
    });

    it('should get endpoint dependencies', async () => {
      const result = await graphStore.getEndpointDependencies('/v1/accounts', 'GET');

      expect(result).toBeDefined();
      expect(result?.endpointPath).toBe('/v1/accounts');
      expect(result?.method).toBe('GET');
      expect(result?.parameters).toBeDefined();
    });

    it('should return null for non-existent endpoint', async () => {
      const result = await graphStore.getEndpointDependencies('/v1/nonexistent', 'GET');
      expect(result).toBeNull();
    });
  });

  describe('searchByPattern', () => {
    beforeEach(async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      await graphStore.createSchema({
        name: 'AccountReference',
        type: 'object',
        specFile: 'test.yaml',
      });

      await graphStore.createSchema({
        name: 'AccountBalance',
        type: 'object',
        specFile: 'test.yaml',
      });

      await graphStore.createSchema({
        name: 'PaymentInitiation',
        type: 'object',
        specFile: 'test.yaml',
      });
    });

    it('should search by exact match', async () => {
      const results = await graphStore.searchByPattern('Schema', { name: 'AccountReference' });

      expect(results.totalMatches).toBe(1);
      expect(results.matches[0].nodes[0].properties.name).toBe('AccountReference');
    });

    it('should search with wildcard pattern', async () => {
      const results = await graphStore.searchByPattern('Schema', { name: '*Account*' });

      expect(results.totalMatches).toBe(2);
    });

    it('should return empty for no matches', async () => {
      const results = await graphStore.searchByPattern('Schema', { name: 'NonExistent' });

      expect(results.totalMatches).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const results = await graphStore.searchByPattern('Schema', { type: 'object' }, 1);

      expect(results.totalMatches).toBe(1);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics about the graph', async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      await graphStore.createSchema({
        name: 'Account',
        type: 'object',
        specFile: 'test.yaml',
      });

      const stats = await graphStore.getStatistics();

      expect(stats.nodeCount).toBeGreaterThanOrEqual(2);
      expect(stats.specificationCount).toBe(1);
      expect(stats.schemaCount).toBe(1);
      expect(stats.nodesByLabel).toBeDefined();
      expect(stats.relationshipsByType).toBeDefined();
    });
  });

  describe('clearAll', () => {
    it('should clear all data from the graph', async () => {
      await graphStore.createSpecification({
        fileName: 'test.yaml',
        title: 'Test',
        version: '1.0.0',
        openApiVersion: '3.0.0',
      });

      await graphStore.clearAll();

      const stats = await graphStore.getStatistics();
      expect(stats.nodeCount).toBe(0);
      expect(stats.relationshipCount).toBe(0);
    });
  });
});

describe('createGraphStore factory', () => {
  it('should create a GraphStore instance', () => {
    const store = createGraphStore();
    expect(store).toBeInstanceOf(GraphStore);
  });

  it('should accept configuration options', () => {
    const store = createGraphStore({
      uri: 'bolt://custom:7687',
      username: 'custom',
      password: 'custom',
    });
    expect(store).toBeInstanceOf(GraphStore);
  });
});
