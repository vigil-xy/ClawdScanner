# Vigil MCP — Cryptographic Security & Trust Tools for AI Systems

This MCP server exposes Vigil's security scanning and cryptographic proof tools. It allows AI assistants to scan systems under attacker assumptions and produce cryptographically signed, tamper-evident reports.

## Features

- **vigil.scan**: Run Vigil security scans on local host or remote repositories (returns structured data)
- **vigil.scan.signed**: Run scans and automatically sign results with cryptographic proofs for tamper-evident reporting
- **vigil.proof.sign**: Sign any action payload with cryptographic proofs

## Architecture

This is an **MCP (Model Context Protocol) server** that communicates via stdio, designed to be launched as a subprocess by MCP clients like Claude Desktop, Cursor, and other MCP-aware agents.

**Important:** This is NOT an HTTP service and cannot be directly deployed as a standalone web server on platforms like Fly.io. It requires an MCP client to invoke it.

## Quick Install

The fastest way to get started:

```bash
curl -fsSL https://lab.vigil.ai/install.sh | sh
```

Or install manually with npm:

```bash
npm install -g vigil-mcp
```

Then run:

```bash
vigil-mcp
```

Or use directly with npx:

```bash
npx vigil-mcp
```

## Usage

### Running the Server

Run the MCP server:

```bash
vigil-mcp
```

Or if installed locally:

```bash
npm start
```

The server communicates over stdio and is compatible with MCP clients like Claude Desktop, Cursor, and other MCP-aware agents.

### Configuration with MCP Clients

Add this server to your MCP client configuration. For example, with Claude Desktop, add to your config file:

- **MacOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "vigil": {
      "command": "vigil-mcp"
    }
  }
}
```

## Available Tools

### vigil.scan

Run a Vigil security scan on a target and return structured data.

**Parameters:**
- `target` (string, required): Either "host" for local system or "repo" for a repository
- `repo_url` (string, optional): Repository URL (required when target is "repo")
- `dry_run` (boolean, optional): Run in dry-run mode without making changes (default: true)

**Returns:** Structured JSON with scan findings including:
- `timestamp`: When the scan was performed
- `target`: What was scanned
- `findings`: Structured data with `open_ports`, `file_findings`, `system_issues`
- `summary`: Risk level and total findings count
- `raw_output`: Raw output from vigil-scan

**Example:**
```json
{
  "target": "host",
  "dry_run": true
}
```

### vigil.scan.signed

Run a Vigil security scan and return cryptographically signed, tamper-evident results. This tool combines scanning with automatic cryptographic signing to ensure results cannot be tampered with.

**Parameters:**
- `target` (string, required): Either "host" for local system or "repo" for a repository
- `repo_url` (string, optional): Repository URL (required when target is "repo")
- `dry_run` (boolean, optional): Run in dry-run mode without making changes (default: true)

**Returns:** Signed JSON containing:
- `scan_result`: The structured scan data
- `cryptographic_proof`: The signature and proof metadata
- `is_tamper_evident`: True, indicating this is a signed result

**Example:**
```json
{
  "target": "host",
  "dry_run": true
}
```

**Use this tool when you need verifiable, tamper-evident security reports.**

### vigil.proof.sign

Sign an arbitrary action payload with cryptographic proof.

**Parameters:**
- `payload` (object, required): The payload to sign
- `purpose` (string, required): Purpose of the signature

**Example:**
```json
{
  "payload": {"action": "scan", "result": "..."},
  "purpose": "verification"
}
```

## Requirements

- Node.js v20+
- Python 3 with `vigil-cryptographicsign` package (install with: `pip3 install vigil-cryptographicsign`)
- `vigil-scan` command-line tool (from https://releases.vigil.ai/)

## Deployment Architecture

### MCP Client Integration (Recommended)

This server is designed to be used as a subprocess by MCP clients:

```
[MCP Client] --stdio--> [vigil-mcp subprocess] --exec--> [vigil-scan, python3]
```

This is the standard MCP deployment model used by:
- Claude Desktop
- Cursor
- VS Code with MCP extensions
- Custom MCP client applications

### HTTP Deployment (Advanced)

If you need to expose this as an HTTP service (e.g., for Fly.io deployment), you'll need to create a bridge server:

```
[HTTP Client] --HTTP--> [Bridge Server] --stdio--> [vigil-mcp subprocess]
```

The bridge server would:
1. Accept HTTP requests
2. Spawn vigil-mcp as a subprocess
3. Route requests to stdin/stdout
4. Return responses as HTTP

**Note:** A reference bridge server implementation is not included in this repository. The Dockerfile provided is for containerization of the MCP server itself, not for direct HTTP deployment.

## Development

The project uses TypeScript with the following structure:

- `src/index.ts`: Main MCP server implementation
- `scripts/sign_proof.py`: Python script for cryptographic signing
- `tsconfig.json`: TypeScript configuration
- `package.json`: Node.js dependencies and scripts

### Building from Source

```bash
npm install
npm run build
```

### Testing Locally

```bash
npm start
```

## License

MIT

