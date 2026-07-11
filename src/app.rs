use axum::{Router, routing::get};
use sqlx::{Pool, Postgres};
use tower_http::trace::TraceLayer;

use crate::controller;

#[derive(Clone)]
pub struct AppState {
    pub pool: Pool<Postgres>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .nest("/api/auth", controller::auth::routes())
        .nest("/api/users", controller::users::routes())
        .nest("/api/workouts", controller::workouts::routes())
        .nest("/api/posts", controller::posts::routes())
        .nest("/api/play-sessions", controller::play_sessions::routes())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

async fn healthz() -> &'static str {
    "ok"
}
