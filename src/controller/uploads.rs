use aide::axum::{ApiRouter, routing::post};
use axum::{
    Json,
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{HeaderMap, StatusCode, header::CONTENT_TYPE},
};

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    media::{CreateUploadTarget, MAX_IMAGE_BYTES, UploadTarget},
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/presign", post(create_upload_target))
        .route("/{*object_key}", axum::routing::put(upload_local_image))
        .layer(DefaultBodyLimit::max(MAX_IMAGE_BYTES))
}

async fn create_upload_target(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreateUploadTarget>,
) -> Result<Json<UploadTarget>, AppError> {
    let target = state
        .media
        .create_upload_target(user_id, &payload.content_type, payload.size_bytes)
        .await?;
    Ok(Json(target))
}

async fn upload_local_image(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(object_key): Path<String>,
    headers: HeaderMap,
    bytes: Bytes,
) -> Result<StatusCode, AppError> {
    let content_type = headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .ok_or_else(|| AppError::BadRequest("content-type is required".to_owned()))?;

    state
        .media
        .store_local(user_id, &object_key, content_type, &bytes)
        .await?;

    Ok(StatusCode::NO_CONTENT)
}
