mod notification;
mod snapshot;

use sqlx::{Pool, Postgres};
use uuid::Uuid;

use crate::error::AppError;

pub use notification::{Notification, UnreadNotificationCount};
pub use snapshot::WeeklySnapshot;

pub async fn weekly_snapshot(
    pool: &Pool<Postgres>,
    user_id: Uuid,
) -> Result<WeeklySnapshot, AppError> {
    let snapshot = sqlx::query_as::<_, WeeklySnapshot>(
        r#"
        SELECT
            (SELECT count(*)::int FROM workouts
             WHERE user_id = $1 AND occurred_at >= now() - interval '7 days') AS activities,
            (SELECT coalesce(sum(duration_minutes), 0)::int FROM workouts
             WHERE user_id = $1 AND occurred_at >= now() - interval '7 days') AS duration_minutes,
            (SELECT count(*)::int FROM game_invite_players
             WHERE user_id = $1 AND joined_at >= now() - interval '7 days') AS games,
            (SELECT count(*)::int FROM posts
             WHERE user_id = $1 AND created_at >= now() - interval '7 days') AS posts
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(snapshot)
}

pub async fn list_notifications(
    pool: &Pool<Postgres>,
    user_id: Uuid,
) -> Result<Vec<Notification>, AppError> {
    ensure_seed_notifications(pool, user_id).await?;

    let notifications = sqlx::query_as::<_, Notification>(
        r#"
        SELECT id, user_id, title, body, notification_type, read_at, created_at
        FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 50
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(notifications)
}

pub async fn unread_notification_count(
    pool: &Pool<Postgres>,
    user_id: Uuid,
) -> Result<i32, AppError> {
    ensure_seed_notifications(pool, user_id).await?;

    let count = sqlx::query_scalar::<_, i32>(
        r#"
        SELECT count(*)::int
        FROM notifications
        WHERE user_id = $1 AND read_at IS NULL
        "#,
    )
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    Ok(count)
}

pub async fn mark_notifications_read(pool: &Pool<Postgres>, user_id: Uuid) -> Result<(), AppError> {
    sqlx::query(
        r#"
        UPDATE notifications
        SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}

async fn ensure_seed_notifications(pool: &Pool<Postgres>, user_id: Uuid) -> Result<(), AppError> {
    sqlx::query(
        r#"
        INSERT INTO notifications (user_id, title, body, notification_type)
        SELECT $1, seed.title, seed.body, seed.notification_type
        FROM (
            VALUES
                ('New players nearby', 'Players around your discovery location are looking for a rally.', 'discover'),
                ('Log this week', 'Add a badminton session to keep your weekly snapshot fresh.', 'workout')
        ) AS seed(title, body, notification_type)
        WHERE NOT EXISTS (
            SELECT 1 FROM notifications WHERE user_id = $1
        )
        "#,
    )
    .bind(user_id)
    .execute(pool)
    .await?;

    Ok(())
}
