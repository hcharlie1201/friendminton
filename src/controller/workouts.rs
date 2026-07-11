use axum::{
    Json, Router,
    extract::{Path, State},
    routing::{get, post},
};
use uuid::Uuid;

use crate::{
    activities::{self, CreateWorkout, Workout},
    app::AppState,
    auth::CurrentUser,
    error::AppError,
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
    let workout = activities::create_workout(&state.pool, user_id, payload).await?;
    Ok(Json(workout))
}

async fn list_user_workouts(
    State(state): State<AppState>,
    Path(user_id): Path<Uuid>,
) -> Result<Json<Vec<Workout>>, AppError> {
    let workouts = activities::list_user_workouts(&state.pool, user_id).await?;
    Ok(Json(workouts))
}
