#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// Configuration types
const ReplicaLoadSchema = z.object({
  cpu: z.number().min(0).describe("CPU load from 0.00 to 1.00 (can exceed 1.00 if overloaded)"),
  ram: z.number().min(0).max(1).describe("RAM load from 0.00 to 1.00"),
});

const ReportReplicaArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server (e.g., https://status.example.com)"),
  reporterToken: z.string().min(1).describe("Reporter token for authentication"),
  probeId: z.string().min(1).describe("The parent probe identifier"),
  nodeId: z.string().min(1).describe("The parent node identifier"),
  replicaId: z.string().min(1).describe("The replica unique identifier (e.g., server LAN IP)"),
  interval: z.number().int().min(1).max(86400).describe("The push interval in seconds (1-86400)"),
  load: ReplicaLoadSchema,
});

const FlushReplicaArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  reporterToken: z.string().min(1).describe("Reporter token for authentication"),
  probeId: z.string().min(1).describe("The parent probe identifier"),
  nodeId: z.string().min(1).describe("The parent node identifier"),
  replicaId: z.string().min(1).describe("The replica unique identifier"),
});

const ListAnnouncementsArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  managerToken: z.string().min(1).describe("Manager token for authentication"),
});

const InsertAnnouncementArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  managerToken: z.string().min(1).describe("Manager token for authentication"),
  title: z.string().min(1).describe("The title for the announcement"),
  text: z.string().min(1).describe("The description text for the announcement"),
});

const RetractAnnouncementArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  managerToken: z.string().min(1).describe("Manager token for authentication"),
  announcementId: z.string().min(1).describe("The announcement identifier to be removed"),
});

const ListProberAlertsArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  managerToken: z.string().min(1).describe("Manager token for authentication"),
});

const GetIgnoreRulesArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  managerToken: z.string().min(1).describe("Manager token for authentication"),
});

const UpdateIgnoreRulesArgsSchema = z.object({
  vigilUrl: z.string().url().describe("Base URL of the Vigil server"),
  managerToken: z.string().min(1).describe("Manager token for authentication"),
  remindersSeconds: z.number().int().min(0).max(604800).describe("Seconds during which downtime reminders should be skipped (0-604800)"),
});

// Helper function to normalize URL by removing trailing slash
function normalizeUrl(url: string): string {
  return url.replace(/\/$/, '');
}

