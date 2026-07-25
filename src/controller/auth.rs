use std::collections::HashMap;

use aide::axum::{
    ApiRouter,
    routing::{get, post},
};
use axum::{
    Form, Json,
    extract::{Query, State},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    response::{IntoResponse, Redirect, Response},
    routing::{get as axum_get, post as axum_post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use better_auth::{AuthResponse, HttpMethod};
use better_auth_core::{PASSWORD_HASH_KEY, hash_password};
use rand::{RngCore, rngs::OsRng};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

use crate::{
    accounts::{self, User},
    app::AppState,
    auth::CurrentUser,
    auth_service::AuthService,
    email::EmailKind,
    error::AppError,
};

const AUTH_PATH: &str = "/api/auth";
const GOOGLE_FLOW_TTL_MINUTES: i32 = 10;
const MOBILE_CODE_TTL_MINUTES: i32 = 2;
const EMAIL_VERIFICATION_TTL_MINUTES: i32 = 24 * 60;
const PASSWORD_RESET_TTL_MINUTES: i32 = 60;
const EMAIL_REQUEST_COOLDOWN_MINUTES: i32 = 2;
const EMAIL_TOKEN_BYTES: usize = 32;

pub fn routes() -> ApiRouter<AppState> {
    ApiRouter::new()
        .api_route("/sign-up/email", post(sign_up_email))
        .api_route("/sign-in/email", post(sign_in_email))
        .api_route("/verification/resend", post(resend_verification_email))
        .route("/verify-email", axum_get(verification_landing))
        .route(
            "/verify-email/confirm",
            axum_post(confirm_email_verification),
        )
        .api_route("/forgot-password", post(forgot_password))
        .route("/password-reset", axum_get(password_reset_landing))
        .api_route("/reset-password", post(reset_password))
        .api_route("/session", get(get_session))
        .api_route("/sign-out", post(sign_out))
        .api_route("/oauth/google/start", post(start_google_oauth))
        .route("/callback/google", axum_get(google_oauth_callback))
        .api_route("/oauth/exchange", post(exchange_mobile_oauth_code))
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct SignUpEmail {
    email: String,
    password: String,
    display_name: String,
    city: Option<String>,
    skill_level: Option<String>,
    bio: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct SignInEmail {
    email: String,
    password: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub(crate) struct EmailSignUpPending {
    email: String,
    email_sent: bool,
    verification_required: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct EmailAddressRequest {
    email: String,
}

#[derive(Debug, Deserialize)]
struct EmailTokenQuery {
    token: String,
}

#[derive(Debug, Deserialize)]
struct ConfirmEmailVerification {
    token: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct ResetPassword {
    token: String,
    new_password: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub(crate) struct AuthenticatedSession {
    token: String,
    user: User,
}

#[derive(Debug, Serialize, JsonSchema)]
pub(crate) struct StatusResponse {
    success: bool,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct GoogleOAuthStart {
    code_challenge: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub(crate) struct GoogleOAuthStartResponse {
    authorization_url: String,
}

#[derive(Debug, Deserialize)]
struct GoogleOAuthCallback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct MobileOAuthExchange {
    code: String,
    code_verifier: String,
}

pub(crate) async fn sign_up_email(
    State(state): State<AppState>,
    Json(payload): Json<SignUpEmail>,
) -> Result<Json<EmailSignUpPending>, AppError> {
    let email = accounts::normalize_email(&payload.email);
    let display_name = payload.display_name.trim();
    let skill_level = payload.skill_level.unwrap_or_else(|| "beginner".to_owned());
    validate_signup(&email, &payload.password, display_name, &skill_level)?;

    let response = auth_json(
        &state.auth,
        HttpMethod::Post,
        format!("{AUTH_PATH}/sign-up/email"),
        json!({
            "email": email,
            "password": payload.password,
            "name": display_name,
        }),
        None,
    )
    .await?;
    let auth_user_id = response_user_id(&response)?;
    accounts::update_signup_profile(
        &state.pool,
        &auth_user_id,
        trimmed_optional(payload.city),
        skill_level,
        trimmed_optional(payload.bio),
    )
    .await?;

    let email_sent = send_email_verification(&state, &auth_user_id, &email, false)
        .await
        .unwrap_or_else(|error| {
            tracing::error!(error = ?error, "initial verification email could not be sent");
            false
        });

    Ok(Json(EmailSignUpPending {
        email,
        email_sent,
        verification_required: true,
    }))
}

pub(crate) async fn sign_in_email(
    State(state): State<AppState>,
    Json(payload): Json<SignInEmail>,
) -> Result<Json<AuthenticatedSession>, AppError> {
    let response = auth_json(
        &state.auth,
        HttpMethod::Post,
        format!("{AUTH_PATH}/sign-in/email"),
        json!({
            "email": accounts::normalize_email(&payload.email),
            "password": payload.password,
        }),
        None,
    )
    .await?;
    let token = response_string(&response, "token")?;
    let auth_user_id = response_user_id(&response)?;
    let email_verified =
        sqlx::query_scalar::<_, bool>("SELECT email_verified FROM users WHERE auth_user_id = $1")
            .bind(&auth_user_id)
            .fetch_one(&state.pool)
            .await?;
    if !email_verified {
        state
            .auth
            .revoke_session(&token)
            .await
            .map_err(auth_internal_error)?;
        return Err(AppError::EmailNotVerified);
    }
    let user = accounts::get_user_by_auth_id(&state.pool, &auth_user_id).await?;

    Ok(Json(AuthenticatedSession { token, user }))
}

pub(crate) async fn resend_verification_email(
    State(state): State<AppState>,
    Json(payload): Json<EmailAddressRequest>,
) -> Result<Json<StatusResponse>, AppError> {
    let email = accounts::normalize_email(&payload.email);
    if let Some((auth_user_id, email_verified)) = sqlx::query_as::<_, (String, bool)>(
        "SELECT auth_user_id, email_verified FROM users WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await?
        && !email_verified
        && let Err(error) = send_email_verification(&state, &auth_user_id, &email, true).await
    {
        tracing::warn!(error = ?error, "verification email resend failed");
    }

    // Keep unknown, verified, cooling-down, and eligible addresses
    // indistinguishable so this endpoint cannot enumerate accounts.
    Ok(Json(StatusResponse { success: true }))
}

pub(crate) async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<EmailAddressRequest>,
) -> Result<Json<StatusResponse>, AppError> {
    let email = accounts::normalize_email(&payload.email);
    if let Some(auth_user_id) =
        sqlx::query_scalar::<_, String>("SELECT auth_user_id FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.pool)
            .await?
        && let Some(token) = issue_email_token(
            &state.pool,
            &auth_user_id,
            EmailTokenPurpose::PasswordReset,
            PASSWORD_RESET_TTL_MINUTES,
            true,
        )
        .await?
        && let Err(error) = send_password_reset_email(&state, &email, &token).await
    {
        tracing::warn!(error = ?error, "password reset email delivery failed");
    }

    // Always acknowledge the request, including unknown addresses and
    // provider failures, to avoid exposing account membership.
    Ok(Json(StatusResponse { success: true }))
}

pub(crate) async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPassword>,
) -> Result<Json<StatusResponse>, AppError> {
    validate_password(&payload.new_password)?;
    validate_email_token(&payload.token)?;
    if !email_token_is_active(
        &state.pool,
        &payload.token,
        EmailTokenPurpose::PasswordReset,
    )
    .await?
    {
        return Err(AppError::BadRequest(
            "reset link is invalid or expired".to_owned(),
        ));
    }
    let password_hash = hash_password(None, &payload.new_password)
        .await
        .map_err(auth_internal_error)?;
    let token_hash = sha256_bytes(&payload.token);

    let mut transaction = state.pool.begin().await?;
    let auth_user_id = sqlx::query_scalar::<_, String>(
        r#"
        DELETE FROM auth_email_tokens
        WHERE token_hash = $1
          AND purpose = 'password_reset'
          AND expires_at > now()
        RETURNING user_id
        "#,
    )
    .bind(token_hash)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::BadRequest("reset link is invalid or expired".to_owned()))?;
    sqlx::query(
        r#"
        UPDATE users
        SET metadata = jsonb_set(
                metadata,
                ARRAY[$2],
                to_jsonb(CAST($3 AS TEXT)),
                TRUE
            ),
            email_verified = TRUE,
            updated_at = now()
        WHERE auth_user_id = $1
        "#,
    )
    .bind(&auth_user_id)
    .bind(PASSWORD_HASH_KEY)
    .bind(password_hash)
    .execute(&mut *transaction)
    .await?;
    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(&auth_user_id)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;

    Ok(Json(StatusResponse { success: true }))
}

async fn verification_landing(
    State(state): State<AppState>,
    Query(query): Query<EmailTokenQuery>,
) -> Response {
    if validate_email_token(&query.token).is_err()
        || !email_token_is_active(
            &state.pool,
            &query.token,
            EmailTokenPurpose::EmailVerification,
        )
        .await
        .unwrap_or(false)
    {
        return auth_html(
            StatusCode::BAD_REQUEST,
            "Verification link expired",
            "<p>This verification link is invalid or has expired. Request a new link from Friendminton.</p>",
        );
    }

    let body = format!(
        r#"<p>Confirm that you want to verify this email address for Friendminton.</p>
<form method="post" action="/api/auth/verify-email/confirm">
  <input type="hidden" name="token" value="{}">
  <button type="submit">Verify email</button>
</form>"#,
        query.token
    );
    auth_html(StatusCode::OK, "Verify your email", &body)
}

async fn confirm_email_verification(
    State(state): State<AppState>,
    Form(payload): Form<ConfirmEmailVerification>,
) -> Response {
    let verified = if validate_email_token(&payload.token).is_ok() {
        verify_email_token(&state.pool, &payload.token)
            .await
            .unwrap_or_else(|error| {
                tracing::error!(error = ?error, "email verification failed");
                false
            })
    } else {
        false
    };
    if !verified {
        return auth_html(
            StatusCode::BAD_REQUEST,
            "Verification link expired",
            "<p>This verification link is invalid, expired, or already used. Request a new link from Friendminton.</p>",
        );
    }

    let app_url = mobile_app_url(&state.auth, "login", &[("verified", "true")])
        .unwrap_or_else(|| "friendminton://login?verified=true".to_owned());
    let body = format!(
        r#"<p>Your email is verified. You can now sign in to Friendminton.</p>
<p><a class="button" href="{app_url}">Open Friendminton</a></p>"#
    );
    auth_html(StatusCode::OK, "Email verified", &body)
}

async fn password_reset_landing(
    State(state): State<AppState>,
    Query(query): Query<EmailTokenQuery>,
) -> Response {
    if validate_email_token(&query.token).is_err()
        || !email_token_is_active(&state.pool, &query.token, EmailTokenPurpose::PasswordReset)
            .await
            .unwrap_or(false)
    {
        return auth_html(
            StatusCode::BAD_REQUEST,
            "Reset link expired",
            "<p>This password-reset link is invalid or has expired. Request another link from Friendminton.</p>",
        );
    }

    let app_url = mobile_app_url(
        &state.auth,
        "auth/reset-password",
        &[("token", query.token.as_str())],
    )
    .unwrap_or_else(|| format!("friendminton://auth/reset-password?token={}", query.token));
    let body = format!(
        r#"<p>Open Friendminton to choose a new password. This link can only be used once.</p>
<p><a class="button" href="{app_url}">Reset password in Friendminton</a></p>"#
    );
    auth_html(StatusCode::OK, "Reset your password", &body)
}

#[derive(Clone, Copy)]
enum EmailTokenPurpose {
    EmailVerification,
    PasswordReset,
}

impl EmailTokenPurpose {
    fn as_str(self) -> &'static str {
        match self {
            Self::EmailVerification => "email_verification",
            Self::PasswordReset => "password_reset",
        }
    }
}

async fn send_email_verification(
    state: &AppState,
    auth_user_id: &str,
    email: &str,
    enforce_cooldown: bool,
) -> Result<bool, AppError> {
    let Some(token) = issue_email_token(
        &state.pool,
        auth_user_id,
        EmailTokenPurpose::EmailVerification,
        EMAIL_VERIFICATION_TTL_MINUTES,
        enforce_cooldown,
    )
    .await?
    else {
        return Ok(false);
    };

    let mut verification_url = Url::parse(&format!(
        "{}/api/auth/verify-email",
        state.auth.public_base_url()
    ))
    .map_err(|error| AppError::Authentication(error.to_string()))?;
    verification_url
        .query_pairs_mut()
        .append_pair("token", &token);
    let subject = "Verify your Friendminton email";
    let text = format!(
        "Verify your Friendminton email address by opening this secure link:\n\n{verification_url}\n\nThis link expires in 24 hours and can only be used once."
    );
    let html = format!(
        r#"<p>Verify your Friendminton email address:</p>
<p><a href="{verification_url}">Verify email</a></p>
<p>This link expires in 24 hours and can only be used once.</p>"#
    );
    if state
        .email
        .send(EmailKind::EmailVerification, email, subject, &html, &text)
        .await
        .is_err()
    {
        revoke_issued_email_token(&state.pool, &token, EmailTokenPurpose::EmailVerification)
            .await?;
        return Err(AppError::ExternalService(
            "transactional email delivery failed".to_owned(),
        ));
    }

    Ok(true)
}

async fn send_password_reset_email(
    state: &AppState,
    email: &str,
    token: &str,
) -> Result<(), AppError> {
    let mut reset_url = Url::parse(&format!(
        "{}/api/auth/password-reset",
        state.auth.public_base_url()
    ))
    .map_err(|error| AppError::Authentication(error.to_string()))?;
    reset_url.query_pairs_mut().append_pair("token", token);
    let subject = "Reset your Friendminton password";
    let text = format!(
        "Open this secure link to reset your Friendminton password:\n\n{reset_url}\n\nThis link expires in one hour and can only be used once. If you did not request it, you can ignore this email."
    );
    let html = format!(
        r#"<p>Open Friendminton to reset your password:</p>
<p><a href="{reset_url}">Reset password</a></p>
<p>This link expires in one hour and can only be used once. If you did not request it, you can ignore this email.</p>"#
    );
    if state
        .email
        .send(EmailKind::PasswordReset, email, subject, &html, &text)
        .await
        .is_err()
    {
        revoke_issued_email_token(&state.pool, token, EmailTokenPurpose::PasswordReset).await?;
        return Err(AppError::ExternalService(
            "transactional email delivery failed".to_owned(),
        ));
    }
    Ok(())
}

async fn issue_email_token(
    pool: &sqlx::PgPool,
    auth_user_id: &str,
    purpose: EmailTokenPurpose,
    ttl_minutes: i32,
    enforce_cooldown: bool,
) -> Result<Option<String>, AppError> {
    let purpose = purpose.as_str();
    let lock_key = format!("{auth_user_id}:{purpose}");
    let mut transaction = pool.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(lock_key)
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM auth_email_tokens WHERE expires_at <= now()")
        .execute(&mut *transaction)
        .await?;

    if enforce_cooldown {
        let cooling_down = sqlx::query_scalar::<_, bool>(
            r#"
            SELECT EXISTS (
                SELECT 1
                FROM auth_email_tokens
                WHERE user_id = $1
                  AND purpose = $2
                  AND created_at > now() - make_interval(mins => $3)
            )
            "#,
        )
        .bind(auth_user_id)
        .bind(purpose)
        .bind(EMAIL_REQUEST_COOLDOWN_MINUTES)
        .fetch_one(&mut *transaction)
        .await?;
        if cooling_down {
            transaction.commit().await?;
            return Ok(None);
        }
    }

    let mut token_bytes = [0_u8; EMAIL_TOKEN_BYTES];
    OsRng.fill_bytes(&mut token_bytes);
    let token = URL_SAFE_NO_PAD.encode(token_bytes);
    sqlx::query(
        r#"
        INSERT INTO auth_email_tokens (
            user_id, purpose, token_hash, expires_at
        )
        VALUES (
            $1, $2, $3, now() + make_interval(mins => $4)
        )
        ON CONFLICT (user_id, purpose)
        DO UPDATE SET
            token_hash = EXCLUDED.token_hash,
            expires_at = EXCLUDED.expires_at,
            created_at = now()
        "#,
    )
    .bind(auth_user_id)
    .bind(purpose)
    .bind(sha256_bytes(&token))
    .bind(ttl_minutes)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;

    Ok(Some(token))
}

async fn revoke_issued_email_token(
    pool: &sqlx::PgPool,
    token: &str,
    purpose: EmailTokenPurpose,
) -> Result<(), AppError> {
    sqlx::query("DELETE FROM auth_email_tokens WHERE token_hash = $1 AND purpose = $2")
        .bind(sha256_bytes(token))
        .bind(purpose.as_str())
        .execute(pool)
        .await?;
    Ok(())
}

async fn email_token_is_active(
    pool: &sqlx::PgPool,
    token: &str,
    purpose: EmailTokenPurpose,
) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM auth_email_tokens
            WHERE token_hash = $1
              AND purpose = $2
              AND expires_at > now()
        )
        "#,
    )
    .bind(sha256_bytes(token))
    .bind(purpose.as_str())
    .fetch_one(pool)
    .await?)
}

async fn verify_email_token(pool: &sqlx::PgPool, token: &str) -> Result<bool, AppError> {
    let mut transaction = pool.begin().await?;
    let auth_user_id = sqlx::query_scalar::<_, String>(
        r#"
        DELETE FROM auth_email_tokens
        WHERE token_hash = $1
          AND purpose = 'email_verification'
          AND expires_at > now()
        RETURNING user_id
        "#,
    )
    .bind(sha256_bytes(token))
    .fetch_optional(&mut *transaction)
    .await?;
    let Some(auth_user_id) = auth_user_id else {
        transaction.rollback().await?;
        return Ok(false);
    };
    sqlx::query(
        r#"
        UPDATE users
        SET email_verified = TRUE,
            updated_at = now()
        WHERE auth_user_id = $1
        "#,
    )
    .bind(auth_user_id)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;
    Ok(true)
}

fn validate_password(password: &str) -> Result<(), AppError> {
    let length = password.chars().count();
    if !(8..=128).contains(&length) {
        return Err(AppError::BadRequest(
            "password must contain between 8 and 128 characters".to_owned(),
        ));
    }
    Ok(())
}

fn validate_email_token(token: &str) -> Result<(), AppError> {
    if token.len() != 43
        || !token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::BadRequest(
            "email action token is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn mobile_app_url(auth: &AuthService, path: &str, query: &[(&str, &str)]) -> Option<String> {
    let callback = Url::parse(auth.mobile_callback_url()).ok()?;
    let mut url = Url::parse(&format!("{}://{path}", callback.scheme())).ok()?;
    url.query_pairs_mut().extend_pairs(query.iter().copied());
    Some(url.into())
}

fn auth_html(status: StatusCode, title: &str, body: &str) -> Response {
    let document = format!(
        r#"<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{title}</title>
  <style>
    :root {{ color-scheme: light; font-family: system-ui, sans-serif; }}
    body {{ background: #f8f4f5; color: #2f2226; margin: 0; }}
    main {{ margin: 15vh auto; max-width: 34rem; padding: 2rem; }}
    h1 {{ font-size: 2rem; }}
    p {{ line-height: 1.55; }}
    button, .button {{ background: #ce7185; border: 0; border-radius: 999px; color: #261a1d; cursor: pointer; display: inline-block; font: inherit; font-weight: 700; padding: .85rem 1.3rem; text-decoration: none; }}
  </style>
</head>
<body><main><h1>{title}</h1>{body}</main></body>
</html>"#
    );
    (
        status,
        [
            ("content-type", "text/html; charset=utf-8"),
            ("cache-control", "no-store"),
            ("referrer-policy", "no-referrer"),
            (
                "content-security-policy",
                "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
            ),
        ],
        document,
    )
        .into_response()
}

pub(crate) async fn get_session(
    State(state): State<AppState>,
    current_user: CurrentUser,
) -> Result<Json<User>, AppError> {
    Ok(Json(
        accounts::get_user(&state.pool, current_user.id).await?,
    ))
}

pub(crate) async fn sign_out(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<StatusResponse>, AppError> {
    let authorization = authorization_header(&headers);
    let token = AuthService::bearer_token(authorization).map_err(|_| AppError::Unauthorized)?;
    state
        .auth
        .revoke_session(token)
        .await
        .map_err(auth_internal_error)?;

    Ok(Json(StatusResponse { success: true }))
}

pub(crate) async fn start_google_oauth(
    State(state): State<AppState>,
    Json(payload): Json<GoogleOAuthStart>,
) -> Result<Json<GoogleOAuthStartResponse>, AppError> {
    if !state.auth.google_enabled() {
        return Err(AppError::ServiceUnavailable(
            "Google sign-in is not configured",
        ));
    }
    validate_pkce_challenge(&payload.code_challenge)?;

    let response = auth_json(
        &state.auth,
        HttpMethod::Post,
        format!("{AUTH_PATH}/sign-in/social"),
        json!({ "provider": "google" }),
        None,
    )
    .await?;
    let authorization_url = response_string(&response, "url")?;
    let oauth_url = Url::parse(&authorization_url)
        .map_err(|_| AppError::Authentication("invalid Google authorization URL".to_owned()))?;
    let state_value = oauth_url
        .query_pairs()
        .find(|(key, _)| key == "state")
        .map(|(_, value)| value.into_owned())
        .ok_or_else(|| AppError::Authentication("Google OAuth state is missing".to_owned()))?;

    cleanup_expired_mobile_auth(&state).await?;
    sqlx::query(
        r#"
        INSERT INTO auth_mobile_oauth_attempts (state_hash, code_challenge, expires_at)
        VALUES ($1, $2, now() + make_interval(mins => $3))
        "#,
    )
    .bind(sha256_bytes(&state_value))
    .bind(payload.code_challenge)
    .bind(GOOGLE_FLOW_TTL_MINUTES)
    .execute(&state.pool)
    .await?;

    Ok(Json(GoogleOAuthStartResponse { authorization_url }))
}

async fn google_oauth_callback(
    State(state): State<AppState>,
    Query(query): Query<GoogleOAuthCallback>,
) -> Response {
    match complete_google_oauth_callback(&state, query).await {
        Ok(code) => mobile_redirect(&state.auth, "code", &code),
        Err(error) => {
            tracing::warn!(error = %error, "Google OAuth callback failed");
            mobile_redirect(&state.auth, "error", "google_sign_in_failed")
        }
    }
}

async fn complete_google_oauth_callback(
    state: &AppState,
    query: GoogleOAuthCallback,
) -> Result<String, AppError> {
    if let Some(provider_error) = query.error {
        if let Some(state_value) = query.state {
            sqlx::query("DELETE FROM auth_mobile_oauth_attempts WHERE state_hash = $1")
                .bind(sha256_bytes(&state_value))
                .execute(&state.pool)
                .await?;
        }
        return Err(AppError::BadRequest(format!(
            "Google declined sign-in: {provider_error}"
        )));
    }

    let code = query
        .code
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("Google authorization code is missing".to_owned()))?;
    let state_value = query
        .state
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest("Google OAuth state is missing".to_owned()))?;
    let state_hash = sha256_bytes(&state_value);
    let code_challenge = sqlx::query_scalar::<_, String>(
        r#"
        SELECT code_challenge
        FROM auth_mobile_oauth_attempts
        WHERE state_hash = $1 AND expires_at > now()
        "#,
    )
    .bind(&state_hash)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let mut auth_request = AuthService::request(
        HttpMethod::Get,
        format!("{AUTH_PATH}/callback/google"),
        None,
        None,
    );
    auth_request.query =
        HashMap::from([("code".to_owned(), code), ("state".to_owned(), state_value)]);
    let auth_response = state
        .auth
        .handle_request(auth_request)
        .await
        .map_err(auth_internal_error)?;
    let response = successful_auth_response(auth_response)?;
    let session_token = response_string(&response, "token")?;
    let auth_user_id = response_user_id(&response)?;
    secure_verified_google_identity(&state.pool, &auth_user_id, &session_token).await?;

    let mut one_time_code_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut one_time_code_bytes);
    let one_time_code = URL_SAFE_NO_PAD.encode(one_time_code_bytes);
    let mut transaction = state.pool.begin().await?;
    sqlx::query("DELETE FROM auth_mobile_oauth_attempts WHERE state_hash = $1")
        .bind(&state_hash)
        .execute(&mut *transaction)
        .await?;
    sqlx::query(
        r#"
        INSERT INTO auth_mobile_codes (
            code_hash, session_token, code_challenge, expires_at
        )
        VALUES ($1, $2, $3, now() + make_interval(mins => $4))
        "#,
    )
    .bind(sha256_bytes(&one_time_code))
    .bind(session_token)
    .bind(code_challenge)
    .bind(MOBILE_CODE_TTL_MINUTES)
    .execute(&mut *transaction)
    .await?;
    transaction.commit().await?;

    Ok(one_time_code)
}

pub(crate) async fn exchange_mobile_oauth_code(
    State(state): State<AppState>,
    Json(payload): Json<MobileOAuthExchange>,
) -> Result<Json<AuthenticatedSession>, AppError> {
    validate_pkce_verifier(&payload.code_verifier)?;
    if payload.code.is_empty() || payload.code.len() > 256 {
        return Err(AppError::Unauthorized);
    }

    let code_challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(payload.code_verifier.as_bytes()));
    let session_token = sqlx::query_scalar::<_, String>(
        r#"
        DELETE FROM auth_mobile_codes
        WHERE code_hash = $1
          AND code_challenge = $2
          AND expires_at > now()
        RETURNING session_token
        "#,
    )
    .bind(sha256_bytes(&payload.code))
    .bind(code_challenge)
    .fetch_optional(&state.pool)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let user_id = state
        .auth
        .domain_user_id_for_token(&session_token)
        .await
        .map_err(|error| {
            if error.status_code() >= 500 {
                auth_internal_error(error)
            } else {
                AppError::Unauthorized
            }
        })?;
    let user = accounts::get_user(&state.pool, user_id).await?;
    cleanup_expired_mobile_auth(&state).await?;

    Ok(Json(AuthenticatedSession {
        token: session_token,
        user,
    }))
}

/// A verified Google login is authoritative for its email address.
///
/// Until Friendminton ships email verification, an unverified password signup
/// must not remain attached after the real email owner proves ownership through
/// Google. Keep the new Google session, revoke older sessions, and remove the
/// unverified password credential. Already-verified users retain their linked
/// credentials.
async fn secure_verified_google_identity(
    pool: &sqlx::PgPool,
    auth_user_id: &str,
    google_session_token: &str,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    let (email_verified, google_linked) = sqlx::query_as::<_, (bool, bool)>(
        r#"
        SELECT
            users.email_verified,
            EXISTS (
                SELECT 1
                FROM accounts
                WHERE accounts.user_id = users.auth_user_id
                  AND accounts.provider_id = 'google'
            )
        FROM users
        WHERE users.auth_user_id = $1
        FOR UPDATE
        "#,
    )
    .bind(auth_user_id)
    .fetch_one(&mut *transaction)
    .await?;
    if !google_linked {
        return Err(AppError::Authentication(
            "Google authentication did not create an account link".to_owned(),
        ));
    }

    if !email_verified {
        sqlx::query("DELETE FROM accounts WHERE user_id = $1 AND provider_id = 'credential'")
            .bind(auth_user_id)
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM sessions WHERE user_id = $1 AND token <> $2")
            .bind(auth_user_id)
            .bind(google_session_token)
            .execute(&mut *transaction)
            .await?;
        sqlx::query(
            r#"
            UPDATE users
            SET email_verified = TRUE,
                metadata = metadata - 'password_hash',
                updated_at = now()
            WHERE auth_user_id = $1
            "#,
        )
        .bind(auth_user_id)
        .execute(&mut *transaction)
        .await?;
    }

    transaction.commit().await?;
    Ok(())
}

async fn auth_json(
    auth: &AuthService,
    method: HttpMethod,
    path: String,
    body: Value,
    authorization: Option<&str>,
) -> Result<Value, AppError> {
    let request = AuthService::request(
        method,
        path,
        Some(
            serde_json::to_vec(&body)
                .map_err(|error| AppError::Authentication(error.to_string()))?,
        ),
        authorization,
    );
    let response = auth
        .handle_request(request)
        .await
        .map_err(auth_internal_error)?;
    successful_auth_response(response)
}

fn successful_auth_response(response: AuthResponse) -> Result<Value, AppError> {
    let status = response.status;
    let body: Value = serde_json::from_slice(&response.body).unwrap_or(Value::Null);
    if (200..300).contains(&status) {
        return Ok(body);
    }

    let message = body
        .get("message")
        .and_then(Value::as_str)
        .unwrap_or("authentication request failed");
    Err(match status {
        400 | 413 | 422 => AppError::BadRequest(message.to_owned()),
        401 | 403 | 404 => AppError::Unauthorized,
        409 => AppError::Conflict("email is already registered".to_owned()),
        429 => AppError::ServiceUnavailable("please wait before trying again"),
        _ => AppError::Authentication(format!("Better Auth returned status {status}: {message}")),
    })
}

fn response_string(response: &Value, field: &str) -> Result<String, AppError> {
    response
        .get(field)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| {
            AppError::Authentication(format!("Better Auth response is missing `{field}`"))
        })
}

fn response_user_id(response: &Value) -> Result<String, AppError> {
    response
        .get("user")
        .and_then(|user| user.get("id"))
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| {
            AppError::Authentication("Better Auth response is missing `user.id`".to_owned())
        })
}

fn validate_signup(
    email: &str,
    password: &str,
    display_name: &str,
    skill_level: &str,
) -> Result<(), AppError> {
    if !email.contains('@') {
        return Err(AppError::BadRequest(
            "email must look like an email address".to_owned(),
        ));
    }
    if display_name.is_empty() {
        return Err(AppError::BadRequest("display_name is required".to_owned()));
    }
    if password.chars().count() < 8 {
        return Err(AppError::BadRequest(
            "password must be at least 8 characters".to_owned(),
        ));
    }
    if !matches!(
        skill_level,
        "beginner" | "intermediate" | "advanced" | "competitive"
    ) {
        return Err(AppError::BadRequest("skill_level is invalid".to_owned()));
    }
    Ok(())
}

fn validate_pkce_challenge(challenge: &str) -> Result<(), AppError> {
    if !(43..=128).contains(&challenge.len())
        || !challenge
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::BadRequest(
            "code_challenge must be an S256 base64url value".to_owned(),
        ));
    }
    Ok(())
}

fn validate_pkce_verifier(verifier: &str) -> Result<(), AppError> {
    if !(43..=128).contains(&verifier.len())
        || !verifier
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~'))
    {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

fn trimmed_optional(value: Option<String>) -> Option<String> {
    value
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn authorization_header(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
}

fn sha256_bytes(value: &str) -> Vec<u8> {
    Sha256::digest(value.as_bytes()).to_vec()
}

fn mobile_redirect(auth: &AuthService, key: &str, value: &str) -> Response {
    let mut url = match Url::parse(auth.mobile_callback_url()) {
        Ok(url) => url,
        Err(error) => {
            tracing::error!(%error, "mobile authentication callback URL is invalid");
            return AppError::Authentication(error.to_string()).into_response();
        }
    };
    url.query_pairs_mut().append_pair(key, value);
    Redirect::temporary(url.as_str()).into_response()
}

fn auth_internal_error(error: better_auth::AuthError) -> AppError {
    AppError::Authentication(error.to_string())
}

async fn cleanup_expired_mobile_auth(state: &AppState) -> Result<(), AppError> {
    sqlx::query("DELETE FROM auth_mobile_oauth_attempts WHERE expires_at <= now()")
        .execute(&state.pool)
        .await?;
    sqlx::query("DELETE FROM auth_mobile_codes WHERE expires_at <= now()")
        .execute(&state.pool)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use uuid::Uuid;

    use crate::controller::test_support::{TestApi, response_uuid};

    use super::{
        EMAIL_VERIFICATION_TTL_MINUTES, EmailTokenPurpose, issue_email_token,
        secure_verified_google_identity, sha256_bytes, verify_email_token,
    };

    async fn user_ids_for_email(api: &TestApi, email: &str) -> (Uuid, String) {
        sqlx::query_as::<_, (Uuid, String)>("SELECT id, auth_user_id FROM users WHERE email = $1")
            .bind(email.trim().to_ascii_lowercase())
            .fetch_one(&api.pool)
            .await
            .expect("fetch signed-up user identifiers")
    }

    async fn verify_user(api: &TestApi, auth_user_id: &str) {
        let token = issue_email_token(
            &api.pool,
            auth_user_id,
            EmailTokenPurpose::EmailVerification,
            EMAIL_VERIFICATION_TTL_MINUTES,
            false,
        )
        .await
        .expect("issue verification token")
        .expect("new verification token");
        assert!(
            verify_email_token(&api.pool, &token)
                .await
                .expect("verify email token")
        );
    }

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
                    "password": "a-good-test-password",
                    "display_name": "Original Player",
                    "city": "Oakland",
                    "skill_level": "intermediate",
                    "bio": "Original bio"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        assert_eq!(
            created.body,
            json!({
                "email": email.trim().to_ascii_lowercase(),
                "email_sent": true,
                "verification_required": true
            })
        );
        let (user_id, _) = user_ids_for_email(&api, &email).await;

        let duplicate = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email.to_ascii_uppercase(),
                    "password": "another-good-test-password",
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

    #[tokio::test]
    async fn unverified_password_sign_in_fails_closed_without_leaving_a_session() {
        let api = TestApi::new().await;
        let email = format!("unverified-{}@example.test", Uuid::new_v4());
        let password = "unverified-player-password";
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": password,
                    "display_name": "Pending Player"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;

        let wrong_password = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": "definitely-wrong" })),
            )
            .await;
        assert_eq!(
            wrong_password.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            wrong_password.body
        );

        let correct_password = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": password })),
            )
            .await;
        assert_eq!(
            correct_password.status,
            StatusCode::FORBIDDEN,
            "{}",
            correct_password.body
        );
        assert_eq!(correct_password.body["code"], json!("email_not_verified"));
        let session_count =
            sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions WHERE user_id = $1")
                .bind(&auth_user_id)
                .fetch_one(&api.pool)
                .await
                .expect("count unverified sessions");
        assert_eq!(session_count, 0);

        let fabricated_legacy_session = api.issue_session_for_auth_user(&auth_user_id).await;
        let rejected_session = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "authorization",
                &format!("Bearer {fabricated_legacy_session}"),
                None,
            )
            .await;
        assert_eq!(
            rejected_session.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            rejected_session.body
        );

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn verification_requires_confirmation_and_consumes_the_token_once() {
        let api = TestApi::new().await;
        let email = format!("verify-{}@example.test", Uuid::new_v4());
        let password = "verification-player-password";
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": password,
                    "display_name": "Verification Player"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        let token = issue_email_token(
            &api.pool,
            &auth_user_id,
            EmailTokenPurpose::EmailVerification,
            EMAIL_VERIFICATION_TTL_MINUTES,
            false,
        )
        .await
        .expect("issue verification token")
        .expect("verification token");

        let scanner_fetch = api
            .request(
                Method::GET,
                &format!("/api/auth/verify-email?token={token}"),
                None,
                None,
                Vec::new(),
            )
            .await;
        assert_eq!(
            scanner_fetch.status,
            StatusCode::OK,
            "{}",
            scanner_fetch.body
        );
        let verified_after_get =
            sqlx::query_scalar::<_, bool>("SELECT email_verified FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_one(&api.pool)
                .await
                .expect("read verification state after GET");
        assert!(!verified_after_get);

        let confirmed = api
            .request(
                Method::POST,
                "/api/auth/verify-email/confirm",
                None,
                Some("application/x-www-form-urlencoded"),
                format!("token={token}").into_bytes(),
            )
            .await;
        assert_eq!(confirmed.status, StatusCode::OK, "{}", confirmed.body);
        let verified =
            sqlx::query_scalar::<_, bool>("SELECT email_verified FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_one(&api.pool)
                .await
                .expect("read verified user");
        assert!(verified);

        let replay = api
            .request(
                Method::POST,
                "/api/auth/verify-email/confirm",
                None,
                Some("application/x-www-form-urlencoded"),
                format!("token={token}").into_bytes(),
            )
            .await;
        assert_eq!(replay.status, StatusCode::BAD_REQUEST, "{}", replay.body);

        let signed_in = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": password })),
            )
            .await;
        assert_eq!(signed_in.status, StatusCode::OK, "{}", signed_in.body);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn password_reset_is_one_use_and_revokes_every_session() {
        let api = TestApi::new().await;
        let email = format!("reset-{}@example.test", Uuid::new_v4());
        let old_password = "old-reset-player-password";
        let new_password = "new-reset-player-password";
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": old_password,
                    "display_name": "Reset Player"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        verify_user(&api, &auth_user_id).await;
        let signed_in = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": old_password })),
            )
            .await;
        assert_eq!(signed_in.status, StatusCode::OK, "{}", signed_in.body);
        let old_session = signed_in.body["token"]
            .as_str()
            .expect("old session token")
            .to_owned();
        let reset_token = issue_email_token(
            &api.pool,
            &auth_user_id,
            EmailTokenPurpose::PasswordReset,
            60,
            false,
        )
        .await
        .expect("issue reset token")
        .expect("reset token");

        let reset = api
            .json(
                Method::POST,
                "/api/auth/reset-password",
                None,
                Some(json!({
                    "token": reset_token,
                    "new_password": new_password
                })),
            )
            .await;
        assert_eq!(reset.status, StatusCode::OK, "{}", reset.body);
        let revoked = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "authorization",
                &format!("Bearer {old_session}"),
                None,
            )
            .await;
        assert_eq!(revoked.status, StatusCode::UNAUTHORIZED, "{}", revoked.body);

        let old_password_result = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": old_password })),
            )
            .await;
        assert_eq!(
            old_password_result.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            old_password_result.body
        );
        let new_password_result = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": new_password })),
            )
            .await;
        assert_eq!(
            new_password_result.status,
            StatusCode::OK,
            "{}",
            new_password_result.body
        );
        let replay = api
            .json(
                Method::POST,
                "/api/auth/reset-password",
                None,
                Some(json!({
                    "token": reset_token,
                    "new_password": "another-reset-player-password"
                })),
            )
            .await;
        assert_eq!(replay.status, StatusCode::BAD_REQUEST, "{}", replay.body);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn password_reset_can_establish_a_password_for_a_legacy_user() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("legacy-password-reset").await;
        let (email, auth_user_id) = sqlx::query_as::<_, (String, String)>(
            "SELECT email, auth_user_id FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&api.pool)
        .await
        .expect("load legacy user");
        let new_password = "legacy-user-new-password";
        let reset_token = issue_email_token(
            &api.pool,
            &auth_user_id,
            EmailTokenPurpose::PasswordReset,
            60,
            false,
        )
        .await
        .expect("issue legacy-user reset token")
        .expect("legacy-user reset token");

        let reset = api
            .json(
                Method::POST,
                "/api/auth/reset-password",
                None,
                Some(json!({
                    "token": reset_token,
                    "new_password": new_password
                })),
            )
            .await;
        assert_eq!(reset.status, StatusCode::OK, "{}", reset.body);
        let signed_in = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": new_password })),
            )
            .await;
        assert_eq!(signed_in.status, StatusCode::OK, "{}", signed_in.body);
        assert_eq!(response_uuid(&signed_in.body["user"], "id"), user_id);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn public_email_requests_are_generic_and_respect_the_cooldown() {
        let api = TestApi::new().await;
        let email = format!("email-request-{}@example.test", Uuid::new_v4());
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": "email-request-player-password",
                    "display_name": "Email Request Player"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        let original_verification_hash = sqlx::query_scalar::<_, Vec<u8>>(
            "SELECT token_hash FROM auth_email_tokens WHERE user_id = $1 AND purpose = 'email_verification'",
        )
        .bind(&auth_user_id)
        .fetch_one(&api.pool)
        .await
        .expect("load original verification token hash");

        for requested_email in [&email, "unknown-account@example.test"] {
            let resend = api
                .json(
                    Method::POST,
                    "/api/auth/verification/resend",
                    None,
                    Some(json!({ "email": requested_email })),
                )
                .await;
            assert_eq!(resend.status, StatusCode::OK, "{}", resend.body);
            assert_eq!(resend.body, json!({ "success": true }));
            let forgot = api
                .json(
                    Method::POST,
                    "/api/auth/forgot-password",
                    None,
                    Some(json!({ "email": requested_email })),
                )
                .await;
            assert_eq!(forgot.status, StatusCode::OK, "{}", forgot.body);
            assert_eq!(forgot.body, json!({ "success": true }));
        }

        let verification_hash_after_resend = sqlx::query_scalar::<_, Vec<u8>>(
            "SELECT token_hash FROM auth_email_tokens WHERE user_id = $1 AND purpose = 'email_verification'",
        )
        .bind(&auth_user_id)
        .fetch_one(&api.pool)
        .await
        .expect("load verification token hash after resend");
        assert_eq!(verification_hash_after_resend, original_verification_hash);
        let reset_token_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM auth_email_tokens WHERE user_id = $1 AND purpose = 'password_reset'",
        )
        .bind(&auth_user_id)
        .fetch_one(&api.pool)
        .await
        .expect("count password reset tokens");
        assert_eq!(reset_token_count, 1);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn sign_up_cannot_claim_a_legacy_user_email() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("legacy-auth").await;
        let email = sqlx::query_scalar::<_, String>("SELECT email FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&api.pool)
            .await
            .expect("fetch legacy user email");

        let response = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": format!("  {}  ", email.to_ascii_uppercase()),
                    "password": "legacy-claim-password",
                    "display_name": "Email Claimer"
                })),
            )
            .await;

        assert_eq!(response.status, StatusCode::CONFLICT, "{}", response.body);
        assert_eq!(
            response.body,
            json!({
                "code": "conflict",
                "error": "email is already registered"
            })
        );
        let account_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM accounts WHERE user_id = (SELECT auth_user_id FROM users WHERE id = $1)",
        )
        .bind(user_id)
        .fetch_one(&api.pool)
        .await
        .expect("count legacy user's auth accounts");
        assert_eq!(account_count, 0);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn verified_google_login_removes_an_unverified_password_claim() {
        let api = TestApi::new().await;
        let email = format!("google-owner-{}@example.test", Uuid::new_v4());
        let password = "unverified-password-claim";
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": password,
                    "display_name": "Unverified Claimer"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        let old_token = api.issue_session_for_auth_user(&auth_user_id).await;
        let google_session_token = api.issue_session_for_auth_user(&auth_user_id).await;
        sqlx::query(
            r#"
            INSERT INTO accounts (id, account_id, provider_id, user_id)
            VALUES ($1, $2, 'google', $3)
            "#,
        )
        .bind(Uuid::new_v4().to_string())
        .bind(format!("google-{user_id}"))
        .bind(&auth_user_id)
        .execute(&api.pool)
        .await
        .expect("insert verified Google account");

        secure_verified_google_identity(&api.pool, &auth_user_id, &google_session_token)
            .await
            .expect("secure Google identity");

        let credential_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM accounts WHERE user_id = $1 AND provider_id = 'credential'",
        )
        .bind(&auth_user_id)
        .fetch_one(&api.pool)
        .await
        .expect("count credentials");
        assert_eq!(credential_count, 0);
        let email_verified =
            sqlx::query_scalar::<_, bool>("SELECT email_verified FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_one(&api.pool)
                .await
                .expect("fetch email verification");
        assert!(email_verified);

        let revoked = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "authorization",
                &format!("Bearer {old_token}"),
                None,
            )
            .await;
        assert_eq!(revoked.status, StatusCode::UNAUTHORIZED, "{}", revoked.body);
        let preserved = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "authorization",
                &format!("Bearer {google_session_token}"),
                None,
            )
            .await;
        assert_eq!(preserved.status, StatusCode::OK, "{}", preserved.body);

        let password_sign_in = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({ "email": email, "password": password })),
            )
            .await;
        assert_eq!(
            password_sign_in.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            password_sign_in.body
        );

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn returning_user_can_sign_in_restore_and_revoke_a_session() {
        let api = TestApi::new().await;
        let email = format!("returning-{}@example.test", Uuid::new_v4());
        let password = "returning-player-password";
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": password,
                    "display_name": "Returning Player"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        verify_user(&api, &auth_user_id).await;

        let signed_in = api
            .json(
                Method::POST,
                "/api/auth/sign-in/email",
                None,
                Some(json!({
                    "email": email,
                    "password": password
                })),
            )
            .await;
        assert_eq!(signed_in.status, StatusCode::OK, "{}", signed_in.body);
        let token = signed_in.body["token"]
            .as_str()
            .expect("sign-in token")
            .to_owned();
        let authorization = format!("Bearer {token}");

        let restored = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "authorization",
                &authorization,
                None,
            )
            .await;
        assert_eq!(restored.status, StatusCode::OK, "{}", restored.body);
        assert_eq!(response_uuid(&restored.body, "id"), user_id);

        let signed_out = api
            .json_with_header(
                Method::POST,
                "/api/auth/sign-out",
                "authorization",
                &authorization,
                None,
            )
            .await;
        assert_eq!(signed_out.status, StatusCode::OK, "{}", signed_out.body);

        let revoked = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "authorization",
                &authorization,
                None,
            )
            .await;
        assert_eq!(revoked.status, StatusCode::UNAUTHORIZED, "{}", revoked.body);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn forged_user_id_header_does_not_authenticate() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("forged-auth").await;
        let response = api
            .json_with_header(
                Method::GET,
                "/api/auth/session",
                "x-user-id",
                &user_id.to_string(),
                None,
            )
            .await;

        assert_eq!(
            response.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            response.body
        );
        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn mobile_oauth_exchange_is_pkce_bound_and_single_use() {
        let api = TestApi::new().await;
        let email = format!("oauth-exchange-{}@example.test", Uuid::new_v4());
        let created = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": "oauth-exchange-password",
                    "display_name": "OAuth Player"
                })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        verify_user(&api, &auth_user_id).await;
        let session_token = api.issue_session_for_auth_user(&auth_user_id).await;
        let one_time_code = "mobile-oauth-one-time-code";
        let verifier = "a".repeat(64);
        let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
        sqlx::query(
            r#"
            INSERT INTO auth_mobile_codes (
                code_hash, session_token, code_challenge, expires_at
            )
            VALUES ($1, $2, $3, now() + interval '2 minutes')
            "#,
        )
        .bind(sha256_bytes(one_time_code))
        .bind(&session_token)
        .bind(challenge)
        .execute(&api.pool)
        .await
        .expect("insert mobile exchange code");

        let wrong_verifier = api
            .json(
                Method::POST,
                "/api/auth/oauth/exchange",
                None,
                Some(json!({
                    "code": one_time_code,
                    "code_verifier": "b".repeat(64)
                })),
            )
            .await;
        assert_eq!(
            wrong_verifier.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            wrong_verifier.body
        );

        let exchanged = api
            .json(
                Method::POST,
                "/api/auth/oauth/exchange",
                None,
                Some(json!({
                    "code": one_time_code,
                    "code_verifier": verifier
                })),
            )
            .await;
        assert_eq!(exchanged.status, StatusCode::OK, "{}", exchanged.body);
        assert_eq!(response_uuid(&exchanged.body["user"], "id"), user_id);
        assert_eq!(exchanged.body["token"], session_token);

        let replayed = api
            .json(
                Method::POST,
                "/api/auth/oauth/exchange",
                None,
                Some(json!({
                    "code": one_time_code,
                    "code_verifier": "a".repeat(64)
                })),
            )
            .await;
        assert_eq!(
            replayed.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            replayed.body
        );

        api.cleanup_users(&[user_id]).await;
    }
}
