/**
 * Sync Encryption Module for End-to-End Encryption.
 *
 * Provides AES-256-GCM encryption for note/directory content synced to S3.
 * Uses Web Crypto API with PBKDF2 key derivation from a user-provided password.
 *
 * Security Parameters:
 * - Algorithm: AES-256-GCM (authenticated encryption)
 * - Key Derivation: PBKDF2, 100,000 iterations, SHA-256
 * - Salt: 16 bytes, random per encryption
 * - IV/Nonce: 12 bytes, random per encryption
 *
 * Binary Format (before base64 encoding):
 * | Offset | Size     | Description                    |
 * |--------|----------|--------------------------------|
 * | 0      | 1 byte   | Version (0x01)                 |
 * | 1      | 16 bytes | PBKDF2 salt                    |
 * | 17     | 12 bytes | AES-GCM IV                     |
 * | 29     | variable | Ciphertext + Auth tag (16 bytes) |
 */

/** Current encryption format version */
const ENCRYPTION_VERSION = 0x01;

/** PBKDF2 iteration count for key derivation */
const PBKDF2_ITERATIONS = 100000;

/** Salt size in bytes */
const SALT_SIZE = 16;

/** IV/Nonce size in bytes (96 bits for AES-GCM) */
const IV_SIZE = 12;

/** AES-GCM authentication tag size in bytes. */
const AUTH_TAG_SIZE = 16;

/** Fixed overhead added to encrypted byte payloads. */
const ENCRYPTED_BYTES_OVERHEAD = 1 + SALT_SIZE + IV_SIZE + AUTH_TAG_SIZE;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array {
  return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
}

function toCryptoBuffer(bytes: Uint8Array): ArrayBuffer {
  const normalizedBytes = new Uint8Array(bytes.length);
  normalizedBytes.set(bytes);
  return normalizedBytes.buffer;
}

/**
 * Derives an AES-256 key from a password using PBKDF2.
 *
 * @param password - User-provided password
 * @param salt - Salt bytes for key derivation
 * @returns CryptoKey suitable for AES-GCM encryption/decryption
 */
async function deriveKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passwordBytes = encoder.encode(password);

  // Import password as raw key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBytes,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  // Derive AES-256 key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt.buffer as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Encrypts content using AES-256-GCM with a password-derived key.
 *
 * @param plaintext - The content to encrypt
 * @param password - User-provided password for key derivation
 * @returns Base64-encoded encrypted payload
 */
export async function encryptSyncContent(
  plaintext: string,
  password: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const encryptedBytes = await encryptSyncBytes(
    encoder.encode(plaintext),
    password,
  );

  return bytesToBase64(encryptedBytes);
}

/**
 * Encrypts raw bytes using AES-256-GCM with a password-derived key.
 *
 * @param plaintextBytes - The bytes to encrypt
 * @param password - User-provided password for key derivation
 * @returns Encrypted payload bytes
 */
export async function encryptSyncBytes(
  plaintextBytes: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_SIZE));
  const iv = crypto.getRandomValues(new Uint8Array(IV_SIZE));

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Encrypt using AES-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    toCryptoBuffer(plaintextBytes),
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Assemble the encrypted payload: version + salt + iv + ciphertext
  const payload = new Uint8Array(1 + SALT_SIZE + IV_SIZE + ciphertext.length);
  payload[0] = ENCRYPTION_VERSION;
  payload.set(salt, 1);
  payload.set(iv, 1 + SALT_SIZE);
  payload.set(ciphertext, 1 + SALT_SIZE + IV_SIZE);

  return payload;
}

/**
 * Decrypts AES-256-GCM encrypted content.
 *
 * @param encryptedBase64 - Base64-encoded encrypted payload
 * @param password - User-provided password for key derivation
 * @returns Decrypted plaintext string
 * @throws Error if decryption fails (wrong password, corrupted data, etc.)
 */
export async function decryptSyncContent(
  encryptedBase64: string,
  password: string,
): Promise<string> {
  const payload = base64ToBytes(encryptedBase64);

  const plaintextBytes = await decryptSyncBytes(payload, password);

  const decoder = new TextDecoder();
  return decoder.decode(plaintextBytes);
}

/**
 * Decrypts AES-256-GCM encrypted bytes.
 *
 * @param payload - Encrypted payload bytes
 * @param password - User-provided password for key derivation
 * @returns Decrypted plaintext bytes
 * @throws Error if decryption fails (wrong password, corrupted data, etc.)
 */
export async function decryptSyncBytes(
  payload: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  // Validate minimum size: version(1) + salt(16) + iv(12) + auth_tag(16) = 45 bytes minimum
  if (payload.length < 45) {
    throw new Error("Invalid encrypted payload: too short");
  }

  // Extract version
  const version = payload[0];
  if (version !== ENCRYPTION_VERSION) {
    throw new Error(`Unsupported encryption version: ${version}`);
  }

  // Extract salt, iv, and ciphertext
  const salt = payload.slice(1, 1 + SALT_SIZE);
  const iv = payload.slice(1 + SALT_SIZE, 1 + SALT_SIZE + IV_SIZE);
  const ciphertext = payload.slice(1 + SALT_SIZE + IV_SIZE);

  // Derive key from password
  const key = await deriveKey(password, salt);

  // Decrypt using AES-GCM
  try {
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      toCryptoBuffer(ciphertext),
    );
    return new Uint8Array(plaintextBuffer);
  } catch {
    throw new Error("Decryption failed: wrong password or corrupted data");
  }
}

/**
 * Calculates the encrypted size of a byte payload.
 *
 * @param plaintextByteLength - The original plaintext size in bytes
 * @returns The final encrypted payload size in bytes
 */
export function getEncryptedSyncByteSize(plaintextByteLength: number): number {
  return plaintextByteLength + ENCRYPTED_BYTES_OVERHEAD;
}

/**
 * Verifies if a password can successfully decrypt content.
 * Useful for password validation without exposing the decrypted content.
 *
 * @param encryptedBase64 - Base64-encoded encrypted payload
 * @param password - Password to verify
 * @returns true if the password is correct
 */
export async function verifyEncryptionPassword(
  encryptedBase64: string,
  password: string,
): Promise<boolean> {
  try {
    await decryptSyncContent(encryptedBase64, password);
    return true;
  } catch {
    return false;
  }
}
