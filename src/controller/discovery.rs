use aide::axum::{ApiRouter, routing::get};
use axum::{
    Json,
    extract::{Query, State},
};

use crate::{
    app::AppState,
    auth::CurrentUser,
    discovery::{self, DiscoveryPage, DiscoverySearch},
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route("/", get(find_discovery))
}

pub(crate) async fn find_discovery(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Query(search): Query<DiscoverySearch>,
) -> Result<Json<DiscoveryPage>, AppError> {
    Ok(Json(
        discovery::search(&state.pool, &state.media, user_id, search).await?,
    ))
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use axum::http::{Method, StatusCode};
    use uuid::Uuid;

    use crate::controller::test_support::TestApi;

    #[tokio::test]
    async fn unified_discovery_requires_auth_and_paginates_category_results() {
        let api = TestApi::new().await;
        let viewer_id = api.insert_user("discovery-viewer").await;
        let first_player_id = api.insert_user("discovery-rally-one").await;
        let second_player_id = api.insert_user("discovery-rally-two").await;
        let uri =
            "/api/discovery?category=players&city=RouteTestOnly&query=discovery-rally&limit=1";

        let unauthorized = api.json(Method::GET, uri, None, None).await;
        assert_eq!(unauthorized.status, StatusCode::UNAUTHORIZED);

        let first_page = api.json(Method::GET, uri, Some(viewer_id), None).await;
        assert_eq!(first_page.status, StatusCode::OK, "{}", first_page.body);
        assert_eq!(first_page.body["items"].as_array().unwrap().len(), 1);
        assert_eq!(first_page.body["items"][0]["category"], "players");
        let first_result_id = first_page.body["items"][0]["item"]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let cursor = first_page.body["next_cursor"].as_str().unwrap();

        let second_page = api
            .json(
                Method::GET,
                &format!("{uri}&cursor={cursor}"),
                Some(viewer_id),
                None,
            )
            .await;
        assert_eq!(second_page.status, StatusCode::OK, "{}", second_page.body);
        assert_eq!(second_page.body["items"].as_array().unwrap().len(), 1);
        assert_ne!(
            second_page.body["items"][0]["item"]["id"].as_str().unwrap(),
            first_result_id
        );

        let invalid_cursor = api
            .json(
                Method::GET,
                &format!("{uri}&cursor=not-a-cursor"),
                Some(viewer_id),
                None,
            )
            .await;
        assert_eq!(invalid_cursor.status, StatusCode::BAD_REQUEST);

        api.cleanup_users(&[viewer_id, first_player_id, second_player_id])
            .await;
    }

    #[tokio::test]
    async fn one_query_returns_each_discovery_category() {
        let api = TestApi::new().await;
        let viewer_id = api.insert_user("unified-viewer").await;
        let player_id = api.insert_user("UnifiedShuttle-player").await;
        let court_id = Uuid::new_v4();
        let group_id = Uuid::new_v4();
        let gathering_id = Uuid::new_v4();

        sqlx::query(
            r#"
            INSERT INTO courts (
                id, created_by, name, address, city, latitude, longitude
            )
            VALUES ($1, $2, 'UnifiedShuttle Court', '1 Test Way', 'RouteTestOnly', 37.8, -122.2)
            "#,
        )
        .bind(court_id)
        .bind(viewer_id)
        .execute(&api.pool)
        .await
        .unwrap();
        sqlx::query(
            r#"
            INSERT INTO badminton_groups (id, owner_id, name, city)
            VALUES ($1, $2, 'UnifiedShuttle Group', 'RouteTestOnly')
            "#,
        )
        .bind(group_id)
        .bind(viewer_id)
        .execute(&api.pool)
        .await
        .unwrap();
        sqlx::query(
            r#"
            INSERT INTO gatherings (
                id, host_id, kind, title, starts_at, ends_at, venue, city
            )
            VALUES (
                $1, $2, 'play', 'UnifiedShuttle Game', now() + interval '1 day',
                now() + interval '1 day 2 hours', 'Test Gym', 'RouteTestOnly'
            )
            "#,
        )
        .bind(gathering_id)
        .bind(viewer_id)
        .execute(&api.pool)
        .await
        .unwrap();

        let response = api
            .json(
                Method::GET,
                "/api/discovery?category=all&city=RouteTestOnly&query=UnifiedShuttle&limit=10",
                Some(viewer_id),
                None,
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{}", response.body);
        let categories = response.body["items"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|item| item["category"].as_str())
            .collect::<HashSet<_>>();
        assert_eq!(
            categories,
            HashSet::from(["games", "courts", "groups", "players"])
        );

        sqlx::query("DELETE FROM courts WHERE id = $1")
            .bind(court_id)
            .execute(&api.pool)
            .await
            .unwrap();
        api.cleanup_users(&[viewer_id, player_id]).await;
    }

    #[tokio::test]
    async fn player_name_search_finds_known_players_outside_browse_filters() {
        let api = TestApi::new().await;
        let viewer_id = api.insert_user("ava-search-viewer").await;
        let ava_id = api.insert_user("ava-search-player").await;
        let charlie_id = api.insert_user("charlie-search-player").await;
        sqlx::query(
            r#"
            UPDATE users
            SET display_name = 'Ava Chen', city = 'Oakland', skill_level = 'intermediate'
            WHERE id = $1
            "#,
        )
        .bind(ava_id)
        .execute(&api.pool)
        .await
        .unwrap();
        sqlx::query(
            r#"
            UPDATE users
            SET display_name = 'Charlie', city = NULL, skill_level = 'intermediate'
            WHERE id = $1
            "#,
        )
        .bind(charlie_id)
        .execute(&api.pool)
        .await
        .unwrap();

        let ava_response = api
            .json(
                Method::GET,
                "/api/discovery?category=all&city=San%20Francisco&latitude=37.7749&longitude=-122.4194&radius_km=10&skill_level=competitive&query=ava",
                Some(viewer_id),
                None,
            )
            .await;
        assert_eq!(ava_response.status, StatusCode::OK, "{}", ava_response.body);
        assert!(ava_response.body["items"].as_array().unwrap().iter().any(
            |result| result["category"] == "players"
                && result["item"]["id"] == ava_id.to_string()
                && result["item"]["display_name"] == "Ava Chen"
        ));

        let charlie_response = api
            .json(
                Method::GET,
                "/api/discovery?category=players&city=Oakland&skill_level=advanced&query=charlie",
                Some(viewer_id),
                None,
            )
            .await;
        assert_eq!(
            charlie_response.status,
            StatusCode::OK,
            "{}",
            charlie_response.body
        );
        assert!(
            charlie_response.body["items"]
                .as_array()
                .unwrap()
                .iter()
                .any(|result| result["category"] == "players"
                    && result["item"]["id"] == charlie_id.to_string()
                    && result["item"]["display_name"] == "Charlie")
        );

        api.cleanup_users(&[viewer_id, ava_id, charlie_id]).await;
    }
}
