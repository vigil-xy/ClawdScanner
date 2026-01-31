#!/usr/bin/env node

import { Command } from 'commander';
import { runFullScan } from './scanners/index.js';
import { formatReport } from './utils/formatter.js';
import { ensureKeysExist, signData, verifySignature, hashData, getPublicKeyPath } from './crypto/keys.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';

const program = new Command();

program
  .name('vigil')
  .description('Production-ready security scanner CLI tool')
  .version('0.1.0');

program
  .command('scan')
  .description('Run comprehensive security scan')
  .option('-o, --output <file>', 'Save report to file')
  .option('-j, --json', 'Output as JSON')
  .option('--no-sign', 'Skip cryptographic signing')
  .action(async (options) => {
    try {
      if (!options.json) {
        console.log('🔍 Starting Vigil Security Scan...\n');
      }

      // Run the scan
      const report = await runFullScan();

      // Generate keys if needed (for signing)
      let signature = '';
      let publicKey = '';
      let hash = '';

      if (options.sign !== false) {
        try {
          const keys = await ensureKeysExist();
          const reportJson = JSON.stringify(report);
          hash = hashData(reportJson);
          signature = signData(reportJson, keys.privateKey);
          publicKey = keys.publicKey;

          if (!options.json) {
            console.log('✅ Report cryptographically signed\n');
          }
        } catch (error: any) {
          if (!options.json) {
            console.error('⚠️  Warning: Could not sign report:', error.message);
          }
        }
      }

      // Create signed report
      const signedReport = {
        report,
        signature: {
          hash,
          signature,
          publicKey,
          algorithm: 'Ed25519',
          timestamp: new Date().toISOString(),
        },
      };

      // Output
      if (options.json) {
        const output = JSON.stringify(signedReport, null, 2);
        console.log(output);

        if (options.output) {
          await writeFile(options.output, output);
          console.error(`\n📄 Report saved to: ${options.output}`);
        }
      } else {
        const formattedReport = formatReport(report);
        console.log(formattedReport);

        if (signature) {
          console.log('\n─────────────────────────────────────────────────────────────');
          console.log('                  CRYPTOGRAPHIC SIGNATURE                     ');
          console.log('─────────────────────────────────────────────────────────────');
          console.log(`Algorithm: Ed25519`);
          console.log(`Hash (SHA-256): ${hash.substring(0, 32)}...`);
          console.log(`Signature: ${signature.substring(0, 32)}...`);
          console.log(`Public Key Location: ${await getPublicKeyPath()}`);
        }

        if (options.output) {
          await writeFile(options.output, JSON.stringify(signedReport, null, 2));
          console.log(`\n📄 Full report (JSON) saved to: ${options.output}`);
        }
      }

      // Exit with appropriate code based on risk level
      if (report.summary.riskLevel === 'CRITICAL') {
        process.exit(1);
      }
    } catch (error: any) {
      console.error('❌ Error running scan:', error.message);
      process.exit(1);
    }
  });

program
  .command('verify')
  .description('Verify cryptographic signature of a report')
  .argument('<file>', 'Report file to verify')
  .action(async (file) => {
    try {
      console.log('🔐 Verifying report signature...\n');

      const content = await readFile(file, 'utf-8');
      const signedReport = JSON.parse(content);

      if (!signedReport.signature || !signedReport.signature.signature) {
        console.error('❌ Error: Report is not signed');
        process.exit(1);
      }

      const { report, signature: sig } = signedReport;
      const reportJson = JSON.stringify(report);

      // Verify signature
      const isValid = verifySignature(reportJson, sig.signature, sig.publicKey);

      if (isValid) {
        console.log('✅ Signature is VALID');
        console.log(`   Report has not been tampered with`);
        console.log(`   Signed at: ${sig.timestamp}`);
        console.log(`   Algorithm: ${sig.algorithm}`);
        console.log(`   Hash: ${sig.hash}`);
      } else {
        console.log('❌ Signature is INVALID');
        console.log('   Report may have been tampered with!');
        process.exit(1);
      }
    } catch (error: any) {
      console.error('❌ Error verifying report:', error.message);
      process.exit(1);
    }
  });

program
  .command('keys')
  .description('Manage cryptographic keys')
  .option('--generate', 'Generate new key pair')
  .option('--show-public', 'Show public key')
  .action(async (options) => {
    try {
      if (options.generate) {
        console.log('🔑 Generating new Ed25519 key pair...');
        const keys = await ensureKeysExist();
        const keysDir = join(homedir(), '.vigil', 'keys');
        console.log(`✅ Keys generated and saved to: ${keysDir}`);
        console.log(`   Private key: ${keysDir}/private.pem`);
        console.log(`   Public key:  ${keysDir}/public.pem`);
        console.log('\n⚠️  Keep your private key secure!');
      } else if (options.showPublic) {
        const publicKeyPath = await getPublicKeyPath();
        const publicKey = await readFile(publicKeyPath, 'utf-8');
        console.log('Public Key:');
        console.log(publicKey);
      } else {
        console.log('Use --generate to create new keys or --show-public to display public key');
      }
    } catch (error: any) {
      console.error('❌ Error managing keys:', error.message);
      process.exit(1);
    }
  });

program.parse();
