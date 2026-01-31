# Vigil Security Scanner

A comprehensive, production-ready security scanning tool for developers and startups. Vigil performs deep security audits of your system and generates cryptographically signed, tamper-evident reports.

## Features

### 🔍 **Comprehensive Security Scanning**

- **Network Security**: Scans open ports, firewall status, and listening services
- **Process Security**: Detects suspicious processes, processes in /tmp, and secrets in environment variables
- **Filesystem Security**: Checks file permissions, SUID/SGID binaries, world-writable files, and exposed secrets
- **Dependency Security**: Integrates with npm audit to detect vulnerable dependencies
- **Configuration Security**: Analyzes SSH configs and scans configuration files for hardcoded secrets
- **Container Security**: Lists Docker containers, checks for privileged containers and exposed ports

### 🔐 **Cryptographic Signing**

Every scan report is cryptographically signed using **Ed25519 signatures** with **SHA-256 hashing** to ensure tamper-evidence and authenticity.

### 🤖 **MCP Server Integration**

Includes an MCP (Model Context Protocol) server that exposes security scanning tools to AI assistants like Claude Desktop and Cursor.

## Installation

### For End Users (Global Install)

```bash
npm install -g vigil-security-scanner
```

Or use directly with npx:

```bash
npx vigil-security-scanner scan
```

### For Developers (From Source)

```bash
# 1. Clone the repository
git clone https://github.com/vigil-xy/vigil-mcp.git
cd vigil-mcp

# 2. Install dependencies
npm install

# 3. Build the project
npm run build

# 4. (Optional) Link globally
npm link
```

## Usage

### CLI Commands

#### Run a Security Scan

```bash
# Basic scan with cryptographic signing
vigil scan

# Output as JSON
vigil scan --json

# Save report to file
vigil scan -o report.json

# Skip cryptographic signing
vigil scan --no-sign

# Combined options
vigil scan --json -o report.json
```

#### Verify a Report

```bash
vigil verify report.json
```

This verifies the cryptographic signature to ensure the report hasn't been tampered with.

#### Manage Cryptographic Keys

```bash
# Generate new Ed25519 key pair
vigil keys --generate

# Show your public key
vigil keys --show-public
```

Keys are stored in `~/.vigil/keys/` directory.

### Using from Source

```bash
# Run CLI directly
node build/cli.js scan

# Run with options
node build/cli.js scan --json -o report.json

# Verify a report
node build/cli.js verify report.json

# Manage keys
node build/cli.js keys --generate
```

### MCP Server (AI Integration)

#### Start the MCP Server

```bash
# If installed globally
vigil-mcp

# From source
npm start
# or
node build/index.js
```

#### Configure AI Assistant

Add to your AI assistant's MCP configuration (e.g., Claude Desktop):

```json
{
  "mcpServers": {
    "vigil": {
      "command": "vigil-mcp"
    }
  }
}
```

#### Available MCP Tools

- `vigil.scan` - Run security scan on host or repository
- `vigil.scan.signed` - Run security scan with cryptographic signing
- `vigil.proof.sign` - Sign action payloads with cryptographic proof

#### Example AI Prompts

- "Scan my system for security issues"
- "Run a signed security scan and give me a report"
- "Check for vulnerabilities on this host"

## Security Checks

### Network Security
- ✅ Scans all open TCP/UDP ports using netstat or ss
- ✅ Identifies dangerous ports (FTP, Telnet, MySQL, PostgreSQL, Redis, MongoDB, etc.)
- ✅ Checks firewall status (ufw/iptables)
- ✅ Lists listening services with lsof or netstat

### Process Security
- ✅ Lists all running processes
- ✅ Detects suspicious processes (reverse shells: nc -l, ncat -l, socat, etc.)
- ✅ Finds processes running from /tmp/
- ✅ Checks for privileged/root processes
- ✅ Scans environment variables for secrets (AWS_ACCESS_KEY, API_KEY, PASSWORD, GITHUB_TOKEN, etc.)

### Filesystem Security
- ✅ Checks sensitive file permissions: ~/.ssh/id_rsa, ~/.aws/credentials, .env files
- ✅ Finds world-writable files in common directories
- ✅ Finds SUID/SGID files
- ✅ Detects exposed secret files

### Dependency Security
- ✅ Runs npm audit if package.json exists
- ✅ Parses and reports vulnerabilities
- ✅ Shows vulnerability severity breakdown

### Configuration Security
- ✅ Analyzes SSH configuration for security issues
- ✅ Scans configuration files for hardcoded secrets

### Container Security
- ✅ Lists all Docker containers
- ✅ Detects privileged containers
- ✅ Identifies exposed dangerous ports

## Development

### Project Structure

```
vigil-mcp/
├── src/
│   ├── cli.ts              # CLI entry point
│   ├── index.ts            # MCP server entry point
│   ├── crypto/
│   │   └── keys.ts         # Cryptographic signing
│   ├── scanners/
│   │   ├── index.ts        # Main scanner orchestrator
│   │   ├── network.ts      # Network security scanner
│   │   ├── process.ts      # Process security scanner
│   │   ├── filesystem.ts   # Filesystem security scanner
│   │   ├── dependencies.ts # Dependency vulnerability scanner
│   │   ├── configuration.ts # Config security scanner
│   │   └── containers.ts   # Container security scanner
│   └── utils/
│       └── formatter.ts    # Report formatting
├── build/                  # Compiled JavaScript
└── package.json
```

### Build Commands

```bash
# Build TypeScript to JavaScript
npm run build

# Run MCP server
npm start

# Build and run MCP server
npm run dev
```

### Technologies

- **TypeScript** - Type-safe development
- **Node.js** - Runtime environment
- **Model Context Protocol SDK** - AI integration
- **Commander.js** - CLI interface
- **Chalk** - Terminal formatting
- **Zod** - Schema validation
- **Ed25519** - Cryptographic signatures
- **SHA-256** - Secure hashing

## Architecture

**Vigil** is a dual-purpose security tool:

1. **CLI Scanner**: Standalone command-line tool for comprehensive local security auditing
2. **MCP Server**: Exposes security scanning capabilities to AI assistants via Model Context Protocol

The tool uses a modular scanner design where each security domain (network, processes, filesystem, etc.) is a separate module. All scans run in parallel for optimal performance, and results are aggregated into a comprehensive report with risk assessment.

## Output Example

```
🔍 Starting Vigil Security Scan...

✅ Report cryptographically signed

═══════════════════════════════════════════════════════════
                    SECURITY SCAN REPORT                    
═══════════════════════════════════════════════════════════

SUMMARY
  Risk Level: MEDIUM
  Total Issues: 12
  Critical: 0 | High: 3 | Medium: 7 | Low: 2

─────────────────────────────────────────────────────────────
                  CRYPTOGRAPHIC SIGNATURE                     
─────────────────────────────────────────────────────────────
Algorithm: Ed25519
Hash (SHA-256): a3f2b1c8d4e5f6a7b8c9d0e1f2a3b4c5...
Signature: x9y8z7w6v5u4t3s2r1q0p9o8n7m6l5k4...
Public Key Location: ~/.vigil/keys/public.pem

📄 Full report (JSON) saved to: report.json
```

## License

MIT

## Author

Vigil Security Team
