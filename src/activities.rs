mod post;
mod workout;

use sqlx::{Pool, Postgres};
use time::OffsetDateTime;
use uuid::Uuid;

use crate::{
    error::AppError,
    media::{MediaStorage, validate_object_keys},
};

pub use post::{CreatePost, FeedPage, FeedPost, FeedQuery, Post, UpdatePost};
use post::{StoredFeedPost, StoredPost};
pub use workout::{CreateWorkout, Workout};

pub async fn create_workout(
    pool: &Pool<Postgres>,
    user_id: Uuid,
    payload: CreateWorkout,
) -> Result<Workout, AppError> {
    if payload.duration_milliseconds <= 0 {
        return Err(AppError::BadRequest(
            "duration_milliseconds must be positive".to_owned(),
        ));
    }
    let duration_minutes = summarized_duration_minutes(payload.duration_milliseconds)?;

    let workout = sqlx::query_as::<_, Workout>(
        r#"
        INSERT INTO workouts (
            user_id, title, workout_type, duration_minutes, duration_milliseconds,
            calories, distance_meters, notes, occurred_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, user_id, title, workout_type, duration_minutes, duration_milliseconds,
            calories, distance_meters, notes, occurred_at, created_at
        "#,
    )
    .bind(user_id)
    .bind(payload.title)
    .bind(payload.workout_type)
    .bind(duration_minutes)
    .bind(payload.duration_milliseconds)
    .bind(payload.calories)
    .bind(payload.distance_meters)
    .bind(payload.notes)
    .bind(payload.occurred_at)
    .fetch_one(pool)
    .await?;

    Ok(workout)
}

fn summarized_duration_minutes(duration_milliseconds: i64) -> Result<i32, AppError> {
    i32::try_from((duration_milliseconds + 59_999) / 60_000)
        .map_err(|_| AppError::BadRequest("recorded duration is too large".to_owned()))
}

pub async fn list_user_workouts(
    pool: &Pool<Postgres>,
    user_id: Uuid,
) -> Result<Vec<Workout>, AppError> {
    let workouts = sqlx::query_as::<_, Workout>(
        r#"
        SELECT id, user_id, title, workout_type, duration_minutes, duration_milliseconds,
            calories, distance_meters, notes, occurred_at, created_at
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
    validate_post(
        user_id,
        Some(payload.workout_id),
        &payload.body,
        payload.effort,
        &payload.image_keys,
    )?;
    ensure_workout_owner(pool, user_id, payload.workout_id).await?;

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

async fn ensure_workout_owner(
    pool: &Pool<Postgres>,
    user_id: Uuid,
    workout_id: Uuid,
) -> Result<(), AppError> {
    let is_owner = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM workouts WHERE id = $1 AND user_id = $2)",
    )
    .bind(workout_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    if !is_owner {
        return Err(AppError::BadRequest(
            "activity posts require a recorded workout owned by the current user".to_owned(),
        ));
    }

    Ok(())
}

pub async fn update_post(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    payload: UpdatePost,
) -> Result<Post, AppError> {
    validate_post(
        user_id,
        Some(payload.workout_id),
        &payload.body,
        payload.effort,
        &payload.image_keys,
    )?;
    ensure_workout_owner(pool, user_id, payload.workout_id).await?;

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

pub async fn feed(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    query: FeedQuery,
) -> Result<FeedPage, AppError> {
    let limit = feed_limit(query.limit)?;
    let cursor = query
        .cursor
        .as_deref()
        .map(decode_feed_cursor)
        .transpose()?;
    let (before_time, before_id) = cursor.unzip();
    let mut posts = sqlx::query_as::<_, StoredFeedPost>(
        r#"
        SELECT posts.id, posts.user_id, users.display_name, posts.workout_id,
            workouts.title AS workout_title,
            workouts.duration_milliseconds AS workout_duration_milliseconds,
            posts.body, posts.location, posts.effort,
            posts.image_urls AS image_keys, posts.created_at
        FROM posts
        JOIN users ON users.id = posts.user_id
        LEFT JOIN workouts ON workouts.id = posts.workout_id
        WHERE $1::timestamptz IS NULL
            OR posts.created_at < $1
            OR (posts.created_at = $1 AND posts.id < $2)
        ORDER BY posts.created_at DESC, posts.id DESC
        LIMIT $3
        "#,
    )
    .bind(before_time)
    .bind(before_id)
    .bind(limit + 1)
    .fetch_all(pool)
    .await?;

    let has_more = posts.len() > limit as usize;
    if has_more {
        posts.truncate(limit as usize);
    }
    let next_cursor = if has_more {
        posts
            .last()
            .map(|post| encode_feed_cursor(post.created_at, post.id))
    } else {
        None
    };
    let mut feed = Vec::with_capacity(posts.len());
    for post in posts {
        let image_urls = media.read_urls(&post.image_keys).await?;
        feed.push(FeedPost {
            id: post.id,
            user_id: post.user_id,
            display_name: post.display_name,
            workout_id: post.workout_id,
            workout_title: post.workout_title,
            workout_duration_milliseconds: post.workout_duration_milliseconds,
            body: post.body,
            location: post.location,
            effort: post.effort,
            image_keys: post.image_keys,
            image_urls,
            created_at: post.created_at,
        });
    }

    Ok(FeedPage {
        items: feed,
        next_cursor,
    })
}

fn feed_limit(limit: Option<i64>) -> Result<i64, AppError> {
    let limit = limit.unwrap_or(20);
    if !(1..=50).contains(&limit) {
        return Err(AppError::BadRequest(
            "feed limit must be between 1 and 50".to_owned(),
        ));
    }
    Ok(limit)
}

fn encode_feed_cursor(created_at: OffsetDateTime, id: Uuid) -> String {
    format!("{}:{id}", created_at.unix_timestamp_nanos())
}

fn decode_feed_cursor(value: &str) -> Result<(OffsetDateTime, Uuid), AppError> {
    let invalid = || AppError::BadRequest("invalid feed cursor".to_owned());
    let (timestamp, id) = value.split_once(':').ok_or_else(invalid)?;
    let timestamp = timestamp.parse::<i128>().map_err(|_| invalid())?;
    let created_at = OffsetDateTime::from_unix_timestamp_nanos(timestamp).map_err(|_| invalid())?;
    let id = Uuid::parse_str(id).map_err(|_| invalid())?;
    Ok((created_at, id))
}

fn validate_post(
    user_id: Uuid,
    workout_id: Option<Uuid>,
    body: &str,
    effort: Option<i16>,
    image_keys: &[String],
) -> Result<(), AppError> {
    if workout_id.is_none() && body.trim().is_empty() && image_keys.is_empty() {
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
    use super::{
        decode_feed_cursor, encode_feed_cursor, feed_limit, summarized_duration_minutes,
        validate_post,
    };
    use time::OffsetDateTime;
    use uuid::Uuid;

    fn image_keys(user_id: Uuid, count: usize) -> Vec<String> {
        (0..count)
            .map(|index| format!("posts/{user_id}/{index}.jpg"))
            .collect()
    }

    #[test]
    fn exact_duration_is_summarized_to_whole_minutes() {
        assert_eq!(summarized_duration_minutes(1).unwrap(), 1);
        assert_eq!(summarized_duration_minutes(60_000).unwrap(), 1);
        assert_eq!(summarized_duration_minutes(60_001).unwrap(), 2);
    }

    #[test]
    fn feed_cursor_round_trips_timestamp_and_id() {
        let created_at =
            OffsetDateTime::from_unix_timestamp_nanos(1_721_234_567_890_123_456).unwrap();
        let id = Uuid::new_v4();
        let cursor = encode_feed_cursor(created_at, id);

        assert_eq!(decode_feed_cursor(&cursor).unwrap(), (created_at, id));
        assert!(decode_feed_cursor("not-a-cursor").is_err());
    }

    #[test]
    fn feed_limit_is_bounded() {
        assert_eq!(feed_limit(None).unwrap(), 20);
        assert_eq!(feed_limit(Some(50)).unwrap(), 50);
        assert!(feed_limit(Some(0)).is_err());
        assert!(feed_limit(Some(51)).is_err());
    }

    #[test]
    fn post_requires_text_or_a_photo() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, None, "  ", None, &[]).is_err());
        assert!(
            validate_post(
                user_id,
                None,
                "",
                None,
                &[format!("posts/{user_id}/photo.jpg")]
            )
            .is_ok()
        );
        assert!(validate_post(user_id, Some(Uuid::new_v4()), "", None, &[]).is_ok());
    }

    #[test]
    fn post_rejects_invalid_effort_and_image_paths() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, None, "Good match", Some(0), &[]).is_err());
        assert!(validate_post(user_id, None, "Good match", Some(11), &[]).is_err());
        assert!(
            validate_post(
                user_id,
                None,
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
        assert!(validate_post(user_id, None, "Easy hit", Some(1), &[]).is_ok());
        assert!(validate_post(user_id, None, "Tournament final", Some(10), &[]).is_ok());
    }

    #[test]
    fn post_allows_at_most_four_photos() {
        let user_id = Uuid::new_v4();
        assert!(validate_post(user_id, None, "", None, &image_keys(user_id, 4)).is_ok());
        assert!(validate_post(user_id, None, "", None, &image_keys(user_id, 5)).is_err());
    }
}
