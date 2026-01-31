import { scanNetwork, NetworkScanResult } from './network.js';
import { scanProcesses, ProcessScanResult } from './process.js';
import { scanFilesystem, FilesystemScanResult } from './filesystem.js';
import { scanDependencies, DependencyScanResult } from './dependencies.js';
import { scanConfiguration, ConfigScanResult } from './configuration.js';
import { scanContainers, ContainerScanResult } from './containers.js';

export interface ScanReport {
  timestamp: string;
  hostname: string;
  network: NetworkScanResult;
  processes: ProcessScanResult;
  filesystem: FilesystemScanResult;
  dependencies: DependencyScanResult;
  configuration: ConfigScanResult;
  containers: ContainerScanResult;
  summary: {
    totalIssues: number;
    criticalIssues: number;
    highIssues: number;
    mediumIssues: number;
    lowIssues: number;
    riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';
  };
}

export async function runFullScan(): Promise<ScanReport> {
  const hostname = await getHostname();

  // Run all scans in parallel for better performance
  const [network, processes, filesystem, dependencies, configuration, containers] = await Promise.all([
    scanNetwork(),
    scanProcesses(),
    scanFilesystem(),
    scanDependencies(),
    scanConfiguration(),
    scanContainers(),
  ]);

  // Calculate summary
  const summary = calculateSummary(network, processes, filesystem, dependencies, configuration, containers);

  return {
    timestamp: new Date().toISOString(),
    hostname,
    network,
    processes,
    filesystem,
    dependencies,
    configuration,
    containers,
    summary,
  };
}

async function getHostname(): Promise<string> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout } = await execAsync('hostname');
    return stdout.trim();
  } catch (error) {
    return 'unknown';
  }
}

function calculateSummary(
  network: NetworkScanResult,
  processes: ProcessScanResult,
  filesystem: FilesystemScanResult,
  dependencies: DependencyScanResult,
  configuration: ConfigScanResult,
  containers: ContainerScanResult
) {
  let criticalIssues = 0;
  let highIssues = 0;
  let mediumIssues = 0;
  let lowIssues = 0;

  // Count network issues
  network.openPorts.forEach((port) => {
    if (port.severity === 'critical') criticalIssues++;
    else if (port.severity === 'high') highIssues++;
    else if (port.severity === 'medium') mediumIssues++;
    else if (port.severity === 'low') lowIssues++;
  });

  if (!network.firewallStatus.enabled) {
    highIssues++;
  }

  // Count process issues
  processes.suspiciousProcesses.forEach((proc) => {
    if (proc.severity === 'critical') criticalIssues++;
    else if (proc.severity === 'high') highIssues++;
    else if (proc.severity === 'medium') mediumIssues++;
    else if (proc.severity === 'low') lowIssues++;
  });

  processes.secretsInEnv.forEach(() => {
    highIssues++;
  });

  // Count filesystem issues
  filesystem.sensitiveFileIssues.forEach((file) => {
    if (file.severity === 'critical') criticalIssues++;
    else if (file.severity === 'high') highIssues++;
    else if (file.severity === 'medium') mediumIssues++;
    else if (file.severity === 'low') lowIssues++;
  });

  filesystem.worldWritableFiles.forEach((file) => {
    if (file.severity === 'medium') mediumIssues++;
  });

  filesystem.suidFiles.forEach(() => {
    lowIssues++;
  });

  filesystem.exposedSecrets.forEach((file) => {
    if (file.severity === 'high') highIssues++;
    else if (file.severity === 'medium') mediumIssues++;
  });

  // Count dependency issues
  criticalIssues += dependencies.summary.critical;
  highIssues += dependencies.summary.high;
  mediumIssues += dependencies.summary.moderate;
  lowIssues += dependencies.summary.low;

  // Count configuration issues
  configuration.sshConfigIssues.forEach((issue) => {
    if (issue.severity === 'critical') criticalIssues++;
    else if (issue.severity === 'high') highIssues++;
    else if (issue.severity === 'medium') mediumIssues++;
    else if (issue.severity === 'low') lowIssues++;
  });

  configuration.secretsInConfig.forEach((issue) => {
    if (issue.severity === 'critical') criticalIssues++;
    else if (issue.severity === 'high') highIssues++;
    else if (issue.severity === 'medium') mediumIssues++;
    else if (issue.severity === 'low') lowIssues++;
  });

  // Count container issues
  containers.containers.forEach((container) => {
    container.issues.forEach((issue) => {
      if (issue.severity === 'critical') criticalIssues++;
      else if (issue.severity === 'high') highIssues++;
      else if (issue.severity === 'medium') mediumIssues++;
      else if (issue.severity === 'low') lowIssues++;
    });
  });

  const totalIssues = criticalIssues + highIssues + mediumIssues + lowIssues;

  let riskLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN';
  if (criticalIssues > 0) {
    riskLevel = 'CRITICAL';
  } else if (highIssues > 0) {
    riskLevel = 'HIGH';
  } else if (mediumIssues > 0) {
    riskLevel = 'MEDIUM';
  } else if (lowIssues > 0) {
    riskLevel = 'LOW';
  } else {
    riskLevel = 'CLEAN';
  }

  return {
    totalIssues,
    criticalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
    riskLevel,
  };
}
