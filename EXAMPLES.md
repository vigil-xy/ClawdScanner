# Example Usage

This document provides practical examples of using each Vigil MCP tool.

## Prerequisites

- A running Vigil server instance
- Valid reporter token (for Reporter API tools)
- Valid manager token (for Manager API tools)
- Your Vigil server URL (e.g., `https://status.example.com`)

## Reporter API Examples

### Report Replica Health

Reports the health status of a service replica to Vigil.

**Example:**
```json
{
  "vigilUrl": "https://status.example.com",
  "reporterToken": "your_reporter_token_here",
  "probeId": "web",
  "nodeId": "api-server",
  "replicaId": "192.168.1.100",
  "interval": 30,
  "load": {
    "cpu": 0.30,
    "ram": 0.80
  }
}
```

**What it does:** Informs Vigil that replica `192.168.1.100` of the `api-server` node in the `web` probe is healthy with 30% CPU load and 80% RAM usage. Reports will be sent every 30 seconds.

### Flush Replica

Removes a replica from Vigil monitoring (e.g., when decommissioning a server).

**Example:**
```json
{
  "vigilUrl": "https://status.example.com",
  "reporterToken": "your_reporter_token_here",
  "probeId": "web",
  "nodeId": "api-server",
  "replicaId": "192.168.1.100"
}
```

**What it does:** Removes replica `192.168.1.100` from monitoring. Use this when shutting down or removing a server.

## Manager API Examples

### List Announcements

Retrieves all published announcements from the status page.

**Example:**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here"
}
```

**Response example:**
```json
[
  {
    "id": "announcement-123",
    "title": "Scheduled Maintenance",
    "text": "We will be performing maintenance on Sunday at 2 AM UTC.",
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

### Insert Announcement

Creates a new announcement on the status page.

**Example (Scheduled Maintenance):**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here",
  "title": "Scheduled Maintenance",
  "text": "We will be performing system maintenance on Sunday, January 21st at 2:00 AM UTC. Expected downtime: 30 minutes.\n\nDuring this time, all services will be temporarily unavailable.\n\nWe apologize for any inconvenience."
}
```

**Example (Incident Update):**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here",
  "title": "Service Degradation - API",
  "text": "We are currently investigating reports of slow API response times. Our team is working on a resolution.\n\nStatus updates will be posted here as we learn more."
}
```

### Retract Announcement

Removes an announcement from the status page.

**Example:**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here",
  "announcementId": "announcement-123"
}
```

**What it does:** Removes the announcement with ID `announcement-123`. The ID is obtained from `list_announcements`.

### List Prober Alerts

Retrieves all current alerts triggered by Vigil's probes.

**Example:**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here"
}
```

**Response example:**
```json
[
  {
    "probe": "web",
    "node": "api-server",
    "status": "dead",
    "last_check": "2024-01-15T10:30:00Z",
    "message": "Connection refused"
  }
]
```

### Get Alert Ignore Rules

Retrieves the current configuration for alert reminder suppression.

**Example:**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here"
}
```

**Response example:**
```json
{
  "reminders_seconds": 600
}
```

### Update Alert Ignore Rules

Configures how long to suppress downtime reminder notifications.

**Example (Suppress for 10 minutes):**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here",
  "remindersSeconds": 600
}
```

**Example (Suppress for 1 hour):**
```json
{
  "vigilUrl": "https://status.example.com",
  "managerToken": "your_manager_token_here",
  "remindersSeconds": 3600
}
```

**What it does:** Prevents Vigil from sending repeated downtime notifications for the specified duration. Useful during known maintenance windows or when you're actively working on an issue.

## Common Use Cases

### Monitoring a Web Application Cluster

Use `report_replica` for each server in your cluster to report health metrics every 30 seconds. This enables Vigil to track the real-time status of all your application instances.

### Planned Maintenance Communication

1. Use `insert_announcement` before maintenance to inform users
2. Optionally use `update_alert_ignore_rules` to suppress alerts during maintenance
3. Use `retract_announcement` after maintenance is complete

### Incident Management

1. Use `list_prober_alerts` to check what's currently down
2. Use `insert_announcement` to inform users about the incident
3. Update the announcement as you work on resolution
4. Use `retract_announcement` once the incident is resolved

### Server Decommissioning

When removing a server from your infrastructure:
1. Stop the application/service on the server
2. Use `flush_replica` to remove it from Vigil monitoring
3. This prevents false alerts about the decommissioned server

## Tips

- **URL Format**: Always include the protocol (https:// or http://) in vigilUrl
- **Tokens**: Keep your reporter and manager tokens secure; never commit them to version control
- **Intervals**: Choose report intervals based on your monitoring needs (typical: 30-60 seconds)
- **Load Metrics**: CPU load can exceed 1.0 if your CPU is overloaded; RAM load is always 0.0-1.0
- **Announcements**: Use multi-line text for detailed announcements by including `\n` newlines
