mod gathering;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    error::AppError,
    media::{MediaStorage, validate_gathering_cover_key},
};

pub use gathering::{
    CreateGathering, Gathering, GatheringJoinPolicy, GatheringParticipant,
    GatheringParticipantStatus, GatheringSearch,
};
use gathering::{GatheringVisibility, StoredGathering};

const GATHERING_COLUMNS: &str = r#"
    g.id, g.host_id, g.kind, g.visibility, g.join_policy, g.title,
    g.starts_at, g.ends_at, g.venue, g.city, g.description, g.capacity,
    g.cost_per_person_cents, g.currency, g.skill_level, g.play_format,
    g.court_count, g.social_tags, g.theme, g.cover_image_key, g.created_at,
    g.updated_at
"#;

const MAX_TITLE_CHARS: usize = 120;
const MAX_VENUE_CHARS: usize = 200;
const MAX_CITY_CHARS: usize = 100;
const MAX_DESCRIPTION_CHARS: usize = 5_000;
const MAX_THEME_CHARS: usize = 40;
const MAX_CAPACITY: i32 = 1_000;
const MAX_COST_CENTS: i32 = 100_000_000;
const MAX_COURT_COUNT: i32 = 50;
const MAX_SOCIAL_TAGS: usize = 5;

pub async fn create_gathering(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    host_id: Uuid,
    mut payload: CreateGathering,
) -> Result<Gathering, AppError> {
    normalize_gathering(&mut payload);
    validate_gathering(host_id, &payload)?;

    let mut transaction = pool.begin().await?;
    let stored = sqlx::query_as::<_, StoredGathering>(
        r#"
        INSERT INTO gatherings (
            host_id, kind, visibility, join_policy, title, starts_at, ends_at,
            venue, city, description, capacity, cost_per_person_cents, currency,
            skill_level, play_format, court_count, social_tags, theme, cover_image_key
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19
        )
        RETURNING id, host_id, kind, visibility, join_policy, title, starts_at,
            ends_at, venue, city, description, capacity, cost_per_person_cents,
            currency, skill_level, play_format, court_count, social_tags, theme,
            cover_image_key, created_at, updated_at
        "#,
    )
    .bind(host_id)
    .bind(payload.kind)
    .bind(payload.visibility)
    .bind(payload.join_policy)
    .bind(payload.title)
    .bind(payload.starts_at)
    .bind(payload.ends_at)
    .bind(payload.venue)
    .bind(payload.city)
    .bind(payload.description)
    .bind(payload.capacity)
    .bind(payload.cost_per_person_cents)
    .bind(payload.currency)
    .bind(payload.skill_level)
    .bind(payload.play_format)
    .bind(payload.court_count)
    .bind(payload.social_tags)
    .bind(payload.theme)
    .bind(payload.cover_image_key)
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO gathering_participants (gathering_id, user_id, status)
        VALUES ($1, $2, 'going')
        "#,
    )
    .bind(stored.id)
    .bind(host_id)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    hydrate_gathering(media, stored).await
}

pub async fn find_gatherings(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    search: GatheringSearch,
) -> Result<Vec<Gathering>, AppError> {
    let limit = gathering_limit(search.limit)?;
    validate_search_window(search.starts_after, search.starts_before)?;

    let mut query = QueryBuilder::<Postgres>::new(format!(
        "SELECT {GATHERING_COLUMNS} FROM gatherings AS g WHERE (g.visibility = 'public'"
    ));
    query
        .push(" OR g.host_id = ")
        .push_bind(user_id)
        .push(
            r#" OR EXISTS (
                SELECT 1 FROM gathering_participants AS participant
                WHERE participant.gathering_id = g.id
                    AND participant.user_id = "#,
        )
        .push_bind(user_id)
        .push(" AND participant.status IN ('going', 'invited')))");

    if let Some(city) = normalized_search_city(search.city)? {
        query
            .push(" AND g.city ILIKE ")
            .push_bind(format!("%{}%", escape_like(&city)))
            .push(" ESCAPE '\\'");
    }
    if let Some(kind) = search.kind {
        query.push(" AND g.kind = ").push_bind(kind);
    }
    if let Some(starts_after) = search.starts_after {
        query.push(" AND g.starts_at >= ").push_bind(starts_after);
    }
    if let Some(starts_before) = search.starts_before {
        query.push(" AND g.starts_at < ").push_bind(starts_before);
    }

    query
        .push(" ORDER BY g.starts_at ASC, g.id ASC LIMIT ")
        .push_bind(limit);

    let stored = query
        .build_query_as::<StoredGathering>()
        .fetch_all(pool)
        .await?;
    hydrate_gatherings(media, stored).await
}

