# Berlin Group MCP Server - Architecture Documentation

## Overview

The Berlin Group MCP (Model Context Protocol) Server is a sophisticated Node.js application that provides intelligent access to Berlin Group OpenAPI specifications and implementation documentation through the MCP interface. It enables AI models and IDEs to query, search, and retrieve detailed information about Berlin Group Open Finance APIs including AIS (Account Information Service), PIS (Payment Initiation Service), PIIS (Payment Initiation Service for Institutional Accounts), Consent Management, BASK, PUSH, and Data Dictionary specifications.

## Project Purpose

This MCP server acts as a bridge between AI assistants (like Claude) and the complex Berlin Group API specifications, allowing developers to:
- Search across multiple OpenAPI specifications quickly
- Retrieve detailed endpoint information and schemas
- Query PDF documentation
- Get comprehensive information about API structures and requirements
- Perform unified searches across all available documentation

## Architecture Overview

### Core Components

#### 1. **Entry Point (index.ts)**
   - Initializes the MCP Server and transport layer
   - Sets up all available tools and resources
   - Orchestrates initialization of parsers and indexers
   - Handles tool routing and responses

#### 2. **SpecificationIndexer (indexer.ts)**
   - Coordinates YAML and PDF parsing
   - Manages initialization of all parsers
   - Provides unified interface for searching across all sources
   - Handles endpoint, schema, and specification queries

#### 3. **YamlParser (yamlParser.ts)**
   - Loads and parses OpenAPI YAML specification files
   - Extracts endpoints, schemas, and metadata
   - Provides search functionality across specifications
   - Manages in-memory index of all API definitions

#### 4. **PdfParser (pdfParser.ts)**
   - Loads and parses PDF documentation files
   - Extracts searchable text from PDFs
   - Provides contextual search with surrounding content
   - Maintains document metadata and structure

#### 5. **MCP Server (via SDK)**
   - Provides stdio-based communication with host applications
   - Routes tool calls to appropriate handlers
   - Manages JSON-RPC protocol
   - Handles resource requests

## Data Flow Architecture

```
Host Application (Claude/IDE)
         ↓
    MCP Server (stdio transport)
         ↓
    Tool Router
         ↓
    SpecificationIndexer
      /  |  \
     /   |   \
YamlParser  PdfParser
    |         |
    ↓         ↓
Endpoints  PDF Documents
Schemas    & Metadata
Specs
```

## Supported Tools

### Endpoint Management Tools
- **search_endpoints**: Search for API endpoints across specifications
- **get_endpoint_details**: Retrieve complete endpoint specification with schemas and parameters

### Schema Management Tools
- **search_schemas**: Search for data models and schemas
- **get_schema**: Retrieve complete schema definition with all properties and constraints

### Specification Tools
- **list_specifications**: View all available Berlin Group specifications
- **get_specification_details**: Get detailed information about a specific specification file

### Documentation Tools
- **search_pdf_documentation**: Search through implementation guides and PDF documentation
- **list_pdf_documents**: List all available PDF documentation files

### Unified Search Tools
- **search_all**: Comprehensive search across endpoints, schemas, specifications, and PDFs
- **get_statistics**: Get overview statistics of loaded specifications

## Data Structures

### OpenAPISpec
```typescript
{
  fileName: string;           // e.g., "BG_oFA_AIS_Version_2.3_20250818.openapi.yaml"
  version: string;            // e.g., "3.0.0"
  title: string;              // e.g., "Account Information Service"
  description?: string;
  paths: Record<string, any>; // All endpoint definitions
  components?: {
    schemas?: Record<string, any>;
    securitySchemes?: Record<string, any>;
  };
}
```

### EndpointInfo
```typescript
{
  path: string;               // e.g., "/v1/accounts/{accountId}/transactions"
  method: string;             // GET, POST, PUT, DELETE, etc.
  operationId?: string;       // Unique operation identifier
  summary?: string;           // Brief description
  description?: string;       // Detailed description
  parameters?: any[];         // Path, query, header parameters
  requestBody?: any;          // Request body schema
  responses: Record<string, any>; // Response definitions
  tags?: string[];            // Categorization tags
  security?: any[];           // Security requirements
  specFile: string;           // Source specification file
}
```

### PDFDocument
```typescript
{
  fileName: string;           // e.g., "Implementation_Guide.pdf"
  title?: string;             // From PDF metadata
  text: string;               // Extracted text content
  pages: number;              // Total pages
  metadata?: any;             // PDF metadata
}
```

## Initialization Sequence

1. **Server Setup**: Create MCP Server and StdioServerTransport
2. **Parser Initialization**: Create YamlParser and PdfParser instances
3. **Tool Registration**: Register all tools with handler functions
4. **Data Loading** (Parallel):
   - Load all YAML specification files
   - Parse endpoints and schemas
   - Load and extract text from PDF files
5. **Index Building**: Create searchable indices from all data
6. **Ready State**: Server ready to accept tool calls from host

The initialization uses parallel loading for YAML and PDF files to minimize startup time.

## Functionality Flows

