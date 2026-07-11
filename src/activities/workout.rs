use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct Workout {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub workout_type: String,
    pub duration_minutes: i32,
    pub calories: Option<i32>,
    pub distance_meters: Option<i32>,
    pub notes: Option<String>,
    #[schemars(with = "String")]
    pub occurred_at: OffsetDateTime,
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateWorkout {
    pub title: String,
    pub workout_type: String,
    pub duration_minutes: i32,
    pub calories: Option<i32>,
    pub distance_meters: Option<i32>,
    pub notes: Option<String>,
    #[schemars(with = "String")]
    pub occurred_at: OffsetDateTime,
}
