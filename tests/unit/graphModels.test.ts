/**
 * Unit tests for graphModels.ts
 * Tests TypeScript interfaces, utility functions, and ID generation
 */

import {
  generateNodeId,
  validateNodeProperties,
  extractSchemaRef,
  createSpecificationId,
  createEndpointId,
  createSchemaId,
  createParameterId,
  createResponseId,
  createTagId,
  RelationshipType,
} from '../../src/graphModels.js';

describe('graphModels', () => {
  describe('generateNodeId', () => {
    it('should generate a valid node ID from label and parts', () => {
      const id = generateNodeId('Specification', 'test-file.yaml');
      expect(id).toBe('specification_test_file_yaml');
    });

    it('should handle multiple parts', () => {
      const id = generateNodeId('Endpoint', 'spec.yaml', '/v1/accounts', 'GET');
      expect(id).toBe('endpoint_spec_yaml_v1_accounts_get');
    });

    it('should sanitize special characters', () => {
      const id = generateNodeId('Schema', 'file.yaml', 'Account$Reference');
      expect(id).toBe('schema_file_yaml_account_reference');
    });

    it('should handle empty parts', () => {
      const id = generateNodeId('Tag', '');
      expect(id).toBe('tag_');
    });

    it('should convert to lowercase', () => {
      const id = generateNodeId('SCHEMA', 'FILE.YAML', 'AccountReference');
      expect(id).toBe('schema_file_yaml_accountreference');
    });

    it('should collapse multiple underscores', () => {
      const id = generateNodeId('Test', 'part---one', 'part___two');
      expect(id).toBe('test_part_one_part_two');
    });
  });

  describe('validateNodeProperties', () => {
    it('should validate required fields are present', () => {
      const props = { name: 'test', type: 'object' };
      const result = validateNodeProperties(props, ['name', 'type']);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return errors for missing fields', () => {
      const props: Record<string, any> = { name: 'test' };
      const result = validateNodeProperties(props, ['name', 'type', 'description']);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors).toContain('Missing required field: type');
      expect(result.errors).toContain('Missing required field: description');
    });

    it('should handle null values as missing', () => {
      const props = { name: 'test', type: null };
      const result = validateNodeProperties(props, ['name', 'type']);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required field: type');
    });

    it('should handle undefined values as missing', () => {
      const props = { name: 'test', type: undefined };
      const result = validateNodeProperties(props, ['name', 'type']);
      expect(result.valid).toBe(false);
    });

    it('should accept empty strings as valid', () => {
      const props = { name: '', type: 'string' };
      const result = validateNodeProperties(props, ['name', 'type']);
      expect(result.valid).toBe(true);
    });

    it('should accept zero as valid', () => {
      const props = { name: 'test', count: 0 };
      const result = validateNodeProperties(props, ['name', 'count']);
      expect(result.valid).toBe(true);
    });
  });

  describe('extractSchemaRef', () => {
    it('should extract schema name from standard $ref path', () => {
      const ref = '#/components/schemas/AccountReference';
      const result = extractSchemaRef(ref);
      expect(result).toBe('AccountReference');
    });

    it('should extract schema name with complex names', () => {
      const ref = '#/components/schemas/Account-Balance_Details';
      const result = extractSchemaRef(ref);
      expect(result).toBe('Account-Balance_Details');
    });

    it('should return null for non-schema refs', () => {
      const ref = '#/components/parameters/AccountId';
      const result = extractSchemaRef(ref);
      expect(result).toBeNull();
    });

    it('should return null for external refs', () => {
      const ref = 'https://example.com/schemas/Account.yaml';
      const result = extractSchemaRef(ref);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = extractSchemaRef('');
      expect(result).toBeNull();
    });

    it('should handle nested schema paths', () => {
      const ref = '#/components/schemas/Nested/Schema';
      const result = extractSchemaRef(ref);
      expect(result).toBe('Nested/Schema');
    });
  });

  describe('createSpecificationId', () => {
    it('should create ID from filename', () => {
      const id = createSpecificationId('BG_oFA_AIS_Version_2.3.yaml');
      expect(id).toContain('spec_');
      expect(id).toContain('bg_ofa_ais');
    });

    it('should handle various file extensions', () => {
      const yamlId = createSpecificationId('test.yaml');
      const ymlId = createSpecificationId('test.yml');
      expect(yamlId).toContain('yaml');
      expect(ymlId).toContain('yml');
    });
  });

  describe('createEndpointId', () => {
    it('should create unique ID from spec, path, and method', () => {
      const id = createEndpointId('spec.yaml', '/v1/accounts', 'GET');
      expect(id).toContain('endpoint_');
      expect(id).toContain('accounts');
      expect(id).toContain('get');
    });

    it('should handle paths with parameters', () => {
      const id = createEndpointId('spec.yaml', '/v1/accounts/{accountId}', 'GET');
      expect(id).toContain('accountid');
    });

    it('should differentiate between methods', () => {
      const getId = createEndpointId('spec.yaml', '/v1/accounts', 'GET');
      const postId = createEndpointId('spec.yaml', '/v1/accounts', 'POST');
      expect(getId).not.toBe(postId);
    });
  });

  describe('createSchemaId', () => {
    it('should create unique ID from spec and schema name', () => {
      const id = createSchemaId('spec.yaml', 'AccountReference');
      expect(id).toContain('schema_');
      expect(id).toContain('accountreference');
    });

    it('should differentiate schemas across specs', () => {
      const id1 = createSchemaId('ais.yaml', 'Account');
      const id2 = createSchemaId('pis.yaml', 'Account');
      expect(id1).not.toBe(id2);
    });
  });

  describe('createParameterId', () => {
    it('should create unique ID from endpoint, name, and location', () => {
      const id = createParameterId('endpoint_1', 'accountId', 'path');
      expect(id).toContain('param_');
      expect(id).toContain('accountid');
      expect(id).toContain('path');
    });

    it('should differentiate same param name in different locations', () => {
      const pathId = createParameterId('endpoint_1', 'filter', 'path');
      const queryId = createParameterId('endpoint_1', 'filter', 'query');
      expect(pathId).not.toBe(queryId);
    });
  });

  describe('createResponseId', () => {
    it('should create unique ID from endpoint and status code', () => {
      const id = createResponseId('endpoint_1', '200');
      expect(id).toContain('response_');
      expect(id).toContain('200');
    });

    it('should differentiate response codes', () => {
      const ok = createResponseId('endpoint_1', '200');
      const error = createResponseId('endpoint_1', '400');
      expect(ok).not.toBe(error);
    });
  });

  describe('createTagId', () => {
    it('should create unique ID from tag name', () => {
      const id = createTagId('accounts');
      expect(id).toContain('tag_');
      expect(id).toContain('accounts');
    });

    it('should handle multi-word tags', () => {
      const id = createTagId('Payment Initiation');
      expect(id).toContain('payment');
      expect(id).toContain('initiation');
    });
  });

  describe('RelationshipType enum', () => {
    it('should have all required relationship types', () => {
      expect(RelationshipType.DEFINES_ENDPOINT).toBe('DEFINES_ENDPOINT');
      expect(RelationshipType.DEFINES_SCHEMA).toBe('DEFINES_SCHEMA');
      expect(RelationshipType.HAS_PARAMETER).toBe('HAS_PARAMETER');
      expect(RelationshipType.HAS_RESPONSE).toBe('HAS_RESPONSE');
      expect(RelationshipType.HAS_PROPERTY).toBe('HAS_PROPERTY');
      expect(RelationshipType.USES_SCHEMA).toBe('USES_SCHEMA');
      expect(RelationshipType.REFERENCES).toBe('REFERENCES');
      expect(RelationshipType.TAGGED_WITH).toBe('TAGGED_WITH');
    });

    it('should be usable as string values', () => {
      const type: string = RelationshipType.DEFINES_ENDPOINT;
      expect(type).toBe('DEFINES_ENDPOINT');
    });
  });
});
