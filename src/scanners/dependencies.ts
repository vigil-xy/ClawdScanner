import { exec } from 'child_process';
import { promisify } from 'util';
import { access, constants } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

export interface Vulnerability {
  name: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  version: string;
  description: string;
}

export interface DependencyScanResult {
  hasPackageJson: boolean;
  vulnerabilities: Vulnerability[];
  totalVulnerabilities: number;
  summary: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
  };
}

export async function scanDependencies(): Promise<DependencyScanResult> {
  const cwd = process.cwd();
  const packageJsonPath = join(cwd, 'package.json');

  try {
    await access(packageJsonPath, constants.F_OK);
  } catch (error) {
    return {
      hasPackageJson: false,
      vulnerabilities: [],
      totalVulnerabilities: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
    };
  }

  try {
    const { stdout } = await execAsync('npm audit --json', {
      cwd,
      timeout: 30000,
    });

    const auditData = JSON.parse(stdout);
    const vulnerabilities: Vulnerability[] = [];

    // Parse npm audit v7+ format
    if (auditData.vulnerabilities) {
      for (const [name, vuln] of Object.entries(auditData.vulnerabilities)) {
        const v = vuln as any;
        vulnerabilities.push({
          name,
          severity: v.severity || 'info',
          version: v.range || 'unknown',
          description: v.via?.[0]?.title || 'No description available',
        });
      }
    }

    const summary = {
      critical: auditData.metadata?.vulnerabilities?.critical || 0,
      high: auditData.metadata?.vulnerabilities?.high || 0,
      moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
      low: auditData.metadata?.vulnerabilities?.low || 0,
      info: auditData.metadata?.vulnerabilities?.info || 0,
    };

    return {
      hasPackageJson: true,
      vulnerabilities: vulnerabilities.slice(0, 20), // Limit to 20
      totalVulnerabilities: vulnerabilities.length,
      summary,
    };
  } catch (error) {
    // npm audit may exit with non-zero if vulnerabilities found
    // Try to parse the error output
    const err = error as any;
    if (err.stdout) {
      try {
        const auditData = JSON.parse(err.stdout);
        const vulnerabilities: Vulnerability[] = [];

        if (auditData.vulnerabilities) {
          for (const [name, vuln] of Object.entries(auditData.vulnerabilities)) {
            const v = vuln as any;
            vulnerabilities.push({
              name,
              severity: v.severity || 'info',
              version: v.range || 'unknown',
              description: v.via?.[0]?.title || 'No description available',
            });
          }
        }

        const summary = {
          critical: auditData.metadata?.vulnerabilities?.critical || 0,
          high: auditData.metadata?.vulnerabilities?.high || 0,
          moderate: auditData.metadata?.vulnerabilities?.moderate || 0,
          low: auditData.metadata?.vulnerabilities?.low || 0,
          info: auditData.metadata?.vulnerabilities?.info || 0,
        };

        return {
          hasPackageJson: true,
          vulnerabilities: vulnerabilities.slice(0, 20),
          totalVulnerabilities: vulnerabilities.length,
          summary,
        };
      } catch (parseError) {
        // Failed to parse, return empty results
      }
    }

    return {
      hasPackageJson: true,
      vulnerabilities: [],
      totalVulnerabilities: 0,
      summary: { critical: 0, high: 0, moderate: 0, low: 0, info: 0 },
    };
  }
}
