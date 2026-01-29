# Production Backend Audit Report
**Repository:** vigil-mcp  
**Date:** 2026-01-29  
**Status:** ⚠️ Functional but incomplete

---

## Executive Summary

This repository implements an MCP (Model Context Protocol) server that bridges AI assistants to external security tools. After thorough analysis, the repository is **functionally correct but NOT directly deployable on Fly.io** due to its architectural design as a stdio-based MCP server rather than an HTTP service.

---

## A. FUNCTIONAL COMPLETENESS

### 1. Does vigil-mcp actually invoke vigil-xy/scan at runtime?
**Answer: YES**

**Evidence:**
- `src/index.ts` Line 129: `await execFileAsync("vigil-scan", cmdArgs)`
- Calls the external `vigil-scan` binary with proper arguments
- For host scans: `vigil-scan scan [--dry-run]`
- For repo scans: `vigil-scan scan --repo <url> [--dry-run]`
- Returns actual stdout from the binary
- Properly handles `ENOENT` error when binary is missing (Line 140-149)

**Verdict:** ✅ Real integration, not mocked

### 2. Does it correctly consume scan output as structured data?
**Answer: PARTIAL**

**Current State:**
- Line 132-137: Returns raw stdout from `vigil-scan` as plain text
- No parsing of scan output
- No structured data extraction (files, ports, findings)
- Downstream consumers receive unstructured text

**Missing Integration:**
- No JSON parsing of scan results
- No typed interfaces for scan findings
- No extraction of specific fields (open_ports, file_findings, system_issues)

**Files Requiring Changes:**
- `src/index.ts` - Add scan output parsing
- Need to add TypeScript interfaces for scan result structure

**Verdict:** ❌ Returns raw text, not structured data

### 3. Does it invoke vigil-cryptographicsign for real signatures?
**Answer: YES**

**Evidence:**
- `src/index.ts` Line 174-177: Calls Python script with payload
- `scripts/sign_proof.py` Line 11-12: Imports and calls `vigil_cryptographicsign.sign_action(payload)`
- Returns actual cryptographic proof from the external library
- Proper error handling for missing Python or package (Line 188-197)

**Verdict:** ✅ Real cryptographic signatures, not simulated

### 4. Are scan results and signatures cryptographically bound?
**Answer: NO**

**Current State:**
- `vigil.scan` returns scan output
- `vigil.proof.sign` signs arbitrary payloads
- No automatic binding between scan results and signatures
- No tamper-evident chain

**Missing Integration:**
- No automatic signing of scan results
- No combined tool that returns signed scan data
- Manual workflow required: user must call scan, then manually call sign with scan data

**What Needs to Be Added:**
- New MCP tool: `vigil.scan.signed` that:
  1. Executes scan
  2. Parses results as structured data
  3. Cryptographically signs the results
  4. Returns combined signed payload
- Alternatively: Modify `vigil.scan` to optionally sign results

**Files Requiring Changes:**
- `src/index.ts` - Add combined scan+sign functionality

**Verdict:** ❌ Not cryptographically bound

### 5. Are findings derived from real execution?
**Answer: YES (when binary is available)**

**Evidence:**
- Calls external `vigil-scan` binary which performs actual system scans
- No mock data or hardcoded results in the code
- Proper error propagation when scan fails

**Important Note:**
- The `vigil-scan` binary itself is not included in this repository
- Must be installed separately from https://releases.vigil.ai/
- Without the binary, tool returns "command not found" error

**Verdict:** ✅ Real execution (assuming binary is installed)

---

## B. MCP CORRECTNESS

### 1. Are all MCP tools wired to real implementations?
**Answer: YES**

**Evidence:**
- `vigil.scan` (Line 85-164): Calls `vigil-scan` binary
- `vigil.proof.sign` (Line 166-212): Calls Python signing script
- No placeholder implementations found

**Verdict:** ✅ All tools have real implementations

### 2. Do any tools return placeholder/demo/hard-coded data?
**Answer: NO**

**Evidence:**
- All tools invoke external processes
- Return values come from external commands/scripts
- No hardcoded responses in the code

**Verdict:** ✅ No placeholder data

### 3. Do errors from scan/signing propagate correctly?
**Answer: YES**

**Evidence:**
- Line 140-149: Handles `vigil-scan` errors with proper `isError: true`
- Line 151-162: Returns stderr and error messages
- Line 188-197: Handles Python signing errors
- Line 199-210: Returns signing errors with stderr

**Verdict:** ✅ Proper error propagation

---

## C. FLY.IO DEPLOYMENT READINESS

### 1. Is there a valid Dockerfile?
**Answer: YES, but irrelevant for this architecture**

**Evidence:**
- `Dockerfile` exists and is well-structured
- Uses Node.js 22, builds TypeScript, removes dev dependencies
- Exposes port 3000 and runs `npm run start`

