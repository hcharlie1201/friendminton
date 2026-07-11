use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow)]
pub struct GameInvite {
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
pub struct CreateGameInvite {
    pub title: String,
    pub venue: String,
    pub city: String,
    pub starts_at: OffsetDateTime,
    pub skill_level: String,
    pub max_players: i32,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GameInviteSearch {
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub limit: Option<i64>,
}
