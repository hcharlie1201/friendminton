use aide::axum::{
    ApiRouter,
    routing::{get, patch, post},
};
use axum::{
    Json,
    extract::{Path, Query, State},
    http::StatusCode,
};
use schemars::JsonSchema;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    accounts::{self, Player, PlayerSearch, UpdateProfile},
    app::AppState,
    auth::CurrentUser,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", get(find_players))
        .api_route("/me", patch(update_profile))
        .api_route("/{id}/block", post(block_user).delete(unblock_user))
        .api_route("/{id}", get(get_user))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct UserPath {
    id: Uuid,
}

pub(crate) async fn get_user(
    State(state): State<AppState>,
    CurrentUser { id: viewer_id }: CurrentUser,
    Path(path): Path<UserPath>,
) -> Result<Json<Player>, AppError> {
    let player = accounts::get_player(&state.pool, &state.media, viewer_id, path.id).await?;
    Ok(Json(player))
}

pub(crate) async fn find_players(
    State(state): State<AppState>,
    CurrentUser { id: viewer_id }: CurrentUser,
    Query(search): Query<PlayerSearch>,
) -> Result<Json<Vec<Player>>, AppError> {
    let users = accounts::find_players(&state.pool, &state.media, viewer_id, search).await?;
    Ok(Json(users))
}

async fn update_profile(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
    Json(payload): Json<UpdateProfile>,
) -> Result<Json<Player>, AppError> {
    Ok(Json(
        accounts::update_profile(&state.pool, &state.media, id, payload).await?,
    ))
}

async fn block_user(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
    Path(path): Path<UserPath>,
) -> Result<StatusCode, AppError> {
    if id == path.id {
        return Err(AppError::BadRequest("you cannot block yourself".to_owned()));
    }
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE id = $1")
        .bind(path.id)
        .fetch_one(&state.pool)
        .await?;
    sqlx::query(
        "INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(id)
    .bind(path.id)
    .execute(&state.pool)
    .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn unblock_user(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
    Path(path): Path<UserPath>,
) -> Result<StatusCode, AppError> {
    sqlx::query("DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2")
        .bind(id)
        .bind(path.id)
        .execute(&state.pool)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::json;

    use crate::controller::test_support::TestApi;

    #[tokio::test]
    async fn profile_updates_are_owned_and_blocks_filter_profiles_and_search() {
        let api = TestApi::new().await;
        let owner = api.insert_user("profile-owner").await;
        let other = api.insert_user("profile-other").await;
        let updated = api
            .json(
                Method::PATCH,
                "/api/users/me",
                Some(owner),
                Some(json!({
                    "display_name": "  Ava Smash  ", "city": " Oakland ",
                    "skill_level": "advanced", "bio": "  Doubles player  ",
                    "avatar_key": format!("avatars/{owner}/profile.jpg")
                })),
            )
            .await;
        assert_eq!(updated.status, StatusCode::OK, "{}", updated.body);
        assert_eq!(updated.body["display_name"], "Ava Smash");
        assert_eq!(updated.body["city"], "Oakland");

        let blocked = api
            .json(
                Method::POST,
                &format!("/api/users/{other}/block"),
                Some(owner),
                None,
            )
            .await;
        assert_eq!(blocked.status, StatusCode::NO_CONTENT);
        let hidden_profile = api
            .json(
                Method::GET,
                &format!("/api/users/{other}"),
                Some(owner),
                None,
            )
            .await;
        assert_eq!(hidden_profile.status, StatusCode::NOT_FOUND);
        let hidden_search = api
            .json(
                Method::GET,
                "/api/users?query=profile-other",
                Some(owner),
                None,
            )
            .await;
        assert_eq!(hidden_search.status, StatusCode::OK);
        assert_eq!(hidden_search.body.as_array().unwrap().len(), 0);
        api.cleanup_users(&[owner, other]).await;
    }
}
