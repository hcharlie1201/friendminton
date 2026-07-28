use std::time::Duration;

use sqlx::{Pool, Postgres, postgres::PgPoolOptions};

use crate::config::AppConfig;

pub async fn connect(config: &AppConfig) -> Result<Pool<Postgres>, sqlx::Error> {
    PgPoolOptions::new()
        .max_connections(10)
        .acquire_timeout(Duration::from_secs(5))
        .idle_timeout(Duration::from_secs(60))
        .connect(&config.database_url)
        .await
}
