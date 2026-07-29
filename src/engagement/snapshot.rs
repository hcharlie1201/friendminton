use schemars::JsonSchema;
use serde::Serialize;
use sqlx::FromRow;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct WeeklySnapshot {
    pub activities: i32,
    pub duration_minutes: i32,
    pub games: i32,
    pub posts: i32,
    pub weekly_goal: i32,
    pub weekly_goal_progress: i32,
    pub current_streak_weeks: i32,
    pub longest_streak_weeks: i32,
    pub active_weeks_last_8: i32,
    pub active_days_last_28: i32,
    pub consistency_percent: i32,
}
