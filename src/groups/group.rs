use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GroupVisibility {
    #[default]
    Public,
    Private,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GroupJoinPolicy {
    #[default]
    Open,
    ApprovalRequired,
    InviteOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GroupGoal {
    Fitness,
    Social,
    Improvement,
    Competitive,
    ConsistentPlay,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GroupRole {
    Owner,
    Admin,
    Member,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum GroupMemberStatus {
    Member,
    Pending,
    Invited,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct BadmintonGroup {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub city: String,
    pub visibility: GroupVisibility,
    pub join_policy: GroupJoinPolicy,
    pub primary_court_id: Option<Uuid>,
    pub goal_tags: Vec<GroupGoal>,
    pub member_count: i64,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateBadmintonGroup {
    pub name: String,
    pub description: Option<String>,
    pub city: String,
    #[serde(default)]
    pub visibility: GroupVisibility,
    #[serde(default)]
    pub join_policy: GroupJoinPolicy,
    pub primary_court_id: Option<Uuid>,
    #[serde(default)]
    pub goal_tags: Vec<GroupGoal>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct GroupSearch {
    pub city: Option<String>,
    pub query: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct GroupMembership {
    pub group_id: Uuid,
    pub user_id: Uuid,
    pub role: GroupRole,
    pub status: GroupMemberStatus,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub joined_at: OffsetDateTime,
}
