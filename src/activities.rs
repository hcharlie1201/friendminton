mod post;
mod workout;

use sqlx::{Pool, Postgres};
use uuid::Uuid;

use crate::error::AppError;

pub use post::{CreatePost, FeedPost, Post};
pub use workout::{CreateWorkout, Workout};

pub async fn create_workout(
    pool: &Pool<Postgres>,
    user_id: Uuid,
    payload: CreateWorkout,
) -> Result<Workout, AppError> {
    if payload.duration_minutes <= 0 {
        return Err(AppError::BadRequest(
            "duration_minutes must be positive".to_owned(),
        ));
    }

    let workout = sqlx::query_as::<_, Workout>(
        r#"
        INSERT INTO workouts (
            user_id, title, workout_type, duration_minutes, calories,
            distance_meters, notes, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, user_id, title, workout_type, duration_minutes, calories,
            distance_meters, notes, occurred_at, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.title)
    .bind(payload.workout_type)
    .bind(payload.duration_minutes)
    .bind(payload.calories)
    .bind(payload.distance_meters)
    .bind(payload.notes)
    .bind(payload.occurred_at)
    .fetch_one(pool)
    .await?;

    Ok(workout)
}

pub async fn list_user_workouts(
    pool: &Pool<Postgres>,
    user_id: Uuid,
) -> Result<Vec<Workout>, AppError> {
    let workouts = sqlx::query_as::<_, Workout>(
        r#"
        SELECT id, user_id, title, workout_type, duration_minutes, calories,
            distance_meters, notes, occurred_at, created_at
        FROM workouts
        WHERE user_id = $1
        ORDER BY occurred_at DESC
        LIMIT 100
        "#,
    )
    .bind(user_id)
    .fetch_all(pool)
    .await?;

    Ok(workouts)
}

pub async fn create_post(
    pool: &Pool<Postgres>,
    user_id: Uuid,
    payload: CreatePost,
) -> Result<Post, AppError> {
    if payload.body.trim().is_empty() {
        return Err(AppError::BadRequest("body is required".to_owned()));
    }

    let post = sqlx::query_as::<_, Post>(
        r#"
        INSERT INTO posts (user_id, workout_id, body)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, workout_id, body, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.workout_id)
    .bind(payload.body)
    .fetch_one(pool)
    .await?;

    Ok(post)
}

pub async fn feed(pool: &Pool<Postgres>) -> Result<Vec<FeedPost>, AppError> {
    let posts = sqlx::query_as::<_, FeedPost>(
        r#"
        SELECT posts.id, posts.user_id, users.display_name, posts.workout_id, posts.body, posts.created_at
        FROM posts
        JOIN users ON users.id = posts.user_id
        ORDER BY posts.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(posts)
}
