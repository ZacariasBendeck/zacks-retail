import { hash, verify } from '@node-rs/argon2';

// argon2id with library defaults. For this app the defaults (memoryCost=19456,
// timeCost=2, parallelism=1) are appropriate — tuned for ~200ms on a laptop.
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext);
}

export async function verifyPassword(plaintext: string, stored: string): Promise<boolean> {
  try {
    return await verify(stored, plaintext);
  } catch {
    // Malformed hashes throw; treat as "does not verify" rather than crashing.
    return false;
  }
}
