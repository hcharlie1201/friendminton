use aide::axum::{
    ApiRouter,
    routing::{get, post},
};
use axum::{Json, extract::State};

use crate::{
    activities::{self, CreatePost, FeedPost, Post},
    app::AppState,
    auth::CurrentUser,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_post))
        .api_route("/feed", get(feed))
}

pub(crate) async fn create_post(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreatePost>,
) -> Result<Json<Post>, AppError> {
    let post = activities::create_post(&state.pool, user_id, payload).await?;
    Ok(Json(post))
}

pub(crate) async fn feed(State(state): State<AppState>) -> Result<Json<Vec<FeedPost>>, AppError> {
    let posts = activities::feed(&state.pool).await?;
    Ok(Json(posts))
}
