mod accounts;
mod activities;
mod app;
mod auth;
mod controller;
mod db;
mod engagement;
mod error;
mod media;
mod openapi;
mod play;

use std::net::SocketAddr;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<(), error::AppError> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "friendminton=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = db::Config::from_env();
    let pool = db::connect(&config).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    tokio::fs::create_dir_all(&config.upload_dir).await?;
    let media = media::MediaStorage::from_config(&config).await;

    let app = app::router(app::AppState {
        pool,
        upload_dir: config.upload_dir.into(),
        media,
    });
    let addr: SocketAddr = config.server_addr.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!(%addr, "friendminton api listening");
    axum::serve(listener, app).await?;

    Ok(())
}
