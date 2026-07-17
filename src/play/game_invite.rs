use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct GameInvite {
    pub id: Uuid,
    pub host_id: Uuid,
    pub title: String,
    pub venue: String,
    pub city: String,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub starts_at: OffsetDateTime,
    pub skill_level: String,
    pub max_players: i32,
    pub notes: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateGameInvite {
    pub title: String,
    pub venue: String,
    pub city: String,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub starts_at: OffsetDateTime,
    pub skill_level: String,
    pub max_players: i32,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GameInviteSearch {
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub limit: Option<i64>,
}
