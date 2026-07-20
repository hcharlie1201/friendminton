use aide::axum::{ApiRouter, routing::get};
use axum::{
    Json,
    extract::{Path, Query, State},
};
use schemars::JsonSchema;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    accounts::{self, Player, PlayerSearch},
    app::AppState,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", get(find_players))
        .api_route("/{id}", get(get_user))
}

#[derive(Deserialize, JsonSchema)]
pub(crate) struct UserPath {
    id: Uuid,
}

pub(crate) async fn get_user(
    State(state): State<AppState>,
    Path(path): Path<UserPath>,
) -> Result<Json<Player>, AppError> {
    let player = accounts::get_player(&state.pool, path.id).await?;
    Ok(Json(player))
}

pub(crate) async fn find_players(
    State(state): State<AppState>,
    Query(search): Query<PlayerSearch>,
) -> Result<Json<Vec<Player>>, AppError> {
    let users = accounts::find_players(&state.pool, search).await?;
    Ok(Json(users))
}
