use aide::{
    axum::{
        ApiRouter,
        routing::{get, get_with},
    },
    openapi::OpenApi,
    swagger::Swagger,
};
use axum::{Extension, Json, Router};
use sqlx::{Pool, Postgres};
use tower_http::trace::TraceLayer;

use crate::{controller, openapi};

#[derive(Clone)]
pub struct AppState {
    pub pool: Pool<Postgres>,
}

pub fn router(state: AppState) -> Router {
    let mut api = openapi::base_document();

    ApiRouter::new()
        .route("/healthz", get(healthz))
        .route("/swagger-ui", Swagger::new("/openapi.json").axum_route())
        .route(
            "/openapi.json",
            get_with(openapi_json, |op| op.hidden(true)),
        )
        .nest("/api/auth", controller::auth::routes())
        .nest("/api/users", controller::users::routes())
        .nest("/api/workouts", controller::workouts::routes())
        .nest("/api/posts", controller::posts::routes())
        .nest("/api/game-invites", controller::game_invites::routes())
        .finish_api(&mut api)
        .layer(TraceLayer::new_for_http())
        .layer(Extension(api))
        .with_state(state)
}

async fn healthz() -> &'static str {
    "ok"
}

async fn openapi_json(Extension(api): Extension<OpenApi>) -> Json<OpenApi> {
    Json(api)
}
