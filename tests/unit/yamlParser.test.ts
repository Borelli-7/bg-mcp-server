/**
 * Unit tests for YamlParser
 */

import { YamlParser, OpenAPISpec, EndpointInfo } from '../../src/yamlParser.js';
import fs from 'fs/promises';
import path from 'path';

// Mock fs module
jest.mock('fs/promises');

const mockOpenAPISpec = `
openapi: 3.0.0
info:
  title: Payment Services API
  description: API for payment initiation services
  version: 2.3.0
paths:
  /v1/payments:
    post:
      operationId: initiatePayment
      summary: Initiate a payment
      description: Creates a new payment initiation
      tags:
        - payments
      parameters:
        - name: X-Request-ID
          in: header
          required: true
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              type: object
      responses:
        '201':
          description: Payment created
        '400':
          description: Bad request
  /v1/accounts:
    get:
      operationId: listAccounts
      summary: List accounts
      tags:
        - accounts
      responses:
        '200':
          description: Success
components:
  schemas:
    Payment:
      type: object
      properties:
        amount:
          type: number
  securitySchemes:
    OAuth2:
      type: oauth2
`;

const mockSwaggerSpec = `
swagger: "2.0"
info:
  title: Legacy API
  version: "1.0"
paths:
  /users:
    get:
      summary: Get users
      responses:
        200:
          description: Success
`;

