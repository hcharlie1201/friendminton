mod game_invite;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::error::AppError;

pub use game_invite::{CreateGameInvite, GameInvite, GameInviteSearch};

pub async fn create_game_invite(
    pool: &Pool<Postgres>,
    host_id: Uuid,
    payload: CreateGameInvite,
) -> Result<GameInvite, AppError> {
    let invite = sqlx::query_as::<_, GameInvite>(
        r#"
        INSERT INTO game_invites (
            host_id, title, venue, city, starts_at, skill_level, max_players, notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id, host_id, title, venue, city, starts_at, skill_level,
            max_players, notes, created_at
        "#,
    )
    .bind(host_id)
    .bind(payload.title)
    .bind(payload.venue)
    .bind(payload.city)
    .bind(payload.starts_at)
    .bind(payload.skill_level)
    .bind(payload.max_players)
    .bind(payload.notes)
    .fetch_one(pool)
    .await?;

    sqlx::query(
        r#"
        INSERT INTO game_invite_players (game_invite_id, user_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(invite.id)
    .bind(host_id)
    .execute(pool)
    .await?;

    Ok(invite)
}

pub async fn find_game_invites(
    pool: &Pool<Postgres>,
    search: GameInviteSearch,
) -> Result<Vec<GameInvite>, AppError> {
    let limit = search.limit.unwrap_or(25).clamp(1, 100);
    let mut query = QueryBuilder::<Postgres>::new(
        "SELECT id, host_id, title, venue, city, starts_at, skill_level, max_players, notes, created_at FROM game_invites",
    );

    let mut has_filter = false;

    if let Some(city) = search.city {
        push_filter(&mut query, &mut has_filter);
        query.push("city ILIKE ").push_bind(format!("%{city}%"));
    }

    if let Some(skill_level) = search.skill_level {
        push_filter(&mut query, &mut has_filter);
        query.push("skill_level = ").push_bind(skill_level);
    }

    query
        .push(" ORDER BY starts_at ASC LIMIT ")
        .push_bind(limit);

    let invites = query.build_query_as::<GameInvite>().fetch_all(pool).await?;
    Ok(invites)
}

fn push_filter(query: &mut QueryBuilder<'_, Postgres>, has_filter: &mut bool) {
    if *has_filter {
        query.push(" AND ");
    } else {
        query.push(" WHERE ");
        *has_filter = true;
    }
}

pub async fn join_game_invite(
    pool: &Pool<Postgres>,
    game_invite_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let affected = sqlx::query(
        r#"
        INSERT INTO game_invite_players (game_invite_id, user_id)
        SELECT $1, $2
        WHERE (
            SELECT count(*) FROM game_invite_players WHERE game_invite_id = $1
        ) < (
            SELECT max_players FROM game_invites WHERE id = $1
        )
        ON CONFLICT DO NOTHING
        "#,
    )
    .bind(game_invite_id)
    .bind(user_id)
    .execute(pool)
    .await?
    .rows_affected();

    if affected == 0 {
        return Err(AppError::BadRequest(
            "game invite is full, missing, or already joined".to_owned(),
        ));
    }

    Ok(())
}
