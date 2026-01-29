#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

// Type definitions for scan results
interface ScanResult {
  timestamp: string;
  target: string;
  findings: {
    open_ports?: Array<{ port: number; service: string; protocol: string }>;
    file_findings?: Array<{ path: string; issue: string; severity: string }>;
    system_issues?: Array<{ category: string; description: string; severity: string }>;
  };
  summary: {
    risk_level: string;
    total_findings: number;
  };
  raw_output: string;
}

// Parse scan output - attempts JSON parsing first, falls back to structured text
function parseScanOutput(stdout: string, target: string): ScanResult {
  const timestamp = new Date().toISOString();
  
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(stdout);
    return {
      timestamp,
      target,
      findings: parsed.findings || {},
      summary: parsed.summary || { risk_level: "unknown", total_findings: 0 },
      raw_output: stdout,
    };
  } catch (parseError) {
    // If not JSON, return structured format with raw output
    // This is expected if vigil-scan returns plain text format
    return {
      timestamp,
      target,
      findings: {},
      summary: {
        risk_level: "unknown",
        total_findings: 0,
      },
      raw_output: stdout,
    };
  }
}

const server = new Server(
  {
    name: "vigil-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handler for listing available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "vigil.scan",
        description: "Run Vigil security scan on host or repository (returns structured data)",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ["host", "repo"],
              description: "Target to scan: 'host' for local system or 'repo' for a repository",
            },
            repo_url: {
              type: "string",
              description: "Repository URL (required when target is 'repo')",
            },
            dry_run: {
              type: "boolean",
              description: "Run in dry-run mode without making changes",
              default: true,
            },
          },
          required: ["target"],
        },
      },
      {
        name: "vigil.scan.signed",
        description: "Run Vigil security scan and return cryptographically signed, tamper-evident results",
        inputSchema: {
          type: "object",
          properties: {
            target: {
              type: "string",
              enum: ["host", "repo"],
              description: "Target to scan: 'host' for local system or 'repo' for a repository",
            },
            repo_url: {
              type: "string",
              description: "Repository URL (required when target is 'repo')",
            },
            dry_run: {
              type: "boolean",
              description: "Run in dry-run mode without making changes",
              default: true,
            },
          },
          required: ["target"],
        },
      },
      {
        name: "vigil.proof.sign",
        description: "Sign action payload with cryptographic proof",
        inputSchema: {
          type: "object",
          properties: {
            payload: {
              type: "object",
              description: "The payload to sign",
            },
            purpose: {
              type: "string",
              description: "Purpose of the signature",
            },
          },
          required: ["payload", "purpose"],
        },
      },
    ],
  };
});

// Handler for calling tools
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "vigil.scan" || name === "vigil.scan.signed") {
    const { target, repo_url, dry_run = true } = args as {
      target: "host" | "repo";
      repo_url?: string;
      dry_run?: boolean;
    };

    // Validate target parameter
    if (target !== "host" && target !== "repo") {
      return {
        content: [
          {
            type: "text",
            text: `Error: target must be either "host" or "repo", got "${target}"`,
          },
        ],
        isError: true,
      };
    }

    const cmdArgs: string[] = [];

    if (target === "host") {
      cmdArgs.push("scan");
      if (dry_run) cmdArgs.push("--dry-run");
    }

    if (target === "repo") {
      if (!repo_url) {
        return {
          content: [
            {
              type: "text",
              text: "Error: repo_url is required when target is 'repo'",
            },
          ],
          isError: true,
        };
      }
      cmdArgs.push("scan", "--repo", repo_url);
      if (dry_run) cmdArgs.push("--dry-run");
    }

    try {
      const { stdout, stderr } = await execFileAsync("vigil-scan", cmdArgs);
      const scanResult = parseScanOutput(stdout, target === "host" ? "localhost" : repo_url || "unknown");

      // If this is a signed scan, sign the results
      if (name === "vigil.scan.signed") {
        try {
          const scriptPath = join(projectRoot, "scripts", "sign_proof.py");
          const { stdout: signedOutput } = await execFileAsync("python3", [
            scriptPath,
            JSON.stringify({ 
              payload: scanResult, 
              purpose: "scan_verification",
              scan_metadata: {
                tool: "vigil-scan",
                target,
              }
            }),
          ]);

          const signedResult = {
            scan_result: scanResult,
            cryptographic_proof: JSON.parse(signedOutput),
            is_tamper_evident: true,
          };

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(signedResult, null, 2),
              },
            ],
          };
        } catch (signError: any) {
          // Signing failed but scan succeeded - return scan results with warning
          const partialResult = {
            scan_result: scanResult,
            signing_error: signError.message,
            is_tamper_evident: false,
            warning: "Scan completed successfully but cryptographic signing failed. Results are not tamper-evident.",
          };
          
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(partialResult, null, 2),
              },
            ],
            // Not marking as error since scan succeeded
          };
        }
      }

      // Regular scan without signing
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(scanResult, null, 2),
          },
        ],
      };
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return {
          content: [
            {
              type: "text",
              text: "Error: vigil-scan command not found. Please install vigil-scan: https://releases.vigil.ai/",
            },
          ],
          isError: true,
        };
      }
      const errorMessage = error.stderr
        ? `Error running vigil-scan: ${error.message}\nStderr: ${error.stderr}`
        : `Error running vigil-scan: ${error.message}`;
      return {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  if (name === "vigil.proof.sign") {
    const { payload, purpose } = args as {
      payload: any;
      purpose: string;
    };

    try {
      const scriptPath = join(projectRoot, "scripts", "sign_proof.py");
      const { stdout, stderr } = await execFileAsync("python3", [
        scriptPath,
        JSON.stringify({ payload, purpose }),
      ]);

      return {
        content: [
          {
            type: "text",
            text: stdout,
          },
        ],
      };
    } catch (error: any) {
      if (error.code === "ENOENT") {
        return {
          content: [
            {
              type: "text",
              text: "Error: python3 not found. Please install Python 3.",
            },
          ],
          isError: true,
        };
      }
      const errorMessage = error.stderr
        ? `Error signing proof: ${error.message}\nStderr: ${error.stderr}`
        : `Error signing proof: ${error.message}`;
      return {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        isError: true,
      };
    }
  }

  return {
    content: [
      {
        type: "text",
        text: `Unknown tool: ${name}`,
      },
    ],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
