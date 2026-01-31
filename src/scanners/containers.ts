import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string;
  issues: Array<{
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
  }>;
}

export interface ContainerScanResult {
  dockerAvailable: boolean;
  containers: ContainerInfo[];
  totalContainers: number;
}

export async function scanContainers(): Promise<ContainerScanResult> {
  try {
    // Check if Docker is available
    await execAsync('docker --version', { timeout: 5000 });

    const containers = await listContainers();

    return {
      dockerAvailable: true,
      containers,
      totalContainers: containers.length,
    };
  } catch (error) {
    return {
      dockerAvailable: false,
      containers: [],
      totalContainers: 0,
    };
  }
}

async function listContainers(): Promise<ContainerInfo[]> {
  const containers: ContainerInfo[] = [];

  try {
    const { stdout } = await execAsync(
      'docker ps -a --format "{{.ID}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"',
      { timeout: 10000 }
    );

    const lines = stdout.split('\n').filter((l) => l.trim());

    for (const line of lines) {
      const [id, name, image, status, ports] = line.split('|');

      const issues: Array<{ description: string; severity: 'critical' | 'high' | 'medium' | 'low' }> = [];

      // Check for privileged mode
      try {
        const { stdout: inspectOutput } = await execAsync(
          `docker inspect ${id} --format '{{.HostConfig.Privileged}}'`,
          { timeout: 5000 }
        );

        if (inspectOutput.trim() === 'true') {
          issues.push({
            description: 'Container running in privileged mode',
            severity: 'high',
          });
        }
      } catch (error) {
        // Skip if inspect fails
      }

      // Check for exposed ports
      if (ports && ports.trim() && ports !== '') {
        // Parse ports for dangerous patterns
        if (ports.includes('0.0.0.0:') || ports.includes(':::')) {
          issues.push({
            description: 'Container has ports exposed to all interfaces',
            severity: 'medium',
          });
        }

        // Check for dangerous ports
        const dangerousPorts = ['21', '23', '3306', '5432', '6379', '27017'];
        for (const port of dangerousPorts) {
          if (ports.includes(`:${port}->`)) {
            issues.push({
              description: `Dangerous port ${port} exposed`,
              severity: 'high',
            });
          }
        }
      }

      containers.push({
        id: id?.substring(0, 12) || 'unknown',
        name: name || 'unknown',
        image: image || 'unknown',
        status: status || 'unknown',
        ports: ports || 'none',
        issues,
      });
    }
  } catch (error) {
    // Failed to list containers
  }

  return containers;
}
