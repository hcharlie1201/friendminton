mod group;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::{
    error::AppError,
    media::{MediaStorage, validate_group_cover_key},
};

use group::StoredBadmintonGroup;
pub use group::{
    BadmintonGroup, CreateBadmintonGroup, GroupMember, GroupMemberStatus, GroupMembership,
    GroupSearch, GroupViewerState, InviteGroupMember,
};
use group::{GroupJoinPolicy, GroupRole, GroupVisibility};

const GROUP_COLUMNS: &str = r#"
    g.id, g.owner_id, g.name, g.description, g.city, g.location_label,
    g.google_place_id, g.latitude, g.longitude, g.visibility,
    g.join_policy, g.primary_court_id, g.goal_tags, g.image_keys, g.cover_image_key,
    (SELECT count(*) FROM badminton_group_members AS member
        WHERE member.group_id = g.id AND member.status = 'member') AS member_count,
    g.created_at, g.updated_at
"#;
const MAX_GROUP_GOALS: usize = 5;

pub async fn create_group(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    owner_id: Uuid,
    mut payload: CreateBadmintonGroup,
) -> Result<BadmintonGroup, AppError> {
    normalize_group(&mut payload);
    validate_group(owner_id, &payload)?;
    let mut transaction = pool.begin().await?;
    let group_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO badminton_groups (
            owner_id, name, description, city, location_label, google_place_id,
            latitude, longitude, visibility, join_policy, primary_court_id,
            goal_tags, image_keys, cover_image_key
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id
        "#,
    )
    .bind(owner_id)
    .bind(payload.name)
    .bind(payload.description)
    .bind(payload.city)
    .bind(payload.location_label)
    .bind(payload.google_place_id)
    .bind(payload.latitude)
    .bind(payload.longitude)
    .bind(payload.visibility)
    .bind(payload.join_policy)
    .bind(payload.primary_court_id)
    .bind(payload.goal_tags)
    .bind(&payload.image_keys)
    .bind(payload.cover_image_key)
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query(
        "INSERT INTO badminton_group_members (group_id, user_id, role, status) VALUES ($1, $2, 'owner', 'member')",
    )
    .bind(group_id)
    .bind(owner_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    get_group(pool, media, group_id, owner_id).await
}

pub async fn find_groups(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
    search: GroupSearch,
) -> Result<Vec<BadmintonGroup>, AppError> {
    let limit = search.limit.unwrap_or(30).clamp(1, 100);
    let mut query = QueryBuilder::<Postgres>::new(format!(
        "SELECT {GROUP_COLUMNS} FROM badminton_groups AS g WHERE (g.visibility = 'public' OR EXISTS (SELECT 1 FROM badminton_group_members AS own_membership WHERE own_membership.group_id = g.id AND own_membership.user_id = "
    ));
    query
        .push_bind(user_id)
        .push(" AND own_membership.status IN ('member', 'invited')))");
    let has_coordinate_search = search.latitude.is_some() || search.longitude.is_some();
    let fallback_city = normalized_optional(search.city);
    if !has_coordinate_search && let Some(city) = &fallback_city {
        query
            .push(" AND g.city ILIKE ")
            .push_bind(format!("%{}%", escape_like(city)))
            .push(" ESCAPE '\\'");
    }
    if let Some(term) = normalized_optional(search.query) {
        if term.chars().count() > 100 {
            return Err(AppError::BadRequest(
                "query must be at most 100 characters".to_owned(),
            ));
        }
        query
            .push(" AND (g.name || ' ' || COALESCE(g.description, '')) ILIKE ")
            .push_bind(format!("%{}%", escape_like(&term)))
            .push(" ESCAPE '\\'");
    }
    push_coordinate_filters(
        &mut query,
        search.latitude,
        search.longitude,
        search.radius_km,
        fallback_city.as_deref(),
    )?;
    query
        .push(" ORDER BY member_count DESC, g.created_at DESC LIMIT ")
        .push_bind(limit);
    let groups = query
        .build_query_as::<StoredBadmintonGroup>()
        .fetch_all(pool)
        .await?;
    hydrate_groups(media, groups).await
}

pub async fn find_joined_groups(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    user_id: Uuid,
) -> Result<Vec<BadmintonGroup>, AppError> {
    let groups = sqlx::query_as::<_, StoredBadmintonGroup>(&format!(
        r#"
        SELECT {GROUP_COLUMNS}
        FROM badminton_groups AS g
        INNER JOIN badminton_group_members AS own_membership
            ON own_membership.group_id = g.id
        WHERE own_membership.user_id = $1
            AND own_membership.status = 'member'
        ORDER BY own_membership.joined_at DESC, g.created_at DESC
        LIMIT 100
        "#
    ))
    .bind(user_id)
    .fetch_all(pool)
    .await?;
    hydrate_groups(media, groups).await
}

pub async fn get_group(
    pool: &Pool<Postgres>,
    media: &MediaStorage,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<BadmintonGroup, AppError> {
    let group = sqlx::query_as::<_, StoredBadmintonGroup>(&format!(
        r#"
        SELECT {GROUP_COLUMNS}
        FROM badminton_groups AS g
        WHERE g.id = $1 AND (
            g.visibility = 'public' OR EXISTS (
                SELECT 1 FROM badminton_group_members AS membership
                WHERE membership.group_id = g.id AND membership.user_id = $2
                    AND membership.status IN ('member', 'invited')
            )
        )
        "#
    ))
    .bind(group_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    hydrate_group(media, group).await
}

pub async fn join_group(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<GroupMembership, AppError> {
    let mut transaction = pool.begin().await?;
    let (visibility, join_policy) = sqlx::query_as::<_, (GroupVisibility, GroupJoinPolicy)>(
        "SELECT visibility, join_policy FROM badminton_groups WHERE id = $1 FOR UPDATE",
    )
    .bind(group_id)
    .fetch_one(&mut *transaction)
    .await?;
    let existing = sqlx::query_as::<_, GroupMembership>(
        "SELECT group_id, user_id, role, status, joined_at FROM badminton_group_members WHERE group_id = $1 AND user_id = $2",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?;
    let status = next_status(
        visibility,
        join_policy,
        existing.as_ref().map(|membership| membership.status),
    )?;
    let membership = sqlx::query_as::<_, GroupMembership>(
        r#"
        INSERT INTO badminton_group_members (group_id, user_id, role, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (group_id, user_id) DO UPDATE
        SET status = EXCLUDED.status, joined_at = now()
        RETURNING group_id, user_id, role, status, joined_at
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .bind(GroupRole::Member)
    .bind(status)
    .fetch_one(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(membership)
}

pub async fn group_viewer_state(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<GroupViewerState, AppError> {
    get_visible_group_row(pool, group_id, user_id).await?;
    let membership = sqlx::query_as::<_, (GroupRole, GroupMemberStatus)>(
        "SELECT role, status FROM badminton_group_members WHERE group_id = $1 AND user_id = $2",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    Ok(GroupViewerState {
        role: membership.map(|value| value.0),
        membership_status: membership.map(|value| value.1),
        can_manage: membership.is_some_and(|(role, status)| {
            status == GroupMemberStatus::Member
                && matches!(role, GroupRole::Owner | GroupRole::Admin)
        }),
    })
}

pub async fn group_members(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<Vec<GroupMember>, AppError> {
    get_visible_group_row(pool, group_id, user_id).await?;
    let can_manage = can_manage_group(pool, group_id, user_id).await?;
    Ok(sqlx::query_as::<_, GroupMember>(
        r#"
        SELECT membership.user_id, users.display_name, users.city, users.skill_level,
            membership.role, membership.status, membership.joined_at
        FROM badminton_group_members AS membership
        INNER JOIN users ON users.id = membership.user_id
        WHERE membership.group_id = $1
            AND ($2 OR membership.status = 'member')
        ORDER BY
            CASE membership.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
            membership.joined_at, membership.user_id
        "#,
    )
    .bind(group_id)
    .bind(can_manage)
    .fetch_all(pool)
    .await?)
}

pub async fn leave_group(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    let role = sqlx::query_scalar::<_, GroupRole>(
        r#"
        SELECT role FROM badminton_group_members
        WHERE group_id = $1 AND user_id = $2
        FOR UPDATE
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::BadRequest("you are not part of this group".to_owned()))?;
    if role == GroupRole::Owner {
        return Err(AppError::BadRequest(
            "the group owner cannot leave the group".to_owned(),
        ));
    }
    delete_group_membership(&mut transaction, group_id, user_id).await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn invite_group_member(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    actor_id: Uuid,
    target_id: Uuid,
) -> Result<GroupMembership, AppError> {
    let mut transaction = pool.begin().await?;
    require_group_manager(&mut transaction, group_id, actor_id).await?;
    if actor_id == target_id {
        return Err(AppError::BadRequest(
            "you are already in this group".to_owned(),
        ));
    }
    ensure_user_exists(&mut transaction, target_id).await?;
    let membership = sqlx::query_as::<_, GroupMembership>(
        r#"
        INSERT INTO badminton_group_members (group_id, user_id, role, status)
        VALUES ($1, $2, 'member', 'invited')
        ON CONFLICT (group_id, user_id) DO NOTHING
        RETURNING group_id, user_id, role, status, joined_at
        "#,
    )
    .bind(group_id)
    .bind(target_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::Conflict("player already has a group membership".to_owned()))?;
    transaction.commit().await?;
    Ok(membership)
}

pub async fn approve_group_member(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    actor_id: Uuid,
    target_id: Uuid,
) -> Result<GroupMembership, AppError> {
    update_group_member_status(
        pool,
        group_id,
        actor_id,
        target_id,
        GroupMemberStatus::Pending,
        GroupMemberStatus::Member,
    )
    .await
}

pub async fn reject_group_member(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    actor_id: Uuid,
    target_id: Uuid,
) -> Result<(), AppError> {
    delete_managed_group_membership(
        pool,
        group_id,
        actor_id,
        target_id,
        Some(GroupMemberStatus::Pending),
    )
    .await
}

pub async fn remove_group_member(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    actor_id: Uuid,
    target_id: Uuid,
) -> Result<(), AppError> {
    delete_managed_group_membership(pool, group_id, actor_id, target_id, None).await
}

async fn get_visible_group_row(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query_scalar::<_, Uuid>(
        r#"
        SELECT id FROM badminton_groups
        WHERE id = $1 AND (
            visibility = 'public' OR EXISTS (
                SELECT 1 FROM badminton_group_members
                WHERE group_id = $1 AND user_id = $2
                    AND status IN ('member', 'invited')
            )
        )
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?;
    Ok(())
}

async fn can_manage_group(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1 FROM badminton_group_members
            WHERE group_id = $1 AND user_id = $2 AND status = 'member'
                AND role IN ('owner', 'admin')
        )
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_one(pool)
    .await?)
}

async fn require_group_manager(
    transaction: &mut sqlx::Transaction<'_, Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<GroupRole, AppError> {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM badminton_groups WHERE id = $1 FOR UPDATE")
        .bind(group_id)
        .fetch_one(&mut **transaction)
        .await?;
    sqlx::query_scalar::<_, GroupRole>(
        r#"
        SELECT role FROM badminton_group_members
        WHERE group_id = $1 AND user_id = $2 AND status = 'member'
            AND role IN ('owner', 'admin')
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(&mut **transaction)
    .await?
    .ok_or_else(|| AppError::Forbidden("only group managers can do that".to_owned()))
}

async fn ensure_user_exists(
    transaction: &mut sqlx::Transaction<'_, Postgres>,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE id = $1")
        .bind(user_id)
        .fetch_one(&mut **transaction)
        .await?;
    Ok(())
}

async fn update_group_member_status(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    actor_id: Uuid,
    target_id: Uuid,
    expected: GroupMemberStatus,
    next: GroupMemberStatus,
) -> Result<GroupMembership, AppError> {
    let mut transaction = pool.begin().await?;
    require_group_manager(&mut transaction, group_id, actor_id).await?;
    let membership = sqlx::query_as::<_, GroupMembership>(
        r#"
        UPDATE badminton_group_members
        SET status = $4, joined_at = now()
        WHERE group_id = $1 AND user_id = $2 AND status = $3
        RETURNING group_id, user_id, role, status, joined_at
        "#,
    )
    .bind(group_id)
    .bind(target_id)
    .bind(expected)
    .bind(next)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::Conflict("membership is no longer pending".to_owned()))?;
    transaction.commit().await?;
    Ok(membership)
}

async fn delete_managed_group_membership(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    actor_id: Uuid,
    target_id: Uuid,
    expected: Option<GroupMemberStatus>,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    require_group_manager(&mut transaction, group_id, actor_id).await?;
    let target = sqlx::query_as::<_, (GroupRole, GroupMemberStatus)>(
        "SELECT role, status FROM badminton_group_members WHERE group_id = $1 AND user_id = $2 FOR UPDATE",
    )
    .bind(group_id)
    .bind(target_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::Conflict("membership no longer exists".to_owned()))?;
    if target.0 == GroupRole::Owner {
        return Err(AppError::Forbidden(
            "the group owner cannot be removed".to_owned(),
        ));
    }
    if expected.is_some_and(|expected| expected != target.1) {
        return Err(AppError::Conflict(
            "membership is no longer pending".to_owned(),
        ));
    }
    delete_group_membership(&mut transaction, group_id, target_id).await?;
    transaction.commit().await?;
    Ok(())
}

async fn delete_group_membership(
    transaction: &mut sqlx::Transaction<'_, Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        r#"
        DELETE FROM gathering_participants AS participant
        USING gatherings
        WHERE participant.gathering_id = gatherings.id
            AND gatherings.group_id = $1 AND participant.user_id = $2
            AND gatherings.starts_at > now()
        "#,
    )
    .bind(group_id)
    .bind(user_id)
    .execute(&mut **transaction)
    .await?;
    sqlx::query("DELETE FROM badminton_group_members WHERE group_id = $1 AND user_id = $2")
        .bind(group_id)
        .bind(user_id)
        .execute(&mut **transaction)
        .await?;
    Ok(())
}

fn next_status(
    visibility: GroupVisibility,
    join_policy: GroupJoinPolicy,
    existing: Option<GroupMemberStatus>,
) -> Result<GroupMemberStatus, AppError> {
    if let Some(existing) = existing {
        return match existing {
            GroupMemberStatus::Invited => Ok(GroupMemberStatus::Member),
            GroupMemberStatus::Member | GroupMemberStatus::Pending => Err(AppError::BadRequest(
                "group is already joined or awaiting approval".to_owned(),
            )),
        };
    }
    if visibility == GroupVisibility::Private {
        return Err(AppError::BadRequest(
            "private group requires an invitation".to_owned(),
        ));
    }
    match join_policy {
        GroupJoinPolicy::Open => Ok(GroupMemberStatus::Member),
        GroupJoinPolicy::ApprovalRequired => Ok(GroupMemberStatus::Pending),
        GroupJoinPolicy::InviteOnly => Err(AppError::BadRequest(
            "group requires an invitation".to_owned(),
        )),
    }
}

fn normalize_group(payload: &mut CreateBadmintonGroup) {
    payload.name = payload.name.trim().to_owned();
    payload.city = payload.city.trim().to_owned();
    payload.description = normalized_optional(payload.description.take());
    payload.location_label = normalized_optional(payload.location_label.take());
    payload.google_place_id = normalized_optional(payload.google_place_id.take());
    if payload.image_keys.is_empty() {
        if let Some(cover_image_key) = &payload.cover_image_key {
            payload.image_keys.push(cover_image_key.clone());
        }
    } else {
        payload.cover_image_key = payload.image_keys.first().cloned();
    }
}

fn validate_group(owner_id: Uuid, payload: &CreateBadmintonGroup) -> Result<(), AppError> {
    if !(1..=120).contains(&payload.name.chars().count()) {
        return Err(AppError::BadRequest(
            "name must be between 1 and 120 characters".to_owned(),
        ));
    }
    if !(1..=100).contains(&payload.city.chars().count()) {
        return Err(AppError::BadRequest(
            "city must be between 1 and 100 characters".to_owned(),
        ));
    }
    if payload
        .description
        .as_ref()
        .is_some_and(|description| description.chars().count() > 3000)
    {
        return Err(AppError::BadRequest(
            "description must be at most 3000 characters".to_owned(),
        ));
    }
    validate_coordinate_pair(payload.latitude, payload.longitude)?;
    if payload
        .location_label
        .as_ref()
        .is_some_and(|label| label.chars().count() > 200)
    {
        return Err(AppError::BadRequest(
            "location_label must be at most 200 characters".to_owned(),
        ));
    }
    if payload
        .google_place_id
        .as_ref()
        .is_some_and(|place_id| place_id.chars().count() > 255)
    {
        return Err(AppError::BadRequest(
            "google_place_id must be at most 255 characters".to_owned(),
        ));
    }
    if payload.goal_tags.len() > MAX_GROUP_GOALS {
        return Err(AppError::BadRequest(format!(
            "goal_tags supports at most {MAX_GROUP_GOALS} values"
        )));
    }
    for (index, goal) in payload.goal_tags.iter().enumerate() {
        if payload.goal_tags[..index].contains(goal) {
            return Err(AppError::BadRequest(
                "goal_tags cannot contain duplicates".to_owned(),
            ));
        }
    }
    if payload.visibility == GroupVisibility::Private
        && payload.join_policy == GroupJoinPolicy::Open
    {
        return Err(AppError::BadRequest(
            "private groups cannot use open joining".to_owned(),
        ));
    }
    if payload.image_keys.len() > 5 {
        return Err(AppError::BadRequest(
            "groups support up to five uploaded photos".to_owned(),
        ));
    }
    for object_key in &payload.image_keys {
        validate_group_cover_key(owner_id, object_key)?;
    }
    Ok(())
}

async fn hydrate_groups(
    media: &MediaStorage,
    stored: Vec<StoredBadmintonGroup>,
) -> Result<Vec<BadmintonGroup>, AppError> {
    let mut groups = Vec::with_capacity(stored.len());
    for group in stored {
        groups.push(hydrate_group(media, group).await?);
    }
    Ok(groups)
}

async fn hydrate_group(
    media: &MediaStorage,
    stored: StoredBadmintonGroup,
) -> Result<BadmintonGroup, AppError> {
    let image_urls = media.read_urls(&stored.image_keys).await?;
    let cover_image_url = image_urls.first().cloned();

    Ok(BadmintonGroup {
        id: stored.id,
        owner_id: stored.owner_id,
        name: stored.name,
        description: stored.description,
        city: stored.city,
        location_label: stored.location_label,
        google_place_id: stored.google_place_id,
        latitude: stored.latitude,
        longitude: stored.longitude,
        visibility: stored.visibility,
        join_policy: stored.join_policy,
        primary_court_id: stored.primary_court_id,
        goal_tags: stored.goal_tags,
        image_keys: stored.image_keys,
        image_urls,
        cover_image_key: stored.cover_image_key,
        cover_image_url,
        member_count: stored.member_count,
        created_at: stored.created_at,
        updated_at: stored.updated_at,
    })
}

fn validate_coordinate_pair(latitude: Option<f64>, longitude: Option<f64>) -> Result<(), AppError> {
    match (latitude, longitude) {
        (None, None) => Ok(()),
        (Some(latitude), Some(longitude))
            if latitude.is_finite()
                && longitude.is_finite()
                && (-90.0..=90.0).contains(&latitude)
                && (-180.0..=180.0).contains(&longitude) =>
        {
            Ok(())
        }
        _ => Err(AppError::BadRequest(
            "latitude and longitude must be provided together and be valid".to_owned(),
        )),
    }
}

fn push_coordinate_filters(
    query: &mut QueryBuilder<'_, Postgres>,
    latitude: Option<f64>,
    longitude: Option<f64>,
    radius_km: Option<f64>,
    fallback_city: Option<&str>,
) -> Result<(), AppError> {
    let (latitude, longitude) = match (latitude, longitude) {
        (None, None) => return Ok(()),
        (Some(latitude), Some(longitude)) => {
            validate_coordinate_pair(Some(latitude), Some(longitude))?;
            (latitude, longitude)
        }
        _ => return validate_coordinate_pair(latitude, longitude),
    };
    let radius_km = radius_km.unwrap_or(40.0);
    if !(0.5..=200.0).contains(&radius_km) {
        return Err(AppError::BadRequest(
            "radius_km must be between 0.5 and 200".to_owned(),
        ));
    }
    query
        .push(" AND (ST_DWithin(g.location, ST_SetSRID(ST_MakePoint(")
        .push_bind(longitude)
        .push(", ")
        .push_bind(latitude)
        .push("), 4326)::GEOGRAPHY, ")
        .push_bind(radius_km * 1_000.0)
        .push(")");
    if let Some(city) = fallback_city {
        query
            .push(" OR (g.location IS NULL AND g.city ILIKE ")
            .push_bind(format!("%{}%", escape_like(city)))
            .push(" ESCAPE '\\')");
    }
    query.push(")");
    Ok(())
}

fn normalized_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let value = value.trim();
        (!value.is_empty()).then(|| value.to_owned())
    })
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::{GroupJoinPolicy, GroupMemberStatus, GroupVisibility, next_status};

    #[test]
    fn group_joining_respects_visibility_and_approval() {
        assert_eq!(
            next_status(GroupVisibility::Public, GroupJoinPolicy::Open, None).unwrap(),
            GroupMemberStatus::Member
        );
        assert_eq!(
            next_status(
                GroupVisibility::Public,
                GroupJoinPolicy::ApprovalRequired,
                None
            )
            .unwrap(),
            GroupMemberStatus::Pending
        );
        assert!(next_status(GroupVisibility::Private, GroupJoinPolicy::Open, None).is_err());
        assert_eq!(
            next_status(
                GroupVisibility::Private,
                GroupJoinPolicy::InviteOnly,
                Some(GroupMemberStatus::Invited)
            )
            .unwrap(),
            GroupMemberStatus::Member
        );
    }
}
