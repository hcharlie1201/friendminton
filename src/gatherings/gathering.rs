use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GatheringKind {
    Play,
    Social,
    PlayAndSocial,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GatheringVisibility {
    #[default]
    Public,
    Private,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GatheringJoinPolicy {
    #[default]
    Open,
    ApprovalRequired,
    InviteOnly,
    MembersOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GatheringParticipantStatus {
    Going,
    Pending,
    Invited,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum PlayFormat {
    OpenPlay,
    Doubles,
    Singles,
    Drills,
    Coaching,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum SocialTag {
    Drinks,
    Food,
    BoardGames,
    WatchParty,
    GearSwap,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct Gathering {
    pub id: Uuid,
    pub host_id: Uuid,
    pub kind: GatheringKind,
    pub visibility: GatheringVisibility,
    pub join_policy: GatheringJoinPolicy,
    pub title: String,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub starts_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub ends_at: Option<OffsetDateTime>,
    pub venue: String,
    pub city: String,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    pub cost_per_person_cents: i32,
    pub currency: String,
    pub skill_level: Option<String>,
    pub play_format: Option<PlayFormat>,
    pub court_count: Option<i32>,
    pub social_tags: Vec<SocialTag>,
    pub theme: Option<String>,
    pub cover_image_key: Option<String>,
    pub cover_image_url: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateGathering {
    pub kind: GatheringKind,
    #[serde(default)]
    pub visibility: GatheringVisibility,
    #[serde(default)]
    pub join_policy: GatheringJoinPolicy,
    pub title: String,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub starts_at: OffsetDateTime,
    #[serde(default, with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub ends_at: Option<OffsetDateTime>,
    pub venue: String,
    pub city: String,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    #[serde(default)]
    pub cost_per_person_cents: i32,
    #[serde(default = "default_currency")]
    pub currency: String,
    pub skill_level: Option<String>,
    pub play_format: Option<PlayFormat>,
    pub court_count: Option<i32>,
    #[serde(default)]
    pub social_tags: Vec<SocialTag>,
    pub theme: Option<String>,
    pub cover_image_key: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GatheringSearch {
    pub city: Option<String>,
    pub kind: Option<GatheringKind>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub starts_after: Option<OffsetDateTime>,
    #[serde(default, with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub starts_before: Option<OffsetDateTime>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct GatheringParticipant {
    pub gathering_id: Uuid,
    pub user_id: Uuid,
    pub status: GatheringParticipantStatus,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub joined_at: OffsetDateTime,
}

#[derive(Debug, FromRow)]
pub(super) struct StoredGathering {
    pub id: Uuid,
    pub host_id: Uuid,
    pub kind: GatheringKind,
    pub visibility: GatheringVisibility,
    pub join_policy: GatheringJoinPolicy,
    pub title: String,
    pub starts_at: OffsetDateTime,
    pub ends_at: Option<OffsetDateTime>,
    pub venue: String,
    pub city: String,
    pub description: Option<String>,
    pub capacity: Option<i32>,
    pub cost_per_person_cents: i32,
    pub currency: String,
    pub skill_level: Option<String>,
    pub play_format: Option<PlayFormat>,
    pub court_count: Option<i32>,
    pub social_tags: Vec<SocialTag>,
    pub theme: Option<String>,
    pub cover_image_key: Option<String>,
    pub created_at: OffsetDateTime,
    pub updated_at: OffsetDateTime,
}

fn default_currency() -> String {
    "USD".to_owned()
}
