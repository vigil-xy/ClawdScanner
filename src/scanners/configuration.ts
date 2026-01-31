import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile, access, constants } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const execAsync = promisify(exec);

export interface ConfigIssue {
  file: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  line?: string;
}

export interface ConfigScanResult {
  sshConfigIssues: ConfigIssue[];
  secretsInConfig: ConfigIssue[];
}

const SECRET_PATTERNS = [
  {
    pattern: /AKIA[0-9A-Z]{16}/g,
    type: 'AWS Access Key',
    severity: 'critical' as const,
  },
  {
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    type: 'GitHub Personal Access Token',
    severity: 'critical' as const,
  },
  {
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    type: 'GitHub OAuth Token',
    severity: 'critical' as const,
  },
  {
    pattern: /sk-[a-zA-Z0-9]{48}/g,
    type: 'OpenAI API Key',
    severity: 'critical' as const,
  },
  {
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    type: 'Private Key',
    severity: 'critical' as const,
  },
  {
    pattern: /password\s*[:=]\s*["']?[^"'\s]{8,}/gi,
    type: 'Password',
    severity: 'high' as const,
  },
  {
    pattern: /api[_-]?key\s*[:=]\s*["']?[a-zA-Z0-9]{16,}/gi,
    type: 'API Key',
    severity: 'high' as const,
  },
];

export async function scanConfiguration(): Promise<ConfigScanResult> {
  const [sshConfigIssues, secretsInConfig] = await Promise.all([
    checkSSHConfig(),
    scanForSecrets(),
  ]);

  return {
    sshConfigIssues,
    secretsInConfig,
  };
}

async function checkSSHConfig(): Promise<ConfigIssue[]> {
  const issues: ConfigIssue[] = [];
  const sshConfigPath = '/etc/ssh/sshd_config';

  try {
    await access(sshConfigPath, constants.R_OK);
    const content = await readFile(sshConfigPath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Check for PermitRootLogin yes
      if (/^PermitRootLogin\s+yes/i.test(trimmed)) {
        issues.push({
          file: sshConfigPath,
          issue: 'SSH allows root login',
          severity: 'high',
          line: trimmed,
        });
      }

      // Check for PasswordAuthentication yes
      if (/^PasswordAuthentication\s+yes/i.test(trimmed)) {
        issues.push({
          file: sshConfigPath,
          issue: 'SSH allows password authentication',
          severity: 'medium',
          line: trimmed,
        });
      }

      // Check for PermitEmptyPasswords yes
      if (/^PermitEmptyPasswords\s+yes/i.test(trimmed)) {
        issues.push({
          file: sshConfigPath,
          issue: 'SSH allows empty passwords',
          severity: 'critical',
          line: trimmed,
        });
      }
    }
  } catch (error) {
    // File doesn't exist or not readable, skip
  }

  return issues;
}

async function scanForSecrets(): Promise<ConfigIssue[]> {
  const secrets: ConfigIssue[] = [];
  const home = homedir();
  const cwd = process.cwd();

  const configFiles = [
    join(cwd, '.env'),
    join(cwd, '.env.local'),
    join(cwd, '.env.production'),
    join(cwd, 'config.json'),
    join(cwd, 'config.yaml'),
    join(cwd, 'config.yml'),
    join(home, '.aws', 'credentials'),
    join(home, '.npmrc'),
  ];

  for (const filePath of configFiles) {
    try {
      await access(filePath, constants.R_OK);
      const content = await readFile(filePath, 'utf-8');

      // Limit file size to 1MB to avoid performance issues
      if (content.length > 1024 * 1024) {
        continue;
      }

      for (const { pattern, type, severity } of SECRET_PATTERNS) {
        const matches = content.match(pattern);
        if (matches) {
          // Avoid duplicates by tracking unique patterns
          const uniqueMatches = Array.from(new Set(matches));
          for (const match of uniqueMatches.slice(0, 3)) {
            // Limit to 3 per file
            secrets.push({
              file: filePath,
              issue: `Potential ${type} detected`,
              severity,
              line: match.substring(0, 50) + (match.length > 50 ? '...' : ''),
            });
          }
          break; // Only report first pattern match per file
        }
      }
    } catch (error) {
      // File doesn't exist or not readable, skip
    }
  }

  return secrets;
}
