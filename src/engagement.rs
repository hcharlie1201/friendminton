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
        WITH bounds AS (
            SELECT date_trunc('week', now()) AS current_week
        ),
        activity_weeks AS (
            SELECT DISTINCT date_trunc('week', occurred_at) AS week_start
            FROM workouts
            WHERE user_id = $1
        ),
        numbered_weeks AS (
            SELECT week_start,
                week_start - row_number() OVER (ORDER BY week_start) * interval '1 week' AS island
            FROM activity_weeks
        ),
        streaks AS (
            SELECT count(*)::int AS length, max(week_start) AS ending_week
            FROM numbered_weeks
            GROUP BY island
        ),
        streak_anchor AS (
            SELECT CASE
                WHEN EXISTS (
                    SELECT 1 FROM activity_weeks
                    WHERE week_start = bounds.current_week
                ) THEN bounds.current_week
                ELSE bounds.current_week - interval '1 week'
            END AS week_start
            FROM bounds
        )
        SELECT
            (SELECT count(*)::int FROM workouts, bounds
             WHERE user_id = $1 AND occurred_at >= bounds.current_week) AS activities,
            (SELECT coalesce(sum(duration_minutes), 0)::int FROM workouts, bounds
             WHERE user_id = $1 AND occurred_at >= bounds.current_week) AS duration_minutes,
            (SELECT count(*)::int FROM workouts, bounds
             WHERE user_id = $1 AND occurred_at >= bounds.current_week
                AND workout_type IN ('match', 'open_play')) AS games,
            (SELECT count(*)::int FROM posts, bounds
             WHERE user_id = $1 AND created_at >= bounds.current_week) AS posts,
            1::int AS weekly_goal,
            (SELECT count(*)::int FROM workouts, bounds
             WHERE user_id = $1 AND occurred_at >= bounds.current_week) AS weekly_goal_progress,
            coalesce((SELECT length FROM streaks, streak_anchor
                WHERE ending_week = streak_anchor.week_start), 0)::int AS current_streak_weeks,
            coalesce((SELECT max(length) FROM streaks), 0)::int AS longest_streak_weeks,
            (SELECT count(*)::int FROM activity_weeks, bounds
             WHERE week_start >= bounds.current_week - interval '7 weeks'
                AND week_start <= bounds.current_week) AS active_weeks_last_8,
            (SELECT count(DISTINCT occurred_at::date)::int FROM workouts
             WHERE user_id = $1 AND occurred_at >= now() - interval '28 days') AS active_days_last_28,
            ((SELECT count(*)::int FROM activity_weeks, bounds
              WHERE week_start >= bounds.current_week - interval '7 weeks'
                AND week_start <= bounds.current_week) * 100 / 8)::int AS consistency_percent
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
