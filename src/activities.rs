mod post;
mod workout;

use sqlx::{Pool, Postgres};
use uuid::Uuid;

use crate::{
    error::AppError,
    media::{MediaStorage, validate_object_keys},
};

pub use post::{CreatePost, FeedPost, Post, UpdatePost};
use post::{StoredFeedPost, StoredPost};
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
    media: &MediaStorage,
    user_id: Uuid,
    payload: CreatePost,
) -> Result<Post, AppError> {
    validate_post(user_id, &payload.body, payload.effort, &payload.image_keys)?;

    let post = sqlx::query_as::<_, StoredPost>(
        r#"
        INSERT INTO posts (user_id, workout_id, body, location, effort, image_urls)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, user_id, workout_id, body, location, effort,
            image_urls AS image_keys, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.workout_id)
    .bind(payload.body)
    .bind(payload.location)
    .bind(payload.effort)
    .bind(payload.image_keys)
    .fetch_one(pool)
    .await?;

    hydrate_post(media, post).await
}

pub async fn update_post(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    payload: UpdatePost,
) -> Result<Post, AppError> {
    validate_post(user_id, &payload.body, payload.effort, &payload.image_keys)?;

    let post = sqlx::query_as::<_, StoredPost>(
        r#"
        UPDATE posts
        SET workout_id = $3, body = $4, location = $5, effort = $6, image_urls = $7
        WHERE id = $1 AND user_id = $2
        RETURNING id, user_id, workout_id, body, location, effort,
            image_urls AS image_keys, created_at
        "#,
    )
    .bind(payload.id)
    .bind(user_id)
    .bind(payload.workout_id)
    .bind(payload.body)
    .bind(payload.location)
    .bind(payload.effort)
    .bind(payload.image_keys)
    .fetch_one(pool)
    .await?;

    hydrate_post(media, post).await
}

pub async fn feed(pool: &Pool<Postgres>, media: &MediaStorage) -> Result<Vec<FeedPost>, AppError> {
    let posts = sqlx::query_as::<_, StoredFeedPost>(
        r#"
        SELECT posts.id, posts.user_id, users.display_name, posts.workout_id, posts.body,
            posts.location, posts.effort, posts.image_urls AS image_keys, posts.created_at
        FROM posts
        JOIN users ON users.id = posts.user_id
        ORDER BY posts.created_at DESC
        LIMIT 100
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut feed = Vec::with_capacity(posts.len());
    for post in posts {
        let image_urls = media.read_urls(&post.image_keys).await?;
        feed.push(FeedPost {
            id: post.id,
            user_id: post.user_id,
            display_name: post.display_name,
            workout_id: post.workout_id,
            body: post.body,
            location: post.location,
            effort: post.effort,
            image_keys: post.image_keys,
            image_urls,
            created_at: post.created_at,
        });
    }

    Ok(feed)
}

fn validate_post(
    user_id: Uuid,
    body: &str,
    effort: Option<i16>,
    image_keys: &[String],
) -> Result<(), AppError> {
    if body.trim().is_empty() && image_keys.is_empty() {
        return Err(AppError::BadRequest(
            "a post needs text or at least one photo".to_owned(),
        ));
    }
    if !matches!(effort, None | Some(1..=10)) {
        return Err(AppError::BadRequest(
            "effort must be between 1 and 10".to_owned(),
        ));
    }
    validate_object_keys(user_id, image_keys)?;

    Ok(())
}

async fn hydrate_post(media: &MediaStorage, post: StoredPost) -> Result<Post, AppError> {
    let image_urls = media.read_urls(&post.image_keys).await?;
    Ok(Post {
        id: post.id,
        user_id: post.user_id,
        workout_id: post.workout_id,
        body: post.body,
        location: post.location,
        effort: post.effort,
        image_keys: post.image_keys,
        image_urls,
        created_at: post.created_at,
    })
}

#[cfg(test)]
mod tests {
    use super::validate_post;
    use uuid::Uuid;

    fn image_keys(user_id: Uuid, count: usize) -> Vec<String> {
        (0..count)
            .map(|index| format!("posts/{user_id}/{index}.jpg"))
            .collect()
    }

    #[test]
    fn post_requires_text_or_a_photo() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, "  ", None, &[]).is_err());
        assert!(validate_post(user_id, "", None, &[format!("posts/{user_id}/photo.jpg")]).is_ok());
    }

    #[test]
    fn post_rejects_invalid_effort_and_image_paths() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, "Good match", Some(0), &[]).is_err());
        assert!(validate_post(user_id, "Good match", Some(11), &[]).is_err());
        assert!(
            validate_post(
                user_id,
                "Good match",
                Some(7),
                &["https://example.com/photo.jpg".to_owned()]
            )
            .is_err()
        );
    }

    #[test]
    fn post_accepts_effort_boundaries() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, "Easy hit", Some(1), &[]).is_ok());
        assert!(validate_post(user_id, "Tournament final", Some(10), &[]).is_ok());
    }

    #[test]
    fn post_allows_at_most_four_photos() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, "", None, &image_keys(user_id, 4)).is_ok());
        assert!(validate_post(user_id, "", None, &image_keys(user_id, 5)).is_err());
    }
}
