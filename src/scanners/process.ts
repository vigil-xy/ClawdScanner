import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProcessInfo {
  pid: string;
  command: string;
  user: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export interface ProcessScanResult {
  suspiciousProcesses: ProcessInfo[];
  privilegedProcesses: ProcessInfo[];
  secretsInEnv: Array<{
    pid: string;
    command: string;
    secret: string;
    type: string;
  }>;
}

const SUSPICIOUS_PATTERNS = [
  { pattern: /nc\s+-l/, description: 'Netcat listener (reverse shell)', severity: 'critical' as const },
  { pattern: /ncat\s+-l/, description: 'Ncat listener (reverse shell)', severity: 'critical' as const },
  { pattern: /socat/, description: 'Socat (potential reverse shell)', severity: 'high' as const },
  { pattern: /perl.*socket/i, description: 'Perl socket (potential reverse shell)', severity: 'high' as const },
  { pattern: /python.*socket/i, description: 'Python socket (potential reverse shell)', severity: 'high' as const },
  { pattern: /bash.*\/dev\/tcp/i, description: 'Bash reverse shell', severity: 'critical' as const },
];

const SECRET_PATTERNS = [
  { pattern: /AWS_ACCESS_KEY/i, type: 'AWS Access Key' },
  { pattern: /AWS_SECRET/i, type: 'AWS Secret' },
  { pattern: /GITHUB_TOKEN/i, type: 'GitHub Token' },
  { pattern: /API_KEY/i, type: 'API Key' },
  { pattern: /PASSWORD/i, type: 'Password' },
  { pattern: /SECRET/i, type: 'Secret' },
  { pattern: /TOKEN/i, type: 'Token' },
  { pattern: /PRIVATE_KEY/i, type: 'Private Key' },
];

export async function scanProcesses(): Promise<ProcessScanResult> {
  const [suspiciousProcesses, privilegedProcesses, secretsInEnv] = await Promise.all([
    findSuspiciousProcesses(),
    findPrivilegedProcesses(),
    scanEnvironmentVariables(),
  ]);

  return {
    suspiciousProcesses,
    privilegedProcesses,
    secretsInEnv,
  };
}

async function findSuspiciousProcesses(): Promise<ProcessInfo[]> {
  const suspicious: ProcessInfo[] = [];

  try {
    // Get all processes with full command line
    const { stdout } = await execAsync('ps aux 2>/dev/null || ps -ef 2>/dev/null || echo ""');
    const lines = stdout.split('\n');

    for (const line of lines) {
      for (const { pattern, description, severity } of SUSPICIOUS_PATTERNS) {
        if (pattern.test(line)) {
          const parts = line.split(/\s+/);
          // Extract PID and user from known positions, command from the rest
          const pid = parts[1] || 'unknown';
          const user = parts[0] || 'unknown';
          // Command starts after the first few fields - take everything after CPU/MEM/TIME
          const commandStartIndex = parts.findIndex((p, i) => i > 7 && !p.match(/^\d/));
          const command = commandStartIndex > 0 ? parts.slice(commandStartIndex).join(' ') : line.substring(line.indexOf(parts[7] || ''));
          
          suspicious.push({
            pid,
            user,
            command: command.substring(0, 150),
            issue: description,
            severity,
          });
        }
      }

      // Check for processes running from /tmp
      if (line.includes('/tmp/') && !line.includes('grep')) {
        const parts = line.split(/\s+/);
        const pid = parts[1] || 'unknown';
        const user = parts[0] || 'unknown';
        // Extract command from the rest of the line
        const commandStartIndex = parts.findIndex((p, i) => i > 7 && !p.match(/^\d/));
        const command = commandStartIndex > 0 ? parts.slice(commandStartIndex).join(' ') : line.substring(line.indexOf(parts[7] || ''));
        
        suspicious.push({
          pid,
          user,
          command: command.substring(0, 150),
          issue: 'Process running from /tmp directory',
          severity: 'high',
        });
      }
    }
  } catch (error) {
    // Silently handle error
  }

  return suspicious;
}

async function findPrivilegedProcesses(): Promise<ProcessInfo[]> {
  const privileged: ProcessInfo[] = [];

  try {
    const { stdout } = await execAsync('ps aux 2>/dev/null | grep "^root" | head -20 || echo ""');
    const lines = stdout.split('\n').filter((l) => l.trim() && !l.includes('grep'));

    for (const line of lines.slice(0, 10)) {
      // Limit to first 10
      const parts = line.split(/\s+/);
      privileged.push({
        pid: parts[1] || 'unknown',
        user: 'root',
        command: parts.slice(10).join(' ').substring(0, 100),
        issue: 'Running with root privileges',
        severity: 'medium',
      });
    }
  } catch (error) {
    // Silently handle error
  }

  return privileged;
}

async function scanEnvironmentVariables(): Promise<
  Array<{ pid: string; command: string; secret: string; type: string }>
> {
  const secrets: Array<{ pid: string; command: string; secret: string; type: string }> = [];

  try {
    // Get current process environment variables only (for safety)
    const env = process.env;

    for (const [key, value] of Object.entries(env)) {
      for (const { pattern, type } of SECRET_PATTERNS) {
        if (pattern.test(key) && value) {
          secrets.push({
            pid: process.pid.toString(),
            command: 'current-process',
            secret: key,
            type,
          });
          break;
        }
      }
    }
  } catch (error) {
    // Silently handle error
  }

  return secrets;
}
