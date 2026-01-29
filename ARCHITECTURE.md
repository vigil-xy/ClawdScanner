# Architecture Documentation

## Overview

vigil-mcp is a Model Context Protocol (MCP) server that provides security scanning and cryptographic signing capabilities to AI assistants. It acts as a bridge between MCP clients and external security tools.

## Design Principles

### 1. MCP Protocol - Stdio Communication

This server implements the MCP protocol over stdio (standard input/output):

```
┌─────────────────┐
│   MCP Client    │ (Claude Desktop, Cursor, etc.)
│  (AI Assistant) │
└────────┬────────┘
         │ stdio
         │ (JSON-RPC over stdin/stdout)
         │
┌────────▼────────┐
│   vigil-mcp     │
│  (This Server)  │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│vigil-  │ │ python3  │
│scan    │ │ + crypto │
└────────┘ └──────────┘
```

**Why stdio?**
- MCP standard: Designed for AI assistant integration
- Process isolation: Each session gets its own process
- Security: No network exposure by default
- Simplicity: No HTTP routing, auth, or CORS concerns

### 2. External Tool Integration

The server does NOT implement scanning or signing logic itself. Instead, it invokes:

1. **vigil-scan** - External binary for security scanning
   - Installed separately from https://releases.vigil.ai/
   - Executes actual port scans, file analysis, system checks
   - Returns findings as text or JSON

2. **vigil-cryptographicsign** - Python package for signing
   - Installed via pip: `pip3 install vigil-cryptographicsign`
   - Provides cryptographic signing functions
   - Returns signed proofs with timestamps and metadata

**Why external tools?**
- Separation of concerns: MCP server is just an integration layer
- Independent versioning: Tools can be updated separately
- Language flexibility: Best tool for each job (Go for scanning, Python for crypto)
- Reusability: Tools can be used standalone or via MCP

### 3. No Mock Data

All functionality depends on real external executables:

```typescript
// Real execution
await execFileAsync("vigil-scan", ["scan", "--dry-run"]);

// Real signing
await execFileAsync("python3", ["scripts/sign_proof.py", payload]);
```

If dependencies are missing:
- Returns clear error: "vigil-scan command not found"
- Provides installation instructions
- Never returns fake/placeholder data

## Tool Implementations

### vigil.scan

**Purpose:** Run security scans and return structured results

**Implementation:**
1. Validate input (target: host or repo)
2. Build command arguments
3. Execute `vigil-scan` binary
4. Parse output (JSON if available, fallback to raw text)
5. Return structured ScanResult object

**Output Structure:**
```typescript
{
  timestamp: string;           // ISO 8601
  target: string;              // "localhost" or repo URL
  findings: {
    open_ports?: Array<{       // TCP/UDP ports found
      port: number;
      service: string;
      protocol: string;
    }>;
    file_findings?: Array<{    // File system issues
      path: string;
      issue: string;
      severity: string;
    }>;
    system_issues?: Array<{    // OS-level problems
      category: string;
      description: string;
      severity: string;
    }>;
  };
  summary: {
    risk_level: string;        // "low", "medium", "high", "critical"
    total_findings: number;
  };
  raw_output: string;          // Original scan output
}
```

### vigil.scan.signed

**Purpose:** Provide tamper-evident scan reports

**Implementation:**
1. Execute vigil.scan (steps 1-5 above)
2. Take scan results as payload
3. Add metadata (tool name, timestamp, target)
4. Execute Python signing script
5. Parse cryptographic proof
6. Return combined object with scan + signature

**Output Structure:**
```typescript
{
  scan_result: ScanResult;           // Full scan data
  cryptographic_proof: {
    signature: string;               // Cryptographic signature
    timestamp: string;               // Signature timestamp
    algorithm: string;               // Signing algorithm used
    metadata: object;                // Additional proof data
  };
  is_tamper_evident: true;           // Always true for this tool
}
```

