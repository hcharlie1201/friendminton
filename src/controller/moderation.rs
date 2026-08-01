use aide::axum::{
    ApiRouter,
    routing::{patch, post},
};
use axum::{
    Json,
    extract::{Path, State},
};
use schemars::JsonSchema;
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    app::AppState,
    auth::CurrentUser,
    error::AppError,
    moderation::{self, CreateReport, ModerationAuditEntry, ModerationReport, ResolveReport},
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/reports", post(create_report).get(list_reports))
        .api_route("/reports/{report_id}", patch(resolve_report))
        .api_route("/audit-log", aide::axum::routing::get(list_audit_log))
}

#[derive(Deserialize, JsonSchema)]
struct ReportPath {
    report_id: Uuid,
}

async fn create_report(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
    Json(payload): Json<CreateReport>,
) -> Result<Json<ModerationReport>, AppError> {
    Ok(Json(
        moderation::create_report(&state.pool, id, payload).await?,
    ))
}

async fn list_reports(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
) -> Result<Json<Vec<ModerationReport>>, AppError> {
    Ok(Json(moderation::list_reports(&state.pool, id).await?))
}

async fn resolve_report(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
    Path(path): Path<ReportPath>,
    Json(payload): Json<ResolveReport>,
) -> Result<Json<ModerationReport>, AppError> {
    Ok(Json(
        moderation::resolve_report(&state.pool, id, path.report_id, payload).await?,
    ))
}

async fn list_audit_log(
    State(state): State<AppState>,
    CurrentUser { id }: CurrentUser,
) -> Result<Json<Vec<ModerationAuditEntry>>, AppError> {
    Ok(Json(moderation::list_audit_log(&state.pool, id).await?))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::json;

    use crate::controller::test_support::TestApi;

    #[tokio::test]
    async fn reports_require_admin_review_and_removal_writes_an_audit_event() {
        let api = TestApi::new().await;
        let reporter = api.insert_user("reporter").await;
        let author = api.insert_user("reported-author").await;
        let admin = api.insert_user("moderator").await;
        sqlx::query("UPDATE users SET is_admin = TRUE WHERE id = $1")
            .bind(admin)
            .execute(&api.pool)
            .await
            .unwrap();
        let post_id = sqlx::query_scalar::<_, uuid::Uuid>(
            "INSERT INTO posts (user_id, body) VALUES ($1, 'reported body') RETURNING id",
        )
        .bind(author)
        .fetch_one(&api.pool)
        .await
        .unwrap();

        let created = api.json(Method::POST, "/api/moderation/reports", Some(reporter), Some(json!({
            "target_type": "post", "target_id": post_id, "reason": "spam", "details": "Repeated promotion"
        }))).await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let report_id = created.body["id"].as_str().unwrap();
        let forbidden = api
            .json(Method::GET, "/api/moderation/reports", Some(reporter), None)
            .await;
        assert_eq!(forbidden.status, StatusCode::FORBIDDEN);
        let reviewed = api
            .json(
                Method::PATCH,
                &format!("/api/moderation/reports/{report_id}"),
                Some(admin),
                Some(json!({
                    "resolution": "remove_content", "note": "Confirmed spam"
                })),
            )
            .await;
        assert_eq!(reviewed.status, StatusCode::OK, "{}", reviewed.body);
        assert_eq!(reviewed.body["status"], "resolved");
        let audit_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM moderation_audit_log WHERE report_id = $1",
        )
        .bind(uuid::Uuid::parse_str(report_id).unwrap())
        .fetch_one(&api.pool)
        .await
        .unwrap();
        assert_eq!(audit_count, 1);
        let hidden = api
            .json(
                Method::GET,
                &format!("/api/posts/{post_id}"),
                Some(reporter),
                None,
            )
            .await;
        assert_eq!(hidden.status, StatusCode::NOT_FOUND);
        api.cleanup_users(&[reporter, author, admin]).await;
    }
}
