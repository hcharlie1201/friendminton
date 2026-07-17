use schemars::JsonSchema;
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct WeeklySnapshot {
    pub activities: i32,
    pub duration_minutes: i32,
    pub games: i32,
    pub posts: i32,
}
