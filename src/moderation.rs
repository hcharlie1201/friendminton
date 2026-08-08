use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateReport {
    pub target_type: ReportTargetType,
    pub target_id: Uuid,
    pub reason: ReportReason,
    pub details: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, JsonSchema, sqlx::Type, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum ReportTargetType {
    User,
    Post,
    GroupMessage,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, JsonSchema, sqlx::Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum ReportReason {
    Harassment,
    Spam,
    Hate,
    SexualContent,
    Violence,
    Other,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct ModerationReport {
    pub id: Uuid,
    pub reporter_id: Uuid,
    pub reporter_name: String,
    pub target_type: ReportTargetType,
    pub target_id: Uuid,
    pub target_label: String,
    pub reason: ReportReason,
    pub details: Option<String>,
    pub status: String,
    pub resolution_note: Option<String>,
    pub reviewed_by: Option<Uuid>,
    #[serde(with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub reviewed_at: Option<OffsetDateTime>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct ModerationAuditEntry {
    pub id: Uuid,
    pub admin_id: Option<Uuid>,
    pub report_id: Option<Uuid>,
    pub action: String,
    pub target_type: String,
    pub target_id: Uuid,
    pub note: Option<String>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct ResolveReport {
    pub resolution: ReportResolution,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReportResolution {
    Dismiss,
    Resolve,
    RemoveContent,
}

pub async fn create_report(
    pool: &PgPool,
    reporter_id: Uuid,
    payload: CreateReport,
) -> Result<ModerationReport, AppError> {
    if payload.target_type == ReportTargetType::User && payload.target_id == reporter_id {
        return Err(AppError::BadRequest(
            "you cannot report yourself".to_owned(),
        ));
    }
    ensure_target_exists(pool, payload.target_type, payload.target_id).await?;
    let details = normalize_note(payload.details)?;
    let report_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO moderation_reports (reporter_id, target_type, target_id, reason, details)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (reporter_id, target_type, target_id)
        DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details,
            status = 'open', reviewed_by = NULL, reviewed_at = NULL, resolution_note = NULL
        RETURNING id
    "#,
    )
    .bind(reporter_id)
    .bind(payload.target_type)
    .bind(payload.target_id)
    .bind(payload.reason)
    .bind(details)
    .fetch_one(pool)
    .await?;
    get_report(pool, report_id).await
}

pub async fn list_reports(
    pool: &PgPool,
    admin_id: Uuid,
) -> Result<Vec<ModerationReport>, AppError> {
    require_admin(pool, admin_id).await?;
    Ok(sqlx::query_as::<_, ModerationReport>(&report_select(
        "WHERE report.status = 'open' ORDER BY report.created_at ASC",
    ))
    .fetch_all(pool)
    .await?)
}

pub async fn list_audit_log(
    pool: &PgPool,
    admin_id: Uuid,
) -> Result<Vec<ModerationAuditEntry>, AppError> {
    require_admin(pool, admin_id).await?;
    Ok(sqlx::query_as::<_, ModerationAuditEntry>(
        r#"
        SELECT id, admin_id, report_id, action, target_type, target_id, note, created_at
        FROM moderation_audit_log ORDER BY created_at DESC LIMIT 200
    "#,
    )
    .fetch_all(pool)
    .await?)
}

pub async fn resolve_report(
    pool: &PgPool,
    admin_id: Uuid,
    report_id: Uuid,
    payload: ResolveReport,
) -> Result<ModerationReport, AppError> {
    require_admin(pool, admin_id).await?;
    let note = normalize_note(payload.note)?;
    let mut tx = pool.begin().await?;
    let (target_type, target_id) = sqlx::query_as::<_, (ReportTargetType, Uuid)>(
        "SELECT target_type, target_id FROM moderation_reports WHERE id = $1 FOR UPDATE",
    )
    .bind(report_id)
    .fetch_one(&mut *tx)
    .await?;
    let (status, action) = match payload.resolution {
        ReportResolution::Dismiss => ("dismissed", "dismissed"),
        ReportResolution::Resolve => ("resolved", "resolved"),
        ReportResolution::RemoveContent => {
            if !matches!(
                target_type,
                ReportTargetType::Post | ReportTargetType::GroupMessage
            ) {
                return Err(AppError::BadRequest(
                    "only reported content can be removed".to_owned(),
                ));
            }
            match target_type {
                ReportTargetType::Post => {
                    sqlx::query("UPDATE posts SET moderated_at = now() WHERE id = $1")
                        .bind(target_id)
                        .execute(&mut *tx)
                        .await?;
                }
                ReportTargetType::GroupMessage => {
                    sqlx::query("UPDATE group_messages SET deleted_at = now() WHERE id = $1")
                        .bind(target_id)
                        .execute(&mut *tx)
                        .await?;
                }
                ReportTargetType::User => unreachable!(),
            }
            ("resolved", "content_removed")
        }
    };
    sqlx::query(
        r#"UPDATE moderation_reports SET status = $2, resolution_note = $3,
        reviewed_by = $4, reviewed_at = now() WHERE id = $1"#,
    )
    .bind(report_id)
    .bind(status)
    .bind(&note)
    .bind(admin_id)
    .execute(&mut *tx)
    .await?;
    sqlx::query(
        r#"INSERT INTO moderation_audit_log
        (admin_id, report_id, action, target_type, target_id, note)
        VALUES ($1, $2, $3, $4, $5, $6)"#,
    )
    .bind(admin_id)
    .bind(report_id)
    .bind(action)
    .bind(target_type)
    .bind(target_id)
    .bind(note)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    get_report(pool, report_id).await
}

async fn get_report(pool: &PgPool, id: Uuid) -> Result<ModerationReport, AppError> {
    Ok(
        sqlx::query_as::<_, ModerationReport>(&report_select("WHERE report.id = $1"))
            .bind(id)
            .fetch_one(pool)
            .await?,
    )
}

fn report_select(suffix: &str) -> String {
    format!(
        r#"SELECT report.id, report.reporter_id, reporter.display_name AS reporter_name,
        report.target_type, report.target_id,
        CASE report.target_type WHEN 'user' THEN COALESCE(target_user.display_name, 'Removed user')
             WHEN 'post' THEN COALESCE(left(target_post.body, 100), 'Removed post')
             ELSE COALESCE(left(target_message.body, 100), 'Removed message') END AS target_label,
        report.reason, report.details, report.status, report.resolution_note,
        report.reviewed_by, report.reviewed_at, report.created_at
        FROM moderation_reports AS report
        JOIN users AS reporter ON reporter.id = report.reporter_id
        LEFT JOIN users AS target_user ON report.target_type = 'user' AND target_user.id = report.target_id
        LEFT JOIN posts AS target_post ON report.target_type = 'post' AND target_post.id = report.target_id
        LEFT JOIN group_messages AS target_message ON report.target_type = 'group_message' AND target_message.id = report.target_id
        {suffix}"#
    )
}

async fn require_admin(pool: &PgPool, user_id: Uuid) -> Result<(), AppError> {
    let is_admin = sqlx::query_scalar::<_, bool>("SELECT is_admin FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(pool)
        .await?;
    if !is_admin {
        return Err(AppError::Forbidden("admin access is required".to_owned()));
    }
    Ok(())
}

async fn ensure_target_exists(
    pool: &PgPool,
    target_type: ReportTargetType,
    target_id: Uuid,
) -> Result<(), AppError> {
    let table = match target_type {
        ReportTargetType::User => "users",
        ReportTargetType::Post => "posts",
        ReportTargetType::GroupMessage => "group_messages",
    };
    let exists = sqlx::query_scalar::<_, bool>(&format!(
        "SELECT EXISTS(SELECT 1 FROM {table} WHERE id = $1)"
    ))
    .bind(target_id)
    .fetch_one(pool)
    .await?;
    if !exists {
        return Err(sqlx::Error::RowNotFound.into());
    }
    Ok(())
}

fn normalize_note(value: Option<String>) -> Result<Option<String>, AppError> {
    let Some(value) = value else { return Ok(None) };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > 1000 {
        return Err(AppError::BadRequest(
            "details must be at most 1000 characters".to_owned(),
        ));
    }
    Ok(Some(value.to_owned()))
}
