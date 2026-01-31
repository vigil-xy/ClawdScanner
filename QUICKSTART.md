# Vigil Security Scanner - Quick Start Guide

## Installation

Install Vigil globally using npm:

```bash
npm install -g vigil-security-scanner
```

Or use directly with npx (no installation required):

```bash
npx vigil-security-scanner scan
```

## Basic Usage

### 1. Run Your First Scan

Simply run:

```bash
vigil scan
```

This will:
- Scan your system for security vulnerabilities
- Generate cryptographic keys on first run (stored in `~/.vigil/keys/`)
- Display a comprehensive security report
- Sign the report with Ed25519 signature

### 2. Save Report to File

To save the report for later analysis:

```bash
vigil scan -o security-report.json
```

### 3. Output as JSON

For programmatic processing:

```bash
vigil scan --json
```

### 4. Verify a Report

To verify that a report hasn't been tampered with:

```bash
vigil verify security-report.json
```

This checks the cryptographic signature to ensure authenticity.

## Understanding the Report

The scan report includes 6 main security categories:

### 🌐 Network Security
- Open ports and their risk levels
- Firewall status
- Listening services

### ⚙️ Process Security
- Suspicious processes (reverse shells, etc.)
- Processes running from /tmp
- Secrets in environment variables

### 📁 Filesystem Security
- Sensitive file permissions
- World-writable files
- SUID/SGID binaries
- Exposed secret files

### 📦 Dependency Security
- npm package vulnerabilities
- Severity breakdown (critical, high, moderate, low)

### ⚙️ Configuration Security
- SSH configuration issues
- Hardcoded secrets in config files

### 🐳 Container Security
- Docker containers and their settings
- Privileged containers
- Exposed ports

## Risk Levels

Reports are classified by risk level:

- 🔴 **CRITICAL**: Immediate action required
- 🟠 **HIGH**: Should be addressed soon
- 🟡 **MEDIUM**: Address when possible
- 🔵 **LOW**: Informational
- ✅ **CLEAN**: No issues found

## Example Workflow

```bash
# 1. Run scan and save report
vigil scan -o report-$(date +%Y%m%d).json

# 2. Review the report
cat report-20260131.json | jq '.report.summary'

# 3. Verify the report signature
vigil verify report-20260131.json

# 4. Share with your team (they can verify it's authentic)
# The report includes cryptographic proof it hasn't been tampered with
```

## Key Management

### Generate New Keys

```bash
vigil keys --generate
```

Keys are stored in `~/.vigil/keys/`:
- `private.pem` - Keep this secret! (600 permissions)
- `public.pem` - Share this to verify your reports (644 permissions)

### Show Public Key

```bash
vigil keys --show-public
```

## Advanced Usage

### Skip Signing

If you don't need cryptographic signatures:

```bash
vigil scan --no-sign
```

### Continuous Monitoring

Set up a cron job to scan regularly:

```bash
# Run scan daily at 2 AM
0 2 * * * /usr/local/bin/vigil scan -o /var/log/vigil/scan-$(date +\%Y\%m\%d).json
```

## Troubleshooting

### "Permission denied" errors

Some security checks require elevated permissions. Run with sudo for complete results:

```bash
sudo vigil scan
```

### Docker not found

Container scanning requires Docker. Install it from https://docker.com

### npm audit fails

Dependency scanning requires a `package.json` file in the current directory.

## Security Best Practices

1. **Regular Scans**: Run scans daily or after system changes
2. **Keep Keys Safe**: Protect your private key (stored in `~/.vigil/keys/private.pem`)
3. **Verify Reports**: Always verify reports received from others
4. **Address Critical Issues**: Prioritize critical and high-severity findings
5. **Track Changes**: Keep historical reports to track security improvements

## Getting Help

```bash
# Show all available commands
vigil --help

# Get help for specific command
vigil scan --help
vigil verify --help
vigil keys --help
```

## Example Output

```
═══════════════════════════════════════════════════════════════
                    VIGIL SECURITY SCAN REPORT                 
═══════════════════════════════════════════════════════════════

Timestamp: 2026-01-31T22:42:10.816Z
Hostname:  production-server

─────────────────────────────────────────────────────────────
                           SUMMARY                            
─────────────────────────────────────────────────────────────
Risk Level:      🟠 HIGH
Total Issues:    15
  Critical:      1
  High:          4
  Medium:        7
  Low:           3

[... detailed findings ...]

─────────────────────────────────────────────────────────────
                  CRYPTOGRAPHIC SIGNATURE                     
─────────────────────────────────────────────────────────────
Algorithm: Ed25519
Hash (SHA-256): 85a14c75d8ff06b6ab91d8c2dbf8b0b8...
Signature: 9GWx9y9M+ZAamC2WU9gRP2RVfUgTNoRB...
```

## What's Next?

1. Address the security issues found in your scan
2. Re-run the scan to verify fixes
3. Set up automated scanning
4. Share reports with your team using signature verification
