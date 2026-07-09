/**
 * S3 configuration storage with encrypted credentials.
 *
 * Non-sensitive config (bucket_name, endpoint_url, region) is stored in plaintext store.
 * Sensitive credentials (access_key_id, secret_access_key) are encrypted using
 * AES-256-GCM with a machine-bound key.
 */

import { invoke } from "@/lib/desktop-adapter";

import {
  deleteS3Credentials,
  getS3Credentials,
  saveS3Credentials,
} from "../credentials";

/**
 * Full S3 configuration including credentials.
 */
export interface S3Config {
  /** The target bucket name for sync operations. */
  bucket_name: string;
  /** AWS access key ID or equivalent for authentication. */
  access_key_id: string;
  /** AWS secret access key for authentication. */
  secret_access_key: string;
  /** AWS region or custom region for S3-compatible services. */
  region: string;
  /** Full URL of the S3 endpoint. */
  endpoint_url: string;
}

/**
 * Non-sensitive S3 configuration stored in plaintext store.
 * Used internally for Rust backend calls.
 */
interface S3ConfigMeta {
  bucket_name: string;
  region?: string;
  endpoint_url: string;
}

/**
 * Saves S3 configuration with encrypted credentials.
 *
 * Non-sensitive config is stored in plaintext store for Rust backend access.
 * Credentials are encrypted using AES-256-GCM and stored separately.
 *
 * @param config - The full S3 configuration to store
 * @throws Error if saving fails
 */
export async function saveS3Config(config: S3Config): Promise<void> {
  // Save only non-sensitive config to Rust backend store
  // The Rust backend only needs non-sensitive metadata.
  const meta: S3ConfigMeta = {
    bucket_name: config.bucket_name,
    region: config.region,
    endpoint_url: config.endpoint_url,
  };
  await invoke("save_s3_config", { config: meta });

  // Save credentials to encrypted storage
  await saveS3Credentials(config.access_key_id, config.secret_access_key);
}

/**
 * Retrieves S3 configuration with decrypted credentials.
 *
 * Combines non-sensitive config from plaintext store with
 * decrypted credentials from encrypted storage.
 *
 * @returns The full S3 configuration, or null if none exists
 * @throws Error if retrieval or decryption fails
 */
export async function getS3Config(): Promise<S3Config | null> {
  // Get non-sensitive config from Rust backend.
  const meta = await invoke<S3ConfigMeta | null>("get_s3_config");
  if (!meta) {
    return null;
  }

  // Get encrypted credentials
  const credentials = await getS3Credentials();
  if (!credentials) {
    // Config exists but credentials are missing (migration case)
    // Return null to trigger re-authentication
    return null;
  }

  return {
    bucket_name: meta.bucket_name,
    region: meta.region ?? "us-east-1",
    endpoint_url: meta.endpoint_url,
    access_key_id: credentials.accessKeyId,
    secret_access_key: credentials.secretAccessKey,
  };
}

/**
 * Deletes S3 configuration and encrypted credentials.
 *
 * @throws Error if deletion fails
 */
export async function deleteS3Config(): Promise<void> {
  // Delete from both stores
  await Promise.all([invoke("delete_s3_config"), deleteS3Credentials()]);
}

/**
 * Checks if S3 configuration exists (both config and credentials).
 *
 * @returns true if both configuration and credentials exist
 * @throws Error if check fails
 */
export async function hasS3Config(): Promise<boolean> {
  const result = await invoke<boolean>("has_s3_config");
  if (!result) {
    return false;
  }

  // Also check if credentials exist
  const credentials = await getS3Credentials();
  return credentials !== null;
}

/**
 * Result of migrating legacy S3 credentials.
 */
interface S3MigrationResult {
  /** Whether migration was needed and performed. */
  migrated: boolean;
  /** The access key ID if extracted from legacy config. */
  access_key_id: string | null;
  /** The secret access key if extracted from legacy config. */
  secret_access_key: string | null;
}
