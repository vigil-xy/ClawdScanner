# Example MCP Client Configuration

This document provides example configurations for connecting to the Vigil MCP server from various MCP clients.

## Claude Desktop

### macOS
Location: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Windows
Location: `%APPDATA%\Claude\claude_desktop_config.json`

### Linux
Location: `~/.config/Claude/claude_desktop_config.json`

### Configuration

```json
{
  "mcpServers": {
    "vigil": {
      "command": "node",
      "args": [
        "/absolute/path/to/vigil-mcp/build/index.js"
      ]
    }
  }
}
```

Or if installed via npm globally:

```json
{
  "mcpServers": {
    "vigil": {
      "command": "vigil-mcp"
    }
  }
}
```

## Using with npx

You can also run the server directly with npx (if published to npm):

```json
{
  "mcpServers": {
    "vigil": {
      "command": "npx",
      "args": ["-y", "vigil-mcp"]
    }
  }
}
```

## Environment Variables (Future Enhancement)

While not currently implemented, you could extend the server to support environment variables for default configuration:

```json
{
  "mcpServers": {
    "vigil": {
      "command": "node",
      "args": ["/path/to/vigil-mcp/build/index.js"],
      "env": {
        "VIGIL_URL": "https://status.example.com",
        "VIGIL_REPORTER_TOKEN": "your-reporter-token",
        "VIGIL_MANAGER_TOKEN": "your-manager-token"
      }
    }
  }
}
```

## Testing the Connection

After adding the configuration:

1. Restart your MCP client (e.g., Claude Desktop)
2. The Vigil tools should appear in the available tools list
3. Try using a tool like `list_announcements` with your Vigil server credentials

## Example Tool Usage

Once connected, you can use natural language to interact with Vigil:

- "Check the current alerts on my Vigil server at https://status.example.com"
- "Report the health of replica 192.168.1.100 with 30% CPU and 80% RAM usage"
- "Create an announcement about upcoming maintenance"
- "List all current announcements"

The AI assistant will use the appropriate tools with the credentials you provide.