### Search Endpoints Flow
1. Client sends search query
2. YamlParser searches endpoint paths, operation IDs, summaries, descriptions, tags
3. Returns matching endpoints with basic information
4. Client can request detailed information for any endpoint

### Get Endpoint Details Flow
1. Client provides specific path and HTTP method
2. YamlParser locates exact endpoint match
3. Enriches with full operation details
4. Resolves referenced schemas from component definitions
5. Returns complete specification including:
   - Parameters with types and constraints
   - Request/response schemas
   - Security requirements
   - Status codes

### Search Schemas Flow
1. Client searches for schema by name or content
2. YamlParser searches schema definitions
3. Returns matching schemas with type information
4. Client can request full schema definition with property details

### Get Schema Flow
1. Client provides schema name
2. YamlParser retrieves schema definition
3. Resolves all $ref references recursively
4. Builds complete property documentation
5. Returns enriched schema with all constraints and examples

### Search PDF Documentation Flow
1. Client searches for text in documentation
2. PdfParser searches all documents case-insensitively
3. Returns matching excerpts with context (±2 lines)
4. Limits to 10 matches per document for brevity

### Comprehensive Search Flow
1. Client initiates unified search across all sources
2. Parallel execution:
   - Search endpoints in YamlParser
   - Search schemas in YamlParser
   - Search specifications
   - Search PDFs in PdfParser
3. Consolidate and rank results by relevance
4. Return categorized results with metadata

## File Structure

```
berlin-group-mcp/
├── docs/
│   └── architecture/
│       └── diagrams/
│           ├── 01-component-architecture.puml
│           ├── 02-class-diagram.puml
│           ├── 03-deployment-diagram.puml
│           ├── 04-initialization-sequence.puml
│           ├── 05-search-endpoints-sequence.puml
│           ├── 06-get-endpoint-details-sequence.puml
│           ├── 07-search-schemas-sequence.puml
│           ├── 08-pdf-search-sequence.puml
│           ├── 09-search-all-sequence.puml
│           └── README.md (this file)
├── src/
│   ├── index.ts          # Entry point and tool definitions
│   ├── indexer.ts        # Coordinates parsing and searching
│   ├── yamlParser.ts     # OpenAPI specification parsing
│   └── pdfParser.ts      # PDF document parsing
├── yml_files/
│   └── *.yaml            # Berlin Group OpenAPI specifications
├── pdf_files/
│   └── *.pdf             # Implementation documentation
├── package.json
└── tsconfig.json
```

## Key Design Patterns

### 1. **Separation of Concerns**
   - Each parser handles its own file type
   - Indexer provides unified interface
   - MCP layer isolated from parsing logic

### 2. **In-Memory Indexing**
   - All data loaded on startup for fast access
   - Map-based storage for O(1) lookups
   - Array-based storage for full-text search

### 3. **Parallel Processing**
   - YAML and PDF files loaded concurrently
   - Search operations performed in parallel where possible
   - Improves initialization and query performance

### 4. **Context Preservation**
   - PDF search returns surrounding context
   - Endpoint details include full schema information
   - Search results include source file references

## Performance Considerations

- **Startup**: Parallel file loading minimizes initialization time
- **Memory**: In-memory indices provide O(1) lookups
- **Search**: Linear search with regex/string matching (scalable for current data volumes)
- **Response**: Streaming-based stdio transport for efficient communication

## Dependencies

- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **js-yaml**: YAML parsing for OpenAPI specifications
- **pdf-parse**: PDF text extraction
- **@types/node**: TypeScript Node.js types

## Security Considerations

- No network operations (all local data)
- No user input directly executed
- String-based matching with no code evaluation
- Safe error handling and logging

## Future Enhancements

1. **Schema Validation**: Validate requests against retrieved schemas
2. **Example Generation**: Generate example requests and responses
3. **Caching**: Implement result caching for frequent queries
4. **Filtering**: Add result filtering by specification version or type
5. **Webhooks**: Document webhook specifications separately
6. **Rate Limiting**: Add rate limiting for production use
7. **Metrics**: Track usage statistics and popular queries

## Diagram Guide

This documentation folder contains the following PlantUML diagrams:

1. **Component Architecture** - System components and their relationships
2. **Class Diagram** - Detailed class structure and interfaces
3. **Deployment Diagram** - Runtime configuration and file locations
4. **Initialization Sequence** - Server startup and data loading process
5. **Search Endpoints Sequence** - Step-by-step endpoint search flow
6. **Get Endpoint Details Sequence** - Detailed endpoint retrieval process
7. **Search Schemas Sequence** - Schema search and retrieval flows
8. **PDF Search Sequence** - PDF document search functionality
9. **Comprehensive Search Sequence** - Unified search across all sources

All diagrams are in PlantUML format and can be rendered using:
- PlantUML online viewer
- VS Code PlantUML extension
- Local PlantUML installation

## Contact & Contribution

For questions or contributions to this documentation, please refer to the main project repository.

---

**Last Updated**: January 26, 2026
**Architecture Version**: 1.0
