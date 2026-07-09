/**
 * Represents a configured S3 connection with minimal identifying information.
 * Used for connection management and UI display.
 */
export interface S3Connection {
  /** Unique identifier for this connection instance. */
  id: string;
  /** The bucket name (used as label for display). */
  bucket_name: string;
  /** AWS region or custom region used for this connection. */
  region: string;
  /** The S3 endpoint URL (e.g., "https://s3.us-east-1.amazonaws.com"). */
  endpoint_url: string;
}

/**
 * Full configuration required to establish an S3 connection.
 * Contains credentials and endpoint information.
 */
export interface S3ConnectionConfig {
  /** AWS access key ID or equivalent for authentication. */
  access_key_id: string;
  /** AWS secret access key for authentication. */
  secret_access_key: string;
  /** AWS region identifier (e.g., "us-east-1"). Optional, defaults to "us-east-1". */
  region?: string;
  /** Full URL of the S3 endpoint. */
  endpoint_url: string;
  /** Target bucket name for sync operations. */
  bucket_name: string;
}

/**
 * Metadata about an object stored in S3.
 */
export interface SyncObjectInfo {
  /** The object's key (path) in the bucket. */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ISO 8601 formatted timestamp of last modification. */
  last_modified: string;
}

/**
 * Current state of the S3 synchronization connection.
 */
export interface SyncState {
  /** Whether there is an active connection to S3. */
  isConnected: boolean;
  /** The current connection details, or null if not connected. */
  connection: S3Connection | null;
  /** Whether a sync operation is currently in progress. */
  isSyncing: boolean;
  /** ISO 8601 timestamp of the last successful sync, or null if never synced. */
  lastSyncAt: string | null;
  /** Error message from the last failed operation, or null if no errors. */
  lastError: string | null;
}

/**
 * Default timeout for S3 connection operations (in milliseconds).
 * This provides a fallback timeout on the frontend in case the backend
 * hangs indefinitely (especially important for Android).
 */
const S3_CONNECTION_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Creates a promise that rejects after the specified timeout.
 *
 * @param ms - Timeout in milliseconds.
 * @param operation - Description of the operation for the error message.
 * @returns A promise that rejects with a timeout error.
 */
