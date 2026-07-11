use aide::axum::{ApiRouter, routing::get};
use axum::{
    Json,
    extract::{Path, Query, State},
};
use uuid::Uuid;

use crate::{
    accounts::{self, PlayerSearch, User},
    app::AppState,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/", get(find_players))
        .api_route("/{id}", get(get_user))
}

pub(crate) async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<User>, AppError> {
    let user = accounts::get_user(&state.pool, id).await?;
    Ok(Json(user))
}

pub(crate) async fn find_players(
    State(state): State<AppState>,
    Query(search): Query<PlayerSearch>,
) -> Result<Json<Vec<User>>, AppError> {
    let users = accounts::find_players(&state.pool, search).await?;
    Ok(Json(users))
}
