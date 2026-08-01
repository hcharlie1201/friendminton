mod accounts;
mod activities;
mod app;
mod apple_auth;
mod auth;
mod auth_service;
mod config;
mod controller;
mod courts;
mod db;
mod discovery;
mod email;
mod engagement;
mod error;
mod gatherings;
mod groups;
mod media;
mod moderation;
mod openapi;
mod places;
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

    let config = config::AppConfig::load()?;
    let pool = db::connect(&config).await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    tokio::fs::create_dir_all(&config.upload_dir).await?;
    let media = media::MediaStorage::from_config(&config).await?;
    let email = email::TransactionalEmail::from_config(&config.authentication.email).await;
    let apple_auth = apple_auth::AppleAuthClient::from_config(config.authentication.apple.as_ref())
        .map_err(|error| error::AppError::Authentication(error.to_string()))?;
    let places_configured = config.third_party.google_places_api_key.is_some();
    let places = places::GooglePlaces::new(config.third_party.google_places_api_key.clone());
    let auth = auth_service::AuthService::new(
        pool.clone(),
        &config.public_base_url,
        &config.authentication,
    )
    .await
    .map_err(|error| error::AppError::Authentication(error.to_string()))?;
    let google_auth_configured = auth.google_enabled();
    let apple_auth_configured = apple_auth.is_some();

    let app = app::router(
        app::AppState {
            pool,
            upload_dir: config.upload_dir.clone().into(),
            media,
            places,
            auth,
            apple_auth,
            email,
        },
        &config,
    );
    let addr: SocketAddr = config.server_addr.parse()?;
    let listener = tokio::net::TcpListener::bind(addr).await?;

    tracing::info!(
        %addr,
        environment = %config.environment,
        places_configured,
        google_auth_configured,
        apple_auth_configured,
        "friendminton api listening"
    );
    axum::serve(listener, app).await?;

    Ok(())
}
