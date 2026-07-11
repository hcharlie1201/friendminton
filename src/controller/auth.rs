use axum::{Json, Router, extract::State, routing::post};

use crate::{
    app::AppState,
    error::AppError,
    models::{CreateUser, User},
};

pub fn routes() -> Router<AppState> {
    Router::new().route("/sign-up/email", post(sign_up_email))
}

pub async fn sign_up_email(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> Result<Json<User>, AppError> {
    validate_user(&payload)?;

    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, display_name, city, skill_level, bio)
        VALUES ($1, $2, $3, COALESCE($4, 'beginner'), $5)
        RETURNING id, email, display_name, city, skill_level, bio, created_at, updated_at
        "#,
    )
    .bind(payload.email.to_ascii_lowercase())
    .bind(payload.display_name)
    .bind(payload.city)
    .bind(payload.skill_level)
    .bind(payload.bio)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(user))
}

fn validate_user(payload: &CreateUser) -> Result<(), AppError> {
    if !payload.email.contains('@') {
        return Err(AppError::BadRequest(
            "email must look like an email address".to_owned(),
        ));
    }

    if payload.display_name.trim().is_empty() {
        return Err(AppError::BadRequest("display_name is required".to_owned()));
    }

    Ok(())
}
