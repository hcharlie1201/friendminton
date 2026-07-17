use schemars::JsonSchema;
use serde::Serialize;
use sqlx::FromRow;
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct Notification {
    pub id: Uuid,
    pub user_id: Uuid,
    pub title: String,
    pub body: String,
    pub notification_type: String,
    #[serde(with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub read_at: Option<OffsetDateTime>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct UnreadNotificationCount {
    pub count: i32,
}
