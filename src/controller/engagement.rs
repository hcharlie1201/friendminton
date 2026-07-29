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
        .api_route(
            "/notifications/unread-count",
            get(unread_notification_count),
        )
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

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};

    use crate::controller::test_support::TestApi;

    #[tokio::test]
    async fn weekly_snapshot_reports_goal_consistency_and_streaks() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("snapshot-streak").await;
        for week_offset in [0_i32, 1, 2, 4] {
            sqlx::query(
                r#"
                INSERT INTO workouts (
                    user_id, title, workout_type, duration_minutes,
                    duration_milliseconds, occurred_at
                )
                VALUES (
                    $1, 'Streak session', 'match', 60, 3600000,
                    date_trunc('week', now()) - $2 * interval '1 week' + interval '1 day'
                )
                "#,
            )
            .bind(user_id)
            .bind(week_offset)
            .execute(&api.pool)
            .await
            .expect("insert streak workout");
        }

        let response = api
            .json(
                Method::GET,
                "/api/engagement/weekly-snapshot",
                Some(user_id),
                None,
            )
            .await;
        assert_eq!(response.status, StatusCode::OK, "{}", response.body);
        assert_eq!(response.body["activities"], 1);
        assert_eq!(response.body["games"], 1);
        assert_eq!(response.body["weekly_goal"], 1);
        assert_eq!(response.body["weekly_goal_progress"], 1);
        assert_eq!(response.body["current_streak_weeks"], 3);
        assert_eq!(response.body["longest_streak_weeks"], 3);
        assert_eq!(response.body["active_weeks_last_8"], 4);
        assert_eq!(response.body["active_days_last_28"], 3);
        assert_eq!(response.body["consistency_percent"], 50);
        api.cleanup_users(&[user_id]).await;
    }
}
