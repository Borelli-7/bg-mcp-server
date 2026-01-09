# IntelliJ IDEA MCP Configuration

## Prerequisites

1. Install the MCP plugin for IntelliJ IDEA from JetBrains Marketplace
2. Ensure Node.js (v18 or higher) is installed
3. Build the Berlin Group MCP server

## Configuration Steps

### 1. Build the Project

```bash
cd /home/kaly-7/Dev/Professional/ReposTests/Berlin-group-mcp
npm install
npm run build
```

### 2. Configure MCP in IntelliJ IDEA

1. Open IntelliJ IDEA Settings/Preferences
2. Navigate to: **Tools** → **Model Context Protocol (MCP)**
3. Click **Add Server** or **+**
4. Enter the following configuration:

   **Server Name:** `berlin-group`
   
   **Command:** `node`
   
   **Arguments:**
   ```
   /home/kaly-7/Dev/Professional/ReposTests/Berlin-group-mcp/build/index.js
   ```
   
   **Working Directory:** (leave empty or set to project root)
   
   **Environment Variables:** (leave empty)

5. Click **OK** to save

### 3. Alternative: JSON Configuration

If your IntelliJ IDEA version supports JSON configuration for MCP servers, create or edit the configuration file:

**Location:** `~/.config/JetBrains/<IDE-VERSION>/options/mcp-settings.xml` or similar

Add this configuration:

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

### 4. Restart and Test

1. Restart IntelliJ IDEA or reload the MCP configuration
2. Open AI Assistant or Copilot in IntelliJ
3. The Berlin Group specification tools should now be available
4. Test with a query like: "What endpoints are available in the Account Information Service?"

## Available Tools

Once configured, you can use these tools through the AI assistant:

- `search_endpoints` - Search for API endpoints
- `search_schemas` - Find data schemas
- `get_endpoint_details` - Get detailed endpoint information
- `search_pdf_documentation` - Search PDF documentation
- `list_specifications` - List all available specs
- `search_all` - Comprehensive search across all sources
- And more...

## Troubleshooting

### Server Not Starting

1. Check Node.js version: `node --version` (should be v18+)
2. Verify build output exists: `ls -la build/`
3. Check IntelliJ IDEA logs for MCP errors

### Tools Not Appearing

1. Ensure the MCP plugin is installed and enabled
2. Restart IntelliJ IDEA completely
3. Check that the server path is absolute and correct

### Permission Issues

Make sure the build files are executable:
```bash
chmod +x build/index.js
```

## Notes

- The configuration uses absolute paths. Update the path if you move the project.
- Each IDE instance maintains its own MCP server connection.
- The server loads all specifications on startup, which may take a few seconds.
