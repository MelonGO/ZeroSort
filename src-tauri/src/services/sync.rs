//! S3-compatible sync operations for cloud sync.

use parking_lot::Mutex;
use s3::creds::Credentials;
use s3::{Bucket, Region};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncConnectionConfig {
    pub access_key_id: String,
    pub secret_access_key: String,
    pub region: Option<String>,
    pub endpoint_url: String,
    pub bucket_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Connection {
    pub id: String,
    pub bucket_name: String,
    pub region: String,
    pub endpoint_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncObjectInfo {
    pub key: String,
    pub size: i64,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncObjectMetadata {
    pub key: String,
    pub size: i64,
    pub last_modified: String,
    pub etag: String,
    pub content_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadResult {
    pub key: String,
    pub etag: String,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeleteBatchResult {
    pub deleted_keys: Vec<String>,
    pub failed_keys: Vec<String>,
    pub errors: Vec<String>,
}

struct ConnectionEntry {
    bucket: Box<Bucket>,
}

pub struct S3ConnectionManager {
    connections: Mutex<HashMap<String, Arc<ConnectionEntry>>>,
}

impl S3ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
        }
    }

    pub async fn connect(&self, config: SyncConnectionConfig) -> Result<S3Connection, String> {
        let region_name = config
            .region
            .clone()
            .unwrap_or_else(|| "us-east-1".to_string());

        let region = Region::Custom {
            region: region_name.clone(),
            endpoint: config.endpoint_url.clone(),
        };

        let credentials = Credentials::new(
            Some(&config.access_key_id),
            Some(&config.secret_access_key),
            None,
            None,
            None,
        )
        .map_err(|e| format!("Invalid credentials: {e}"))?;

        let mut bucket = Bucket::new(&config.bucket_name, region, credentials)
            .map_err(|e| format!("Failed to create bucket client: {e}"))?
            .with_path_style();

        // Validate bucket access with a list (head_bucket equivalent).
        bucket
            .list("".to_string(), Some("/".to_string()))
            .await
            .map_err(|e| format!("Failed to access bucket: {e}"))?;

        // Re-create without delimiter for normal ops — keep the same client.
        let region = Region::Custom {
            region: region_name.clone(),
            endpoint: config.endpoint_url.clone(),
        };
        let credentials = Credentials::new(
            Some(&config.access_key_id),
            Some(&config.secret_access_key),
            None,
            None,
            None,
        )
        .map_err(|e| format!("Invalid credentials: {e}"))?;
        bucket = Bucket::new(&config.bucket_name, region, credentials)
            .map_err(|e| format!("Failed to create bucket client: {e}"))?
            .with_path_style();

        let id = Uuid::new_v4().to_string();
        self.connections.lock().insert(
            id.clone(),
            Arc::new(ConnectionEntry { bucket }),
        );

        Ok(S3Connection {
            id,
            bucket_name: config.bucket_name,
            region: region_name,
            endpoint_url: config.endpoint_url,
        })
    }

    pub fn disconnect(&self, connection_id: &str) {
        self.connections.lock().remove(connection_id);
    }

    fn get_bucket(&self, connection_id: &str) -> Result<Arc<ConnectionEntry>, String> {
        self.connections
            .lock()
            .get(connection_id)
            .cloned()
            .ok_or_else(|| "Connection not found".to_string())
    }

    pub async fn list_objects(
        &self,
        connection_id: &str,
        _bucket_name: &str,
        prefix: &str,
    ) -> Result<Vec<SyncObjectInfo>, String> {
        let entry = self.get_bucket(connection_id)?;
        let results = entry
            .bucket
            .list(prefix.to_string(), None)
            .await
            .map_err(|e| format!("Failed to list objects: {e}"))?;

        let mut objects = Vec::new();
        for list in results {
            for obj in list.contents {
                objects.push(SyncObjectInfo {
                    key: obj.key,
                    size: obj.size as i64,
                    last_modified: obj.last_modified,
                });
            }
        }
        Ok(objects)
    }

    pub async fn get_object_metadata(
        &self,
        connection_id: &str,
        _bucket_name: &str,
        key: &str,
    ) -> Result<SyncObjectMetadata, String> {
        let entry = self.get_bucket(connection_id)?;
        let (head, _status) = entry
            .bucket
            .head_object(key)
            .await
            .map_err(|e| format!("Failed to get object metadata: {e}"))?;

        Ok(SyncObjectMetadata {
            key: key.to_string(),
            size: head.content_length.unwrap_or(0),
            last_modified: head
                .last_modified
                .unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
            etag: head
                .e_tag
                .unwrap_or_default()
                .trim_matches('"')
                .to_string(),
            content_type: head
                .content_type
                .unwrap_or_else(|| "application/octet-stream".to_string()),
        })
    }

    pub async fn upload_object(
        &self,
        connection_id: &str,
        bucket_name: &str,
        key: &str,
        content: &str,
        content_type: Option<&str>,
    ) -> Result<UploadResult, String> {
        self.upload_binary(
            connection_id,
            bucket_name,
            key,
            content.as_bytes().to_vec(),
            content_type.or(Some("application/json")),
        )
        .await
    }

    pub async fn upload_binary(
        &self,
        connection_id: &str,
        _bucket_name: &str,
        key: &str,
        bytes: Vec<u8>,
        content_type: Option<&str>,
    ) -> Result<UploadResult, String> {
        let entry = self.get_bucket(connection_id)?;
        let response = entry
            .bucket
            .put_object_with_content_type(
                key,
                &bytes,
                content_type.unwrap_or("application/octet-stream"),
            )
            .await
            .map_err(|e| format!("Failed to upload binary: {e}"))?;

        if response.status_code() >= 400 {
            return Err(format!(
                "Failed to upload binary: status {}",
                response.status_code()
            ));
        }

        let meta = self
            .get_object_metadata(connection_id, _bucket_name, key)
            .await?;
        Ok(UploadResult {
            key: key.to_string(),
            etag: meta.etag,
            last_modified: meta.last_modified,
        })
    }

    pub async fn download_object(
        &self,
        connection_id: &str,
        bucket_name: &str,
        key: &str,
    ) -> Result<String, String> {
        let bytes = self
            .download_binary(connection_id, bucket_name, key)
            .await?;
        String::from_utf8(bytes).map_err(|e| format!("Failed to decode object as UTF-8: {e}"))
    }

    pub async fn download_binary(
        &self,
        connection_id: &str,
        _bucket_name: &str,
        key: &str,
    ) -> Result<Vec<u8>, String> {
        let entry = self.get_bucket(connection_id)?;
        let response = entry
            .bucket
            .get_object(key)
            .await
            .map_err(|e| format!("Failed to download binary: {e}"))?;

        if response.status_code() >= 400 {
            return Err(format!(
                "Failed to download binary: status {}",
                response.status_code()
            ));
        }

        Ok(response.bytes().to_vec())
    }

    pub async fn delete_batch(
        &self,
        connection_id: &str,
        _bucket_name: &str,
        keys: &[String],
    ) -> Result<DeleteBatchResult, String> {
        let mut result = DeleteBatchResult {
            deleted_keys: Vec::new(),
            failed_keys: Vec::new(),
            errors: Vec::new(),
        };

        if keys.is_empty() {
            return Ok(result);
        }

        let entry = self.get_bucket(connection_id)?;
        for key in keys {
            match entry.bucket.delete_object(key).await {
                Ok(response) if response.status_code() < 400 => {
                    result.deleted_keys.push(key.clone());
                }
                Ok(response) => {
                    result.failed_keys.push(key.clone());
                    result
                        .errors
                        .push(format!("{key}: status {}", response.status_code()));
                }
                Err(e) => {
                    result.failed_keys.push(key.clone());
                    result.errors.push(format!("{key}: {e}"));
                }
            }
        }

        Ok(result)
    }
}

impl Default for S3ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}
