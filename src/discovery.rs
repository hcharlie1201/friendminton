use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Pool, Postgres};
use uuid::Uuid;

use crate::{
    accounts::{self, Player},
    courts::{self, Court},
    error::AppError,
    gatherings::{self, Gathering},
    groups::{self, BadmintonGroup},
    media::MediaStorage,
};

const DEFAULT_LIMIT: i64 = 20;
const MAX_LIMIT: i64 = 50;
const MAX_QUERY_CHARS: usize = 100;
const DEFAULT_RADIUS_KM: f64 = 40.0;
const MAX_RADIUS_KM: f64 = 100.0;

#[derive(Debug, Clone, Copy, Default, Deserialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryCategory {
    #[default]
    All,
    Games,
    Courts,
    Groups,
    Players,
}

impl DiscoveryCategory {
    fn as_str(self) -> &'static str {
        match self {
            Self::All => "all",
            Self::Games => "games",
            Self::Courts => "courts",
            Self::Groups => "groups",
            Self::Players => "players",
        }
    }
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct DiscoverySearch {
    #[serde(default)]
    pub category: DiscoveryCategory,
    pub query: Option<String>,
    pub city: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub radius_km: Option<f64>,
    pub skill_level: Option<String>,
    pub cursor: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(tag = "category", content = "item", rename_all = "snake_case")]
