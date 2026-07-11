use axum::{
    Json, Router,
    extract::{Path, Query, State},
    routing::get,
};
use sqlx::{Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    app::AppState,
    error::AppError,
    models::{PlayerSearch, User},
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
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, email, display_name, city, skill_level, bio, created_at, updated_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(user))
}

async fn find_players(
    State(state): State<AppState>,
    Query(search): Query<PlayerSearch>,
) -> Result<Json<Vec<User>>, AppError> {
    let limit = search.limit.unwrap_or(25).clamp(1, 100);
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT id, email, display_name, city, skill_level, bio, created_at, updated_at FROM users",
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
        .push(" ORDER BY created_at DESC LIMIT ")
        .push_bind(limit);

    let users = query
        .build_query_as::<User>()
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(users))
}
