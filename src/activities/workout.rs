use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct Workout {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub workout_type: String,
    pub duration_minutes: i32,
    pub calories: Option<i32>,
    pub distance_meters: Option<i32>,
    pub notes: Option<String>,
    pub occurred_at: OffsetDateTime,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkout {
    pub title: String,
    pub workout_type: String,
    pub duration_minutes: i32,
    pub calories: Option<i32>,
    pub distance_meters: Option<i32>,
    pub notes: Option<String>,
    pub occurred_at: OffsetDateTime,
}
