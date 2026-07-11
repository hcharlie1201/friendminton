use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct Post {
    pub id: Uuid,
    pub user_id: Uuid,
    pub workout_id: Option<Uuid>,
    pub body: String,
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreatePost {
    pub workout_id: Option<Uuid>,
    pub body: String,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct FeedPost {
    pub id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub workout_id: Option<Uuid>,
    pub body: String,
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}
