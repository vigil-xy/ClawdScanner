import { createHash, sign, verify, generateKeyPairSync } from 'crypto';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const VIGIL_DIR = join(homedir(), '.vigil');
const KEYS_DIR = join(VIGIL_DIR, 'keys');
const PRIVATE_KEY_PATH = join(KEYS_DIR, 'private.pem');
const PUBLIC_KEY_PATH = join(KEYS_DIR, 'public.pem');

export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

export async function ensureKeysExist(): Promise<KeyPair> {
  try {
    // Try to load existing keys
    const privateKey = await fs.readFile(PRIVATE_KEY_PATH, 'utf-8');
    const publicKey = await fs.readFile(PUBLIC_KEY_PATH, 'utf-8');
    return { privateKey, publicKey };
  } catch (error) {
    // Keys don't exist, generate new ones
    return await generateKeys();
  }
}

async function generateKeys(): Promise<KeyPair> {
  // Ensure directory exists
  await fs.mkdir(KEYS_DIR, { recursive: true });

  // Generate Ed25519 key pair
  const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
  });

  // Save keys
  await fs.writeFile(PRIVATE_KEY_PATH, privateKey, { mode: 0o600 });
  await fs.writeFile(PUBLIC_KEY_PATH, publicKey, { mode: 0o644 });

  return { privateKey, publicKey };
}

export function hashData(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function signData(data: string, privateKey: string): string {
  const hash = Buffer.from(hashData(data), 'hex');
  const signature = sign(null, hash, {
    key: privateKey,
    format: 'pem',
  });
  return signature.toString('base64');
}

export function verifySignature(
  data: string,
  signature: string,
  publicKey: string
): boolean {
  try {
    const hash = Buffer.from(hashData(data), 'hex');
    const signatureBuffer = Buffer.from(signature, 'base64');
    return verify(null, hash, { key: publicKey, format: 'pem' }, signatureBuffer);
  } catch (error) {
    return false;
  }
}

export async function getPublicKeyPath(): Promise<string> {
  await ensureKeysExist();
  return PUBLIC_KEY_PATH;
}
