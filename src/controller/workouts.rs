use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, post},
};
use uuid::Uuid;

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    models::{CreateWorkout, Workout},
};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/", post(create_workout))
        .route("/users/{user_id}", get(list_user_workouts))
}

async fn create_workout(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
    Json(payload): Json<CreateWorkout>,
) -> Result<Json<Workout>, AppError> {
    if payload.duration_minutes <= 0 {
        return Err(AppError::BadRequest(
            "duration_minutes must be positive".to_owned(),
        ));
    }

    let workout = sqlx::query_as::<_, Workout>(
        r#"
        INSERT INTO workouts (
            user_id, title, workout_type, duration_minutes, calories,
            distance_meters, notes, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, user_id, title, workout_type, duration_minutes, calories,
            distance_meters, notes, occurred_at, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.title)
    .bind(payload.workout_type)
    .bind(payload.duration_minutes)
    .bind(payload.calories)
    .bind(payload.distance_meters)
    .bind(payload.notes)
    .bind(payload.occurred_at)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(workout))
}

async fn list_user_workouts(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Vec<Workout>>, AppError> {
    let workouts = sqlx::query_as::<_, Workout>(
        r#"
        SELECT id, user_id, title, workout_type, duration_minutes, calories,
            distance_meters, notes, occurred_at, created_at
        FROM workouts
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT 100
        "#,
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(workouts))
}