pub enum DiscoveryResult {
    Games(Gathering),
    Courts(Court),
    Groups(BadmintonGroup),
    Players(Player),
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct DiscoveryPage {
    pub items: Vec<DiscoveryResult>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DiscoveryCursor {
    match_rank: i32,
    sort_key: i64,
    category: String,
    id: Uuid,
}

#[derive(Debug, FromRow)]
struct Candidate {
    category: String,
    entity_id: Uuid,
    match_rank: i32,
    sort_key: i64,
}

struct ValidatedSearch {
    category: DiscoveryCategory,
    term: Option<String>,
    city_pattern: Option<String>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    radius_meters: f64,
    skill_level: Option<String>,
    cursor: Option<DiscoveryCursor>,
    limit: i64,
}

pub async fn search(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    search: DiscoverySearch,
) -> Result<DiscoveryPage, AppError> {
    let search = validate_search(search)?;
    let pattern = search.term.as_ref().map(|term| like_pattern(term));
    let prefix = search.term.as_ref().map(|term| {
        let escaped = escape_like(term);
        format!("{escaped}%")
    });
    let exact = search.term.clone();
    let requested_limit = search.limit + 1;
    let cursor_rank = search.cursor.as_ref().map(|cursor| cursor.match_rank);
    let cursor_sort_key = search.cursor.as_ref().map(|cursor| cursor.sort_key);
    let cursor_category = search.cursor.as_ref().map(|cursor| cursor.category.clone());
    let cursor_id = search.cursor.as_ref().map(|cursor| cursor.id);

    let mut candidates = sqlx::query_as::<_, Candidate>(
        r#"
        WITH candidates AS (
            SELECT
                'games'::TEXT AS category,
                g.id AS entity_id,
                g.title AS name,
                concat_ws(' ', g.title, g.venue, g.city, g.description) AS haystack,
                (-extract(epoch FROM g.starts_at))::BIGINT AS sort_key
            FROM gatherings AS g
            WHERE $7 IN ('all', 'games')
                AND g.cancelled_at IS NULL
                AND NOT EXISTS (
                    SELECT 1 FROM user_blocks
                    WHERE (blocker_id = $1 AND blocked_id = g.host_id)
                       OR (blocker_id = g.host_id AND blocked_id = $1)
                )
                AND (
                    g.visibility = 'public'
                    OR g.host_id = $1
                    OR EXISTS (
                        SELECT 1
                        FROM gathering_participants AS participant
                        WHERE participant.gathering_id = g.id
                            AND participant.user_id = $1
                            AND participant.status IN ('going', 'invited')
                    )
                )
                AND (g.starts_at >= now() OR g.ends_at > now())
                AND (
                    (
                        $4::DOUBLE PRECISION IS NOT NULL
                        AND g.location IS NOT NULL
                        AND ST_DWithin(
                            g.location,
                            ST_SetSRID(ST_MakePoint($5, $4), 4326)::GEOGRAPHY,
                            $6
                        )
                    )
                    OR (
                        $4::DOUBLE PRECISION IS NULL
                        AND ($3::TEXT IS NULL OR g.city ILIKE $3 ESCAPE '\')
                    )
                )
                AND (
                    $15::TEXT IS NULL
                    OR g.skill_level IS NULL
                    OR ($15 = 'beginner' AND g.skill_level::TEXT IN ('beginner', 'e'))
                    OR ($15 = 'intermediate' AND g.skill_level::TEXT IN ('e_plus', 'd'))
                    OR ($15 = 'advanced' AND g.skill_level::TEXT IN ('c', 'b'))
                    OR ($15 = 'competitive' AND g.skill_level::TEXT = 'a')
                )

            UNION ALL

            SELECT
                'courts'::TEXT,
                c.id,
                c.name,
                concat_ws(' ', c.name, c.address, c.city),
                extract(epoch FROM COALESCE(c.verified_at, c.created_at))::BIGINT
            FROM courts AS c
            WHERE $7 IN ('all', 'courts')
                AND (
                    (
                        $4::DOUBLE PRECISION IS NOT NULL
                        AND c.location IS NOT NULL
                        AND ST_DWithin(
                            c.location,
                            ST_SetSRID(ST_MakePoint($5, $4), 4326)::GEOGRAPHY,
                            $6
                        )
                    )
                    OR (
                        $4::DOUBLE PRECISION IS NULL
                        AND ($3::TEXT IS NULL OR c.city ILIKE $3 ESCAPE '\')
                    )
                )

            UNION ALL

            SELECT
                'groups'::TEXT,
                bg.id,
                bg.name,
                concat_ws(' ', bg.name, bg.description, bg.city, bg.location_label),
                extract(epoch FROM bg.created_at)::BIGINT
            FROM badminton_groups AS bg
            WHERE $7 IN ('all', 'groups')
                AND (
                    bg.visibility = 'public'
                    OR EXISTS (
                        SELECT 1
                        FROM badminton_group_members AS membership
                        WHERE membership.group_id = bg.id
                            AND membership.user_id = $1
                            AND membership.status IN ('member', 'invited')
                    )
                )
                AND (
                    (
                        $4::DOUBLE PRECISION IS NOT NULL
                        AND bg.location IS NOT NULL
                        AND ST_DWithin(
                            bg.location,
                            ST_SetSRID(ST_MakePoint($5, $4), 4326)::GEOGRAPHY,
                            $6
                        )
                    )
                    OR (
                        $4::DOUBLE PRECISION IS NULL
                        AND ($3::TEXT IS NULL OR bg.city ILIKE $3 ESCAPE '\')
                    )
                )

            UNION ALL

            SELECT
                'players'::TEXT,
                u.id,
                u.display_name,
                concat_ws(' ', u.display_name, u.bio, u.city),
                extract(epoch FROM u.created_at)::BIGINT
            FROM users AS u
            WHERE $7 IN ('all', 'players')
                AND NOT EXISTS (
                    SELECT 1 FROM user_blocks
                    WHERE (blocker_id = $1 AND blocked_id = u.id)
                       OR (blocker_id = u.id AND blocked_id = $1)
                )
                -- Explicit player text search is global. Location and skill
                -- remain browse filters, but must not hide a known person.
                AND ($2::TEXT IS NOT NULL OR $3::TEXT IS NULL OR u.city ILIKE $3 ESCAPE '\')
                AND ($2::TEXT IS NOT NULL OR $15::TEXT IS NULL OR u.skill_level = $15)
        ),
        ranked AS (
            SELECT
                category,
                entity_id,
                sort_key,
                CASE
                    WHEN $2::TEXT IS NULL THEN 0
                    WHEN lower(name) = lower($8) THEN 3
                    WHEN name ILIKE $9 ESCAPE '\' THEN 2
                    ELSE 1
                END AS match_rank
            FROM candidates
            WHERE $2::TEXT IS NULL OR haystack ILIKE $2 ESCAPE '\'
        )
        SELECT category, entity_id, match_rank, sort_key
        FROM ranked
        WHERE
            $10::INTEGER IS NULL
            OR match_rank < $10
            OR (match_rank = $10 AND sort_key < $11)
            OR (match_rank = $10 AND sort_key = $11 AND category > $12)
            OR (
                match_rank = $10
                AND sort_key = $11
                AND category = $12
                AND entity_id > $13
            )
        ORDER BY match_rank DESC, sort_key DESC, category ASC, entity_id ASC
        LIMIT $14
        "#,
    )
    .bind(user_id)
    .bind(pattern)
    .bind(search.city_pattern)
    .bind(search.latitude)
    .bind(search.longitude)
    .bind(search.radius_meters)
    .bind(search.category.as_str())
    .bind(exact)
    .bind(prefix)
    .bind(cursor_rank)
    .bind(cursor_sort_key)
    .bind(cursor_category)
    .bind(cursor_id)
    .bind(requested_limit)
    .bind(search.skill_level)
    .fetch_all(pool)
    .await?;

    let has_more = candidates.len() > search.limit as usize;
    if has_more {
        candidates.pop();
    }
    let next_cursor = has_more
        .then(|| candidates.last().map(encode_cursor))
        .flatten()
        .transpose()?;

    let mut items = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        items.push(hydrate_candidate(pool, media, user_id, candidate).await?);
    }

    Ok(DiscoveryPage { items, next_cursor })
}

async fn hydrate_candidate(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    candidate: Candidate,
) -> Result<DiscoveryResult, AppError> {
    match candidate.category.as_str() {
        "games" => Ok(DiscoveryResult::Games(
            gatherings::get_gathering(pool, media, candidate.entity_id, user_id).await?,
        )),
        "courts" => Ok(DiscoveryResult::Courts(
            courts::get_court(pool, candidate.entity_id).await?,
        )),
        "groups" => Ok(DiscoveryResult::Groups(
            groups::get_group(pool, media, candidate.entity_id, user_id).await?,
        )),
        "players" => Ok(DiscoveryResult::Players(
            accounts::get_player(pool, media, user_id, candidate.entity_id).await?,
        )),
        category => Err(AppError::BadRequest(format!(
            "unsupported discovery category {category}"
        ))),
    }
}

fn validate_search(search: DiscoverySearch) -> Result<ValidatedSearch, AppError> {
    let term = normalized_text("query", search.query)?;
    let city = normalized_text("city", search.city)?;
    let skill_level = normalized_text("skill_level", search.skill_level)?;
    let (latitude, longitude) = match (search.latitude, search.longitude) {
        (Some(latitude), Some(longitude))
            if latitude.is_finite()
                && longitude.is_finite()
                && (-90.0..=90.0).contains(&latitude)
                && (-180.0..=180.0).contains(&longitude) =>
        {
            (Some(latitude), Some(longitude))
        }
        (None, None) => (None, None),
        _ => {
            return Err(AppError::BadRequest(
                "latitude and longitude must be provided together and be valid".to_owned(),
            ));
        }
    };
    let radius_km = search.radius_km.unwrap_or(DEFAULT_RADIUS_KM);
    if !(0.5..=MAX_RADIUS_KM).contains(&radius_km) {
        return Err(AppError::BadRequest(format!(
            "radius_km must be between 0.5 and {MAX_RADIUS_KM}"
        )));
    }
    let limit = search.limit.unwrap_or(DEFAULT_LIMIT);
    if !(1..=MAX_LIMIT).contains(&limit) {
        return Err(AppError::BadRequest(format!(
            "limit must be between 1 and {MAX_LIMIT}"
        )));
    }

    Ok(ValidatedSearch {
        category: search.category,
        term,
        city_pattern: city.as_deref().map(like_pattern),
        latitude,
        longitude,
        radius_meters: radius_km * 1_000.0,
        skill_level,
        cursor: search.cursor.as_deref().map(decode_cursor).transpose()?,
        limit,
    })
}

fn normalized_text(field: &str, value: Option<String>) -> Result<Option<String>, AppError> {
    let value = value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    });
    if value
        .as_ref()
        .is_some_and(|value| value.chars().count() > MAX_QUERY_CHARS)
    {
        return Err(AppError::BadRequest(format!(
            "{field} must be at most {MAX_QUERY_CHARS} characters"
        )));
    }
    Ok(value)
}

fn like_pattern(value: &str) -> String {
    format!("%{}%", escape_like(value))
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn encode_cursor(candidate: &Candidate) -> Result<String, AppError> {
    let bytes = serde_json::to_vec(&DiscoveryCursor {
        match_rank: candidate.match_rank,
        sort_key: candidate.sort_key,
        category: candidate.category.clone(),
        id: candidate.entity_id,
    })
    .map_err(|error| AppError::BadRequest(format!("could not encode cursor: {error}")))?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}

fn decode_cursor(value: &str) -> Result<DiscoveryCursor, AppError> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| AppError::BadRequest("cursor is invalid".to_owned()))?;
    serde_json::from_slice(&bytes).map_err(|_| AppError::BadRequest("cursor is invalid".to_owned()))
}

#[cfg(test)]
mod tests {
    use super::{Candidate, decode_cursor, encode_cursor, like_pattern, normalized_text};
    use uuid::Uuid;

    #[test]
    fn cursor_round_trips_and_rejects_invalid_values() {
        let candidate = Candidate {
            category: "players".to_owned(),
            entity_id: Uuid::new_v4(),
            match_rank: 2,
            sort_key: 42,
        };
        let encoded = encode_cursor(&candidate).unwrap();
        let decoded = decode_cursor(&encoded).unwrap();
        assert_eq!(decoded.category, candidate.category);
        assert_eq!(decoded.id, candidate.entity_id);
        assert!(decode_cursor("not-base64!").is_err());
    }

    #[test]
    fn search_text_is_trimmed_and_escaped() {
        assert_eq!(
            normalized_text("query", Some("  rally_100%  ".to_owned())).unwrap(),
            Some("rally_100%".to_owned())
        );
        assert_eq!(like_pattern(r"rally_100%"), r"%rally\_100\%%");
    }
}
