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
        .create_upload_target_for(
            user_id,
            &payload.content_type,
            payload.size_bytes,
            payload.purpose,
        )
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

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::json;

    use crate::{controller::test_support::TestApi, media::MAX_IMAGE_BYTES};

    #[tokio::test]
    async fn upload_routes_authenticate_scope_validate_and_store_each_purpose() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("upload-owner").await;

        let unauthorized = api
            .json(
                Method::POST,
                "/api/uploads/presign",
                None,
                Some(json!({
                    "content_type": "image/png",
                    "size_bytes": 4
                })),
            )
            .await;
        assert_eq!(unauthorized.status, StatusCode::UNAUTHORIZED);

        let post_target = api
            .json(
                Method::POST,
                "/api/uploads/presign",
                Some(user_id),
                Some(json!({
                    "content_type": "image/png",
                    "size_bytes": 4
                })),
            )
            .await;
        assert_eq!(post_target.status, StatusCode::OK, "{}", post_target.body);
        assert!(
            post_target.body["object_key"]
                .as_str()
                .expect("post object key")
                .starts_with(&format!("posts/{user_id}/"))
        );

        let gathering_target = api
            .json(
                Method::POST,
                "/api/uploads/presign",
                Some(user_id),
                Some(json!({
                    "content_type": "image/png",
                    "size_bytes": 4,
                    "purpose": "gathering_cover"
                })),
            )
            .await;
        assert_eq!(
            gathering_target.status,
            StatusCode::OK,
            "{}",
            gathering_target.body
        );
        let object_key = gathering_target.body["object_key"]
            .as_str()
            .expect("gathering object key");
        assert!(object_key.starts_with(&format!("gatherings/{user_id}/")));

        let group_target = api
            .json(
                Method::POST,
                "/api/uploads/presign",
                Some(user_id),
                Some(json!({
                    "content_type": "image/jpeg",
                    "size_bytes": 4,
                    "purpose": "group_cover"
                })),
            )
            .await;
        assert_eq!(group_target.status, StatusCode::OK, "{}", group_target.body);
        assert!(
            group_target.body["object_key"]
                .as_str()
                .expect("group object key")
                .starts_with(&format!("groups/{user_id}/"))
        );

        let upload_url = gathering_target.body["upload_url"]
            .as_str()
            .expect("local upload URL");
        let uploaded = api
            .request(
                Method::PUT,
                upload_url,
                Some(user_id),
                Some("image/png"),
                b"test".to_vec(),
            )
            .await;
        assert_eq!(uploaded.status, StatusCode::NO_CONTENT, "{}", uploaded.body);
        assert_eq!(
            tokio::fs::read(api.upload_dir.join(object_key))
                .await
                .expect("read locally uploaded gathering cover"),
            b"test"
        );

        let invalid_type = api
            .json(
                Method::POST,
                "/api/uploads/presign",
                Some(user_id),
                Some(json!({
                    "content_type": "application/pdf",
                    "size_bytes": 4,
                    "purpose": "gathering_cover"
                })),
            )
            .await;
        assert_eq!(invalid_type.status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid_type.body["code"], "bad_request");

        let invalid_size = api
            .json(
                Method::POST,
                "/api/uploads/presign",
                Some(user_id),
                Some(json!({
                    "content_type": "image/jpeg",
                    "size_bytes": MAX_IMAGE_BYTES as i64 + 1
                })),
            )
            .await;
        assert_eq!(invalid_size.status, StatusCode::BAD_REQUEST);

        api.cleanup_users(&[user_id]).await;
    }
}
