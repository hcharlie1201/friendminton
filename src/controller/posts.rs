use aide::axum::{
    ApiRouter,
    routing::{get, post},
};
use axum::{
    Json,
    extract::{Path, Query, State},
};
use schemars::JsonSchema;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    activities::{self, CreatePost, FeedPage, FeedPost, FeedQuery, Post, UpdatePost},
    app::AppState,
    auth::CurrentUser,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_post).put(update_post))
        .api_route("/feed", get(feed))
        .api_route("/{post_id}", get(get_post))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct PostPath {
    post_id: Uuid,
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

pub(crate) async fn get_post(
    State(state): State<AppState>,
    Path(path): Path<PostPath>,
) -> Result<Json<FeedPost>, AppError> {
    let post = activities::get_post(&state.pool, &state.media, path.post_id).await?;
    Ok(Json(post))
}
