/**
 * Unified secure credential storage for sensitive data.
 *
 * Provides TypeScript functions to interact with the encrypted credential
 * store in the Rust backend. All credentials are encrypted using AES-256-GCM
 * with a machine-bound key.
 */

import { invoke } from "@/lib/desktop-adapter";

/**
 * Well-known credential keys for type-safe access.
 * Use these constants instead of raw strings where possible.
 */
export const CREDENTIAL_KEYS = {
  /** AWS/S3 access key ID */
  S3_ACCESS_KEY: "s3_access_key_id",
  /** AWS/S3 secret access key */
  S3_SECRET_KEY: "s3_secret_access_key",
  /** Sync encryption password for E2E encryption of notes/directories */
  SYNC_ENCRYPTION_PASSWORD: "sync_encryption_password",
} as const;

/**
 * Prefix for AI provider API keys.
 * Full key format: `ai_api_key_{configId}`
 */
const AI_API_KEY_PREFIX = "ai_api_key_";

/**
 * Saves a credential to encrypted storage.
 *
 * @param key - Unique identifier for the credential
 * @param value - The sensitive value to encrypt and store
 * @throws Error if encryption or storage fails
 */
export async function saveCredential(
  key: string,
  value: string,
): Promise<void> {
  await invoke("save_credential", { key, value });
}

/**
 * Retrieves a credential from encrypted storage.
 *
 * @param key - The credential identifier
 * @returns The decrypted value, or null if not found
 * @throws Error if decryption fails
 */
export async function getCredential(key: string): Promise<string | null> {
  const result = await invoke<string | null>("get_credential", { key });
  return result;
}

/**
 * Deletes a credential from encrypted storage.
 *
 * @param key - The credential identifier to delete
 * @throws Error if deletion fails
 */
export async function deleteCredential(key: string): Promise<void> {
  await invoke("delete_credential", { key });
}

/**
 * Checks if a credential exists in encrypted storage.
 *
 * @param key - The credential identifier to check
 * @returns true if the credential exists, false otherwise
 */
export async function hasCredential(key: string): Promise<boolean> {
  const result = await invoke<boolean>("has_credential", { key });
  return result;
}

/**
 * Lists all credential keys (not values) in storage.
 *
 * @returns Array of credential key names
 */
export async function listCredentialKeys(): Promise<string[]> {
  const result = await invoke<string[]>("list_credential_keys");
  return result;
}

/**
 * Clears all credentials from storage.
 * Use with caution - this is irreversible.
 *
 * @throws Error if clearing fails
 */
export async function clearAllCredentials(): Promise<void> {
  await invoke("clear_all_credentials");
}

// ============================================================================
// AI Provider API Key Helpers
// ============================================================================

/**
 * Generates the credential key for an AI provider's API key.
 *
 * @param configId - The provider configuration ID
 * @returns The full credential key
 */
export function getAIApiKeyCredentialKey(configId: string): string {
  return `${AI_API_KEY_PREFIX}${configId}`;
}

/**
 * Saves an AI provider's API key to encrypted storage.
 *
 * @param configId - The provider configuration ID
 * @param apiKey - The API key to store
 */
export async function saveAIApiKey(
  configId: string,
  apiKey: string,
): Promise<void> {
  const key = getAIApiKeyCredentialKey(configId);
  await saveCredential(key, apiKey);
}

/**
 * Retrieves an AI provider's API key from encrypted storage.
 *
 * @param configId - The provider configuration ID
 * @returns The API key, or null if not found
 */
export async function getAIApiKey(configId: string): Promise<string | null> {
  const key = getAIApiKeyCredentialKey(configId);
  return getCredential(key);
}

/**
 * Deletes an AI provider's API key from encrypted storage.
 *
 * @param configId - The provider configuration ID
 */
export async function deleteAIApiKey(configId: string): Promise<void> {
  const key = getAIApiKeyCredentialKey(configId);
  await deleteCredential(key);
}

/**
 * Checks if an AI provider's API key exists in encrypted storage.
 *
 * @param configId - The provider configuration ID
 * @returns true if the API key exists
 */
export async function hasAIApiKey(configId: string): Promise<boolean> {
  const key = getAIApiKeyCredentialKey(configId);
  return hasCredential(key);
}

// ============================================================================
// S3 Credential Helpers
// ============================================================================

/**
 * Saves S3 credentials to encrypted storage.
 *
 * @param accessKeyId - AWS access key ID
 * @param secretAccessKey - AWS secret access key
 */
export async function saveS3Credentials(
  accessKeyId: string,
  secretAccessKey: string,
): Promise<void> {
  await Promise.all([
    saveCredential(CREDENTIAL_KEYS.S3_ACCESS_KEY, accessKeyId),
    saveCredential(CREDENTIAL_KEYS.S3_SECRET_KEY, secretAccessKey),
  ]);
}

/**
 * Retrieves S3 credentials from encrypted storage.
 *
 * @returns Object with accessKeyId and secretAccessKey, or null if not found
 */
export async function getS3Credentials(): Promise<{
  accessKeyId: string;
  secretAccessKey: string;
} | null> {
  const [accessKeyId, secretAccessKey] = await Promise.all([
    getCredential(CREDENTIAL_KEYS.S3_ACCESS_KEY),
    getCredential(CREDENTIAL_KEYS.S3_SECRET_KEY),
  ]);

  if (accessKeyId && secretAccessKey) {
    return { accessKeyId, secretAccessKey };
  }
  return null;
}

/**
 * Deletes S3 credentials from encrypted storage.
 */
export async function deleteS3Credentials(): Promise<void> {
  await Promise.all([
    deleteCredential(CREDENTIAL_KEYS.S3_ACCESS_KEY),
    deleteCredential(CREDENTIAL_KEYS.S3_SECRET_KEY),
  ]);
}

/**
 * Checks if S3 credentials exist in encrypted storage.
 *
 * @returns true if both access key and secret key exist
 */
export async function hasS3Credentials(): Promise<boolean> {
  const [hasAccess, hasSecret] = await Promise.all([
    hasCredential(CREDENTIAL_KEYS.S3_ACCESS_KEY),
    hasCredential(CREDENTIAL_KEYS.S3_SECRET_KEY),
  ]);
  return hasAccess && hasSecret;
}

// ============================================================================
// Sync Encryption Password Helpers
// ============================================================================

/**
 * Saves the sync encryption password to encrypted storage.
 * This password is used for E2E encryption of notes/directories in S3.
 *
 * @param password - The encryption password to store
 */
export async function saveSyncEncryptionPassword(
  password: string,
): Promise<void> {
  await saveCredential(CREDENTIAL_KEYS.SYNC_ENCRYPTION_PASSWORD, password);
}

/**
 * Retrieves the sync encryption password from encrypted storage.
 *
 * @returns The encryption password, or null if not set
 */
export async function getSyncEncryptionPassword(): Promise<string | null> {
  return getCredential(CREDENTIAL_KEYS.SYNC_ENCRYPTION_PASSWORD);
}

/**
 * Deletes the sync encryption password from encrypted storage.
 */
export async function deleteSyncEncryptionPassword(): Promise<void> {
  await deleteCredential(CREDENTIAL_KEYS.SYNC_ENCRYPTION_PASSWORD);
}

/**
 * Checks if the sync encryption password exists in encrypted storage.
 *
 * @returns true if the encryption password is set
 */
export async function hasSyncEncryptionPassword(): Promise<boolean> {
  return hasCredential(CREDENTIAL_KEYS.SYNC_ENCRYPTION_PASSWORD);
}
