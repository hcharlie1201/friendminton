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
    courts::{self, Court, CourtSearch, CreateCourt},
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", post(create_court).get(find_courts))
        .api_route("/{court_id}", get(get_court))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct CourtPath {
    court_id: Uuid,
}

pub(crate) async fn create_court(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreateCourt>,
) -> Result<Json<Court>, AppError> {
    Ok(Json(
        courts::create_court(&state.pool, user_id, payload).await?,
    ))
}

pub(crate) async fn find_courts(
    State(state): State<AppState>,
    Query(search): Query<CourtSearch>,
) -> Result<Json<Vec<Court>>, AppError> {
    Ok(Json(courts::find_courts(&state.pool, search).await?))
}

pub(crate) async fn get_court(
    State(state): State<AppState>,
    Path(path): Path<CourtPath>,
) -> Result<Json<Court>, AppError> {
    Ok(Json(courts::get_court(&state.pool, path.court_id).await?))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::json;

    use crate::controller::test_support::{TestApi, response_uuid};

    #[tokio::test]
    async fn court_routes_create_search_get_and_validate_coordinates() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("court-host").await;
        let payload = json!({
            "google_place_id": null,
            "name": "  East Bay Badminton  ",
            "address": "123 Rally Way",
            "city": "RouteTestOnly",
            "latitude": 37.8044,
            "longitude": -122.2712,
            "environment": "indoor",
            "court_count": 8,
            "drop_in_available": true,
            "amenities": ["parking", "water"],
            "website_url": null,
            "reservation_url": null,
            "phone": null
        });

        let unauthorized = api
            .json(Method::POST, "/api/courts", None, Some(payload.clone()))
            .await;
        assert_eq!(unauthorized.status, StatusCode::UNAUTHORIZED);

        let created = api
            .json(Method::POST, "/api/courts", Some(user_id), Some(payload))
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(created.body["name"], "East Bay Badminton");
        let court_id = response_uuid(&created.body, "id");

        let found = api
            .json(
                Method::GET,
                "/api/courts?latitude=37.8044&longitude=-122.2712&radius_km=5",
                None,
                None,
            )
            .await;
        assert_eq!(found.status, StatusCode::OK, "{}", found.body);
        assert!(found.body.as_array().is_some_and(|courts| {
            courts
                .iter()
                .any(|court| court["id"] == court_id.to_string())
        }));

        let detail = api
            .json(Method::GET, &format!("/api/courts/{court_id}"), None, None)
            .await;
        assert_eq!(detail.status, StatusCode::OK);
        assert_eq!(detail.body["court_count"], 8);

        let invalid = api
            .json(Method::GET, "/api/courts?latitude=37.8", None, None)
            .await;
        assert_eq!(invalid.status, StatusCode::BAD_REQUEST);
        assert_eq!(invalid.body["code"], "bad_request");

        api.cleanup_users(&[user_id]).await;
    }
}
