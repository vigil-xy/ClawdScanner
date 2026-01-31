import { exec } from 'child_process';
import { promisify } from 'util';
import { access, stat, constants } from 'fs/promises';
import { homedir } from 'os';
import { join } from 'path';

const execAsync = promisify(exec);

export interface FileIssue {
  path: string;
  issue: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  permissions?: string;
}

export interface FilesystemScanResult {
  sensitiveFileIssues: FileIssue[];
  worldWritableFiles: FileIssue[];
  suidFiles: FileIssue[];
  exposedSecrets: FileIssue[];
}

const SENSITIVE_FILES = [
  { path: '.ssh/id_rsa', severity: 'critical' as const, expectedPerms: '600' },
  { path: '.ssh/id_ed25519', severity: 'critical' as const, expectedPerms: '600' },
  { path: '.aws/credentials', severity: 'high' as const, expectedPerms: '600' },
  { path: '.env', severity: 'high' as const, expectedPerms: '600' },
  { path: '.env.local', severity: 'high' as const, expectedPerms: '600' },
  { path: '.npmrc', severity: 'medium' as const, expectedPerms: '600' },
  { path: '.netrc', severity: 'high' as const, expectedPerms: '600' },
];

export async function scanFilesystem(): Promise<FilesystemScanResult> {
  const [sensitiveFileIssues, worldWritableFiles, suidFiles, exposedSecrets] = await Promise.all([
    checkSensitiveFiles(),
    findWorldWritableFiles(),
    findSuidFiles(),
    findExposedSecrets(),
  ]);

  return {
    sensitiveFileIssues,
    worldWritableFiles,
    suidFiles,
    exposedSecrets,
  };
}

async function checkSensitiveFiles(): Promise<FileIssue[]> {
  const issues: FileIssue[] = [];
  const home = homedir();

  for (const file of SENSITIVE_FILES) {
    const fullPath = join(home, file.path);

    try {
      await access(fullPath, constants.F_OK);
      const stats = await stat(fullPath);
      const mode = stats.mode & 0o777;
      const perms = mode.toString(8);

      // Check if file is world-readable or group-readable
      if ((mode & 0o044) !== 0) {
        issues.push({
          path: fullPath,
          issue: 'Sensitive file has overly permissive permissions',
          severity: file.severity,
          permissions: perms,
        });
      }
    } catch (error) {
      // File doesn't exist, skip
    }
  }

  return issues;
}

async function findWorldWritableFiles(): Promise<FileIssue[]> {
  const files: FileIssue[] = [];

  try {
    const { stdout } = await execAsync(
      'find /tmp /var/tmp -type f -perm -002 2>/dev/null | head -20 || echo ""',
      { timeout: 5000 }
    );

    const lines = stdout.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      files.push({
        path: line,
        issue: 'World-writable file',
        severity: 'medium',
      });
    }
  } catch (error) {
    // Silently handle error or timeout
  }

  return files;
}

async function findSuidFiles(): Promise<FileIssue[]> {
  const files: FileIssue[] = [];

  try {
    // Search common directories for SUID/SGID files
    const { stdout } = await execAsync(
      'find /usr/bin /usr/sbin /bin /sbin -type f \\( -perm -4000 -o -perm -2000 \\) 2>/dev/null | head -30 || echo ""',
      { timeout: 10000 }
    );

    const lines = stdout.split('\n').filter((l) => l.trim());
    for (const line of lines.slice(0, 20)) {
      // Limit output
      try {
        const stats = await stat(line);
        const mode = stats.mode & 0o7777;
        const perms = mode.toString(8);

        files.push({
          path: line,
          issue: mode & 0o4000 ? 'SUID binary' : 'SGID binary',
          severity: 'low',
          permissions: perms,
        });
      } catch (error) {
        // Skip if we can't stat the file
      }
    }
  } catch (error) {
    // Silently handle error or timeout
  }

  return files;
}

async function findExposedSecrets(): Promise<FileIssue[]> {
  const secrets: FileIssue[] = [];
  const home = homedir();

  const secretFiles = [
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    'config.json',
    'config.yaml',
    'config.yml',
    '.npmrc',
    '.aws/credentials',
  ];

  for (const file of secretFiles) {
    const fullPath = join(home, file);

    try {
      await access(fullPath, constants.R_OK);
      secrets.push({
        path: fullPath,
        issue: 'Potential secrets file found',
        severity: 'medium',
      });
    } catch (error) {
      // File doesn't exist or not readable, skip
    }
  }

  // Also check current directory
  const cwd = process.cwd();
  for (const file of ['.env', '.env.local', 'config.json']) {
    const fullPath = join(cwd, file);

    try {
      await access(fullPath, constants.R_OK);
      const stats = await stat(fullPath);
      if (stats.isFile()) {
        secrets.push({
          path: fullPath,
          issue: 'Potential secrets file in current directory',
          severity: 'high',
        });
      }
    } catch (error) {
      // File doesn't exist or not readable, skip
    }
  }

  return secrets;
}