**Tamper Evidence:**
- Signature covers entire scan_result
- Timestamp proves when signature was created
- Any modification to scan_result breaks signature verification
- Proof can be verified independently

### vigil.proof.sign

**Purpose:** Sign arbitrary payloads

**Implementation:**
1. Accept any JSON payload + purpose string
2. Execute Python signing script
3. Return cryptographic proof

**Use Cases:**
- Sign scan results manually
- Sign action logs
- Create verifiable audit trails
- Timestamp important events

## Error Handling

### Missing Dependencies

If `vigil-scan` is not installed:
```json
{
  "error": "vigil-scan command not found. Please install vigil-scan: https://releases.vigil.ai/",
  "isError": true
}
```

If `vigil-cryptographicsign` is not installed:
```json
{
  "error": "Failed to import vigil_cryptographicsign: No module named 'vigil_cryptographicsign'",
  "isError": true
}
```

### Scan Failures

If scan execution fails:
```json
{
  "error": "Error running vigil-scan: <message>\nStderr: <stderr>",
  "isError": true
}
```

### Signing Failures in Combined Tool

If scan succeeds but signing fails in `vigil.scan.signed`:
```json
{
  "error": "Scan completed but signing failed: <message>\n\nScan results:\n<scan_json>",
  "isError": true
}
```

This ensures scan data is not lost even if signing fails.

## Deployment Models

### Model 1: Direct MCP Client (Recommended)

```
User → Claude Desktop → vigil-mcp (subprocess) → External Tools
```

**Configuration:**
```json
{
  "mcpServers": {
    "vigil": {
      "command": "node",
      "args": ["/path/to/vigil-mcp/build/index.js"]
    }
  }
}
```

**Pros:**
- Simple, standard MCP deployment
- No network exposure
- Process isolation
- Works offline (except for repo scans)

**Cons:**
- Cannot be accessed remotely
- Requires local tool installation

### Model 2: HTTP Bridge Server (Advanced)

For Fly.io or cloud deployment:

```
HTTP Client → Bridge Server → vigil-mcp (subprocess) → External Tools
```

**Bridge Server Requirements:**
- Accept HTTP POST requests
- Spawn vigil-mcp subprocess per request (or use pooling)
- Route HTTP body to subprocess stdin
- Stream subprocess stdout back as HTTP response
- Handle timeouts and process cleanup

**Example Bridge Server (Conceptual):**
```typescript
import express from 'express';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

app.post('/mcp/call', async (req, res) => {
  const mcp = spawn('node', ['build/index.js']);
  
  // Write request to stdin
  mcp.stdin.write(JSON.stringify(req.body));
  mcp.stdin.end();
  
  // Collect stdout
  let output = '';
  mcp.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  mcp.on('close', () => {
    res.json(JSON.parse(output));
  });
});

app.listen(process.env.PORT || 8080);
```

**Pros:**
- Remote access
- Can be deployed on Fly.io, AWS, GCP, etc.
- Centralized installation

**Cons:**
- More complex
- Requires authentication/authorization
- Network latency
- Security considerations (exposing scan capabilities)

### Model 3: Containerized MCP (Docker)

```
User → MCP Client → Docker Container → vigil-mcp → External Tools
```

**Dockerfile considerations:**
- Install Node.js runtime
- Install Python 3 and vigil-cryptographicsign
- Download and install vigil-scan binary
- Copy vigil-mcp build artifacts
- Set up stdio communication

**Current Dockerfile Status:**
The existing Dockerfile is configured for HTTP (exposes port 3000) but the application uses stdio. To fix:

1. Remove `EXPOSE 3000` (not needed for stdio)
2. Ensure vigil-scan binary is installed in container
3. Ensure Python and crypto package are installed
4. Use `CMD ["node", "build/index.js"]` to run MCP server

## Security Considerations

### Trust Model

