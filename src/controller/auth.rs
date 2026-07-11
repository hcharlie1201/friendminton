use aide::axum::{ApiRouter, routing::post};
use axum::{Json, extract::State};

use crate::{
    accounts::{self, CreateUser, User},
    app::AppState,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route("/sign-up/email", post(sign_up_email))
}

pub(crate) async fn sign_up_email(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> Result<Json<User>, AppError> {
    let user = accounts::create_user(&state.pool, payload).await?;
    Ok(Json(user))
}
