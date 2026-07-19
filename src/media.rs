use std::{
    collections::HashMap, future::Future, path::PathBuf, pin::Pin, sync::Arc, time::Duration,
};

use aws_config::BehaviorVersion;
use aws_sdk_s3::{Client, config::Region, presigning::PresigningConfig};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{db::Config, error::AppError};

const UPLOAD_URL_TTL: Duration = Duration::from_secs(5 * 60);
const READ_URL_TTL: Duration = Duration::from_secs(60 * 60);
pub const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

pub(crate) type StorageFuture<'a, T> =
    Pin<Box<dyn Future<Output = Result<T, AppError>> + Send + 'a>>;

pub(crate) struct SignedUpload {
    url: String,
    headers: HashMap<String, String>,
}

pub(crate) trait ObjectStore: Send + Sync {
    fn presign_upload<'a>(
        &'a self,
        object_key: &'a str,
        content_type: &'a str,
        size_bytes: i64,
    ) -> StorageFuture<'a, SignedUpload>;

    fn presign_read<'a>(&'a self, object_key: &'a str) -> StorageFuture<'a, String>;
}

struct AwsS3Store {
    bucket: String,
    client: Client,
}

impl ObjectStore for AwsS3Store {
    fn presign_upload<'a>(
        &'a self,
        object_key: &'a str,
        content_type: &'a str,
        size_bytes: i64,
    ) -> StorageFuture<'a, SignedUpload> {
        Box::pin(async move {
            let request = self
                .client
                .put_object()
                .bucket(&self.bucket)
                .key(object_key)
                .content_type(content_type)
                .content_length(size_bytes)
                .presigned(presigning_config(UPLOAD_URL_TTL)?)
                .await
                .map_err(|error| AppError::Media(error.to_string()))?;
            let headers = request
                .headers()
                .map(|(name, value)| (name.to_owned(), value.to_owned()))
                .collect();
            Ok(SignedUpload {
                url: request.uri().to_string(),
                headers,
            })
        })
    }

    fn presign_read<'a>(&'a self, object_key: &'a str) -> StorageFuture<'a, String> {
        Box::pin(async move {
            self.client
                .get_object()
                .bucket(&self.bucket)
                .key(object_key)
                .presigned(presigning_config(READ_URL_TTL)?)
                .await
                .map(|request| request.uri().to_string())
                .map_err(|error| AppError::Media(error.to_string()))
        })
    }
}

