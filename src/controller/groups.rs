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
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    groups::{self, BadmintonGroup, CreateBadmintonGroup, GroupMembership, GroupSearch},
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_group).get(find_groups))
        .api_route("/{group_id}", get(get_group))
        .api_route("/{group_id}/join", post(join_group))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct GroupPath {
    group_id: Uuid,
}

pub(crate) async fn create_group(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreateBadmintonGroup>,
) -> Result<Json<BadmintonGroup>, AppError> {
    Ok(Json(
        groups::create_group(&state.pool, user_id, payload).await?,
    ))
}

pub(crate) async fn find_groups(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Query(search): Query<GroupSearch>,
) -> Result<Json<Vec<BadmintonGroup>>, AppError> {
    Ok(Json(
        groups::find_groups(&state.pool, user_id, search).await?,
    ))
}

pub(crate) async fn get_group(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GroupPath>,
) -> Result<Json<BadmintonGroup>, AppError> {
    Ok(Json(
        groups::get_group(&state.pool, path.group_id, user_id).await?,
    ))
}

pub(crate) async fn join_group(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GroupPath>,
) -> Result<Json<GroupMembership>, AppError> {
    Ok(Json(
        groups::join_group(&state.pool, path.group_id, user_id).await?,
    ))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::json;

    use crate::controller::test_support::{TestApi, response_uuid};

    #[tokio::test]
    async fn group_routes_create_discover_and_join() {
        let api = TestApi::new().await;
        let owner_id = api.insert_user("group-owner").await;
        let member_id = api.insert_user("group-member").await;
        let created = api
            .json(
                Method::POST,
                "/api/groups",
                Some(owner_id),
                Some(json!({
                    "name": "Oakland Fitness Birdies",
                    "description": "Consistent badminton for fitness and fun.",
                    "city": "RouteTestOnly",
                    "visibility": "public",
                    "join_policy": "open",
                    "primary_court_id": null,
                    "goal_tags": ["fitness", "consistent_play"]
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(created.body["member_count"], 1);
        let group_id = response_uuid(&created.body, "id");

        let found = api
            .json(
                Method::GET,
                "/api/groups?city=RouteTestOnly",
                Some(member_id),
                None,
            )
            .await;
        assert_eq!(found.status, StatusCode::OK, "{}", found.body);
        assert!(found.body.as_array().is_some_and(|groups| {
            groups
                .iter()
                .any(|group| group["id"] == group_id.to_string())
        }));

        let joined = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/join"),
                Some(member_id),
                None,
            )
            .await;
        assert_eq!(joined.status, StatusCode::OK, "{}", joined.body);
        assert_eq!(joined.body["status"], "member");

        api.cleanup_users(&[owner_id, member_id]).await;
    }
}
