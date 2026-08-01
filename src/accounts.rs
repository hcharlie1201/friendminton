mod user;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    error::AppError,
    media::{MediaStorage, validate_avatar_key},
};

pub use user::{Player, PlayerSearch, UpdateProfile, User};

const MAX_PLAYER_SEARCH_CHARS: usize = 80;

#[derive(sqlx::FromRow)]
struct StoredPlayer {
    id: Uuid,
    display_name: String,
    city: Option<String>,
    skill_level: String,
    bio: Option<String>,
    avatar_key: Option<String>,
}

pub async fn get_player(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    viewer_id: Uuid,
    id: Uuid,
) -> Result<Player, AppError> {
    let player = sqlx::query_as::<_, StoredPlayer>(
        r#"
        SELECT id, display_name, city, skill_level, bio, avatar_key
        FROM users AS candidate
        WHERE id = $1 AND NOT EXISTS (
            SELECT 1 FROM user_blocks
            WHERE (blocker_id = $2 AND blocked_id = candidate.id)
               OR (blocker_id = candidate.id AND blocked_id = $2)
        )
        "#,
    )
    .bind(id)
    .bind(viewer_id)
    .fetch_one(pool)
    .await?;
    hydrate_player(media, player).await
}

pub async fn get_user(pool: &Pool<Postgres>, id: Uuid) -> Result<User, AppError> {
    let user = sqlx::query_as::<_, User>(
        r#"
        SELECT id, email, display_name, city, skill_level, bio, avatar_key, is_admin, created_at, updated_at
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
        SELECT id, email, display_name, city, skill_level, bio, avatar_key, is_admin, created_at, updated_at
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
        RETURNING id, email, display_name, city, skill_level, bio, avatar_key, is_admin, created_at, updated_at
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
    media: &MediaStorage,
    viewer_id: Uuid,
    search: PlayerSearch,
) -> Result<Vec<Player>, AppError> {
    let limit = search.limit.unwrap_or(25).clamp(1, 100);
    let search_term = player_search_term(search.query.as_deref())?;
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT id, display_name, city, skill_level, bio, avatar_key FROM users AS candidate",
    );

    let mut has_filter = false;

    push_filter(&mut query, &mut has_filter);
    query
        .push("NOT EXISTS (SELECT 1 FROM user_blocks WHERE (blocker_id = ")
        .push_bind(viewer_id)
        .push(" AND blocked_id = candidate.id) OR (blocker_id = candidate.id AND blocked_id = ")
        .push_bind(viewer_id)
        .push("))");

    if let Some(city) = search.city {
        push_filter(&mut query, &mut has_filter);
        query
            .push("candidate.city ILIKE ")
            .push_bind(format!("%{city}%"));
    }

    if let Some(skill_level) = search.skill_level {
        push_filter(&mut query, &mut has_filter);
        query
            .push("candidate.skill_level = ")
            .push_bind(skill_level);
    }

    if let Some(search_term) = &search_term {
        push_filter(&mut query, &mut has_filter);
        query
            .push("(candidate.display_name || ' ' || COALESCE(candidate.bio, '')) ILIKE ")
            .push_bind(player_search_pattern(search_term))
            .push(" ESCAPE '\\'");
    }

    if let Some(search_term) = search_term {
        query
            .push(" ORDER BY similarity(candidate.display_name, ")
            .push_bind(search_term)
            .push(") DESC, candidate.created_at DESC");
    } else {
        query.push(" ORDER BY candidate.created_at DESC");
    }
    query.push(" LIMIT ").push_bind(limit);

    let users = query
        .build_query_as::<StoredPlayer>()
        .fetch_all(pool)
        .await?;
    let mut players = Vec::with_capacity(users.len());
    for player in users {
        players.push(hydrate_player(media, player).await?);
    }
    Ok(players)
}

pub async fn update_profile(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    payload: UpdateProfile,
) -> Result<Player, AppError> {
    let display_name = required_text("display name", payload.display_name, 60)?;
    let city = optional_text("city", payload.city, 100)?;
    let bio = optional_text("bio", payload.bio, 500)?;
    if !matches!(
        payload.skill_level.as_str(),
        "beginner" | "intermediate" | "advanced" | "competitive"
    ) {
        return Err(AppError::BadRequest("invalid skill level".to_owned()));
    }
    if let Some(key) = payload.avatar_key.as_deref() {
        validate_avatar_key(user_id, key)?;
    }
    let player = sqlx::query_as::<_, StoredPlayer>(
        r#"
        UPDATE users SET display_name = $2, city = $3, skill_level = $4, bio = $5,
            avatar_key = $6, updated_at = now()
        WHERE id = $1
        RETURNING id, display_name, city, skill_level, bio, avatar_key
    "#,
    )
    .bind(user_id)
    .bind(display_name)
    .bind(city)
    .bind(payload.skill_level)
    .bind(bio)
    .bind(payload.avatar_key)
    .fetch_one(pool)
    .await?;
    hydrate_player(media, player).await
}

pub async fn ensure_interaction_allowed(
    pool: &Pool<Postgres>,
    first: Uuid,
    second: Uuid,
) -> Result<(), AppError> {
    let is_blocked = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(SELECT 1 FROM user_blocks
        WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1))
    "#,
    )
    .bind(first)
    .bind(second)
    .fetch_one(pool)
    .await?;
    if is_blocked {
        return Err(AppError::Forbidden(
            "this interaction is unavailable".to_owned(),
        ));
    }
    Ok(())
}

async fn hydrate_player(media: &MediaStorage, player: StoredPlayer) -> Result<Player, AppError> {
    let avatar_url = match &player.avatar_key {
        Some(key) => media
            .read_urls(std::slice::from_ref(key))
            .await?
            .into_iter()
            .next(),
        None => None,
    };
    Ok(Player {
        id: player.id,
        display_name: player.display_name,
        city: player.city,
        skill_level: player.skill_level,
        bio: player.bio,
        avatar_key: player.avatar_key,
        avatar_url,
    })
}

fn required_text(field: &str, value: String, max: usize) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > max {
        return Err(AppError::BadRequest(format!(
            "{field} must be between 1 and {max} characters"
        )));
    }
    Ok(value.to_owned())
}

fn optional_text(
    field: &str,
    value: Option<String>,
    max: usize,
) -> Result<Option<String>, AppError> {
    let Some(value) = value else { return Ok(None) };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.chars().count() > max {
        return Err(AppError::BadRequest(format!(
            "{field} must be at most {max} characters"
        )));
    }
    Ok(Some(value.to_owned()))
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