**Problem:**
The Dockerfile assumes this is an HTTP service, but it's not.

### 2. Non-interactive startup process?
**Answer: YES**

**Evidence:**
- `src/index.ts` Line 225-226: Connects to stdio transport and waits for messages
- No interactive prompts
- MCP server listens on stdin/stdout

**Verdict:** ✅ Non-interactive

### 3. Is there an HTTP server?
**Answer: NO - This is a stdio-based MCP server**

**Critical Finding:**
- Line 225: `new StdioServerTransport()` - Uses stdio, not HTTP
- Line 226: `await server.connect(transport)` - Connects to stdin/stdout
- MCP servers communicate via stdio by design (for Claude Desktop, Cursor, etc.)
- This is NOT an HTTP service and cannot handle web requests

**Verdict:** ❌ Not an HTTP service

### 4. Does it use process.env.PORT?
**Answer: NO, and it shouldn't**

**Evidence:**
- No HTTP server in the code
- No port binding
- Communicates via stdin/stdout only

**Verdict:** ⚠️ Not applicable for stdio-based service

### 5. Is this repo Fly-deployable by itself?
**Answer: NO**

**Why:**
- Fly.io expects HTTP services that bind to a port
- This is a stdio-based MCP server that reads from stdin and writes to stdout
- MCP servers are designed to be launched as subprocesses by MCP clients, not as standalone services
- The Dockerfile exposing port 3000 is misleading - the application doesn't listen on any port

**What wrapper/backend service is required:**

To deploy this on Fly.io, you would need:

1. **HTTP-to-MCP Bridge Server** that:
   - Accepts HTTP requests (REST API or WebSocket)
   - Spawns `vigil-mcp` as a subprocess
   - Routes HTTP requests to the subprocess's stdin
   - Returns subprocess's stdout as HTTP responses
   - Handles process lifecycle (spawn, restart, cleanup)

2. **Minimal Architecture:**
   ```
   [Client] --HTTP--> [Bridge Server on Fly.io] --stdio--> [vigil-mcp subprocess]
   ```

3. **Implementation needs:**
   - Express/Fastify HTTP server
   - Child process management
   - Request/response correlation (map HTTP requests to MCP messages)
   - Process pooling or per-request spawning
   - Proper signal handling and cleanup

**Verdict:** ❌ Not Fly-deployable without significant wrapper architecture

---

## D. SECURITY & HONESTY CHECK

### 1. Does the system make unsupported security claims?
**Answer: NO (mostly safe)**

**Evidence:**
- README states: "scan systems under attacker assumptions and produce tamper-evident, verifiable reports"
- However, "tamper-evident" claim is not currently true (see A.4 above)
- All other claims are accurate - it does invoke real scanning tools

**Issues Found:**
1. **README Line 3**: Claims "tamper-evident, verifiable reports"
   - Not currently true: scan results are not automatically signed
   - User must manually sign results in a separate step
   - No cryptographic binding ensures scan → sign chain

2. **No false compromise claims**: Code never claims compromise without evidence
3. **No false port/credential claims**: Depends on external scanner output

**Recommendations:**
1. Update README to clarify: "Can produce tamper-evident reports when scan results are signed using vigil.proof.sign"
2. Add example workflow showing how to create truly tamper-evident reports
3. Consider adding `vigil.scan.signed` tool for automatic signing

**Verdict:** ⚠️ One misleading claim about tamper-evidence

---

## E. FINAL VERDICT

### Status: ⚠️ **Functional but incomplete**

**What Works:**
- ✅ Real integration with vigil-scan binary
- ✅ Real cryptographic signing via vigil-cryptographicsign
- ✅ Proper MCP server implementation
- ✅ Clean error handling and propagation
- ✅ Non-interactive, stdio-based operation

**What's Missing:**
- ❌ Structured data parsing from scan results
- ❌ Cryptographic binding between scans and signatures
- ❌ HTTP server for Fly.io deployment
- ❌ Accurate documentation about tamper-evidence
- ❌ Combined scan+sign functionality

