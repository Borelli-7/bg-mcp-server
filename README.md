# Berlin Group MCP Server

A Model Context Protocol (MCP) server that provides Berlin Group Open Finance API specifications as contextual information to AI assistants in VS Code and IntelliJ IDEA.

## Overview

This MCP server loads and indexes Berlin Group Open Finance specifications from OpenAPI YAML files and PDF documentation, enabling LLMs to provide accurate, specification-compliant guidance during Open Finance Framework implementation.

## Features

- 📚 **Complete Specification Access**: Loads all Berlin Group OpenAPI specs (AIS, PIS, PIIS, BASK, Consent, etc.)
- 🔍 **Powerful Search**: Search across endpoints, schemas, and PDF documentation
- 🎯 **Smart Filtering**: Filter endpoints by method, tag, or specification
- 📖 **PDF Support**: Extract and search content from implementation guides
- 🛠️ **12 MCP Tools**: Comprehensive toolset for querying specifications
- 🔌 **Multi-IDE Support**: Works in VS Code and IntelliJ IDEA

## Available Specifications

The server indexes the following Berlin Group specifications:

- **Account Information Services (AIS)** v2.3
- **Payment Initiation Services (PIS)** v2.3
- **Confirmation of Funds (PIIS)** v2.3
- **Bank Account Status Services (BASK)** v2.2
- **Consent Management** v2.1
- **Data Dictionary** v2.2.6
- **Payment Update Status Hub (PUSH)** v2.2

## Installation

### Prerequisites

- Node.js v18 or higher
- npm or yarn
- VS Code or IntelliJ IDEA with MCP support

### Setup

1. **Clone or navigate to the project directory:**
   ```bash
   cd /home/kaly-7/Dev/Professional/ReposTests/Berlin-group-mcp
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the project:**
   ```bash
   npm run build
   ```

## Configuration

### VS Code

1. The configuration file is already created at `.vscode/mcp-settings.json`

2. Update the path if needed to match your project location:
   ```json
   {
     "mcpServers": {
       "berlin-group": {
         "command": "node",
         "args": [
           "/home/kaly-7/Dev/Professional/ReposTests/Berlin-group-mcp/build/index.js"
         ]
       }
     }
   }
   ```

3. Restart VS Code or reload the window

4. The Berlin Group tools should now be available in GitHub Copilot Chat

### IntelliJ IDEA

See [INTELLIJ_SETUP.md](INTELLIJ_SETUP.md) for detailed configuration instructions.

## Available Tools

The server provides 12 MCP tools:

### Search and Discovery

- **`search_endpoints`** - Search for API endpoints across all specifications
  ```
  Example: "Find all payment endpoints"
  ```

- **`search_schemas`** - Search for data schemas and models
  ```
  Example: "Find schemas related to transaction"
  ```

- **`search_pdf_documentation`** - Search through PDF documentation
  ```
  Example: "Search for SCA requirements"
  ```

- **`search_all`** - Comprehensive search across all sources
  ```
  Example: "Find everything about consent"
  ```

### Endpoint Information

- **`get_endpoint_details`** - Get detailed information about a specific endpoint
  ```
  Parameters: path, method
  Example: path="/v1/accounts", method="GET"
  ```

- **`filter_endpoints_by_tag`** - Filter endpoints by tag
  ```
  Example: tag="accounts"
  ```

- **`filter_endpoints_by_method`** - Filter endpoints by HTTP method
  ```
  Example: method="POST"
  ```

### Schema Information

- **`get_schema`** - Get a specific schema definition
  ```
  Parameters: schemaName, specFile (optional)
  Example: schemaName="AccountDetails"
  ```

### Specification Management

- **`list_specifications`** - List all available OpenAPI specifications

- **`get_specification_details`** - Get comprehensive details about a specific spec
  ```
  Parameters: fileName
  ```

- **`list_pdf_documents`** - List all available PDF documentation

- **`get_statistics`** - Get statistics about loaded specifications

## Usage Examples

### In VS Code with GitHub Copilot

```
You: "What endpoints are available for account information?"
Copilot: [Uses search_endpoints tool to find AIS endpoints]

You: "Show me the schema for payment initiation request"
Copilot: [Uses search_schemas tool to find payment schemas]

You: "How do I implement Strong Customer Authentication?"
Copilot: [Uses search_pdf_documentation to find SCA information]
```

### Programmatic Usage

The server can also be used programmatically via the MCP protocol:

```typescript
// Example tool call
{
  "method": "tools/call",
  "params": {
    "name": "search_endpoints",
    "arguments": {
      "query": "payment"
    }
  }
}
```

## Project Structure

```
Berlin-group-mcp/
├── src/
│   ├── index.ts           # Main MCP server
│   ├── indexer.ts         # Specification indexer
│   ├── yamlParser.ts      # OpenAPI YAML parser
│   └── pdfParser.ts       # PDF document parser
├── yml_files/             # Berlin Group OpenAPI specs
├── pdf_files/             # PDF documentation
├── build/                 # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .vscode/
│   └── mcp-settings.json  # VS Code MCP configuration
├── INTELLIJ_SETUP.md      # IntelliJ configuration guide
└── README.md
```

## Development

### Watch Mode

To automatically rebuild on file changes:
```bash
npm run watch
```

### Debugging

To debug the server with Node.js inspector:
```bash
npm run inspector
```

### Adding New Specifications

1. Add YAML files to `yml_files/` directory
2. Add PDF files to `pdf_files/` directory
3. Rebuild the project: `npm run build`
4. Restart the MCP server

## Troubleshooting

### Server Not Starting

1. Check Node.js version: `node --version` (should be v18+)
2. Verify build completed: `ls -la build/`
3. Check for errors in VS Code Developer Tools console

### Tools Not Appearing

1. Ensure MCP settings file exists and has correct paths
2. Restart VS Code completely
3. Check GitHub Copilot is enabled and working

### No Results from Search

1. Verify YAML and PDF files exist in their directories
2. Check server logs for initialization errors
3. Ensure files are readable: `ls -la yml_files/ pdf_files/`

### Permission Issues

```bash
chmod +x build/index.js
```

## Technical Details

### MCP Protocol

This server implements the Model Context Protocol specification (2025-11-25):
- Tools: 12 tools for querying specifications
- Resources: Direct access to specification files via `berlin-group://` URI scheme
- Transport: stdio-based communication

### Parser Features

- **YAML Parser**: Extracts paths, operations, schemas, components from OpenAPI specs
- **PDF Parser**: Uses pdf-parse to extract text content for full-text search
- **Indexer**: Maintains in-memory index of all specifications for fast queries

### Performance

- Initial load time: ~1-2 seconds (depends on file count/size)
- Search response: <100ms (in-memory search)
- Memory usage: ~50-100MB (depends on specification size)

## License

MIT

## References

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Berlin Group Open Finance](https://www.berlin-group.org/)
- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)

## Contributing

Contributions are welcome! Please ensure:
- TypeScript code follows project conventions
- All tools have proper error handling
- Documentation is updated for new features

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review MCP documentation
3. Check Berlin Group specification documentation
