use aide::axum::{
    ApiRouter,
    routing::{get, post},
};
use axum::{Json, extract::State, http::StatusCode};

use crate::{
    app::AppState,
    auth::CurrentUser,
    engagement::{self, Notification, UnreadNotificationCount, WeeklySnapshot},
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/weekly-snapshot", get(weekly_snapshot))
        .api_route("/notifications", get(notifications))
        .api_route("/notifications/unread-count", get(unread_notification_count))
        .api_route("/notifications/read", post(mark_notifications_read))
}

pub(crate) async fn weekly_snapshot(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
) -> Result<Json<WeeklySnapshot>, AppError> {
    let snapshot = engagement::weekly_snapshot(&state.pool, user_id).await?;
    Ok(Json(snapshot))
}

pub(crate) async fn notifications(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
) -> Result<Json<Vec<Notification>>, AppError> {
    let notifications = engagement::list_notifications(&state.pool, user_id).await?;
    Ok(Json(notifications))
}

pub(crate) async fn unread_notification_count(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
) -> Result<Json<UnreadNotificationCount>, AppError> {
    let count = engagement::unread_notification_count(&state.pool, user_id).await?;
    Ok(Json(UnreadNotificationCount { count }))
}

pub(crate) async fn mark_notifications_read(
    State(state): State<AppState>,
    CurrentUser { id: user_id }: CurrentUser,
) -> Result<StatusCode, AppError> {
    engagement::mark_notifications_read(&state.pool, user_id).await?;
    Ok(StatusCode::NO_CONTENT)
}
