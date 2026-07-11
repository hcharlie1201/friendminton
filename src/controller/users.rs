use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::get,
};
use uuid::Uuid;

use crate::{
    accounts::{self, PlayerSearch, User},
    app::AppState,
    error::AppError,
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", get(find_players))
        .route("/{id}", get(get_user))
}

async fn get_user(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<User>, AppError> {
    let user = accounts::get_user(&state.pool, id).await?;
    Ok(Json(user))
}

async fn find_players(
    State(state): State<AppState>,
    Query(search): Query<PlayerSearch>,
) -> Result<Json<Vec<User>>, AppError> {
    let users = accounts::find_players(&state.pool, search).await?;
    Ok(Json(users))
}
