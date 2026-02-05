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

// ============================================================================
// Configuration
// ============================================================================

interface ServerConfig {
  chromaDB: {
    host: string;
    port: number;
    collectionName: string;
    embeddingModel?: string;
  };
  neo4j: {
    uri: string;
    username: string;
    password: string;
    database?: string;
    maxConnectionPoolSize?: number;
    connectionAcquisitionTimeout?: number;
  };
}

/**
 * Load configuration from environment variables
 */
function loadConfig(): ServerConfig {
  return {
    chromaDB: {
      host: process.env.CHROMA_HOST || 'localhost',
      port: parseInt(process.env.CHROMA_PORT || '8000', 10),
      collectionName: process.env.CHROMA_COLLECTION || 'berlin_group_pdfs',
      embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
    },
    neo4j: {
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password',
      database: process.env.NEO4J_DATABASE || 'neo4j',
      maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_POOL_SIZE || '50', 10),
      connectionAcquisitionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT || '60000', 10),
    },
  };
}

// Load configuration
const config = loadConfig();

// Initialize the indexer with custom configurations
const indexer = new SpecificationIndexer({
  vectorStore: {
    chromaHost: config.chromaDB.host,
    chromaPort: config.chromaDB.port,
    collectionName: config.chromaDB.collectionName,
    embeddingModel: config.chromaDB.embeddingModel,
  },
  graphStore: {
    uri: config.neo4j.uri,
    username: config.neo4j.username,
    password: config.neo4j.password,
    database: config.neo4j.database,
    maxConnectionPoolSize: config.neo4j.maxConnectionPoolSize,
    connectionAcquisitionTimeout: config.neo4j.connectionAcquisitionTimeout,
  },
});

console.error('Configuration loaded:');
console.error(`- ChromaDB: ${config.chromaDB.host}:${config.chromaDB.port}`);
console.error(`- Neo4j: ${config.neo4j.uri}`);

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
  {
    name: 'search_pdf_semantic',
    description: 'Perform semantic search across PDF documentation using AI embeddings. Understands synonyms and concepts. Returns results ranked by relevance.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query for semantic search',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_pdf_semantic_filtered',
    description: 'Perform semantic search with metadata filters (by filename or section).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query for semantic search',
        },
        fileName: {
          type: 'string',
          description: 'Filter results to a specific PDF file',
        },
        section: {
          type: 'string',
          description: 'Filter results to a specific section',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_all_semantic',
    description: 'Comprehensive semantic search across all Berlin Group specifications (endpoints, schemas, and PDF documentation with AI-powered relevance ranking).',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query to search across all sources',
        },
        topK: {
          type: 'number',
          description: 'Number of PDF results to return (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_vector_store_stats',
    description: 'Get statistics about the vector store including chunk count and configuration.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  // Graph Store Tools
  {
    name: 'graph_find_related_schemas',
    description: 'Find schemas related to a given schema through $ref references. Useful for understanding schema dependencies and inheritance.',
    inputSchema: {
      type: 'object',
      properties: {
        schemaName: {
          type: 'string',
          description: 'Name of the schema to find relations for',
        },
        specFile: {
          type: 'string',
          description: 'Optional: specific specification file to search within',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth of relationships to traverse (default: 3)',
        },
      },
      required: ['schemaName'],
    },
  },
  {
    name: 'graph_get_endpoint_dependencies',
    description: 'Get all dependencies of an API endpoint including parameters, request/response schemas, and related data models.',
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
        specFile: {
          type: 'string',
          description: 'Optional: specific specification file',
        },
      },
      required: ['path', 'method'],
    },
  },
  {
    name: 'graph_traverse_relationships',
    description: 'Execute a custom graph traversal starting from a specific node type and filter. Returns connected nodes and relationships.',
    inputSchema: {
      type: 'object',
      properties: {
        startNodeType: {
          type: 'string',
          description: 'Type of starting node (Specification, Endpoint, Schema, Parameter, Response, Tag)',
        },
        startNodeFilter: {
          type: 'object',
          description: 'Property filters for the starting node (e.g., {name: "AccountReference"})',
        },
        relationshipTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: specific relationship types to follow (DEFINES_ENDPOINT, DEFINES_SCHEMA, HAS_PARAMETER, HAS_RESPONSE, USES_SCHEMA, REFERENCES, TAGGED_WITH)',
        },
        maxDepth: {
          type: 'number',
          description: 'Maximum depth to traverse (default: 3)',
        },
      },
      required: ['startNodeType', 'startNodeFilter'],
    },
  },
  {
    name: 'graph_get_specification_graph',
    description: 'Get the complete graph structure for a specification including all endpoints, schemas, and their relationships.',
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
    name: 'graph_search_by_pattern',
    description: 'Search for graph nodes matching a property pattern. Supports wildcards (*) in string values.',
    inputSchema: {
      type: 'object',
      properties: {
        nodeType: {
          type: 'string',
          description: 'Type of node to search (Specification, Endpoint, Schema, Parameter, Response, Tag)',
        },
        pattern: {
          type: 'object',
          description: 'Property pattern to match (e.g., {path: "/v1/accounts*"} or {name: "*Account*"})',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of results (default: 50)',
        },
      },
      required: ['nodeType', 'pattern'],
    },
  },
  {
    name: 'get_graph_store_stats',
    description: 'Get statistics about the graph store including node counts, relationship counts, and connection status.',
    inputSchema: {
      type: 'object',
      properties: {},
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

      case 'search_pdf_semantic': {
        const topK = (args.topK as number) || 10;
        const results = await indexer.searchPdfSemantic(args.query as string, topK);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'search_pdf_semantic_filtered': {
        const topK = (args.topK as number) || 10;
        const filter: { fileName?: string; section?: string } = {};
        if (args.fileName) filter.fileName = args.fileName as string;
        if (args.section) filter.section = args.section as string;
        
        const results = await indexer.searchPdfSemanticFiltered(
          args.query as string,
          filter,
          topK
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'search_all_semantic': {
        const topK = (args.topK as number) || 10;
        const results = await indexer.searchAllSemantic(args.query as string, topK);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_vector_store_stats': {
        const stats = await indexer.getVectorStoreStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      // Graph Store Tool Handlers
      case 'graph_find_related_schemas': {
        const maxDepth = (args.maxDepth as number) || 3;
        const results = await indexer.findRelatedSchemas(
          args.schemaName as string,
          args.specFile as string | undefined,
          maxDepth
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'graph_get_endpoint_dependencies': {
        const result = await indexer.getEndpointDependencies(
          args.path as string,
          args.method as string,
          args.specFile as string | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: result ? JSON.stringify(result, null, 2) : 'Endpoint not found',
            },
          ],
        };
      }

      case 'graph_traverse_relationships': {
        const maxDepth = (args.maxDepth as number) || 3;
        const results = await indexer.traverseGraph(
          args.startNodeType as string,
          args.startNodeFilter as Record<string, any>,
          args.relationshipTypes as string[] | undefined,
          maxDepth
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'graph_get_specification_graph': {
        const result = await indexer.getSpecificationGraph(args.fileName as string);
        return {
          content: [
            {
              type: 'text',
              text: result ? JSON.stringify(result, null, 2) : 'Specification not found',
            },
          ],
        };
      }

      case 'graph_search_by_pattern': {
        const limit = (args.limit as number) || 50;
        const results = await indexer.searchGraphByPattern(
          args.nodeType as string,
          args.pattern as Record<string, any>,
          limit
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'get_graph_store_stats': {
        const stats = await indexer.getGraphStoreStats();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats, null, 2),
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
