use std::path::PathBuf;

use axum::{
    Router,
    body::{Body, to_bytes},
    http::{Method, Request, StatusCode, header::CONTENT_TYPE},
};
use serde_json::Value;
use sqlx::{PgPool, postgres::PgPoolOptions};
use tower::ServiceExt;
use uuid::Uuid;

use crate::{
    app::{self, AppState},
    config::{
        AppConfig, Environment, ObjectStorageConfig, ObjectStorageProvider, ThirdPartyConfig,
    },
    media::MediaStorage,
};

const LOCAL_TEST_DATABASE_URL: &str =
    "postgres://friendminton:friendminton@localhost:5432/friendminton";

pub(crate) struct TestApi {
    router: Router,
    pub(crate) pool: PgPool,
    pub(crate) upload_dir: PathBuf,
}

pub(crate) struct TestResponse {
    pub(crate) status: StatusCode,
    pub(crate) body: Value,
}

impl TestApi {
    pub(crate) async fn new() -> Self {
        let pool = test_pool().await;
        let upload_dir =
            std::env::temp_dir().join(format!("friendminton-api-test-{}", Uuid::new_v4()));
        let config = test_config(&upload_dir);
        let router = app::router(
            AppState {
                pool: pool.clone(),
                upload_dir: upload_dir.clone(),
                media: MediaStorage::Local {
                    upload_dir: upload_dir.clone(),
                },
            },
            &config,
        );

        Self {
            router,
            pool,
            upload_dir,
        }
    }

    pub(crate) async fn json(
        &self,
        method: Method,
        uri: &str,
        user_id: Option<Uuid>,
        body: Option<Value>,
    ) -> TestResponse {
        let body = body
            .map(|body| body.to_string().into_bytes())
            .unwrap_or_default();
        self.request(
            method,
            uri,
            user_id,
            (!body.is_empty()).then_some("application/json"),
            body,
        )
        .await
    }

    pub(crate) async fn request(
        &self,
        method: Method,
        uri: &str,
        user_id: Option<Uuid>,
        content_type: Option<&str>,
        body: Vec<u8>,
    ) -> TestResponse {
        let mut request = Request::builder().method(method).uri(uri);
        if let Some(user_id) = user_id {
            request = request.header("x-user-id", user_id.to_string());
        }
        if let Some(content_type) = content_type {
            request = request.header(CONTENT_TYPE, content_type);
        }

        let response = self
            .router
            .clone()
            .oneshot(request.body(Body::from(body)).expect("build test request"))
            .await
            .expect("route test response");
        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("read route test response");
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice::<Value>(&bytes)
                .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()))
        };

        TestResponse { status, body }
    }

    pub(crate) async fn insert_user(&self, label: &str) -> Uuid {
        let id = Uuid::new_v4();
        sqlx::query(
            r#"
            INSERT INTO users (id, email, display_name, city, skill_level)
            VALUES ($1, $2, $3, 'RouteTestOnly', 'intermediate')
            "#,
        )
        .bind(id)
        .bind(format!("{label}-{id}@example.test"))
        .bind(format!("Test {label}"))
        .execute(&self.pool)
        .await
        .expect("insert route test user");
        id
    }

    pub(crate) async fn cleanup_users(&self, user_ids: &[Uuid]) {
        for user_id in user_ids {
            sqlx::query("DELETE FROM users WHERE id = $1")
                .bind(user_id)
                .execute(&self.pool)
                .await
                .expect("clean up route test user");
        }
    }
}

impl Drop for TestApi {
    fn drop(&mut self) {
        if self.upload_dir.exists() {
            std::fs::remove_dir_all(&self.upload_dir)
                .expect("clean up route test upload directory");
        }
    }
}

async fn test_pool() -> PgPool {
    let database_url = std::env::var("TEST_DATABASE_URL")
        .or_else(|_| std::env::var("DATABASE_URL"))
        .unwrap_or_else(|_| LOCAL_TEST_DATABASE_URL.to_owned());
    let pool = PgPoolOptions::new()
        .max_connections(8)
        .connect(&database_url)
        .await
        .unwrap_or_else(|error| {
            panic!(
                "connect to the route-test database at {database_url}: {error}. \
                 Start PostgreSQL or set TEST_DATABASE_URL"
            )
        });
    sqlx::migrate!("./migrations")
        .run(&pool)
        .await
        .expect("migrate route-test database");
    pool
}

fn test_config(upload_dir: &std::path::Path) -> AppConfig {
    AppConfig {
        environment: Environment::Development,
        database_url: LOCAL_TEST_DATABASE_URL.to_owned(),
        public_base_url: "http://localhost:3000".to_owned(),
        server_addr: "127.0.0.1:0".to_owned(),
        upload_dir: upload_dir.to_string_lossy().into_owned(),
        third_party: ThirdPartyConfig {
            object_storage: ObjectStorageConfig {
                provider: ObjectStorageProvider::Local,
                aws_region: "us-west-2".to_owned(),
                bucket: None,
            },
        },
    }
}

pub(crate) fn response_uuid(body: &Value, field: &str) -> Uuid {
    Uuid::parse_str(
        body.get(field)
            .and_then(Value::as_str)
            .unwrap_or_else(|| panic!("response field `{field}` should be a UUID: {body}")),
    )
    .unwrap_or_else(|error| panic!("parse response field `{field}` as UUID: {error}"))
}

pub(crate) fn response_ids(body: &Value) -> Vec<Uuid> {
    body.as_array()
        .unwrap_or_else(|| panic!("response should be an array: {body}"))
        .iter()
        .map(|item| response_uuid(item, "id"))
        .collect()
}
