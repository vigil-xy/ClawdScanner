import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface PortInfo {
  port: number;
  protocol: string;
  service: string;
  state: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface NetworkScanResult {
  openPorts: PortInfo[];
  firewallStatus: {
    enabled: boolean;
    type: string;
  };
  listeningServices: Array<{
    pid: string;
    command: string;
    port: string;
  }>;
}

const DANGEROUS_PORTS: Record<number, { service: string; severity: 'critical' | 'high' | 'medium' | 'low' }> = {
  21: { service: 'FTP (unencrypted)', severity: 'critical' },
  23: { service: 'Telnet (unencrypted)', severity: 'critical' },
  3306: { service: 'MySQL', severity: 'high' },
  5432: { service: 'PostgreSQL', severity: 'high' },
  6379: { service: 'Redis', severity: 'high' },
  27017: { service: 'MongoDB', severity: 'high' },
  3389: { service: 'RDP', severity: 'high' },
  5900: { service: 'VNC', severity: 'high' },
  445: { service: 'SMB', severity: 'medium' },
  139: { service: 'NetBIOS', severity: 'medium' },
  135: { service: 'RPC', severity: 'medium' },
};

export async function scanNetwork(): Promise<NetworkScanResult> {
  const [openPorts, firewallStatus, listeningServices] = await Promise.all([
    scanPorts(),
    checkFirewall(),
    getListeningServices(),
  ]);

  return {
    openPorts,
    firewallStatus,
    listeningServices,
  };
}

async function scanPorts(): Promise<PortInfo[]> {
  const ports: PortInfo[] = [];

  try {
    // Try netstat first (more portable)
    const { stdout } = await execAsync(
      "netstat -tuln 2>/dev/null || ss -tuln 2>/dev/null || echo ''"
    );

    const lines = stdout.split('\n');
    for (const line of lines) {
      const match = line.match(/^(tcp|udp)\s+\d+\s+\d+\s+([^\s]+):(\d+)/);
      if (match) {
        const [, protocol, , portStr] = match;
        const port = parseInt(portStr, 10);

        if (port > 0 && port < 65536) {
          const dangerousPort = DANGEROUS_PORTS[port];
          ports.push({
            port,
            protocol: protocol.toUpperCase(),
            service: dangerousPort?.service || 'Unknown',
            state: 'LISTENING',
            severity: dangerousPort?.severity || 'low',
          });
        }
      }
    }
  } catch (error) {
    // Silently handle error, return empty array
  }

  // Remove duplicates
  const uniquePorts = Array.from(
    new Map(ports.map((p) => [`${p.port}-${p.protocol}`, p])).values()
  );

  return uniquePorts;
}

async function checkFirewall(): Promise<{ enabled: boolean; type: string }> {
  try {
    // Check ufw
    const { stdout: ufwOutput } = await execAsync('ufw status 2>/dev/null || echo ""');
    if (ufwOutput.includes('Status: active')) {
      return { enabled: true, type: 'ufw' };
    }

    // Check iptables
    const { stdout: iptablesOutput } = await execAsync(
      'iptables -L 2>/dev/null | wc -l || echo "0"'
    );
    const ruleCount = parseInt(iptablesOutput.trim(), 10);
    if (ruleCount > 8) {
      return { enabled: true, type: 'iptables' };
    }

    return { enabled: false, type: 'none' };
  } catch (error) {
    return { enabled: false, type: 'unknown' };
  }
}

async function getListeningServices(): Promise<
  Array<{ pid: string; command: string; port: string }>
> {
  try {
    const { stdout } = await execAsync(
      "lsof -i -P -n 2>/dev/null | grep LISTEN | head -20 || echo ''"
    );

    const services: Array<{ pid: string; command: string; port: string }> = [];
    const lines = stdout.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length >= 9) {
        services.push({
          command: parts[0],
          pid: parts[1],
          port: parts[8] || 'unknown',
        });
      }
    }

    return services;
  } catch (error) {
    return [];
  }
}
