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
    activities::Workout,
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    gatherings::{
        self, CreateGathering, Gathering, GatheringParticipant, GatheringSearch,
        GatheringViewerState,
    },
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_gathering).get(find_gatherings))
        .api_route("/{gathering_id}", get(get_gathering))
        .api_route("/{gathering_id}/me", get(get_gathering_viewer_state))
        .api_route("/{gathering_id}/join", post(join_gathering))
        .api_route("/{gathering_id}/finish", post(finish_gathering))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct GatheringPath {
    gathering_id: Uuid,
}

pub(crate) async fn create_gathering(
    State(state): State<AppState>,
    CurrentUser { id: host_id }: CurrentUser,
    Json(payload): Json<CreateGathering>,
) -> Result<Json<Gathering>, AppError> {
    let gathering =
        gatherings::create_gathering(&state.pool, &state.media, host_id, payload).await?;
    Ok(Json(gathering))
}

pub(crate) async fn find_gatherings(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Query(search): Query<GatheringSearch>,
) -> Result<Json<Vec<Gathering>>, AppError> {
    let gatherings =
        gatherings::find_gatherings(&state.pool, &state.media, user_id, search).await?;
    Ok(Json(gatherings))
}

pub(crate) async fn get_gathering(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GatheringPath>,
) -> Result<Json<Gathering>, AppError> {
    let gathering =
        gatherings::get_gathering(&state.pool, &state.media, path.gathering_id, user_id).await?;
    Ok(Json(gathering))
}

pub(crate) async fn join_gathering(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GatheringPath>,
) -> Result<Json<GatheringParticipant>, AppError> {
    let participant = gatherings::join_gathering(&state.pool, path.gathering_id, user_id).await?;
    Ok(Json(participant))
}

pub(crate) async fn get_gathering_viewer_state(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GatheringPath>,
) -> Result<Json<GatheringViewerState>, AppError> {
    let viewer_state =
        gatherings::gathering_viewer_state(&state.pool, path.gathering_id, user_id).await?;
    Ok(Json(viewer_state))
}