**Production Readiness Issues:**
1. Not directly deployable on Fly.io (by design - it's a stdio MCP server)
2. Scan results are unstructured text, not parsed data
3. No automatic cryptographic binding of scan results

---

## EXACT ACTIONS REQUIRED FOR PRODUCTION READINESS

### For Backend Functionality (Priority: HIGH)

**1. Add Structured Scan Output Parsing**
- File: `src/index.ts`
- Add TypeScript interfaces for scan results:
  ```typescript
  interface ScanResult {
    timestamp: string;
    target: string;
    findings: {
      open_ports?: Array<{port: number; service: string}>;
      file_findings?: Array<{path: string; issue: string}>;
      system_issues?: Array<{category: string; description: string}>;
    };
    summary: {
      risk_level: string;
      total_findings: number;
    };
  }
  ```
- Parse vigil-scan JSON output (if it outputs JSON) or implement text parser
- Return structured data instead of raw text

**2. Add Cryptographically Bound Scan Tool**
- File: `src/index.ts`
- Add new tool `vigil.scan.signed`:
  ```typescript
  {
    name: "vigil.scan.signed",
    description: "Run security scan and return cryptographically signed results",
    // ... same params as vigil.scan
  }
  ```
- Implementation:
  1. Execute scan
  2. Parse results to structured format
  3. Add timestamp and metadata
  4. Sign the structured results
  5. Return signed payload with signature proof
- This ensures tamper-evident reporting

**3. Update Documentation**
- File: `README.md`
- Clarify: "Produces tamper-evident reports when using vigil.scan.signed tool"
- Add workflow example showing scan → sign chain
- Document that this is a stdio MCP server, not an HTTP service

### For Fly.io Deployment (Priority: MEDIUM - Optional)

**If Fly.io deployment is desired, create new repository: `vigil-mcp-server`**

**4. Create HTTP Bridge Server**
- New repository structure:
  ```
  vigil-mcp-server/
  ├── src/
  │   └── server.ts         # HTTP bridge server
  ├── Dockerfile            # HTTP server Dockerfile
  ├── package.json
  └── fly.toml
  ```

**5. Implement Bridge Server (`src/server.ts`)**
  ```typescript
  import express from 'express';
  import { spawn } from 'child_process';
  
  const app = express();
  const PORT = process.env.PORT || 8080;
  
  app.post('/mcp/call', async (req, res) => {
    const mcpServer = spawn('vigil-mcp');
    // Route HTTP request to MCP stdin
    // Collect MCP stdout
    // Return as HTTP response
  });
  
  app.listen(PORT, () => {
    console.log(`MCP Bridge Server listening on ${PORT}`);
  });
  ```

**6. Update Dockerfile for Bridge Server**
  - Install vigil-mcp as dependency
  - Install vigil-scan binary
  - Install Python and vigil-cryptographicsign
  - Expose PORT and bind HTTP server
  - Use process.env.PORT properly

**7. Update fly.toml**
  - Point to bridge server
  - Configure http_service properly

### Security & Verification (Priority: HIGH)

**8. Add Integration Tests**
- Create `tests/` directory
- Test scan invocation with mocked binary
- Test signing with mocked Python script
- Test error conditions
- Test that results are properly structured

**9. Security Verification**
- Ensure no scan results are logged or cached
- Verify signatures include timestamp to prevent replay
- Add integrity checks for scan→sign chain
- Document security assumptions

### Documentation (Priority: HIGH)

**10. Add Architecture Documentation**
- Create `ARCHITECTURE.md`:
  - Explain stdio MCP server design
  - Document why Fly.io direct deployment isn't applicable
  - Provide bridge server architecture diagram
  - Explain security model and trust chain

**11. Update README.md**
- Remove misleading Fly.io references (or move to bridge server docs)
- Clarify deployment model: "MCP clients run this as subprocess"
- Add clear examples of structured data usage
- Document tamper-evident workflow

---

## RECOMMENDED IMMEDIATE CHANGES

The following changes should be made immediately:

### Change 1: Add Structured Scan Result Parsing
**Impact:** Enables downstream processing of scan data  
**Effort:** 2-4 hours  
**Priority:** HIGH

### Change 2: Add `vigil.scan.signed` Tool
**Impact:** Provides true tamper-evident reporting  
**Effort:** 1-2 hours  
**Priority:** HIGH

### Change 3: Update README for Accuracy
**Impact:** Prevents user confusion about capabilities  
**Effort:** 30 minutes  
**Priority:** HIGH

### Change 4: Add ARCHITECTURE.md
**Impact:** Clarifies deployment model and design decisions  
**Effort:** 1 hour  
**Priority:** MEDIUM

### Optional: Bridge Server for Fly.io
**Impact:** Enables Fly.io deployment  
**Effort:** 4-8 hours  
**Priority:** LOW (only if HTTP deployment is required)

---

## CONCLUSION

The vigil-mcp repository is **functionally sound** as an MCP server with real integrations to security tools. However:

1. **Not production-ready for Fly.io** - Wrong architectural pattern (stdio vs HTTP)
2. **Missing structured data handling** - Returns raw text instead of parsed objects
3. **Missing cryptographic binding** - No automatic scan→sign integration
4. **Documentation inaccuracies** - Claims about tamper-evidence are premature

**Recommended Path Forward:**
1. Implement structured scan parsing (2-4 hours)
2. Add signed scan tool (1-2 hours)
3. Update documentation (1 hour)
4. If Fly.io deployment is required, create separate bridge server project (8+ hours)

**Current Grade:** C+ (Functional core, missing production features)  
**With recommended changes:** A- (Production-ready for MCP use case)