pub async fn get_gathering(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    gathering_id: Uuid,
    user_id: Uuid,
) -> Result<Gathering, AppError> {
    let stored = sqlx::query_as::<_, StoredGathering>(&format!(
        r#"
        SELECT {GATHERING_COLUMNS}
        FROM gatherings AS g
        WHERE g.id = $1
            AND (
                g.visibility = 'public'
                OR g.host_id = $2
                OR EXISTS (
                    SELECT 1 FROM gathering_participants AS participant
                    WHERE participant.gathering_id = g.id
                        AND participant.user_id = $2
                        AND participant.status IN ('going', 'invited')
                )
            )
        "#
    ))
    .bind(gathering_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;

    hydrate_gathering(media, stored).await
}

pub async fn join_gathering(
    pool: &Pool<Postgres>,
    gathering_id: Uuid,
    user_id: Uuid,
) -> Result<GatheringParticipant, AppError> {
    let mut transaction = pool.begin().await?;
    let (join_policy, capacity, visibility) =
        sqlx::query_as::<_, (GatheringJoinPolicy, Option<i32>, GatheringVisibility)>(
            r#"
        SELECT join_policy, capacity, visibility
        FROM gatherings
        WHERE id = $1
        FOR UPDATE
        "#,
        )
        .bind(gathering_id)
        .fetch_one(&mut *transaction)
        .await?;

    let existing = sqlx::query_as::<_, GatheringParticipant>(
        r#"
        SELECT gathering_id, user_id, status, joined_at
        FROM gathering_participants
        WHERE gathering_id = $1 AND user_id = $2
        "#,
    )
    .bind(gathering_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?;

    let status = next_join_status(
        visibility,
        join_policy,
        existing.as_ref().map(|participant| participant.status),
    )?;

    if status == GatheringParticipantStatus::Going
        && let Some(capacity) = capacity
    {
        let going = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT count(*)
            FROM gathering_participants
            WHERE gathering_id = $1 AND status = 'going'
            "#,
        )
        .bind(gathering_id)
        .fetch_one(&mut *transaction)
        .await?;

        if going >= i64::from(capacity) {
            return Err(AppError::BadRequest("gathering is full".to_owned()));
        }
    }

    let participant = if existing.is_some() {
        sqlx::query_as::<_, GatheringParticipant>(
            r#"
            UPDATE gathering_participants
            SET status = $3, joined_at = now()
            WHERE gathering_id = $1 AND user_id = $2
            RETURNING gathering_id, user_id, status, joined_at
            "#,
        )
        .bind(gathering_id)
        .bind(user_id)
        .bind(status)
        .fetch_one(&mut *transaction)
        .await?
    } else {
        sqlx::query_as::<_, GatheringParticipant>(
            r#"
            INSERT INTO gathering_participants (gathering_id, user_id, status)
            VALUES ($1, $2, $3)
            RETURNING gathering_id, user_id, status, joined_at
            "#,
        )
        .bind(gathering_id)
        .bind(user_id)
        .bind(status)
        .fetch_one(&mut *transaction)
        .await?
    };

    transaction.commit().await?;
    Ok(participant)
}

fn next_join_status(
    visibility: GatheringVisibility,
    join_policy: GatheringJoinPolicy,
    existing_status: Option<GatheringParticipantStatus>,
) -> Result<GatheringParticipantStatus, AppError> {
    if let Some(existing_status) = existing_status {
        return match existing_status {
            GatheringParticipantStatus::Invited => Ok(GatheringParticipantStatus::Going),
            GatheringParticipantStatus::Going | GatheringParticipantStatus::Pending => Err(
                AppError::BadRequest("gathering is already joined or awaiting approval".to_owned()),
            ),
        };
    }

    if visibility == GatheringVisibility::Private {
        return Err(AppError::BadRequest(
            "private gathering requires an invitation".to_owned(),
        ));
    }

    match join_policy {
        GatheringJoinPolicy::Open => Ok(GatheringParticipantStatus::Going),
        GatheringJoinPolicy::ApprovalRequired => Ok(GatheringParticipantStatus::Pending),
        GatheringJoinPolicy::InviteOnly => Err(AppError::BadRequest(
            "gathering requires an invitation".to_owned(),
        )),
        GatheringJoinPolicy::MembersOnly => Err(AppError::BadRequest(
            "members-only gatherings require group membership".to_owned(),
        )),
    }
}

async fn hydrate_gatherings(
    media: &MediaStorage,
    stored: Vec<StoredGathering>,
) -> Result<Vec<Gathering>, AppError> {
    let mut gatherings = Vec::with_capacity(stored.len());
    for gathering in stored {
        gatherings.push(hydrate_gathering(media, gathering).await?);
    }
    Ok(gatherings)
}

async fn hydrate_gathering(
    media: &MediaStorage,
    stored: StoredGathering,
) -> Result<Gathering, AppError> {
    let cover_image_url = if let Some(object_key) = &stored.cover_image_key {
        media
            .read_urls(std::slice::from_ref(object_key))
            .await?
            .into_iter()
            .next()
    } else {
        None
    };

    Ok(Gathering {
        id: stored.id,
        host_id: stored.host_id,
        kind: stored.kind,
        visibility: stored.visibility,
        join_policy: stored.join_policy,
        title: stored.title,
        starts_at: stored.starts_at,
        ends_at: stored.ends_at,
        venue: stored.venue,
        city: stored.city,
        description: stored.description,
        capacity: stored.capacity,
        cost_per_person_cents: stored.cost_per_person_cents,
        currency: stored.currency,
        skill_level: stored.skill_level,
        play_format: stored.play_format,
        court_count: stored.court_count,
        social_tags: stored.social_tags,
        theme: stored.theme,
        cover_image_key: stored.cover_image_key,
        cover_image_url,
        created_at: stored.created_at,
        updated_at: stored.updated_at,
    })
}

fn normalize_gathering(payload: &mut CreateGathering) {
    payload.title = payload.title.trim().to_owned();
    payload.venue = payload.venue.trim().to_owned();
    payload.city = payload.city.trim().to_owned();
    payload.currency = payload.currency.trim().to_ascii_uppercase();
    payload.description = normalized_optional_text(payload.description.take());
    payload.skill_level = normalized_optional_text(payload.skill_level.take())
        .map(|skill_level| skill_level.to_ascii_lowercase());
    payload.theme = normalized_optional_text(payload.theme.take());
}

fn normalized_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_owned())
    })
}