#[derive(Clone)]
pub enum MediaStorage {
    Local { upload_dir: PathBuf },
    S3 { store: Arc<dyn ObjectStore> },
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateUploadTarget {
    pub content_type: String,
    pub size_bytes: i64,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct UploadTarget {
    pub object_key: String,
    pub upload_url: String,
    pub headers: HashMap<String, String>,
}

impl MediaStorage {
    pub async fn from_config(config: &Config) -> Self {
        let Some(bucket) = &config.s3_bucket else {
            return Self::Local {
                upload_dir: config.upload_dir.clone().into(),
            };
        };

        let sdk_config = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(config.aws_region.clone()))
            .load()
            .await;

        Self::S3 {
            store: Arc::new(AwsS3Store {
                bucket: bucket.clone(),
                client: Client::new(&sdk_config),
            }),
        }
    }

    pub async fn create_upload_target(
        &self,
        user_id: Uuid,
        content_type: &str,
        size_bytes: i64,
    ) -> Result<UploadTarget, AppError> {
        if !(1..=MAX_IMAGE_BYTES as i64).contains(&size_bytes) {
            return Err(AppError::BadRequest(
                "image must be 10 MB or smaller".to_owned(),
            ));
        }
        let extension = image_extension(content_type)?;
        let object_key = format!("posts/{user_id}/{}.{}", Uuid::new_v4(), extension);
        let (upload_url, headers) = match self {
            Self::Local { .. } => (
                format!("/api/uploads/{object_key}"),
                HashMap::from([("content-type".to_owned(), content_type.to_owned())]),
            ),
            Self::S3 { store } => {
                let signed = store
                    .presign_upload(&object_key, content_type, size_bytes)
                    .await?;
                (signed.url, signed.headers)
            }
        };

        Ok(UploadTarget {
            object_key,
            upload_url,
            headers,
        })
    }

    pub async fn store_local(
        &self,
        user_id: Uuid,
        object_key: &str,
        content_type: &str,
        bytes: &[u8],
    ) -> Result<(), AppError> {
        image_extension(content_type)?;
        validate_object_key(user_id, object_key)?;

        let Self::Local { upload_dir } = self else {
            return Err(AppError::BadRequest(
                "local uploads are disabled".to_owned(),
            ));
        };

        let path = upload_dir.join(object_key);
        let parent = path
            .parent()
            .ok_or_else(|| AppError::BadRequest("invalid object key".to_owned()))?;
        tokio::fs::create_dir_all(parent).await?;
        tokio::fs::write(path, bytes).await?;
        Ok(())
    }

    pub async fn read_urls(&self, object_keys: &[String]) -> Result<Vec<String>, AppError> {
        let mut urls = Vec::with_capacity(object_keys.len());

        for object_key in object_keys {
            let url = match self {
                Self::Local { .. } => format!("/uploads/{object_key}"),
                Self::S3 { store } => store.presign_read(object_key).await?,
            };
            urls.push(url);
        }

        Ok(urls)
    }
}

pub fn validate_object_keys(user_id: Uuid, object_keys: &[String]) -> Result<(), AppError> {
    if object_keys.len() > 4 {
        return Err(AppError::BadRequest(
            "posts support up to four uploaded photos".to_owned(),
        ));
    }

    for object_key in object_keys {
        validate_object_key(user_id, object_key)?;
    }

    Ok(())
}

fn validate_object_key(user_id: Uuid, object_key: &str) -> Result<(), AppError> {
    let expected_prefix = format!("posts/{user_id}/");
    if !object_key.starts_with(&expected_prefix)
        || object_key.contains("..")
        || object_key.contains('\\')
    {
        return Err(AppError::BadRequest("invalid photo object key".to_owned()));
    }
    Ok(())
}

fn image_extension(content_type: &str) -> Result<&'static str, AppError> {
    match content_type {
        "image/jpeg" => Ok("jpg"),
        "image/png" => Ok("png"),
        "image/webp" => Ok("webp"),
        "image/heic" | "image/heif" => Ok("heic"),
        _ => Err(AppError::BadRequest(
            "photo must be JPEG, PNG, WebP, or HEIC".to_owned(),
        )),
    }
}