pub(crate) async fn finish_gathering(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(path): Path<GatheringPath>,
) -> Result<Json<Workout>, AppError> {
    let workout = gatherings::finish_gathering(&state.pool, path.gathering_id, user_id).await?;
    Ok(Json(workout))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::{Value, json};
    use uuid::Uuid;

    use crate::controller::test_support::{TestApi, TestResponse, response_ids, response_uuid};

    #[tokio::test]
    async fn create_route_requires_auth_validates_input_and_persists_the_host() {
        let api = TestApi::new().await;
        let host_id = api.insert_user("create-host").await;
        let city = unique_city();
        let mut payload = gathering_payload(
            "  Friday birdies & board games  ",
            &city,
            "public",
            "open",
            Some(16),
        );

        let unauthorized = api
            .json(Method::POST, "/api/gatherings", None, Some(payload.clone()))
            .await;
        assert_eq!(unauthorized.status, StatusCode::UNAUTHORIZED);
        assert_eq!(unauthorized.body["code"], "unauthorized");

        let created = api
            .json(
                Method::POST,
                "/api/gatherings",
                Some(host_id),
                Some(payload.clone()),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(created.body["title"], "Friday birdies & board games");
        assert_eq!(created.body["currency"], "USD");
        assert_eq!(created.body["skill_level"], "e_plus");
        assert_eq!(created.body["court_setup"], "reserved");
        assert_eq!(created.body["host_id"], host_id.to_string());

        let gathering_id = response_uuid(&created.body, "id");
        let host_status = sqlx::query_scalar::<_, String>(
            r#"
            SELECT status
            FROM gathering_participants
            WHERE gathering_id = $1 AND user_id = $2
            "#,
        )
        .bind(gathering_id)
        .bind(host_id)
        .fetch_one(&api.pool)
        .await
        .expect("load host participant");
        assert_eq!(host_status, "going");

        payload["ends_at"] = payload["starts_at"].clone();
        let invalid_time = api
            .json(
                Method::POST,
                "/api/gatherings",
                Some(host_id),
                Some(payload),
            )
            .await;
        assert_eq!(invalid_time.status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid_time.body["code"], "bad_request");

        let mut invalid_cover = gathering_payload("Wrong cover", &city, "public", "open", Some(16));
        invalid_cover["cover_image_key"] = json!(format!("posts/{host_id}/cover.jpg"));
        let invalid_cover = api
            .json(
                Method::POST,
                "/api/gatherings",
                Some(host_id),
                Some(invalid_cover),
            )
            .await;
        assert_eq!(invalid_cover.status, StatusCode::BAD_REQUEST);

        api.cleanup_users(&[host_id]).await;
    }

    #[tokio::test]
    async fn group_events_are_visible_and_closed_group_access_is_requested() {
        let api = TestApi::new().await;
        let owner_id = api.insert_user("group-event-owner").await;
        let guest_id = api.insert_user("group-event-guest").await;
        let city = unique_city();
        let group_id = sqlx::query_scalar::<_, Uuid>(
            r#"
            INSERT INTO badminton_groups (owner_id, name, city, visibility, join_policy)
            VALUES ($1, 'Closed rally crew', $2, 'public', 'approval_required')
            RETURNING id
            "#,
        )
        .bind(owner_id)
        .bind(&city)
        .fetch_one(&api.pool)
        .await
        .expect("insert group fixture");
        sqlx::query(
            "INSERT INTO badminton_group_members (group_id, user_id, role, status) VALUES ($1, $2, 'owner', 'member')",
        )
        .bind(group_id)
        .bind(owner_id)
        .execute(&api.pool)
        .await
        .expect("insert group owner fixture");

        let mut payload =
            gathering_payload("Closed crew doubles", &city, "private", "open", Some(12));
        payload["group_id"] = json!(group_id);
        let created = api
            .json(
                Method::POST,
                "/api/gatherings",
                Some(owner_id),
                Some(payload),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(created.body["group_id"], group_id.to_string());
        assert_eq!(created.body["visibility"], "public");
        assert_eq!(created.body["join_policy"], "members_only");
        let gathering_id = response_uuid(&created.body, "id");

        let discovered = api
            .json(
                Method::GET,
                &format!("/api/gatherings?city={city}"),
                Some(guest_id),
                None,
            )
            .await;
        assert_eq!(discovered.status, StatusCode::OK, "{}", discovered.body);
        assert!(discovered.body.as_array().is_some_and(|gatherings| {
            gatherings.iter().any(|gathering| {
                gathering["id"] == gathering_id.to_string()
                    && gathering["group_id"] == group_id.to_string()
            })
        }));

        let requested = api
            .json(
                Method::POST,
                &format!("/api/gatherings/{gathering_id}/join"),
                Some(guest_id),
                None,
            )
            .await;
        assert_eq!(requested.status, StatusCode::OK, "{}", requested.body);
        assert_eq!(requested.body["status"], "pending");
        let membership_status = sqlx::query_scalar::<_, String>(
            "SELECT status FROM badminton_group_members WHERE group_id = $1 AND user_id = $2",
        )
        .bind(group_id)
        .bind(guest_id)
        .fetch_one(&api.pool)
        .await
        .expect("load requested group membership");
        assert_eq!(membership_status, "pending");

        api.cleanup_users(&[owner_id, guest_id]).await;
    }

    #[tokio::test]
    async fn list_and_detail_routes_enforce_private_visibility() {
        let api = TestApi::new().await;
        let host_id = api.insert_user("visibility-host").await;
        let invited_id = api.insert_user("visibility-invited").await;
        let pending_id = api.insert_user("visibility-pending").await;
        let stranger_id = api.insert_user("visibility-stranger").await;
        let city = unique_city();

        let public = create_gathering(
            &api,
            host_id,
            gathering_payload("Public open play", &city, "public", "open", Some(20)),
        )
        .await;
        let private = create_gathering(
            &api,
            host_id,
            gathering_payload(
                "Private club night",
                &city,
                "private",
                "invite_only",
                Some(20),
            ),
        )
        .await;
        let public_id = response_uuid(&public, "id");
        let private_id = response_uuid(&private, "id");

        insert_participant(&api, private_id, invited_id, "invited").await;
        insert_participant(&api, private_id, pending_id, "pending").await;

        let list_uri = format!("/api/gatherings?city={city}&kind=play&limit=10");
        let unauthorized = api.json(Method::GET, &list_uri, None, None).await;
        assert_eq!(unauthorized.status, StatusCode::UNAUTHORIZED);

        let stranger_list = api
            .json(Method::GET, &list_uri, Some(stranger_id), None)
            .await;
        assert_eq!(stranger_list.status, StatusCode::OK);
        assert_eq!(response_ids(&stranger_list.body), vec![public_id]);

        for visible_user in [host_id, invited_id] {
            let response = api
                .json(Method::GET, &list_uri, Some(visible_user), None)
                .await;
            assert_eq!(response.status, StatusCode::OK, "{}", response.body);
            let ids = response_ids(&response.body);
            assert!(ids.contains(&public_id));
            assert!(ids.contains(&private_id));
        }

        let pending_list = api
            .json(Method::GET, &list_uri, Some(pending_id), None)
            .await;
        assert_eq!(response_ids(&pending_list.body), vec![public_id]);

        let public_uri = format!("/api/gatherings/{public_id}");
        let public_detail = api
            .json(Method::GET, &public_uri, Some(stranger_id), None)
            .await;
        assert_eq!(public_detail.status, StatusCode::OK);

        let private_uri = format!("/api/gatherings/{private_id}");
        for visible_user in [host_id, invited_id] {
            let response = api
                .json(Method::GET, &private_uri, Some(visible_user), None)
                .await;
            assert_eq!(response.status, StatusCode::OK, "{}", response.body);
        }
        for hidden_user in [pending_id, stranger_id] {
            let response = api
                .json(Method::GET, &private_uri, Some(hidden_user), None)
                .await;
            assert_eq!(response.status, StatusCode::NOT_FOUND, "{}", response.body);
        }

        let missing = api
            .json(
                Method::GET,
                &format!("/api/gatherings/{}", Uuid::new_v4()),
                Some(stranger_id),
                None,
            )
            .await;
        assert_eq!(missing.status, StatusCode::NOT_FOUND);
        assert_eq!(missing.body["code"], "not_found");

        let invalid_limit = api
            .json(
                Method::GET,
                "/api/gatherings?limit=101",
                Some(stranger_id),
                None,
            )
            .await;
        assert_eq!(invalid_limit.status, StatusCode::BAD_REQUEST);

        api.cleanup_users(&[host_id, invited_id, pending_id, stranger_id])
            .await;
    }

    #[tokio::test]
    async fn join_route_applies_open_approval_invite_and_capacity_policies() {
        let api = TestApi::new().await;
        let host_id = api.insert_user("join-host").await;
        let guest_id = api.insert_user("join-guest").await;
        let invitee_id = api.insert_user("join-invitee").await;
        let stranger_id = api.insert_user("join-stranger").await;
        let city = unique_city();

        let open_id = response_uuid(
            &create_gathering(
                &api,
                host_id,
                gathering_payload("Open play", &city, "public", "open", Some(8)),
            )
            .await,
            "id",
        );
        let approval_id = response_uuid(
            &create_gathering(
                &api,
                host_id,
                gathering_payload(
                    "Approval play",
                    &city,
                    "public",
                    "approval_required",
                    Some(8),
                ),
            )
            .await,
            "id",
        );
        let private_id = response_uuid(
            &create_gathering(
                &api,
                host_id,
                gathering_payload("Private play", &city, "private", "invite_only", Some(8)),
            )
            .await,
            "id",
        );
        let full_id = response_uuid(
            &create_gathering(
                &api,
                host_id,
                gathering_payload("Full play", &city, "public", "open", Some(1)),
            )
            .await,
            "id",
        );

        let unauthenticated = api
            .json(
                Method::POST,
                &format!("/api/gatherings/{open_id}/join"),
                None,
                None,
            )
            .await;
        assert_eq!(unauthenticated.status, StatusCode::UNAUTHORIZED);

        let open_join = join(&api, open_id, guest_id).await;
        assert_eq!(open_join.status, StatusCode::OK, "{}", open_join.body);
        assert_eq!(open_join.body["status"], "going");
        assert_eq!(
            join(&api, open_id, guest_id).await.status,
            StatusCode::BAD_REQUEST
        );

        let approval_join = join(&api, approval_id, guest_id).await;
        assert_eq!(
            approval_join.status,
            StatusCode::OK,
            "{}",
            approval_join.body
        );
        assert_eq!(approval_join.body["status"], "pending");
        assert_eq!(
            join(&api, approval_id, guest_id).await.status,
            StatusCode::BAD_REQUEST
        );

        assert_eq!(
            join(&api, private_id, stranger_id).await.status,
            StatusCode::BAD_REQUEST
        );
        insert_participant(&api, private_id, invitee_id, "invited").await;
        let invited_join = join(&api, private_id, invitee_id).await;
        assert_eq!(invited_join.status, StatusCode::OK, "{}", invited_join.body);
        assert_eq!(invited_join.body["status"], "going");

        assert_eq!(
            join(&api, full_id, stranger_id).await.status,
            StatusCode::BAD_REQUEST
        );
        assert_eq!(
            join(&api, Uuid::new_v4(), stranger_id).await.status,
            StatusCode::NOT_FOUND
        );

        api.cleanup_users(&[host_id, guest_id, invitee_id, stranger_id])
            .await;
    }

    #[tokio::test]
    async fn finish_route_requires_participation_and_creates_one_event_workout() {
        let api = TestApi::new().await;
        let host_id = api.insert_user("finish-host").await;
        let stranger_id = api.insert_user("finish-stranger").await;
        let city = unique_city();
        let gathering = create_gathering(
            &api,
            host_id,
            gathering_payload("Finished open play", &city, "public", "open", Some(8)),
        )
        .await;
        let gathering_id = response_uuid(&gathering, "id");
        sqlx::query(
            r#"
            UPDATE gatherings
            SET starts_at = now() - interval '2 hours',
                ends_at = now() - interval '30 minutes'
            WHERE id = $1
            "#,
        )
        .bind(gathering_id)
        .execute(&api.pool)
        .await
        .expect("move gathering into the past");

        let viewer_uri = format!("/api/gatherings/{gathering_id}/me");
        let before = api
            .json(Method::GET, &viewer_uri, Some(host_id), None)
            .await;
        assert_eq!(before.status, StatusCode::OK, "{}", before.body);
        assert_eq!(before.body["participant_status"], "going");
        assert_eq!(before.body["can_finish"], true);
        assert!(before.body["workout_id"].is_null());

        let finish_uri = format!("/api/gatherings/{gathering_id}/finish");
        let rejected = api
            .json(Method::POST, &finish_uri, Some(stranger_id), None)
            .await;
        assert_eq!(rejected.status, StatusCode::BAD_REQUEST);

        let finished = api
            .json(Method::POST, &finish_uri, Some(host_id), None)
            .await;
        assert_eq!(finished.status, StatusCode::OK, "{}", finished.body);
        assert_eq!(finished.body["gathering_id"], gathering_id.to_string());
        assert!(finished.body["duration_milliseconds"].as_i64().unwrap_or(0) > 0);
        let workout_id = response_uuid(&finished.body, "id");

        let repeated = api
            .json(Method::POST, &finish_uri, Some(host_id), None)
            .await;
        assert_eq!(repeated.status, StatusCode::OK, "{}", repeated.body);
        assert_eq!(response_uuid(&repeated.body, "id"), workout_id);

        let post_payload = json!({
            "workout_id": workout_id,
            "body": "Great open play session",
            "location": "East Bay Badminton",
            "effort": 7,
            "image_keys": []
        });
        let post = api
            .json(
                Method::POST,
                "/api/posts",
                Some(host_id),
                Some(post_payload.clone()),
            )
            .await;
        assert_eq!(post.status, StatusCode::OK, "{}", post.body);
        let post_id = response_uuid(&post.body, "id");
        let duplicate_post = api
            .json(
                Method::POST,
                "/api/posts",
                Some(host_id),
                Some(post_payload),
            )
            .await;
        assert_eq!(duplicate_post.status, StatusCode::BAD_REQUEST);

        let after = api
            .json(Method::GET, &viewer_uri, Some(host_id), None)
            .await;
        assert_eq!(after.status, StatusCode::OK, "{}", after.body);
        assert_eq!(response_uuid(&after.body, "workout_id"), workout_id);
        assert_eq!(response_uuid(&after.body, "post_id"), post_id);
        assert_eq!(after.body["can_finish"], false);

        api.cleanup_users(&[host_id, stranger_id]).await;
    }

    async fn create_gathering(api: &TestApi, host_id: Uuid, payload: Value) -> Value {
        let response = api
            .json(
                Method::POST,
                "/api/gatherings",
                Some(host_id),
                Some(payload),
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{}", response.body);
        response.body
    }

    async fn join(api: &TestApi, gathering_id: Uuid, user_id: Uuid) -> TestResponse {
        api.json(
            Method::POST,
            &format!("/api/gatherings/{gathering_id}/join"),
            Some(user_id),
            None,
        )
        .await
    }

    async fn insert_participant(api: &TestApi, gathering_id: Uuid, user_id: Uuid, status: &str) {
        sqlx::query(
            r#"
            INSERT INTO gathering_participants (gathering_id, user_id, status)
            VALUES ($1, $2, $3)
            "#,
        )
        .bind(gathering_id)
        .bind(user_id)
        .bind(status)
        .execute(&api.pool)
        .await
        .expect("insert gathering participant fixture");
    }

    fn gathering_payload(
        title: &str,
        city: &str,
        visibility: &str,
        join_policy: &str,
        capacity: Option<i32>,
    ) -> Value {
        json!({
            "kind": "play",
            "visibility": visibility,
            "join_policy": join_policy,
            "title": title,
            "starts_at": "2030-01-02T18:00:00Z",
            "ends_at": "2030-01-02T20:00:00Z",
            "venue": "East Bay Badminton",
            "city": city,
            "description": "Two hours of badminton.",
            "capacity": capacity,
            "cost_per_person_cents": 1500,
            "currency": " usd ",
            "skill_level": "e_plus",
            "play_format": "open_play",
            "court_setup": "reserved",
            "court_count": 4,
            "social_tags": [],
            "theme": "court-glow",
            "cover_image_key": null
        })
    }

    fn unique_city() -> String {
        format!("ApiTest{}", Uuid::new_v4().simple())
    }
}