fn validate_gathering(host_id: Uuid, payload: &CreateGathering) -> Result<(), AppError> {
    validate_required_text("title", &payload.title, MAX_TITLE_CHARS)?;
    validate_required_text("venue", &payload.venue, MAX_VENUE_CHARS)?;
    validate_required_text("city", &payload.city, MAX_CITY_CHARS)?;

    if let Some(ends_at) = payload.ends_at
        && ends_at <= payload.starts_at
    {
        return Err(AppError::BadRequest(
            "ends_at must be after starts_at".to_owned(),
        ));
    }
    if payload
        .description
        .as_ref()
        .is_some_and(|value| value.chars().count() > MAX_DESCRIPTION_CHARS)
    {
        return Err(AppError::BadRequest(format!(
            "description must be at most {MAX_DESCRIPTION_CHARS} characters"
        )));
    }
    if !matches!(payload.capacity, None | Some(1..=MAX_CAPACITY)) {
        return Err(AppError::BadRequest(format!(
            "capacity must be between 1 and {MAX_CAPACITY}"
        )));
    }
    if !(0..=MAX_COST_CENTS).contains(&payload.cost_per_person_cents) {
        return Err(AppError::BadRequest(format!(
            "cost_per_person_cents must be between 0 and {MAX_COST_CENTS}"
        )));
    }
    if payload.currency.len() != 3
        || !payload
            .currency
            .bytes()
            .all(|character| character.is_ascii_uppercase())
    {
        return Err(AppError::BadRequest(
            "currency must be a three-letter ISO currency code".to_owned(),
        ));
    }
    if let Some(skill_level) = &payload.skill_level
        && !matches!(
            skill_level.as_str(),
            "beginner" | "intermediate" | "advanced" | "competitive"
        )
    {
        return Err(AppError::BadRequest(
            "skill_level must be beginner, intermediate, advanced, or competitive".to_owned(),
        ));
    }
    if !matches!(payload.court_count, None | Some(1..=MAX_COURT_COUNT)) {
        return Err(AppError::BadRequest(format!(
            "court_count must be between 1 and {MAX_COURT_COUNT}"
        )));
    }
    if payload.social_tags.len() > MAX_SOCIAL_TAGS {
        return Err(AppError::BadRequest(format!(
            "social_tags supports at most {MAX_SOCIAL_TAGS} values"
        )));
    }
    for (index, tag) in payload.social_tags.iter().enumerate() {
        if payload.social_tags[..index].contains(tag) {
            return Err(AppError::BadRequest(
                "social_tags cannot contain duplicates".to_owned(),
            ));
        }
    }
    if payload
        .theme
        .as_ref()
        .is_some_and(|theme| theme.chars().count() > MAX_THEME_CHARS)
    {
        return Err(AppError::BadRequest(format!(
            "theme must be at most {MAX_THEME_CHARS} characters"
        )));
    }
    if let Some(object_key) = &payload.cover_image_key {
        validate_gathering_cover_key(host_id, object_key)?;
    }

    Ok(())
}

