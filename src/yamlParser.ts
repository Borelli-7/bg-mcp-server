import yaml from 'js-yaml';
import fs from 'fs/promises';
import path from 'path';

export interface OpenAPISpec {
  fileName: string;
  version: string;
  title: string;
  description?: string;
  paths: Record<string, any>;
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
    parameters?: Record<string, any>;
    responses?: Record<string, any>;
  };
}

export interface EndpointInfo {
  path: string;
  method: string;
  operationId?: string;
  summary?: string;
  description?: string;
  parameters?: any[];
  requestBody?: any;
  responses?: Record<string, any>;
  tags?: string[];
  security?: any[];
  specFile: string;
}

export class YamlParser {
  private specs: Map<string, OpenAPISpec> = new Map();
  private endpoints: EndpointInfo[] = [];

  async loadYamlFiles(yamlDir: string): Promise<void> {
    const files = await fs.readdir(yamlDir);
    const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));

    for (const file of yamlFiles) {
      const filePath = path.join(yamlDir, file);
      await this.parseYamlFile(filePath, file);
    }
  }

  private async parseYamlFile(filePath: string, fileName: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const doc = yaml.load(content) as any;

      const spec: OpenAPISpec = {
        fileName,
        version: doc.openapi || doc.swagger || 'unknown',
        title: doc.info?.title || fileName,
        description: doc.info?.description,
        paths: doc.paths || {},
        components: doc.components,
      };

      this.specs.set(fileName, spec);
      this.extractEndpoints(spec);
    } catch (error) {
      console.error(`Error parsing ${fileName}:`, error);
    }
  }

  private extractEndpoints(spec: OpenAPISpec): void {
    for (const [path, pathItem] of Object.entries(spec.paths)) {
      const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'];

      for (const method of methods) {
        if (pathItem[method]) {
          const operation = pathItem[method];
          this.endpoints.push({
            path,
            method: method.toUpperCase(),
            operationId: operation.operationId,
            summary: operation.summary,
            description: operation.description,
            parameters: operation.parameters,
            requestBody: operation.requestBody,
            responses: operation.responses,
            tags: operation.tags,
            security: operation.security,
            specFile: spec.fileName,
          });
        }
      }
    }
  }

  getSpecs(): Map<string, OpenAPISpec> {
    return this.specs;
  }

  getEndpoints(): EndpointInfo[] {
    return this.endpoints;
  }

  searchEndpoints(query: string): EndpointInfo[] {
    const lowerQuery = query.toLowerCase();
    return this.endpoints.filter(
      ep =>
        ep.path.toLowerCase().includes(lowerQuery) ||
        ep.operationId?.toLowerCase().includes(lowerQuery) ||
        ep.summary?.toLowerCase().includes(lowerQuery) ||
        ep.description?.toLowerCase().includes(lowerQuery) ||
        ep.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  getSchema(specFile: string, schemaName: string): any {
    const spec = this.specs.get(specFile);
    return spec?.components?.schemas?.[schemaName];
  }

  getAllSchemas(): Array<{ specFile: string; name: string; schema: any }> {
    const schemas: Array<{ specFile: string; name: string; schema: any }> = [];
    
    for (const [fileName, spec] of this.specs) {
      if (spec.components?.schemas) {
        for (const [name, schema] of Object.entries(spec.components.schemas)) {
          schemas.push({ specFile: fileName, name, schema });
        }
      }
    }
    
    return schemas;
  }

  searchSchemas(query: string): Array<{ specFile: string; name: string; schema: any }> {
    const lowerQuery = query.toLowerCase();
    return this.getAllSchemas().filter(
      s => s.name.toLowerCase().includes(lowerQuery) ||
           JSON.stringify(s.schema).toLowerCase().includes(lowerQuery)
    );
  }
}
