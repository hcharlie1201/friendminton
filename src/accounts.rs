mod user;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::error::AppError;

pub use user::{CreateUser, PlayerSearch, User};

pub async fn create_user(pool: &Pool<Postgres>, payload: CreateUser) -> Result<User, AppError> {
    validate_user(&payload)?;

    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, display_name, city, skill_level, bio)
        VALUES ($1, $2, $3, COALESCE($4, 'beginner'), $5)
        RETURNING id, email, display_name, city, skill_level, bio, created_at, updated_at
        "#,
    )
    .bind(payload.email.to_ascii_lowercase())
    .bind(payload.display_name)
    .bind(payload.city)
    .bind(payload.skill_level)
    .bind(payload.bio)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn get_user(pool: &Pool<Postgres>, id: Uuid) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, email, display_name, city, skill_level, bio, created_at, updated_at
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn find_players(
    pool: &Pool<Postgres>,
    search: PlayerSearch,
) -> Result<Vec<User>, AppError> {
    let limit = search.limit.unwrap_or(25).clamp(1, 100);
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT id, email, display_name, city, skill_level, bio, created_at, updated_at FROM users",
    );

    if search.city.is_some() || search.skill_level.is_some() {
        query.push(" WHERE ");
        let mut separated = query.separated(" AND ");

        if let Some(city) = search.city {
            separated.push("city ILIKE ").push_bind(format!("%{city}%"));
        }
        if let Some(skill_level) = search.skill_level {
            separated.push("skill_level = ").push_bind(skill_level);
        }
    }

    query
        .push(" ORDER BY created_at DESC LIMIT ")
        .push_bind(limit);

    let users = query.build_query_as::<User>().fetch_all(pool).await?;
    Ok(users)
}

fn validate_user(payload: &CreateUser) -> Result<(), AppError> {
    if !payload.email.contains('@') {
        return Err(AppError::BadRequest(
            "email must look like an email address".to_owned(),
        ));
    }

    if payload.display_name.trim().is_empty() {
        return Err(AppError::BadRequest("display_name is required".to_owned()));
    }

    Ok(())
}