describe('YamlParser', () => {
  let parser: YamlParser;

  beforeEach(() => {
    parser = new YamlParser();
    jest.clearAllMocks();
  });

  describe('loadYamlFiles', () => {
    it('should load and parse YAML files from directory', async () => {
      const mockFiles = ['api1.yaml', 'api2.yml', 'readme.txt', 'api3.yaml'];

      (fs.readdir as jest.Mock).mockResolvedValue(mockFiles);
      (fs.readFile as jest.Mock).mockResolvedValue(mockOpenAPISpec);

      await parser.loadYamlFiles('/test/yaml/dir');

      const specs = parser.getSpecs();
      expect(specs.size).toBe(3); // Only YAML files
      expect(specs.has('api1.yaml')).toBe(true);
      expect(specs.has('api2.yml')).toBe(true);
      expect(specs.has('api3.yaml')).toBe(true);
    });

    it('should parse OpenAPI 3.0 specifications', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['openapi.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(mockOpenAPISpec);

      await parser.loadYamlFiles('/test/dir');

      const specs = parser.getSpecs();
      const spec = specs.get('openapi.yaml');

      expect(spec).toBeDefined();
      expect(spec?.version).toBe('3.0.0');
      expect(spec?.title).toBe('Payment Services API');
      expect(spec?.description).toBe('API for payment initiation services');
    });

    it('should parse Swagger 2.0 specifications', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['swagger.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(mockSwaggerSpec);

      await parser.loadYamlFiles('/test/dir');

      const specs = parser.getSpecs();
      const spec = specs.get('swagger.yaml');

      expect(spec).toBeDefined();
      expect(spec?.version).toBe('2.0');
      expect(spec?.title).toBe('Legacy API');
    });

    it('should handle missing version field', async () => {
      const specWithoutVersion = `
info:
  title: Simple API
paths:
  /test:
    get:
      responses:
        200:
          description: OK
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['noversion.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(specWithoutVersion);

      await parser.loadYamlFiles('/test/dir');

      const spec = parser.getSpecs().get('noversion.yaml');
      expect(spec?.version).toBe('unknown');
    });

    it('should use filename as title when info.title is missing', async () => {
      const specWithoutTitle = `
openapi: 3.0.0
info:
  version: 1.0.0
paths: {}
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['notitle.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(specWithoutTitle);

      await parser.loadYamlFiles('/test/dir');

      const spec = parser.getSpecs().get('notitle.yaml');
      expect(spec?.title).toBe('notitle.yaml');
    });

    it('should handle parsing errors gracefully', async () => {
      const invalidYaml = `invalid: yaml: content: [unclosed`;

      (fs.readdir as jest.Mock).mockResolvedValue(['invalid.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(invalidYaml);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await parser.loadYamlFiles('/test/dir');

      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(parser.getSpecs().size).toBe(0);

      consoleErrorSpy.mockRestore();
    });

    it('should handle file read errors gracefully', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['error.yaml']);
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('File read error'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await parser.loadYamlFiles('/test/dir');

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('getSpecs', () => {
    it('should return empty map when no specs loaded', () => {
      const specs = parser.getSpecs();
      expect(specs).toBeInstanceOf(Map);
      expect(specs.size).toBe(0);
    });

    it('should return all loaded specifications', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['spec1.yaml', 'spec2.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(mockOpenAPISpec);

      await parser.loadYamlFiles('/test/dir');

      const specs = parser.getSpecs();
      expect(specs.size).toBe(2);
    });

    it('should include components in specification', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['withcomponents.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(mockOpenAPISpec);

      await parser.loadYamlFiles('/test/dir');

      const spec = parser.getSpecs().get('withcomponents.yaml');
      expect(spec?.components).toBeDefined();
      expect(spec?.components?.schemas).toBeDefined();
      expect(spec?.components?.schemas?.Payment).toBeDefined();
      expect(spec?.components?.securitySchemes).toBeDefined();
    });
  });

  describe('getEndpoints', () => {
    beforeEach(async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['api.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(mockOpenAPISpec);
      await parser.loadYamlFiles('/test/dir');
    });

    it('should extract all endpoints from specifications', () => {
      const endpoints = parser.getEndpoints();
      
      expect(endpoints.length).toBe(2);
      expect(endpoints.some(e => e.path === '/v1/payments' && e.method === 'POST')).toBe(true);
      expect(endpoints.some(e => e.path === '/v1/accounts' && e.method === 'GET')).toBe(true);
    });

    it('should include endpoint metadata', () => {
      const endpoints = parser.getEndpoints();
      const paymentEndpoint = endpoints.find(e => e.path === '/v1/payments');

      expect(paymentEndpoint).toBeDefined();
      expect(paymentEndpoint?.operationId).toBe('initiatePayment');
      expect(paymentEndpoint?.summary).toBe('Initiate a payment');
      expect(paymentEndpoint?.description).toBe('Creates a new payment initiation');
      expect(paymentEndpoint?.tags).toEqual(['payments']);
      expect(paymentEndpoint?.specFile).toBe('api.yaml');
    });

    it('should include parameters', () => {
      const endpoints = parser.getEndpoints();
      const paymentEndpoint = endpoints.find(e => e.path === '/v1/payments');

      expect(paymentEndpoint?.parameters).toBeDefined();
      expect(paymentEndpoint?.parameters?.length).toBe(1);
      expect(paymentEndpoint?.parameters?.[0].name).toBe('X-Request-ID');
      expect(paymentEndpoint?.parameters?.[0].in).toBe('header');
    });

    it('should include request body', () => {
      const endpoints = parser.getEndpoints();
      const paymentEndpoint = endpoints.find(e => e.path === '/v1/payments');

      expect(paymentEndpoint?.requestBody).toBeDefined();
    });

    it('should include responses', () => {
      const endpoints = parser.getEndpoints();
      const paymentEndpoint = endpoints.find(e => e.path === '/v1/payments');

      expect(paymentEndpoint?.responses).toBeDefined();
      expect(paymentEndpoint?.responses?.['201']).toBeDefined();
      expect(paymentEndpoint?.responses?.['400']).toBeDefined();
    });
  });

  describe('HTTP method extraction', () => {
    it('should extract all HTTP methods', async () => {
      const specWithAllMethods = `
openapi: 3.0.0
info:
  title: Full Methods API
paths:
  /resource:
    get:
      summary: Get resource
      responses:
        200:
          description: OK
    post:
      summary: Create resource
      responses:
        201:
          description: Created
    put:
      summary: Update resource
      responses:
        200:
          description: OK
    patch:
      summary: Partial update
      responses:
        200:
          description: OK
    delete:
      summary: Delete resource
      responses:
        204:
          description: No content
    options:
      summary: Get options
      responses:
        200:
          description: OK
    head:
      summary: Get headers
      responses:
        200:
          description: OK
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['methods.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(specWithAllMethods);

      await parser.loadYamlFiles('/test/dir');

      const endpoints = parser.getEndpoints();
      const methods = endpoints.map(e => e.method);

      expect(methods).toContain('GET');
      expect(methods).toContain('POST');
      expect(methods).toContain('PUT');
      expect(methods).toContain('PATCH');
      expect(methods).toContain('DELETE');
      expect(methods).toContain('OPTIONS');
      expect(methods).toContain('HEAD');
    });

    it('should convert methods to uppercase', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['case.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(mockOpenAPISpec);

      await parser.loadYamlFiles('/test/dir');

      const endpoints = parser.getEndpoints();
      endpoints.forEach(endpoint => {
        expect(endpoint.method).toBe(endpoint.method.toUpperCase());
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty paths object', async () => {
      const emptyPathsSpec = `
openapi: 3.0.0
info:
  title: Empty API
paths: {}
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['empty.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(emptyPathsSpec);

      await parser.loadYamlFiles('/test/dir');

      const endpoints = parser.getEndpoints();
      expect(endpoints.length).toBe(0);
    });

    it('should handle missing paths object', async () => {
      const noPathsSpec = `
openapi: 3.0.0
info:
  title: No Paths API
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['nopaths.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(noPathsSpec);

      await parser.loadYamlFiles('/test/dir');

      const spec = parser.getSpecs().get('nopaths.yaml');
      expect(spec?.paths).toEqual({});
    });

    it('should handle paths with no operations', async () => {
      const pathsNoOpsSpec = `
openapi: 3.0.0
info:
  title: API
paths:
  /resource:
    summary: Resource endpoint
    description: No operations defined
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['noops.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(pathsNoOpsSpec);

      await parser.loadYamlFiles('/test/dir');

      const endpoints = parser.getEndpoints();
      expect(endpoints.length).toBe(0);
    });

    it('should handle operations without optional fields', async () => {
      const minimalSpec = `
openapi: 3.0.0
info:
  title: Minimal API
paths:
  /minimal:
    get:
      responses:
        200:
          description: OK
`;

      (fs.readdir as jest.Mock).mockResolvedValue(['minimal.yaml']);
      (fs.readFile as jest.Mock).mockResolvedValue(minimalSpec);

      await parser.loadYamlFiles('/test/dir');

      const endpoints = parser.getEndpoints();
      expect(endpoints.length).toBe(1);
      
      const endpoint = endpoints[0];
      expect(endpoint.operationId).toBeUndefined();
      expect(endpoint.summary).toBeUndefined();
      expect(endpoint.description).toBeUndefined();
      expect(endpoint.tags).toBeUndefined();
      expect(endpoint.parameters).toBeUndefined();
    });
  });
});
