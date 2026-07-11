use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};

use crate::{
    activities::{self, CreatePost, FeedPost, Post},
    app::AppState,
    auth::CurrentUser,
    error::AppError,
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
    let post = activities::create_post(&state.pool, user_id, payload).await?;
    Ok(Json(post))
}

async fn feed(State(state): State<AppState>) -> Result<Json<Vec<FeedPost>>, AppError> {
    let posts = activities::feed(&state.pool).await?;
    Ok(Json(posts))
}
