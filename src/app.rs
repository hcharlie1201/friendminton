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
        .nest("/api", api_routes())
        .finish_api(&mut api)
        .layer(TraceLayer::new_for_http())
        .layer(Extension(api))
        .with_state(state)
}

fn api_routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .nest("/auth", controller::auth::routes())
        .nest("/users", controller::users::routes())
        .nest("/workouts", controller::workouts::routes())
        .nest("/posts", controller::posts::routes())
        .nest("/game-invites", controller::game_invites::routes())
        .nest("/engagement", controller::engagement::routes())
}

async fn healthz() -> &'static str {
    "ok"
}

async fn openapi_json(Extension(api): Extension<OpenApi>) -> Json<OpenApi> {
    Json(api)
}
