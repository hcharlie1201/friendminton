use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GroupMessageQuery {
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateGroupMessage {
    pub client_message_id: Uuid,
    pub body: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct SetGroupMessageReaction {
    pub emoji: String,
    pub active: bool,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct GroupMessagePage {
    pub items: Vec<GroupMessage>,
    pub next_cursor: Option<String>,
    pub unread_count: i64,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct GroupMessage {
    pub id: Uuid,
    pub group_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub avatar_url: Option<String>,
    pub body: String,
    pub reactions: Vec<GroupMessageReaction>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct GroupMessageReaction {
    pub emoji: String,
    pub count: i64,
    pub reacted_by_viewer: bool,
}

#[derive(Debug, FromRow)]
pub(super) struct StoredGroupMessage {
    pub id: Uuid,
    pub group_id: Uuid,
    pub user_id: Uuid,
    pub display_name: String,
    pub avatar_key: Option<String>,
    pub body: String,
    pub created_at: OffsetDateTime,
}

#[derive(Debug, FromRow)]
pub(super) struct StoredReaction {
    pub emoji: String,
    pub count: i64,
    pub reacted_by_viewer: bool,
}
