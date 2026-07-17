use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub display_name: String,
    pub city: Option<String>,
    pub skill_level: String,
    pub bio: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateUser {
    pub email: String,
    pub display_name: String,
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub bio: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PlayerSearch {
    pub city: Option<String>,
    pub skill_level: Option<String>,
    pub limit: Option<i64>,
}
