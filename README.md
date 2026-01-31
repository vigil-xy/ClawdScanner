# Vigil Security Scanner

A production-ready security scanner CLI tool for developers and startups. Vigil performs comprehensive security audits of your system and generates cryptographically signed reports.

## Features

### 🔍 **Comprehensive Security Scanning**

- **Network Security**: Scans open ports, firewall status, and listening services
- **Process Security**: Detects suspicious processes, processes in /tmp, and secrets in environment variables
- **Filesystem Security**: Checks file permissions, SUID/SGID binaries, world-writable files, and exposed secrets
- **Dependency Security**: Integrates with npm audit to detect vulnerable dependencies
- **Configuration Security**: Analyzes SSH configs and scans configuration files for hardcoded secrets
- **Container Security**: Lists Docker containers, checks for privileged containers and exposed ports

### 🔐 **Cryptographic Signing**

Every scan report is cryptographically signed using Ed25519 signatures with SHA-256 hashing to ensure tamper-evidence and authenticity.

### 🚀 **MCP Server Integration**

This package also includes an MCP (Model Context Protocol) server that exposes security scanning tools to AI assistants like Claude Desktop and Cursor.

## Quick Install

```bash
npm install -g vigil-security-scanner
```

Or use directly with npx:

```bash
npx vigil-security-scanner scan
```

## Usage

### Run a Security Scan

```bash
# Run a basic scan
vigil scan

# Output as JSON
vigil scan --json

# Save report to file
vigil scan -o report.json

# Skip cryptographic signing
vigil scan --no-sign
```

### Verify a Report

```bash
vigil verify report.json
```

This verifies the cryptographic signature to ensure the report hasn't been tampered with.

### Manage Keys

```bash
# Generate new Ed25519 key pair
vigil keys --generate

# Show your public key
vigil keys --show-public
```

Keys are stored in `~/.vigil/keys/` directory.

## Security Checks

### Network Security
- ✅ Scans all open TCP/UDP ports using netstat or ss
- ✅ Identifies dangerous ports (FTP, Telnet, MySQL, PostgreSQL, Redis, MongoDB, etc.)
- ✅ Checks firewall status (ufw/iptables)
- ✅ Lists listening services with lsof or netstat

### Process Security
- ✅ Lists all running processes
- ✅ Detects suspicious processes (reverse shells: nc -l, ncat -l, etc.)
- ✅ Finds processes running from /tmp/
- ✅ Checks for privileged/root processes
- ✅ Scans environment variables for secrets (AWS_ACCESS_KEY, API_KEY, PASSWORD, GITHUB_TOKEN, etc.)

### Filesystem Security
- ✅ Checks sensitive file permissions: ~/.ssh/id_rsa, ~/.aws/credentials, .env, .env.local
- ✅ Finds world-writable files in common directories
- ✅ Finds SUID/SGID files
- ✅ Detects exposed secret files

### Dependency Security
- ✅ Runs npm audit if package.json exists
- ✅ Parses and reports vulnerabilities
- ✅ Shows vulnerability severity breakdown

### Configuration Security
- ✅ Checks SSH config (/etc/ssh/sshd_config) for PermitRootLogin, PasswordAuthentication
- ✅ Scans common config files for secrets: .env, config.json, config.yaml
- ✅ Detects patterns: AWS keys (AKIA[0-9A-Z]{16}), GitHub tokens (ghp_), OpenAI keys (sk-), Private keys (-----BEGIN)

### Container Security
- ✅ Lists Docker containers if available
- ✅ Checks for privileged containers
- ✅ Identifies exposed ports

## Cryptographic Signature System

Every scan report is cryptographically signed to ensure tamper-evidence:

1. **Key Generation**: Ed25519 key pair is generated on first run (stored in ~/.vigil/keys/)
2. **Hashing**: Entire scan report is hashed with SHA-256
3. **Signing**: Hash is signed with private key using Ed25519
4. **Verification**: Signature + public key included in output for verification

To verify a report:
```bash
vigil verify report.json
```

## Sample Output

```
═══════════════════════════════════════════════════════════════
                    VIGIL SECURITY SCAN REPORT                 
═══════════════════════════════════════════════════════════════

Timestamp: 2026-01-31T22:42:10.816Z
Hostname:  your-hostname

─────────────────────────────────────────────────────────────
                           SUMMARY                            
─────────────────────────────────────────────────────────────
Risk Level:      🟠 HIGH
Total Issues:    33
  Critical:      0
  High:          7
  Medium:        0
  Low:           26

[... detailed findings by category ...]

─────────────────────────────────────────────────────────────
                  CRYPTOGRAPHIC SIGNATURE                     
─────────────────────────────────────────────────────────────
Algorithm: Ed25519
Hash (SHA-256): 85a14c75d8ff06b6ab91d8c2dbf8b0b8...
Signature: 9GWx9y9M+ZAamC2WU9gRP2RVfUgTNoRB...
Public Key Location: /home/user/.vigil/keys/public.pem
```

## MCP Server Usage

This package also includes an MCP (Model Context Protocol) server for AI assistants.

### Running the MCP Server

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
- Optional: Docker (for container scanning)
- Optional: Python 3 with `vigil-cryptographicsign` package (for MCP server only)

### Installing vigil-scan

**Note**: The legacy `vigil-scan` tool is no longer required. All scanning functionality is built directly into the `vigil` CLI.

For older integrations that still reference `vigil-scan`:

**macOS:**
```bash
curl -fsSL https://releases.vigil.ai/vigil-scan-macos -o /usr/local/bin/vigil-scan
chmod +x /usr/local/bin/vigil-scan
```

**Linux:**
```bash
curl -fsSL https://releases.vigil.ai/vigil-scan-linux -o /usr/local/bin/vigil-scan
chmod +x /usr/local/bin/vigil-scan
```

**Windows:**
Download the executable from https://releases.vigil.ai/vigil-scan-windows.exe

### Installing Python Dependencies

**Note**: Python dependencies are only needed for the MCP server, not for the CLI scanner.

```bash
pip3 install vigil-cryptographicsign
```

## Deployment Architecture

This server is designed to be used as a subprocess by MCP clients:

```
[MCP Client] --stdio--> [vigil-mcp subprocess] --exec--> [vigil-scan, python3]
```

This is the standard MCP deployment model used by:
- Claude Desktop
- Cursor
- VS Code with MCP extensions
- Custom MCP client applications

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

