use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::post,
};
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    models::{CreatePlaySession, PlaySession, PlaySessionSearch},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_play_session).get(find_play_sessions))
        .route("/{session_id}/join", post(join_play_session))
}

async fn create_play_session(
    State(state): State<AppState>,
    CurrentUser { id: host_id }: CurrentUser,
    Json(payload): Json<CreatePlaySession>,
) -> Result<Json<PlaySession>, AppError> {
    let session = sqlx::query_as::<_, PlaySession>(
        r#"
        INSERT INTO play_sessions (
            host_id, title, venue, city, starts_at, skill_level, max_players, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, host_id, title, venue, city, starts_at, skill_level,
            max_players, notes, created_at
        "#,
    )
    .bind(host_id)
    .bind(payload.title)
    .bind(payload.venue)
    .bind(payload.city)
    .bind(payload.starts_at)
    .bind(payload.skill_level)
    .bind(payload.max_players)
    .bind(payload.notes)
    .fetch_one(&state.pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO play_session_players (session_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(session.id)
    .bind(host_id)
    .execute(&state.pool)
    .await?;

    Ok(Json(session))
}

async fn find_play_sessions(
    State(state): State<AppState>,
    Query(search): Query<PlaySessionSearch>,
) -> Result<Json<Vec<PlaySession>>, AppError> {
    let limit = search.limit.unwrap_or(25).clamp(1, 100);
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT id, host_id, title, venue, city, starts_at, skill_level, max_players, notes, created_at FROM play_sessions",
    );

    if search.city.is_some() || search.skill_level.is_some() {
        query.push(" WHERE ");
        let mut separated = query.separated(" AND ");

        if let Some(city) = search.city {
            separated.push("city ILIKE ").push_bind(format!("%{city}%"));
        }
        if let Some(skill_level) = search.skill_level {
            separated.push("skill_level = ").push_bind(skill_level);
        }
    }

    query
        .push(" ORDER BY starts_at ASC LIMIT ")
        .push_bind(limit);

    let sessions = query
        .build_query_as::<PlaySession>()
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(sessions))
}

async fn join_play_session(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Path(session_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    let affected = sqlx::query(
        r#"
        INSERT INTO play_session_players (session_id, user_id)
        SELECT $1, $2
        WHERE (
            SELECT count(*) FROM play_session_players WHERE session_id = $1
        ) < (
            SELECT max_players FROM play_sessions WHERE id = $1
        )
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(session_id)
    .bind(user_id)
    .execute(&state.pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::BadRequest(
            "session is full, missing, or already joined".to_owned(),
        ));
    }

    Ok(StatusCode::NO_CONTENT)
}
