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
        .api_route("/mine", get(find_joined_groups))
        .api_route("/{group_id}", get(get_group))
        .api_route("/{group_id}/join", post(join_group))
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
}
