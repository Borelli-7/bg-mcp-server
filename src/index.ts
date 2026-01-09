#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { SpecificationIndexer } from './indexer.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize the indexer
const indexer = new SpecificationIndexer();

// Define MCP tools
const TOOLS: Tool[] = [
  {
    name: 'search_endpoints',
    description: 'Search for API endpoints in Berlin Group specifications. Returns endpoints matching the query with full details including path, method, parameters, and responses.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for endpoints (searches in path, operation ID, summary, description, and tags)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_endpoint_details',
    description: 'Get detailed information about a specific API endpoint including request/response schemas, parameters, and authentication requirements.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The API endpoint path (e.g., /v1/accounts)',
        },
        method: {
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
        },
      },
      required: ['path', 'method'],
    },
  },
  {
    name: 'search_schemas',
    description: 'Search for data schemas/models in Berlin Group specifications. Returns schema definitions including properties, types, and validation rules.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for schemas (searches in schema name and content)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_schema',
    description: 'Get a specific schema definition by name from a specification file.',
    inputSchema: {
      type: 'object',
      properties: {
        schemaName: {
          type: 'string',
          description: 'Name of the schema to retrieve',
        },
        specFile: {
          type: 'string',
          description: 'Optional: specific specification file name (e.g., BG_oFA_AIS_Version_2.3_20250818.openapi.yaml)',
        },
      },
      required: ['schemaName'],
    },
  },
  {
    name: 'list_specifications',
    description: 'List all available Berlin Group OpenAPI specifications with their details (AIS, PIS, PIIS, etc.).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_specification_details',
    description: 'Get comprehensive details about a specific Berlin Group specification file.',
    inputSchema: {
      type: 'object',
      properties: {
        fileName: {
          type: 'string',
          description: 'Name of the specification file',
        },
      },
      required: ['fileName'],
    },
  },
  {
    name: 'search_pdf_documentation',
    description: 'Search through Berlin Group PDF documentation for implementation guides, frameworks, and technical specifications.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query for PDF content',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_pdf_documents',
    description: 'List all available PDF documentation files.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'search_all',
    description: 'Comprehensive search across all Berlin Group specifications (endpoints, schemas, and PDF documentation).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find across all sources',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_statistics',
    description: 'Get statistics about the loaded Berlin Group specifications (counts of endpoints, schemas, documents, etc.).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'filter_endpoints_by_tag',
    description: 'Filter API endpoints by their tag (e.g., accounts, payments, consents).',
    inputSchema: {
      type: 'object',
      properties: {
        tag: {
          type: 'string',
          description: 'Tag name to filter by',
        },
      },
      required: ['tag'],
    },
  },
  {
    name: 'filter_endpoints_by_method',
    description: 'Filter API endpoints by HTTP method.',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          description: 'HTTP method (GET, POST, PUT, DELETE, etc.)',
        },
      },
      required: ['method'],
    },
  },
];

// Create MCP server
const server = new Server(
  {
    name: 'berlin-group-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Tool handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!indexer.isInitialized()) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Specifications not yet loaded. Please wait for initialization to complete.',
        },
      ],
    };
  }

  if (!args) {
    return {
      content: [
        {
          type: 'text',
          text: 'Error: Missing arguments for tool call.',
        },
      ],
      isError: true,
    };
  }

  try {
    switch (name) {
      case 'search_endpoints': {
        const results = indexer.searchEndpoints(args.query as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_endpoint_details': {
        const endpoints = indexer.getAllEndpoints();
        const endpoint = endpoints.find(
          ep => ep.path === args.path && ep.method.toUpperCase() === (args.method as string).toUpperCase()
        );
        return {
          content: [
            {
              type: 'text',
              text: endpoint ? JSON.stringify(endpoint, null, 2) : 'Endpoint not found',
            },
          ],
        };
      }

      case 'search_schemas': {
        const results = indexer.searchSchemas(args.query as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_schema': {
        if (args.specFile) {
          const schema = indexer.getSchema(args.specFile as string, args.schemaName as string);
          return {
            content: [
              {
                type: 'text',
                text: schema ? JSON.stringify(schema, null, 2) : 'Schema not found',
              },
            ],
          };
        } else {
          const schemas = indexer.searchSchemas(args.schemaName as string);
          const exactMatch = schemas.find(s => s.name === args.schemaName);
          return {
            content: [
              {
                type: 'text',
                text: exactMatch ? JSON.stringify(exactMatch, null, 2) : JSON.stringify(schemas, null, 2),
              },
            ],
          };
        }
      }

      case 'list_specifications': {
        const specs = indexer.getAllSpecs();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(specs, null, 2),
            },
          ],
        };
      }

      case 'get_specification_details': {
        const spec = indexer.getSpecDetails(args.fileName as string);
        return {
          content: [
            {
              type: 'text',
              text: spec ? JSON.stringify(spec, null, 2) : 'Specification not found',
            },
          ],
        };
      }

      case 'search_pdf_documentation': {
        const results = indexer.searchPdfDocuments(args.query as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'list_pdf_documents': {
        const docs = indexer.getAllPdfDocuments();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(docs, null, 2),
            },
          ],
        };
      }

      case 'search_all': {
        const results = indexer.searchAll(args.query as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_statistics': {
        const stats = indexer.getStatistics();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case 'filter_endpoints_by_tag': {
        const results = indexer.getEndpointsByTag(args.tag as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'filter_endpoints_by_method': {
        const results = indexer.getEndpointsByMethod(args.method as string);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error executing tool: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

// Resource handlers (optional - provides direct access to spec files)
server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: indexer.getAllSpecs().map(spec => ({
    uri: `berlin-group://specs/${spec.fileName}`,
    name: spec.title,
    description: spec.description || `${spec.title} specification`,
    mimeType: 'application/json',
  })),
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;
  const fileName = uri.replace('berlin-group://specs/', '');
  const spec = indexer.getSpecDetails(fileName);

  if (!spec) {
    throw new Error(`Specification not found: ${fileName}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(spec, null, 2),
      },
    ],
  };
});

// Initialize and start server
async function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const yamlDir = path.join(projectRoot, 'yml_files');
  const pdfDir = path.join(projectRoot, 'pdf_files');

  console.error('Berlin Group MCP Server starting...');
  console.error(`YAML directory: ${yamlDir}`);
  console.error(`PDF directory: ${pdfDir}`);

  await indexer.initialize(yamlDir, pdfDir);

  const stats = indexer.getStatistics();
  console.error('Initialization complete:');
  console.error(`- ${stats.totalSpecs} specifications loaded`);
  console.error(`- ${stats.totalEndpoints} endpoints indexed`);
  console.error(`- ${stats.totalSchemas} schemas available`);
  console.error(`- ${stats.totalPdfDocuments} PDF documents loaded`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Server ready and listening on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
