use axum::{Json, Router, extract::State, routing::post};

use crate::{
    accounts::{self, CreateUser, User},
    app::AppState,
    error::AppError,
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/sign-up/email", post(sign_up_email))
}

pub async fn sign_up_email(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> Result<Json<User>, AppError> {
    let user = accounts::create_user(&state.pool, payload).await?;
    Ok(Json(user))
}
