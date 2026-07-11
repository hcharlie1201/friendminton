use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::post,
};
use uuid::Uuid;

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    play::{self, CreateGameInvite, GameInvite, GameInviteSearch},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_game_invite).get(find_game_invites))
        .route("/{game_invite_id}/join", post(join_game_invite))
}

async fn create_game_invite(
    State(state): State<AppState>,
    CurrentUser { id: host_id }: CurrentUser,
    Json(payload): Json<CreateGameInvite>,
) -> Result<Json<GameInvite>, AppError> {
    let invite = play::create_game_invite(&state.pool, host_id, payload).await?;
    Ok(Json(invite))
}

async fn find_game_invites(
    State(state): State<AppState>,
    Query(search): Query<GameInviteSearch>,
) -> Result<Json<Vec<GameInvite>>, AppError> {
    let invites = play::find_game_invites(&state.pool, search).await?;
    Ok(Json(invites))
}

async fn join_game_invite(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(game_invite_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    play::join_game_invite(&state.pool, game_invite_id, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