fn validate_required_text(field: &str, value: &str, max_chars: usize) -> Result<(), AppError> {
    let chars = value.chars().count();
    if chars == 0 {
        return Err(AppError::BadRequest(format!("{field} is required")));
    }
    if chars > max_chars {
        return Err(AppError::BadRequest(format!(
            "{field} must be at most {max_chars} characters"
        )));
    }
    Ok(())
}

fn gathering_limit(limit: Option<i64>) -> Result<i64, AppError> {
    let limit = limit.unwrap_or(25);
    if !(1..=100).contains(&limit) {
        return Err(AppError::BadRequest(
            "gathering limit must be between 1 and 100".to_owned(),
        ));
    }
    Ok(limit)
}

fn validate_search_window(
    starts_after: Option<time::OffsetDateTime>,
    starts_before: Option<time::OffsetDateTime>,
) -> Result<(), AppError> {
    if let (Some(starts_after), Some(starts_before)) = (starts_after, starts_before)
        && starts_before <= starts_after
    {
        return Err(AppError::BadRequest(
            "starts_before must be after starts_after".to_owned(),
        ));
    }
    Ok(())
}

fn normalized_search_city(city: Option<String>) -> Result<Option<String>, AppError> {
    let city = normalized_optional_text(city);
    if city
        .as_ref()
        .is_some_and(|city| city.chars().count() > MAX_CITY_CHARS)
    {
        return Err(AppError::BadRequest(format!(
            "city must be at most {MAX_CITY_CHARS} characters"
        )));
    }
    Ok(city)
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::gathering::{
        CreateGathering, GatheringJoinPolicy, GatheringKind, GatheringParticipantStatus,
        GatheringVisibility, PlayFormat, SocialTag,
    };
    use super::{
        MAX_DESCRIPTION_CHARS, gathering_limit, next_join_status, normalize_gathering,
        normalized_search_city, validate_gathering, validate_search_window,
    };
    use time::{Duration, OffsetDateTime};
    use uuid::Uuid;

    fn valid_payload() -> CreateGathering {
        let starts_at = OffsetDateTime::from_unix_timestamp(1_800_000_000).unwrap();
        CreateGathering {
            kind: GatheringKind::PlayAndSocial,
            visibility: GatheringVisibility::Public,
            join_policy: GatheringJoinPolicy::ApprovalRequired,
            title: " Friday birdies & board games ".to_owned(),
            starts_at,
            ends_at: Some(starts_at + Duration::hours(3)),
            venue: " East Bay Badminton ".to_owned(),
            city: " Emeryville ".to_owned(),
            description: Some(" Courts first, snacks after. ".to_owned()),
            capacity: Some(24),
            cost_per_person_cents: 1_500,
            currency: " usd ".to_owned(),
            skill_level: Some(" Intermediate ".to_owned()),
            play_format: Some(PlayFormat::OpenPlay),
            court_count: Some(4),
            social_tags: vec![SocialTag::Food, SocialTag::BoardGames],
            theme: Some(" court-glow ".to_owned()),
            cover_image_key: None,
        }
    }

    #[test]
    fn gathering_input_is_normalized_and_validated() {
        let mut payload = valid_payload();
        normalize_gathering(&mut payload);

        assert_eq!(payload.title, "Friday birdies & board games");
        assert_eq!(payload.currency, "USD");
        assert_eq!(payload.skill_level.as_deref(), Some("intermediate"));
        assert_eq!(payload.theme.as_deref(), Some("court-glow"));
        assert!(validate_gathering(Uuid::new_v4(), &payload).is_ok());
    }

    #[test]
    fn gathering_rejects_invalid_time_capacity_cost_and_description() {
        let host_id = Uuid::new_v4();

        let mut payload = valid_payload();
        normalize_gathering(&mut payload);
        payload.ends_at = Some(payload.starts_at);
        assert!(validate_gathering(host_id, &payload).is_err());

        let mut payload = valid_payload();
        normalize_gathering(&mut payload);
        payload.capacity = Some(0);
        assert!(validate_gathering(host_id, &payload).is_err());

        let mut payload = valid_payload();
        normalize_gathering(&mut payload);
        payload.cost_per_person_cents = -1;
        assert!(validate_gathering(host_id, &payload).is_err());

        let mut payload = valid_payload();
        normalize_gathering(&mut payload);
        payload.description = Some("x".repeat(MAX_DESCRIPTION_CHARS + 1));
        assert!(validate_gathering(host_id, &payload).is_err());
    }

    #[test]
    fn gathering_search_bounds_limits_windows_and_city_length() {
        let now = OffsetDateTime::from_unix_timestamp(1_800_000_000).unwrap();
        assert_eq!(gathering_limit(None).unwrap(), 25);
        assert!(gathering_limit(Some(0)).is_err());
        assert!(gathering_limit(Some(101)).is_err());
        assert!(validate_search_window(Some(now), Some(now + Duration::hours(1))).is_ok());
        assert!(validate_search_window(Some(now), Some(now)).is_err());
        assert_eq!(
            normalized_search_city(Some(" Oakland ".to_owned())).unwrap(),
            Some("Oakland".to_owned())
        );
    }

    #[test]
    fn gathering_join_policy_protects_private_details_and_accepts_invites() {
        assert!(matches!(
            next_join_status(
                GatheringVisibility::Private,
                GatheringJoinPolicy::Open,
                None,
            ),
            Err(crate::error::AppError::BadRequest(_))
        ));
        assert_eq!(
            next_join_status(
                GatheringVisibility::Private,
                GatheringJoinPolicy::InviteOnly,
                Some(GatheringParticipantStatus::Invited),
            )
            .unwrap(),
            GatheringParticipantStatus::Going
        );
        assert_eq!(
            next_join_status(
                GatheringVisibility::Public,
                GatheringJoinPolicy::ApprovalRequired,
                None,
            )
            .unwrap(),
            GatheringParticipantStatus::Pending
        );
    }
}
