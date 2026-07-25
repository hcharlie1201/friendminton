use aide::axum::{ApiRouter, routing::post};
use axum::{Json, extract::State};

use crate::{
    accounts::{self, CreateUser, User},
    app::AppState,
    error::AppError,
};

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new().api_route("/sign-up/email", post(sign_up_email))
}

pub(crate) async fn sign_up_email(
    State(state): State<AppState>,
    Json(payload): Json<CreateUser>,
) -> Result<Json<User>, AppError> {
    let user = accounts::create_user(&state.pool, payload).await?;
    Ok(Json(user))
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use serde_json::json;
    use uuid::Uuid;

    use crate::controller::test_support::{TestApi, response_uuid};

    #[tokio::test]
    async fn sign_up_rejects_an_existing_normalized_email_without_overwriting_the_user() {
        let api = TestApi::new().await;
        let email = format!("Player-{}@Example.TEST", Uuid::new_v4());
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": format!("  {email}  "),
                    "display_name": "Original Player",
                    "city": "Oakland",
                    "skill_level": "intermediate",
                    "bio": "Original bio"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(
            created.body["email"],
            email.trim().to_ascii_lowercase(),
            "{}",
            created.body
        );
        let user_id = response_uuid(&created.body, "id");

        let duplicate = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email.to_ascii_uppercase(),
                    "display_name": "Overwritten Player",
                    "city": "San Francisco",
                    "skill_level": "competitive",
                    "bio": "Overwritten bio"
                })),
            )
            .await;
        assert_eq!(duplicate.status, StatusCode::CONFLICT, "{}", duplicate.body);
        assert_eq!(
            duplicate.body,
            json!({
                "code": "conflict",
                "error": "email is already registered"
            })
        );

        let stored_profile = sqlx::query_as::<_, (String, Option<String>, String, Option<String>)>(
            r#"
                SELECT display_name, city, skill_level, bio
                FROM users
                WHERE id = $1
                "#,
        )
        .bind(user_id)
        .fetch_one(&api.pool)
        .await
        .expect("fetch original signup");
        assert_eq!(
            stored_profile,
            (
                "Original Player".to_owned(),
                Some("Oakland".to_owned()),
                "intermediate".to_owned(),
                Some("Original bio".to_owned())
            )
        );

        api.cleanup_users(&[user_id]).await;
    }
}
