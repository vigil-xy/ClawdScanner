import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

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
        description: "Run Vigil security scan on host or repository",
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

  if (name === "vigil.scan") {
    const { target, repo_url, dry_run = true } = args as {
      target: "host" | "repo";
      repo_url?: string;
      dry_run?: boolean;
    };

    const cmdArgs: string[] = [];

    if (target === "host") {
      cmdArgs.push("scan");
      if (dry_run) cmdArgs.push("--dry-run");
    }

    if (target === "repo" && repo_url) {
      cmdArgs.push("scan", "--repo", repo_url);
    }

    try {
      const { stdout } = await execFileAsync("vigil-scan", cmdArgs);

      return {
        content: [
          {
            type: "text",
            text: stdout,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error running vigil-scan: ${error.message}`,
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
      const { stdout } = await execFileAsync("python3", [
        "scripts/sign_proof.py",
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
      return {
        content: [
          {
            type: "text",
            text: `Error signing proof: ${error.message}`,
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
