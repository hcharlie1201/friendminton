use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, JsonSchema)]
pub struct Post {
    pub id: Uuid,
    pub user_id: Uuid,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub location: Option<String>,
    pub effort: Option<i16>,
    pub image_keys: Vec<String>,
    pub image_urls: Vec<String>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreatePost {
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub location: Option<String>,
    pub effort: Option<i16>,
    #[serde(default)]
    pub image_keys: Vec<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct UpdatePost {
    pub id: Uuid,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub location: Option<String>,
    pub effort: Option<i16>,
    #[serde(default)]
    pub image_keys: Vec<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct FeedPost {
    pub id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub location: Option<String>,
    pub effort: Option<i16>,
    pub image_keys: Vec<String>,
    pub image_urls: Vec<String>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, FromRow)]
pub(super) struct StoredPost {
    pub id: Uuid,
    pub user_id: Uuid,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub location: Option<String>,
    pub effort: Option<i16>,
    pub image_keys: Vec<String>,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, FromRow)]
pub(super) struct StoredFeedPost {
    pub id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub workout_id: Option<Uuid>,
    pub body: String,
    pub location: Option<String>,
    pub effort: Option<i16>,
    pub image_keys: Vec<String>,
    pub created_at: OffsetDateTime,
}
