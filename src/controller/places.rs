use aide::axum::{ApiRouter, routing::get};
use axum::{
    Json,
    extract::{Path, Query, State},
};
use schemars::JsonSchema;
use serde::Deserialize;

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    places::{PlaceAutocompleteQuery, PlaceDetailsQuery, PlacePrediction, ResolvedPlace},
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/autocomplete", get(autocomplete))
        .api_route("/{place_id}", get(resolve))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct PlacePath {
    place_id: String,
}

pub(crate) async fn autocomplete(
    State(state): State<AppState>,
    CurrentUser { .. }: CurrentUser,
    Query(query): Query<PlaceAutocompleteQuery>,
) -> Result<Json<Vec<PlacePrediction>>, AppError> {
    Ok(Json(state.places.autocomplete(query).await?))
}

pub(crate) async fn resolve(
    State(state): State<AppState>,
    CurrentUser { .. }: CurrentUser,
    Path(path): Path<PlacePath>,
    Query(query): Query<PlaceDetailsQuery>,
) -> Result<Json<ResolvedPlace>, AppError> {
    Ok(Json(state.places.resolve(&path.place_id, query).await?))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};

    use crate::controller::test_support::TestApi;

    #[tokio::test]
    async fn place_routes_authenticate_validate_and_report_missing_configuration() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("places-user").await;
        let token = uuid::Uuid::new_v4();

        let unauthorized = api
            .json(
                Method::GET,
                &format!("/api/places/autocomplete?input=Oakland&session_token={token}"),
                None,
                None,
            )
            .await;
        assert_eq!(unauthorized.status, StatusCode::UNAUTHORIZED);

        let invalid = api
            .json(
                Method::GET,
                &format!("/api/places/autocomplete?input=O&session_token={token}"),
                Some(user_id),
                None,
            )
            .await;
        assert_eq!(invalid.status, StatusCode::BAD_REQUEST, "{}", invalid.body);

        let unconfigured = api
            .json(
                Method::GET,
                &format!("/api/places/autocomplete?input=Oakland&session_token={token}"),
                Some(user_id),
                None,
            )
            .await;
        assert_eq!(
            unconfigured.status,
            StatusCode::SERVICE_UNAVAILABLE,
            "{}",
            unconfigured.body
        );
        assert_eq!(unconfigured.body["code"], "service_unavailable");

        let invalid_place = api
            .json(
                Method::GET,
                &format!("/api/places/..%2Fsecret?session_token={token}"),
                Some(user_id),
                None,
            )
            .await;
        assert!(matches!(
            invalid_place.status,
            StatusCode::BAD_REQUEST | StatusCode::NOT_FOUND
        ));

        api.cleanup_users(&[user_id]).await;
    }
}
