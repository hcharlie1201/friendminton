mod user;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::error::AppError;

pub use user::{Player, PlayerSearch, User};

const MAX_PLAYER_SEARCH_CHARS: usize = 80;

pub async fn get_player(pool: &Pool<Postgres>, id: Uuid) -> Result<Player, AppError> {
    let player = sqlx::query_as::<_, Player>(
        r#"
        SELECT id, display_name, city, skill_level, bio
        FROM users
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(pool)
    .await?;

    Ok(player)
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

pub async fn get_user_by_auth_id(
    pool: &Pool<Postgres>,
    auth_user_id: &str,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, email, display_name, city, skill_level, bio, created_at, updated_at
        FROM users
        WHERE auth_user_id = $1
        "#,
    )
    .bind(auth_user_id)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn update_signup_profile(
    pool: &Pool<Postgres>,
    auth_user_id: &str,
    city: Option<String>,
    skill_level: String,
    bio: Option<String>,
) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
        UPDATE users
        SET city = $2,
            skill_level = $3,
            bio = $4,
            updated_at = now()
        WHERE auth_user_id = $1
        RETURNING id, email, display_name, city, skill_level, bio, created_at, updated_at
        "#,
    )
    .bind(auth_user_id)
    .bind(city)
    .bind(skill_level)
    .bind(bio)
    .fetch_one(pool)
    .await?;

    Ok(user)
}

pub async fn find_players(
    pool: &Pool<Postgres>,
    search: PlayerSearch,
) -> Result<Vec<Player>, AppError> {
    let limit = search.limit.unwrap_or(25).clamp(1, 100);
    let search_term = player_search_term(search.query.as_deref())?;
    let mut query =
        QueryBuilder::<Postgres>::new("SELECT id, display_name, city, skill_level, bio FROM users");

    let mut has_filter = false;

    if let Some(city) = search.city {
        push_filter(&mut query, &mut has_filter);
        query.push("city ILIKE ").push_bind(format!("%{city}%"));
    }

    if let Some(skill_level) = search.skill_level {
        push_filter(&mut query, &mut has_filter);
        query.push("skill_level = ").push_bind(skill_level);
    }

    if let Some(search_term) = &search_term {
        push_filter(&mut query, &mut has_filter);
        query
            .push("(display_name || ' ' || COALESCE(bio, '')) ILIKE ")
            .push_bind(player_search_pattern(search_term))
            .push(" ESCAPE '\\'");
    }

    if let Some(search_term) = search_term {
        query
            .push(" ORDER BY similarity(display_name, ")
            .push_bind(search_term)
            .push(") DESC, created_at DESC");
    } else {
        query.push(" ORDER BY created_at DESC");
    }
    query.push(" LIMIT ").push_bind(limit);

    let users = query.build_query_as::<Player>().fetch_all(pool).await?;
    Ok(users)
}

fn push_filter(query: &mut QueryBuilder<'_, Postgres>, has_filter: &mut bool) {
    if *has_filter {
        query.push(" AND ");
    } else {
        query.push(" WHERE ");
        *has_filter = true;
    }
}

fn player_search_term(query: Option<&str>) -> Result<Option<String>, AppError> {
    let Some(query) = query.map(str::trim) else {
        return Ok(None);
    };
    if query.is_empty() {
        return Ok(None);
    }
    if query.chars().count() > MAX_PLAYER_SEARCH_CHARS {
        return Err(AppError::BadRequest(format!(
            "query must be at most {MAX_PLAYER_SEARCH_CHARS} characters"
        )));
    }

    Ok(Some(query.to_owned()))
}

fn player_search_pattern(query: &str) -> String {
    let escaped = query
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{escaped}%")
}

pub(crate) fn normalize_email(email: &str) -> String {
    email.trim().to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_PLAYER_SEARCH_CHARS, normalize_email, player_search_pattern, player_search_term,
    };

    #[test]
    fn email_is_trimmed_and_lowercased() {
        assert_eq!(
            normalize_email("  Player@Example.COM \n"),
            "player@example.com"
        );
    }

    #[test]
    fn player_search_ignores_blank_input() {
        assert_eq!(player_search_term(None).unwrap(), None);
        assert_eq!(player_search_term(Some("   ")).unwrap(), None);
    }

    #[test]
    fn player_search_is_trimmed_and_treats_wildcards_literally() {
        let term = player_search_term(Some(r"  Alex_100%\club  "))
            .unwrap()
            .unwrap();
        assert_eq!(term, r"Alex_100%\club");
        assert_eq!(
            player_search_pattern(&term),
            r"%Alex\_100\%\\club%".to_owned()
        );
    }

    #[test]
    fn player_search_rejects_excessively_long_input() {
        let query = "a".repeat(MAX_PLAYER_SEARCH_CHARS + 1);
        let error = player_search_term(Some(&query)).unwrap_err();

        assert_eq!(
            error.to_string(),
            format!("bad request: query must be at most {MAX_PLAYER_SEARCH_CHARS} characters")
        );
    }
}
