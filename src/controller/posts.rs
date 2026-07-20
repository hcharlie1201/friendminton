use aide::axum::{
    ApiRouter,
    routing::{get, post},
};
use axum::{
    Json,
    extract::{Query, State},
};

use crate::{
    activities::{self, CreatePost, FeedPage, FeedQuery, Post, UpdatePost},
    app::AppState,
    auth::CurrentUser,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_post).put(update_post))
        .api_route("/feed", get(feed))
}

pub(crate) async fn update_post(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<UpdatePost>,
) -> Result<Json<Post>, AppError> {
    let post = activities::update_post(&state.pool, &state.media, user_id, payload).await?;
    Ok(Json(post))
}

pub(crate) async fn create_post(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreatePost>,
) -> Result<Json<Post>, AppError> {
    let post = activities::create_post(&state.pool, &state.media, user_id, payload).await?;
    Ok(Json(post))
}

pub(crate) async fn feed(
    State(state): State<AppState>,
    Query(query): Query<FeedQuery>,
) -> Result<Json<FeedPage>, AppError> {
    let page = activities::feed(&state.pool, &state.media, query).await?;
    Ok(Json(page))
}
