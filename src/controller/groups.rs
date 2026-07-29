use aide::axum::{
    ApiRouter,
    routing::{get, post},
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
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    groups::{
        self, BadmintonGroup, CreateBadmintonGroup, GroupMember, GroupMembership, GroupSearch,
        GroupViewerState, InviteGroupMember,
    },
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_group).get(find_groups))
        .api_route("/mine", get(find_joined_groups))
        .api_route("/{group_id}", get(get_group))
        .api_route("/{group_id}/me", get(get_group_viewer_state))
        .api_route("/{group_id}/members", get(get_group_members))
        .api_route("/{group_id}/join", post(join_group))
        .api_route("/{group_id}/leave", post(leave_group))
        .api_route("/{group_id}/invite", post(invite_group_member))
        .api_route(
            "/{group_id}/members/{user_id}/approve",
            post(approve_group_member),
        )
        .api_route(
            "/{group_id}/members/{user_id}/reject",
            post(reject_group_member),
        )
        .api_route(
            "/{group_id}/members/{user_id}/remove",
            post(remove_group_member),
        )
}

pub(crate) async fn find_joined_groups(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
) -> Result<Json<Vec<BadmintonGroup>>, AppError> {
    Ok(Json(
        groups::find_joined_groups(&state.pool, &state.media, user_id).await?,
    ))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct GroupPath {
    group_id: Uuid,
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct GroupMemberPath {
    group_id: Uuid,
    user_id: Uuid,
}

pub(crate) async fn create_group(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreateBadmintonGroup>,
) -> Result<Json<BadmintonGroup>, AppError> {
    Ok(Json(
        groups::create_group(&state.pool, &state.media, user_id, payload).await?,
    ))
}

pub(crate) async fn find_groups(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Query(search): Query<GroupSearch>,
) -> Result<Json<Vec<BadmintonGroup>>, AppError> {
    Ok(Json(
        groups::find_groups(&state.pool, &state.media, user_id, search).await?,
    ))
}

pub(crate) async fn get_group(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GroupPath>,
) -> Result<Json<BadmintonGroup>, AppError> {
    Ok(Json(
        groups::get_group(&state.pool, &state.media, path.group_id, user_id).await?,
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

pub(crate) async fn get_group_viewer_state(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GroupPath>,
) -> Result<Json<GroupViewerState>, AppError> {
    Ok(Json(
        groups::group_viewer_state(&state.pool, path.group_id, user_id).await?,
    ))
}

pub(crate) async fn get_group_members(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GroupPath>,
) -> Result<Json<Vec<GroupMember>>, AppError> {
    Ok(Json(
        groups::group_members(&state.pool, path.group_id, user_id).await?,
    ))
}

pub(crate) async fn leave_group(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GroupPath>,
) -> Result<StatusCode, AppError> {
    groups::leave_group(&state.pool, path.group_id, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn invite_group_member(
    State(state): State<AppState>,
    CurrentUser { id: actor_id }: CurrentUser,
    Path(path): Path<GroupPath>,
    Json(payload): Json<InviteGroupMember>,
) -> Result<Json<GroupMembership>, AppError> {
    Ok(Json(
        groups::invite_group_member(&state.pool, path.group_id, actor_id, payload.user_id).await?,
    ))
}

pub(crate) async fn approve_group_member(
    State(state): State<AppState>,
    CurrentUser { id: actor_id }: CurrentUser,
    Path(path): Path<GroupMemberPath>,
) -> Result<Json<GroupMembership>, AppError> {
    Ok(Json(
        groups::approve_group_member(&state.pool, path.group_id, actor_id, path.user_id).await?,
    ))
}

pub(crate) async fn reject_group_member(
    State(state): State<AppState>,
    CurrentUser { id: actor_id }: CurrentUser,
    Path(path): Path<GroupMemberPath>,
) -> Result<StatusCode, AppError> {
    groups::reject_group_member(&state.pool, path.group_id, actor_id, path.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}

pub(crate) async fn remove_group_member(
    State(state): State<AppState>,
    CurrentUser { id: actor_id }: CurrentUser,
    Path(path): Path<GroupMemberPath>,
) -> Result<StatusCode, AppError> {
    groups::remove_group_member(&state.pool, path.group_id, actor_id, path.user_id).await?;
    Ok(StatusCode::NO_CONTENT)
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
        let cover_image_key = format!("groups/{owner_id}/cover.jpg");
        let created = api
            .json(
                Method::POST,
                "/api/groups",
                Some(owner_id),
                Some(json!({
                    "name": "Oakland Fitness Birdies",
                    "description": "Consistent badminton for fitness and fun.",
                    "city": "RouteTestOnly",
                    "location_label": "Near Lake Merritt",
                    "google_place_id": null,
                    "latitude": 37.8044,
                    "longitude": -122.2712,
                    "visibility": "public",
                    "join_policy": "open",
                    "primary_court_id": null,
                    "cover_image_key": cover_image_key,
                    "image_keys": [cover_image_key],
                    "goal_tags": ["fitness", "consistent_play"]
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(created.body["member_count"], 1);
        assert_eq!(created.body["location_label"], "Near Lake Merritt");
        assert_eq!(created.body["cover_image_key"], cover_image_key);
        assert_eq!(created.body["image_keys"], json!([cover_image_key]));
        assert_eq!(
            created.body["image_urls"],
            json!([format!("/uploads/{cover_image_key}")])
        );
        assert_eq!(
            created.body["cover_image_url"],
            format!("/uploads/{cover_image_key}")
        );
        let group_id = response_uuid(&created.body, "id");

        let too_many_images = api
            .json(
                Method::POST,
                "/api/groups",
                Some(owner_id),
                Some(json!({
                    "name": "Too Many Photos",
                    "city": "RouteTestOnly",
                    "image_keys": (0..6)
                        .map(|index| format!("groups/{owner_id}/{index}.jpg"))
                        .collect::<Vec<_>>()
                })),
            )
            .await;
        assert_eq!(too_many_images.status, StatusCode::BAD_REQUEST);

        let found = api
            .json(
                Method::GET,
                "/api/groups?city=RouteTestOnly&latitude=37.81&longitude=-122.27&radius_km=10",
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

        let member_groups = api
            .json(Method::GET, "/api/groups/mine", Some(member_id), None)
            .await;
        assert_eq!(
            member_groups.status,
            StatusCode::OK,
            "{}",
            member_groups.body
        );
        assert!(member_groups.body.as_array().is_some_and(|groups| {
            groups.len() == 1 && groups[0]["id"] == group_id.to_string()
        }));

        api.cleanup_users(&[owner_id, member_id]).await;
    }

    #[tokio::test]
    async fn group_membership_controls_enforce_manager_authorization() {
        let api = TestApi::new().await;
        let owner_id = api.insert_user("membership-owner").await;
        let requester_id = api.insert_user("membership-requester").await;
        let outsider_id = api.insert_user("membership-outsider").await;
        let created = api
            .json(
                Method::POST,
                "/api/groups",
                Some(owner_id),
                Some(json!({
                    "name": "Approval Crew",
                    "city": "Oakland",
                    "visibility": "public",
                    "join_policy": "approval_required"
                })),
            )
            .await;
        let group_id = response_uuid(&created.body, "id");

        let requested = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/join"),
                Some(requester_id),
                None,
            )
            .await;
        assert_eq!(requested.body["status"], "pending");

        let forbidden = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/members/{requester_id}/approve"),
                Some(outsider_id),
                None,
            )
            .await;
        assert_eq!(forbidden.status, StatusCode::FORBIDDEN);

        let manager_members = api
            .json(
                Method::GET,
                &format!("/api/groups/{group_id}/members"),
                Some(owner_id),
                None,
            )
            .await;
        assert!(manager_members.body.as_array().is_some_and(|members| {
            members.iter().any(|member| {
                member["user_id"] == requester_id.to_string() && member["status"] == "pending"
            })
        }));

        let approved = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/members/{requester_id}/approve"),
                Some(owner_id),
                None,
            )
            .await;
        assert_eq!(approved.status, StatusCode::OK, "{}", approved.body);
        assert_eq!(approved.body["status"], "member");

        let left = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/leave"),
                Some(requester_id),
                None,
            )
            .await;
        assert_eq!(left.status, StatusCode::NO_CONTENT);

        let invited = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/invite"),
                Some(owner_id),
                Some(json!({ "user_id": requester_id })),
            )
            .await;
        assert_eq!(invited.body["status"], "invited");
        let accepted = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/join"),
                Some(requester_id),
                None,
            )
            .await;
        assert_eq!(accepted.body["status"], "member");

        let removed = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/members/{requester_id}/remove"),
                Some(owner_id),
                None,
            )
            .await;
        assert_eq!(removed.status, StatusCode::NO_CONTENT);

        let owner_leave = api
            .json(
                Method::POST,
                &format!("/api/groups/{group_id}/leave"),
                Some(owner_id),
                None,
            )
            .await;
        assert_eq!(owner_leave.status, StatusCode::BAD_REQUEST);
        api.cleanup_users(&[owner_id, requester_id, outsider_id])
            .await;
    }
}
