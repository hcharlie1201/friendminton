use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    models::{CreatePost, FeedPost, Post},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_post))
        .route("/feed", get(feed))
}

async fn create_post(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreatePost>,
) -> Result<Json<Post>, AppError> {
    if payload.body.trim().is_empty() {
        return Err(AppError::BadRequest("body is required".to_owned()));
    }

    let post = sqlx::query_as::<_, Post>(
        r#"
        INSERT INTO posts (user_id, workout_id, body)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, workout_id, body, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.workout_id)
    .bind(payload.body)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(post))
}

async fn feed(State(state): State<AppState>) -> Result<Json<Vec<FeedPost>>, AppError> {
    let posts = sqlx::query_as::<_, FeedPost>(
        r#"
        SELECT posts.id, posts.user_id, users.display_name, posts.workout_id, posts.body, posts.created_at
        FROM posts
        JOIN users ON users.id = posts.user_id
        ORDER BY posts.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(posts))
}