1. **Local Execution:** vigil-mcp runs with the same privileges as the MCP client
2. **Tool Execution:** vigil-scan and python3 run as subprocesses with same privileges
3. **No Privilege Escalation:** Tools should not require root/admin access for basic scans
4. **Scan Privileges:** Host scans may miss system-level issues without elevated privileges

### Data Handling

1. **No Logging:** Scan results are not logged by vigil-mcp
2. **No Caching:** Each scan is fresh, no stored results
3. **No Network:** No network calls except by external tools (repo scans)
4. **Ephemeral:** Results exist only in client memory after return

### Signature Verification

1. **Trust Python Package:** Assumes vigil-cryptographicsign is correct
2. **No Built-in Verification:** MCP server does not verify signatures
3. **External Verification:** Signatures can be verified using the crypto package
4. **Timestamp Trust:** Relies on system clock for timestamps

### Input Validation

1. **Target Validation:** Checks target is "host" or "repo"
2. **URL Validation:** Minimal validation of repo_url (external tool validates)
3. **Payload Sanitization:** JSON payloads are passed to external tools as-is
4. **Command Injection Protection:** Uses execFile (not shell) to prevent injection

## Performance Characteristics

### Scan Performance

- **Host Scan:** Depends on vigil-scan implementation (typically 5-30 seconds)
- **Repo Scan:** Depends on repo size and network speed (typically 10-60 seconds)
- **Dry Run:** Usually faster (no actual changes)

### Signing Performance

- **Typical:** < 1 second
- **Depends On:** Algorithm used by vigil-cryptographicsign

### Combined Scan+Sign

- **Total Time:** scan_time + sign_time + ~100ms overhead
- **No Parallelization:** Sequential execution (scan then sign)

### Resource Usage

- **Memory:** Minimal (< 50MB for MCP server, depends on scan tool)
- **CPU:** Low (mostly waiting for external processes)
- **Disk:** None (no file writes)
- **Network:** Only for repo scans

## Future Enhancements

### Potential Improvements

1. **Streaming Results:** Stream scan output as it's generated
2. **Parallel Scanning:** Multiple targets simultaneously
3. **Result Caching:** Optional caching with TTL
4. **Signature Verification:** Built-in signature validation
5. **Tool Version Check:** Verify compatible tool versions
6. **Progress Updates:** Report scan progress for long operations
7. **Cancellation:** Allow cancelling long-running scans
8. **Configuration:** Support for config file (scan options, timeouts)

### Not Planned

1. **HTTP Server:** Use bridge server if needed
2. **Authentication:** MCP clients handle auth
3. **Rate Limiting:** MCP clients control rate
4. **Database:** Results are ephemeral by design
5. **GUI:** This is a backend service

## Comparison: vigil-mcp vs HTTP API

| Feature | vigil-mcp (MCP) | HTTP API |
|---------|----------------|----------|
| Protocol | stdio (JSON-RPC) | HTTP REST |
| Use Case | AI assistant integration | Web/mobile apps |
| Network | Local only (by default) | Remote access |
| Authentication | OS-level (process owner) | API keys, OAuth |
| State | Stateless per invocation | Can maintain sessions |
| Deployment | Subprocess | Server process |
| Scaling | Process per client | Horizontal scaling |
| Latency | ~10ms overhead | ~50-200ms network |
| Security | Process isolation | Network security |
| Tool Updates | Local installation | Centralized updates |

## Conclusion

vigil-mcp is purpose-built for MCP clients and AI assistant integration. It excels at:

- ✅ Providing structured security scan data
- ✅ Cryptographic signing and tamper-evidence
- ✅ Real tool integration (no mocks)
- ✅ Clean error handling
- ✅ MCP protocol compliance

It is NOT designed for:

- ❌ Direct HTTP deployment
- ❌ Standalone web service
- ❌ Multi-tenant SaaS
- ❌ Public API exposure

For HTTP deployment, implement a bridge server. For MCP use cases, use as-is.
