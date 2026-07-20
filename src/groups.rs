mod group;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::error::AppError;

pub use group::{
    BadmintonGroup, CreateBadmintonGroup, GroupMemberStatus, GroupMembership, GroupSearch,
};
use group::{GroupJoinPolicy, GroupRole, GroupVisibility};

const GROUP_COLUMNS: &str = r#"
    g.id, g.owner_id, g.name, g.description, g.city, g.visibility,
    g.join_policy, g.primary_court_id, g.goal_tags,
    (SELECT count(*) FROM badminton_group_members AS member
        WHERE member.group_id = g.id AND member.status = 'member') AS member_count,
    g.created_at, g.updated_at
"#;
const MAX_GROUP_GOALS: usize = 5;

pub async fn create_group(
    pool: &Pool<Postgres>,
    owner_id: Uuid,
    mut payload: CreateBadmintonGroup,
) -> Result<BadmintonGroup, AppError> {
    normalize_group(&mut payload);
    validate_group(&payload)?;
    let mut transaction = pool.begin().await?;
    let group_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO badminton_groups (
            owner_id, name, description, city, visibility, join_policy,
            primary_court_id, goal_tags
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
        "#,
    )
    .bind(owner_id)
    .bind(payload.name)
    .bind(payload.description)
    .bind(payload.city)
    .bind(payload.visibility)
    .bind(payload.join_policy)
    .bind(payload.primary_court_id)
    .bind(payload.goal_tags)
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
    get_group(pool, group_id, owner_id).await
}

pub async fn find_groups(
    pool: &Pool<Postgres>,
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
    if let Some(city) = normalized_optional(search.city) {
        query
            .push(" AND g.city ILIKE ")
            .push_bind(format!("%{}%", escape_like(&city)))
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
    query
        .push(" ORDER BY member_count DESC, g.created_at DESC LIMIT ")
        .push_bind(limit);
    Ok(query
        .build_query_as::<BadmintonGroup>()
        .fetch_all(pool)
        .await?)
}

pub async fn get_group(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<BadmintonGroup, AppError> {
    Ok(sqlx::query_as::<_, BadmintonGroup>(&format!(
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
    .await?)
}

pub async fn join_group(
    pool: &Pool<Postgres>,
    group_id: Uuid,
    user_id: Uuid,
) -> Result<GroupMembership, AppError> {
    let (visibility, join_policy) = sqlx::query_as::<_, (GroupVisibility, GroupJoinPolicy)>(
        "SELECT visibility, join_policy FROM badminton_groups WHERE id = $1",
    )
    .bind(group_id)
    .fetch_one(pool)
    .await?;
    let existing = sqlx::query_as::<_, GroupMembership>(
        "SELECT group_id, user_id, role, status, joined_at FROM badminton_group_members WHERE group_id = $1 AND user_id = $2",
    )
    .bind(group_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?;
    let status = next_status(
        visibility,
        join_policy,
        existing.as_ref().map(|membership| membership.status),
    )?;
    Ok(sqlx::query_as::<_, GroupMembership>(
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
    .fetch_one(pool)
    .await?)
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
}

fn validate_group(payload: &CreateBadmintonGroup) -> Result<(), AppError> {
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