function createTimeout<T>(ms: number, operation: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operation} timed out after ${ms / 1000} seconds`));
    }, ms);
  });
}

/**
 * Establishes a connection to an S3-compatible storage service.
 *
 * @param config - The connection configuration including credentials and endpoint.
 * @returns A promise that resolves to the established connection.
 * @throws Error if the connection cannot be established or times out.
 */
export async function connectS3Sync(
  config: S3ConnectionConfig,
): Promise<S3Connection> {
  const { invoke } = await import("@/lib/desktop-adapter");

  // Race between the actual invoke and a timeout to prevent indefinite hanging
  // This is especially important on Android where network operations can hang
  const result = await Promise.race([
    invoke<S3Connection>("connect_s3_sync", { config }),
    createTimeout<S3Connection>(
      S3_CONNECTION_TIMEOUT_MS,
      "S3 connection validation",
    ),
  ]);

  return result;
}

/**
 * Disconnects from an S3 connection and releases resources.
 *
 * @param connectionId - The unique identifier of the connection to disconnect.
 * @returns A promise that resolves when disconnection is complete.
 */
export async function disconnectS3Sync(connectionId: string): Promise<void> {
  const { invoke } = await import("@/lib/desktop-adapter");
  await invoke("disconnect_s3_sync", { connectionId });
}

/**
 * Options for synchronizing data to S3.
 */
export interface SyncOptions {
  /** The unique identifier of the active connection. */
  connectionId: string;
  /** The target bucket name. */
  bucketName: string;
  /** Optional specific backup key to use. If not provided, a new key will be generated. */
  backupKey?: string;
}

// ============================================================================
// Incremental Sync Operations (Three-Way Comparison Model)
// ============================================================================
// The following functions support the new incremental sync model that
// operates on individual entities rather than full backup replacements.

/**
 * Extended metadata for an S3 sync object.
 * Includes additional fields compared to SyncObjectInfo for sync record management.
 */
export interface SyncObjectMetadata {
  /** The object's key (path) in the bucket. */
  key: string;
  /** Object size in bytes. */
  size: number;
  /** ISO 8601 formatted timestamp of last modification. */
  last_modified: string;
  /** ETag hash for content verification. */
  etag: string;
  /** MIME type of the object. */
  content_type: string;
}

/**
 * Result of uploading a sync object.
 */
export interface UploadSyncObjectResult {
  /** The key of the uploaded object. */
  key: string;
  /** ETag returned by S3 for the uploaded object. */
  etag: string;
  /** ISO 8601 formatted timestamp when S3 stored the object. */
  last_modified: string;
}

export type UploadSyncBinaryResult = UploadSyncObjectResult;

/**
 * Result of a batch remote delete.
 */
export interface DeleteSyncObjectsBatchResult {
  /** Keys confirmed deleted by the backend. */
  deleted_keys: string[];
  /** Keys that failed deletion or were not confirmed deleted. */
  failed_keys: string[];
  /** Human-readable error details for failures. */
  errors: string[];
}

/**
 * Uploads a single JSON entity to S3 for incremental sync.
 *
 * Used by the three-way sync engine to upload individual notes or directories.
 *
 * @param connectionId - The unique identifier of the active connection.
 * @param bucketName - The target bucket name.
 * @param key - The object key (e.g., "notes/{uuid}.json").
 * @param jsonContent - The JSON string to upload.
 * @returns A promise that resolves to the upload result with ETag.
 */
export async function uploadSyncObject(
  connectionId: string,
  bucketName: string,
  key: string,
  jsonContent: string,
): Promise<UploadSyncObjectResult> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<UploadSyncObjectResult>("upload_sync_object", {
    opts: {
      connection_id: connectionId,
      bucket_name: bucketName,
      key,
      json_content: jsonContent,
    },
  });
  return result;
}

/**
 * Downloads a single sync object as a string from S3.
 *
 * Used by the three-way sync engine to download individual notes or directories.
 *
 * @param connectionId - The unique identifier of the active connection.
 * @param bucketName - The source bucket name.
 * @param key - The object key to download.
 * @returns A promise that resolves to the JSON content of the object.
 */
export async function downloadSyncObject(
  connectionId: string,
  bucketName: string,
  key: string,
): Promise<string> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<string>("download_sync_object", {
    opts: {
      connection_id: connectionId,
      bucket_name: bucketName,
      key,
    },
  });
  return result;
}

/**
 * Uploads a single binary object to S3 for incremental sync.
 *
 * Used by the sync engine for encrypted image blobs.
 */
export async function uploadSyncBinaryObject(
  connectionId: string,
  bucketName: string,
  key: string,
  bytes: Uint8Array,
  contentType = "application/octet-stream",
): Promise<UploadSyncBinaryResult> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<UploadSyncBinaryResult>("upload_sync_binary", {
    opts: {
      connection_id: connectionId,
      bucket_name: bucketName,
      key,
      bytes: Array.from(bytes),
      content_type: contentType,
    },
  });
  return result;
}

/**
 * Downloads a single binary sync object from S3.
 *
 * Used by the sync engine for encrypted image blobs.
 */
export async function downloadSyncBinaryObject(
  connectionId: string,
  bucketName: string,
  key: string,
): Promise<Uint8Array> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<number[] | Uint8Array>("download_sync_binary", {
    opts: {
      connection_id: connectionId,
      bucket_name: bucketName,
      key,
    },
  });
  return result instanceof Uint8Array ? result : Uint8Array.from(result);
}

/**
 * Batch deletes multiple sync objects from S3.
 *
 * Used by the three-way sync engine to efficiently delete multiple remote entities.
 * Supports up to 1000 keys per request (S3 DeleteObjects API limit).
 *
 * @param connectionId - The unique identifier of the active connection.
 * @param bucketName - The bucket containing the objects.
 * @param keys - Array of object keys to delete.
 * @returns Per-key delete results from the backend.
 */
export async function deleteSyncObjectsBatch(
  connectionId: string,
  bucketName: string,
  keys: string[],
): Promise<DeleteSyncObjectsBatchResult> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<DeleteSyncObjectsBatchResult>(
    "delete_sync_objects_batch",
    {
      opts: {
        connection_id: connectionId,
        bucket_name: bucketName,
        keys,
      },
    },
  );
  return result;
}

/**
 * Gets metadata for a single sync object without downloading its content.
 *
 * Uses S3 HeadObject API to efficiently retrieve metadata (size, mtime, etag).
 * Useful for verifying remote state before sync operations.
 *
 * @param connectionId - The unique identifier of the active connection.
 * @param bucketName - The bucket containing the object.
 * @param key - The object key to get metadata for.
 * @returns A promise that resolves to the object metadata.
 * @throws Error if the object doesn't exist or the request fails.
 */
export async function getSyncObjectMetadata(
  connectionId: string,
  bucketName: string,
  key: string,
): Promise<SyncObjectMetadata> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<SyncObjectMetadata>("get_sync_object_metadata", {
    opts: {
      connection_id: connectionId,
      bucket_name: bucketName,
      key,
    },
  });
  return result;
}

/**
 * Lists all sync objects (notes and directories) in the bucket with a given prefix.
 *
 * Used by the sync engine to collect the remote state for three-way comparison.
 *
 * @param connectionId - The unique identifier of the active connection.
 * @param bucketName - The bucket to list objects from.
 * @param prefix - Key prefix filter (e.g., "notes/" or "directories/").
 * @returns A promise that resolves to an array of object metadata.
 */
export async function listSyncObjects(
  connectionId: string,
  bucketName: string,
  prefix: string,
): Promise<SyncObjectInfo[]> {
  const { invoke } = await import("@/lib/desktop-adapter");
  const result = await invoke<SyncObjectInfo[]>("list_sync_objects", {
    opts: {
      connection_id: connectionId,
      bucket_name: bucketName,
      prefix,
    },
  });
  return result;
}
