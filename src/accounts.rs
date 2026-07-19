mod user;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::error::AppError;

pub use user::{CreateUser, Player, PlayerSearch, User};

const MAX_PLAYER_SEARCH_CHARS: usize = 80;

pub async fn create_user(pool: &Pool<Postgres>, payload: CreateUser) -> Result<User, AppError> {
    validate_user(&payload)?;

    let user = sqlx::query_as::<_, User>(
        r#"
        INSERT INTO users (email, display_name, city, skill_level, bio)
        VALUES ($1, $2, $3, COALESCE($4, 'beginner'), $5)
        ON CONFLICT (email) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            city = EXCLUDED.city,
            skill_level = EXCLUDED.skill_level,
            bio = EXCLUDED.bio,
            updated_at = now()
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

#[cfg(test)]
mod tests {
    use super::{MAX_PLAYER_SEARCH_CHARS, player_search_pattern, player_search_term};

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
