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
