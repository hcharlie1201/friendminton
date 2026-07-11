use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub city: Option<String>,
    pub skill_level: String,
    pub bio: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreateUser {
    pub email: String,
    pub display_name: String,
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub bio: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlayerSearch {
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub limit: Option<i64>,
}

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

#[derive(Debug, Serialize, FromRow)]
pub struct Post {
    pub id: Uuid,
    pub user_id: Uuid,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreatePost {
    pub workout_id: Option<Uuid>,
    pub body: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct FeedPost {
    pub id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Serialize, FromRow)]
pub struct PlaySession {
    pub id: Uuid,
    pub host_id: Uuid,
    pub title: String,
    pub venue: String,
    pub city: String,
    pub starts_at: OffsetDateTime,
    pub skill_level: String,
    pub max_players: i32,
    pub notes: Option<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlaySession {
    pub title: String,
    pub venue: String,
    pub city: String,
    pub starts_at: OffsetDateTime,
    pub skill_level: String,
    pub max_players: i32,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlaySessionSearch {
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub limit: Option<i64>,
}
