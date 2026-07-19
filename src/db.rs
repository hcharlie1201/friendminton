use sqlx::{Pool, Postgres, postgres::PgPoolOptions};

#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub server_addr: String,
    pub upload_dir: String,
    pub s3_bucket: Option<String>,
    pub aws_region: String,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: std::env::var("DATABASE_URL").unwrap_or_else(|_| {
                "postgres://friendminton:friendminton@localhost:5432/friendminton".to_owned()
            }),
            server_addr: std::env::var("SERVER_ADDR")
                .unwrap_or_else(|_| "127.0.0.1:3000".to_owned()),
            upload_dir: std::env::var("UPLOAD_DIR").unwrap_or_else(|_| "uploads".to_owned()),
            s3_bucket: std::env::var("S3_BUCKET")
                .ok()
                .filter(|value| !value.is_empty()),
            aws_region: std::env::var("AWS_REGION").unwrap_or_else(|_| "us-west-2".to_owned()),
        }
    }
}

pub async fn connect(config: &Config) -> Result<Pool<Postgres>, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
}