// Helper function to make HTTP requests
async function makeRequest(
  url: string,
  method: string,
  token: string,
  body?: any
): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`:${token}`).toString("base64")}`,
  };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json; charset=utf-8";
  }

  // Create abort controller for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseText = await response.text();
    
    if (!response.ok) {
      // Don't include full response in error to avoid exposing sensitive data
      throw new Error(
        `HTTP ${response.status}: ${response.statusText}`
      );
    }

    // Try to parse JSON response, or return text if not JSON
    try {
      return responseText ? JSON.parse(responseText) : { success: true };
    } catch {
      return { success: true, response: responseText };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timeout: Vigil server did not respond within 30 seconds');
    }
    throw error;
  }
}

// Initialize MCP Server
const server = new Server(
  {
    name: "vigil-mcp",
    version: "1.0.0",
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

// Define tools
const TOOLS: Tool[] = [
  {
    name: "report_replica",
    description:
      "Report a replica's health status to Vigil. Used for push-based monitoring where your service actively reports its health metrics (CPU and RAM load) to Vigil.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server (e.g., https://status.example.com)",
        },
        reporterToken: {
          type: "string",
          description: "Reporter token for authentication",
        },
        probeId: {
          type: "string",
          description: "The parent probe identifier",
        },
        nodeId: {
          type: "string",
          description: "The parent node identifier",
        },
        replicaId: {
          type: "string",
          description: "The replica unique identifier (e.g., server LAN IP)",
        },
        interval: {
          type: "number",
          description: "The push interval in seconds",
        },
        load: {
          type: "object",
          properties: {
            cpu: {
              type: "number",
              description: "CPU load from 0.00 to 1.00 (can exceed 1.00 if overloaded)",
            },
            ram: {
              type: "number",
              description: "RAM load from 0.00 to 1.00",
            },
          },
          required: ["cpu", "ram"],
        },
      },
      required: [
        "vigilUrl",
        "reporterToken",
        "probeId",
        "nodeId",
        "replicaId",
        "interval",
        "load",
      ],
    },
  },
  {
    name: "flush_replica",
    description:
      "Remove a replica from Vigil monitoring. This should be called when a replica is being decommissioned or should no longer be monitored.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        reporterToken: {
          type: "string",
          description: "Reporter token for authentication",
        },
        probeId: {
          type: "string",
          description: "The parent probe identifier",
        },
        nodeId: {
          type: "string",
          description: "The parent node identifier",
        },
        replicaId: {
          type: "string",
          description: "The replica unique identifier",
        },
      },
      required: ["vigilUrl", "reporterToken", "probeId", "nodeId", "replicaId"],
    },
  },
  {
    name: "list_announcements",
    description:
      "List all published announcements on the Vigil status page. Announcements are used to communicate planned maintenance or ongoing incidents to users.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        managerToken: {
          type: "string",
          description: "Manager token for authentication",
        },
      },
      required: ["vigilUrl", "managerToken"],
    },
  },
  {
    name: "insert_announcement",
    description:
      "Create and publish a new announcement on the Vigil status page. Use this to inform users about planned maintenance, incidents, or important updates.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        managerToken: {
          type: "string",
          description: "Manager token for authentication",
        },
        title: {
          type: "string",
          description: "The title for the announcement",
        },
        text: {
          type: "string",
          description: "The description text for the announcement (can be multi-line)",
        },
      },
      required: ["vigilUrl", "managerToken", "title", "text"],
    },
  },
  {
    name: "retract_announcement",
    description:
      "Remove a published announcement from the Vigil status page. Use this when an announcement is no longer relevant.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        managerToken: {
          type: "string",
          description: "Manager token for authentication",
        },
        announcementId: {
          type: "string",
          description: "The announcement identifier to be removed",
        },
      },
      required: ["vigilUrl", "managerToken", "announcementId"],
    },
  },
  {
    name: "list_prober_alerts",
    description:
      "List all current prober alerts. Alerts are triggered when monitored services fail health checks or become unreachable.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        managerToken: {
          type: "string",
          description: "Manager token for authentication",
        },
      },
      required: ["vigilUrl", "managerToken"],
    },
  },
  {
    name: "get_alert_ignore_rules",
    description:
      "Get the current ignore rules for prober alerts. These rules control when downtime reminder notifications should be suppressed.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        managerToken: {
          type: "string",
          description: "Manager token for authentication",
        },
      },
      required: ["vigilUrl", "managerToken"],
    },
  },
  {
    name: "update_alert_ignore_rules",
    description:
      "Update ignore rules for prober alerts. This configures how long downtime reminder notifications should be suppressed.",
    inputSchema: {
      type: "object",
      properties: {
        vigilUrl: {
          type: "string",
          description: "Base URL of the Vigil server",
        },
        managerToken: {
          type: "string",
          description: "Manager token for authentication",
        },
        remindersSeconds: {
          type: "number",
          description: "Seconds during which downtime reminders should be skipped",
        },
      },
      required: ["vigilUrl", "managerToken", "remindersSeconds"],
    },
  },
];

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: TOOLS };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "report_replica": {
        const validated = ReportReplicaArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/reporter/${validated.probeId}/${validated.nodeId}/`;
        const body = {
          replica: validated.replicaId,
          interval: validated.interval,
          load: validated.load,
        };
        const result = await makeRequest(url, "POST", validated.reporterToken, body);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Replica reported successfully",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "flush_replica": {
        const validated = FlushReplicaArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/reporter/${validated.probeId}/${validated.nodeId}/${validated.replicaId}/`;
        const result = await makeRequest(url, "DELETE", validated.reporterToken);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Replica flushed successfully",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_announcements": {
        const validated = ListAnnouncementsArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/manager/announcements/`;
        const result = await makeRequest(url, "GET", validated.managerToken);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "insert_announcement": {
        const validated = InsertAnnouncementArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/manager/announcement/`;
        const body = {
          title: validated.title,
          text: validated.text,
        };
        const result = await makeRequest(url, "POST", validated.managerToken, body);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Announcement created successfully",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "retract_announcement": {
        const validated = RetractAnnouncementArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/manager/announcement/${validated.announcementId}/`;
        const result = await makeRequest(url, "DELETE", validated.managerToken);
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

    if (target === "repo") {
      if (!repo_url) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Announcement retracted successfully",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "list_prober_alerts": {
        const validated = ListProberAlertsArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/manager/prober/alerts/`;
        const result = await makeRequest(url, "GET", validated.managerToken);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_alert_ignore_rules": {
        const validated = GetIgnoreRulesArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/manager/prober/alerts/ignored/`;
        const result = await makeRequest(url, "GET", validated.managerToken);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "update_alert_ignore_rules": {
        const validated = UpdateIgnoreRulesArgsSchema.parse(args);
        const baseUrl = normalizeUrl(validated.vigilUrl);
        const url = `${baseUrl}/manager/prober/alerts/ignored/`;
        const body = {
          reminders_seconds: validated.remindersSeconds,
        };
        const result = await makeRequest(url, "PUT", validated.managerToken, body);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: "Alert ignore rules updated successfully",
                  result,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(
        `Invalid arguments for tool '${name}': ${error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
      );
    }
    if (error instanceof Error) {
      throw new Error(`Error in tool '${name}': ${error.message}`);
    }
    throw error;
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Vigil MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
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

      return {
        content: [
          {
            type: "text",
            text: stdout,
          },
        ],
      };
    } catch (error: any) {
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