fn presigning_config(expires_in: Duration) -> Result<PresigningConfig, AppError> {
    PresigningConfig::builder()
        .expires_in(expires_in)
        .build()
        .map_err(|error| AppError::Media(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_IMAGE_BYTES, MediaStorage, ObjectStore, SignedUpload, StorageFuture,
        validate_object_keys,
    };
    use std::{collections::HashMap, path::PathBuf, sync::Arc};
    use uuid::Uuid;

    struct MockObjectStore;

    impl ObjectStore for MockObjectStore {
        fn presign_upload<'a>(
            &'a self,
            object_key: &'a str,
            content_type: &'a str,
            size_bytes: i64,
        ) -> StorageFuture<'a, SignedUpload> {
            Box::pin(async move {
                assert!(object_key.starts_with("posts/"));
                assert!(object_key.ends_with(".webp"));
                assert_eq!(content_type, "image/webp");
                assert_eq!(size_bytes, 2048);
                Ok(SignedUpload {
                    url: format!("https://mock-s3.example/{object_key}?signature=test"),
                    headers: HashMap::from([
                        ("content-type".to_owned(), content_type.to_owned()),
                        ("content-length".to_owned(), size_bytes.to_string()),
                    ]),
                })
            })
        }

        fn presign_read<'a>(&'a self, object_key: &'a str) -> StorageFuture<'a, String> {
            Box::pin(async move {
                Ok(format!(
                    "https://mock-s3.example/{object_key}?read-signature=test"
                ))
            })
        }
    }

    #[test]
    fn object_keys_are_scoped_to_the_current_user() {
        let user_id = Uuid::new_v4();
        let other_user_id = Uuid::new_v4();

        assert!(validate_object_keys(user_id, &[format!("posts/{user_id}/photo.jpg")]).is_ok());
        assert!(
            validate_object_keys(user_id, &[format!("posts/{other_user_id}/photo.jpg")]).is_err()
        );
        assert!(validate_object_keys(user_id, &[format!("posts/{user_id}/../photo.jpg")]).is_err());
    }

    #[tokio::test]
    async fn local_upload_targets_are_typed_and_size_limited() {
        let storage = MediaStorage::Local {
            upload_dir: "uploads".into(),
        };
        let user_id = Uuid::new_v4();
        let target = storage
            .create_upload_target(user_id, "image/png", 1024)
            .await
            .expect("valid upload target");

        assert!(target.object_key.starts_with(&format!("posts/{user_id}/")));
        assert_eq!(
            target.headers.get("content-type"),
            Some(&"image/png".to_owned())
        );
        assert!(
            storage
                .create_upload_target(user_id, "image/png", MAX_IMAGE_BYTES as i64 + 1)
                .await
                .is_err()
        );
        assert!(
            storage
                .create_upload_target(user_id, "image/png", 0)
                .await
                .is_err()
        );
        assert!(
            storage
                .create_upload_target(user_id, "application/pdf", 1024)
                .await
                .is_err()
        );
    }

    #[tokio::test]
    async fn local_storage_writes_and_resolves_owned_images() {
        let user_id = Uuid::new_v4();
        let upload_dir = temporary_upload_dir();
        let storage = MediaStorage::Local {
            upload_dir: upload_dir.clone(),
        };
        let object_key = format!("posts/{user_id}/photo.jpg");

        storage
            .store_local(user_id, &object_key, "image/jpeg", b"test-image")
            .await
            .expect("store image");

        let stored = tokio::fs::read(upload_dir.join(&object_key))
            .await
            .expect("read stored image");
        let urls = storage
            .read_urls(std::slice::from_ref(&object_key))
            .await
            .expect("resolve image URL");

        assert_eq!(stored, b"test-image");
        assert_eq!(urls, vec![format!("/uploads/{object_key}")]);

        tokio::fs::remove_dir_all(upload_dir)
            .await
            .expect("clean temporary upload directory");
    }

    #[tokio::test]
    async fn local_storage_rejects_another_users_object_key() {
        let user_id = Uuid::new_v4();
        let other_user_id = Uuid::new_v4();
        let upload_dir = temporary_upload_dir();
        let storage = MediaStorage::Local {
            upload_dir: upload_dir.clone(),
        };

        let result = storage
            .store_local(
                user_id,
                &format!("posts/{other_user_id}/photo.jpg"),
                "image/jpeg",
                b"test-image",
            )
            .await;

        assert!(result.is_err());
        assert!(!upload_dir.exists());
    }

    #[tokio::test]
    async fn s3_upload_target_uses_the_object_store_contract() {
        let storage = MediaStorage::S3 {
            store: Arc::new(MockObjectStore),
        };
        let user_id = Uuid::new_v4();

        let target = storage
            .create_upload_target(user_id, "image/webp", 2048)
            .await
            .expect("presign S3 upload");

        assert!(target.upload_url.starts_with("https://mock-s3.example/"));
        assert!(target.upload_url.contains("signature=test"));
        assert!(target.object_key.starts_with(&format!("posts/{user_id}/")));
        assert_eq!(
            target.headers.get("content-type"),
            Some(&"image/webp".to_owned())
        );
        assert_eq!(
            target.headers.get("content-length"),
            Some(&"2048".to_owned())
        );
    }

    #[tokio::test]
    async fn s3_read_urls_use_the_object_store_contract() {
        let storage = MediaStorage::S3 {
            store: Arc::new(MockObjectStore),
        };
        let key = "posts/user/photo.webp".to_owned();

        let urls = storage
            .read_urls(std::slice::from_ref(&key))
            .await
            .expect("resolve mocked S3 URL");

        assert_eq!(
            urls,
            vec!["https://mock-s3.example/posts/user/photo.webp?read-signature=test"]
        );
    }

    fn temporary_upload_dir() -> PathBuf {
        std::env::temp_dir().join(format!("friendminton-media-test-{}", Uuid::new_v4()))
    }
}
