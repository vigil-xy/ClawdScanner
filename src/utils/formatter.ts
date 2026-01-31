import { ScanReport } from '../scanners/index.js';

export function formatReport(report: ScanReport, includeDetails: boolean = true): string {
  const lines: string[] = [];

  // Header
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                    VIGIL SECURITY SCAN REPORT                 ');
  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Hostname:  ${report.hostname}`);
  lines.push('');

  // Summary
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                           SUMMARY                            ');
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`Risk Level:      ${getRiskLevelIcon(report.summary.riskLevel)} ${report.summary.riskLevel}`);
  lines.push(`Total Issues:    ${report.summary.totalIssues}`);
  lines.push(`  Critical:      ${report.summary.criticalIssues}`);
  lines.push(`  High:          ${report.summary.highIssues}`);
  lines.push(`  Medium:        ${report.summary.mediumIssues}`);
  lines.push(`  Low:           ${report.summary.lowIssues}`);
  lines.push('');

  if (!includeDetails) {
    return lines.join('\n');
  }

  // Network Security
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                      NETWORK SECURITY                        ');
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`Firewall: ${report.network.firewallStatus.enabled ? '✓ Enabled' : '✗ Disabled'} (${report.network.firewallStatus.type})`);
  lines.push(`Open Ports: ${report.network.openPorts.length}`);
  
  if (report.network.openPorts.length > 0) {
    report.network.openPorts.forEach((port) => {
      lines.push(`  ${getSeverityIcon(port.severity)} Port ${port.port}/${port.protocol} - ${port.service} [${port.severity.toUpperCase()}]`);
    });
  }

  lines.push(`Listening Services: ${report.network.listeningServices.length}`);
  if (report.network.listeningServices.length > 0) {
    report.network.listeningServices.slice(0, 5).forEach((svc) => {
      lines.push(`  • ${svc.command} (PID: ${svc.pid}) on ${svc.port}`);
    });
    if (report.network.listeningServices.length > 5) {
      lines.push(`  ... and ${report.network.listeningServices.length - 5} more`);
    }
  }
  lines.push('');

  // Process Security
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                      PROCESS SECURITY                        ');
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push(`Suspicious Processes: ${report.processes.suspiciousProcesses.length}`);
  
  if (report.processes.suspiciousProcesses.length > 0) {
    report.processes.suspiciousProcesses.forEach((proc) => {
      lines.push(`  ${getSeverityIcon(proc.severity)} ${proc.issue}`);
      lines.push(`     PID: ${proc.pid}, User: ${proc.user}`);
      lines.push(`     Command: ${proc.command.substring(0, 80)}`);
    });
  }

  if (report.processes.secretsInEnv.length > 0) {
    lines.push(`Environment Secrets Detected: ${report.processes.secretsInEnv.length}`);
    report.processes.secretsInEnv.forEach((secret) => {
      lines.push(`  ⚠ ${secret.type}: ${secret.secret}`);
    });
  }
  lines.push('');

  // Filesystem Security
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                    FILESYSTEM SECURITY                       ');
  lines.push('─────────────────────────────────────────────────────────────');
  
  if (report.filesystem.sensitiveFileIssues.length > 0) {
    lines.push(`Sensitive File Issues: ${report.filesystem.sensitiveFileIssues.length}`);
    report.filesystem.sensitiveFileIssues.forEach((issue) => {
      lines.push(`  ${getSeverityIcon(issue.severity)} ${issue.path}`);
      lines.push(`     ${issue.issue}${issue.permissions ? ` (perms: ${issue.permissions})` : ''}`);
    });
  }

  if (report.filesystem.worldWritableFiles.length > 0) {
    lines.push(`World-Writable Files: ${report.filesystem.worldWritableFiles.length}`);
    report.filesystem.worldWritableFiles.slice(0, 5).forEach((file) => {
      lines.push(`  ⚠ ${file.path}`);
    });
    if (report.filesystem.worldWritableFiles.length > 5) {
      lines.push(`  ... and ${report.filesystem.worldWritableFiles.length - 5} more`);
    }
  }

  if (report.filesystem.suidFiles.length > 0) {
    lines.push(`SUID/SGID Files: ${report.filesystem.suidFiles.length} (showing first 5)`);
    report.filesystem.suidFiles.slice(0, 5).forEach((file) => {
      lines.push(`  • ${file.path} (${file.permissions})`);
    });
  }

  if (report.filesystem.exposedSecrets.length > 0) {
    lines.push(`Exposed Secret Files: ${report.filesystem.exposedSecrets.length}`);
    report.filesystem.exposedSecrets.forEach((file) => {
      lines.push(`  ${getSeverityIcon(file.severity)} ${file.path}`);
    });
  }
  lines.push('');

  // Dependency Security
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                    DEPENDENCY SECURITY                       ');
  lines.push('─────────────────────────────────────────────────────────────');
  
  if (report.dependencies.hasPackageJson) {
    lines.push(`Total Vulnerabilities: ${report.dependencies.totalVulnerabilities}`);
    lines.push(`  Critical: ${report.dependencies.summary.critical}`);
    lines.push(`  High:     ${report.dependencies.summary.high}`);
    lines.push(`  Moderate: ${report.dependencies.summary.moderate}`);
    lines.push(`  Low:      ${report.dependencies.summary.low}`);
    
    if (report.dependencies.vulnerabilities.length > 0) {
      lines.push('');
      lines.push('Top Vulnerabilities:');
      report.dependencies.vulnerabilities.slice(0, 5).forEach((vuln) => {
        // Map 'moderate' to 'medium' for severity icon
        const severity = vuln.severity === 'moderate' ? 'medium' : vuln.severity;
        lines.push(`  ${getSeverityIcon(severity as any)} ${vuln.name} (${vuln.version})`);
        lines.push(`     ${vuln.description.substring(0, 80)}`);
      });
      if (report.dependencies.vulnerabilities.length > 5) {
        lines.push(`  ... and ${report.dependencies.vulnerabilities.length - 5} more`);
      }
    }
  } else {
    lines.push('No package.json found - skipping npm audit');
  }
  lines.push('');

  // Configuration Security
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                  CONFIGURATION SECURITY                      ');
  lines.push('─────────────────────────────────────────────────────────────');
  
  if (report.configuration.sshConfigIssues.length > 0) {
    lines.push(`SSH Configuration Issues: ${report.configuration.sshConfigIssues.length}`);
    report.configuration.sshConfigIssues.forEach((issue) => {
      lines.push(`  ${getSeverityIcon(issue.severity)} ${issue.issue}`);
      if (issue.line) {
        lines.push(`     Config: ${issue.line}`);
      }
    });
  } else {
    lines.push('SSH Configuration: No issues found');
  }

  if (report.configuration.secretsInConfig.length > 0) {
    lines.push(`Secrets in Config Files: ${report.configuration.secretsInConfig.length}`);
    report.configuration.secretsInConfig.forEach((secret) => {
      lines.push(`  ${getSeverityIcon(secret.severity)} ${secret.file}`);
      lines.push(`     ${secret.issue}`);
    });
  }
  lines.push('');

  // Container Security
  lines.push('─────────────────────────────────────────────────────────────');
  lines.push('                     CONTAINER SECURITY                       ');
  lines.push('─────────────────────────────────────────────────────────────');
  
  if (report.containers.dockerAvailable) {
    lines.push(`Total Containers: ${report.containers.totalContainers}`);
    
    if (report.containers.containers.length > 0) {
      report.containers.containers.forEach((container) => {
        lines.push(`  Container: ${container.name} (${container.id})`);
        lines.push(`    Image:  ${container.image}`);
        lines.push(`    Status: ${container.status}`);
        lines.push(`    Ports:  ${container.ports}`);
        
        if (container.issues.length > 0) {
          container.issues.forEach((issue) => {
            lines.push(`    ${getSeverityIcon(issue.severity)} ${issue.description}`);
          });
        }
      });
    }
  } else {
    lines.push('Docker not available');
  }
  lines.push('');

  lines.push('═══════════════════════════════════════════════════════════════');
  lines.push('                       END OF REPORT                          ');
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

function getSeverityIcon(severity: 'critical' | 'high' | 'medium' | 'low' | 'moderate' | 'info'): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'high':
      return '🟠';
    case 'medium':
    case 'moderate':
      return '🟡';
    case 'low':
    case 'info':
      return '🔵';
    default:
      return '⚪';
  }
}

function getRiskLevelIcon(level: string): string {
  switch (level) {
    case 'CRITICAL':
      return '🔴';
    case 'HIGH':
      return '🟠';
    case 'MEDIUM':
      return '🟡';
    case 'LOW':
      return '🔵';
    case 'CLEAN':
      return '✅';
    default:
      return '⚪';
  }
}
