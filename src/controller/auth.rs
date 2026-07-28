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
use chrono::{DateTime, Utc};
use rand::{RngCore, rngs::OsRng};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use url::Url;

use crate::{
    accounts::{self, User},
    app::AppState,
    apple_auth::{AppleAuthError, VerifiedAppleIdentity},
    auth::CurrentUser,
    auth_service::{AppleSignInDecision, AuthService, PendingAppleSignIn, StoredAppleTokens},
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
const APPLE_CHALLENGE_TTL_MINUTES: i32 = 5;
const APPLE_PENDING_TTL_MINUTES: i32 = 10;
const APPLE_CHALLENGE_BYTES: usize = 32;
const APPLE_PENDING_TOKEN_BYTES: usize = 32;
const APPLE_CHALLENGE_PATH: &str = "/api/auth/oauth/apple/challenge";
const APPLE_SIGN_IN_PATH: &str = "/api/auth/oauth/apple";

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
        .api_route("/oauth/apple/challenge", post(start_apple_sign_in))
        .api_route("/oauth/apple", post(sign_in_with_apple))
        .api_route("/oauth/apple/create", post(create_apple_account))
        .api_route("/oauth/apple/link", post(link_apple_account))
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

#[derive(Debug, Serialize, JsonSchema)]
pub(crate) struct AppleSignInChallenge {
    nonce: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct AppleSignIn {
    identity_token: String,
    authorization_code: String,
    nonce: String,
    display_name: Option<String>,
}

#[derive(Debug, Serialize, JsonSchema)]
#[serde(tag = "status", rename_all = "snake_case")]
pub(crate) enum AppleSignInOutcome {
    Authenticated {
        session: AuthenticatedSession,
    },
    RegistrationRequired {
        pending_token: String,
        apple_email: String,
        suggested_display_name: Option<String>,
    },
}

#[derive(Debug, Deserialize, JsonSchema)]
pub(crate) struct PendingAppleSignInRequest {
    pending_token: String,
}

#[derive(sqlx::FromRow)]
struct PendingAppleSignInRow {
    apple_subject: String,
    email: String,
    display_name: Option<String>,
    access_token: String,
    refresh_token: Option<String>,
    id_token: String,
    access_token_expires_at: Option<DateTime<Utc>>,
}

pub(crate) async fn sign_up_email(
    State(state): State<AppState>,
    headers: HeaderMap,
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
        forwarded_client_ip(&headers).as_deref(),
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
    headers: HeaderMap,
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
        forwarded_client_ip(&headers).as_deref(),
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

pub(crate) async fn start_apple_sign_in(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AppleSignInChallenge>, AppError> {
    if state.apple_auth.is_none() {
        return Err(AppError::ServiceUnavailable(
            "Apple sign-in is not configured",
        ));
    }
    let client_ip = forwarded_client_ip(&headers);
    enforce_apple_rate_limit(&state.auth, APPLE_CHALLENGE_PATH, client_ip.as_deref()).await?;
    cleanup_expired_apple_challenges(&state.pool).await?;

    let mut nonce_bytes = [0_u8; APPLE_CHALLENGE_BYTES];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = URL_SAFE_NO_PAD.encode(nonce_bytes);
    sqlx::query(
        r#"
        INSERT INTO auth_apple_challenges (nonce_hash, expires_at)
        VALUES ($1, now() + make_interval(mins => $2))
        "#,
    )
    .bind(sha256_bytes(&nonce))
    .bind(APPLE_CHALLENGE_TTL_MINUTES)
    .execute(&state.pool)
    .await?;

    Ok(Json(AppleSignInChallenge { nonce }))
}

pub(crate) async fn sign_in_with_apple(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<AppleSignIn>,
) -> Result<Json<AppleSignInOutcome>, AppError> {
    let apple = state
        .apple_auth
        .as_ref()
        .ok_or(AppError::ServiceUnavailable(
            "Apple sign-in is not configured",
        ))?;
    validate_apple_sign_in(&payload)?;
    let client_ip = forwarded_client_ip(&headers);
    enforce_apple_rate_limit(&state.auth, APPLE_SIGN_IN_PATH, client_ip.as_deref()).await?;
    let nonce_hash = sha256_bytes(&payload.nonce);
    let challenge_is_active = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS (
            SELECT 1
            FROM auth_apple_challenges
            WHERE nonce_hash = $1 AND expires_at > now()
        )
        "#,
    )
    .bind(&nonce_hash)
    .fetch_one(&state.pool)
    .await?;
    if !challenge_is_active {
        return Err(AppError::Unauthorized);
    }

    let presented_identity = apple
        .verify_identity_token(&payload.identity_token, Some(&payload.nonce))
        .await
        .map_err(map_apple_auth_error)?;
    let tokens = apple
        .exchange_authorization_code(&payload.authorization_code)
        .await
        .map_err(map_apple_auth_error)?;
    let exchanged_identity = apple
        .verify_identity_token(&tokens.id_token, None)
        .await
        .map_err(map_apple_auth_error)?;
    let identity = reconcile_apple_identities(presented_identity, exchanged_identity)?;

    if !consume_apple_challenge(&state.pool, &nonce_hash).await? {
        return Err(AppError::Unauthorized);
    }

    let decision = state
        .auth
        .begin_apple_sign_in(
            identity,
            tokens,
            payload.display_name.as_deref(),
            client_ip.as_deref(),
        )
        .await
        .map_err(map_auth_service_error)?;
    match decision {
        AppleSignInDecision::Authenticated(result) => {
            let user = accounts::get_user_by_auth_id(&state.pool, &result.auth_user_id).await?;
            Ok(Json(AppleSignInOutcome::Authenticated {
                session: AuthenticatedSession {
                    token: result.token,
                    user,
                },
            }))
        }
        AppleSignInDecision::RegistrationRequired(pending) => {
            let apple_email = pending
                .identity
                .email
                .clone()
                .ok_or_else(|| AppError::Authentication("Apple email is missing".to_owned()))?;
            let suggested_display_name = pending.display_name.clone();
            let pending_token = store_pending_apple_sign_in(&state.pool, pending).await?;
            Ok(Json(AppleSignInOutcome::RegistrationRequired {
                pending_token,
                apple_email,
                suggested_display_name,
            }))
        }
    }
}

pub(crate) async fn create_apple_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PendingAppleSignInRequest>,
) -> Result<Json<AuthenticatedSession>, AppError> {
    let client_ip = forwarded_client_ip(&headers);
    enforce_apple_rate_limit(&state.auth, APPLE_SIGN_IN_PATH, client_ip.as_deref()).await?;
    let pending = load_pending_apple_sign_in(&state.pool, &payload.pending_token).await?;
    let result = state
        .auth
        .complete_apple_registration(pending, client_ip.as_deref())
        .await
        .map_err(map_auth_service_error)?;
    consume_pending_apple_sign_in(&state.pool, &payload.pending_token).await?;
    let user = accounts::get_user_by_auth_id(&state.pool, &result.auth_user_id).await?;
    Ok(Json(AuthenticatedSession {
        token: result.token,
        user,
    }))
}

pub(crate) async fn link_apple_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(payload): Json<PendingAppleSignInRequest>,
) -> Result<Json<StatusResponse>, AppError> {
    let client_ip = forwarded_client_ip(&headers);
    enforce_apple_rate_limit(&state.auth, APPLE_SIGN_IN_PATH, client_ip.as_deref()).await?;
    state
        .auth
        .domain_user_id_for_bearer(authorization_header(&headers))
        .await
        .map_err(map_auth_service_error)?;
    let pending = load_pending_apple_sign_in(&state.pool, &payload.pending_token).await?;
    state
        .auth
        .link_apple_account(authorization_header(&headers), pending)
        .await
        .map_err(map_auth_service_error)?;
    consume_pending_apple_sign_in(&state.pool, &payload.pending_token).await?;
    Ok(Json(StatusResponse { success: true }))
}

pub(crate) async fn start_google_oauth(
    State(state): State<AppState>,
    headers: HeaderMap,
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
        forwarded_client_ip(&headers).as_deref(),
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
    headers: HeaderMap,
    Query(query): Query<GoogleOAuthCallback>,
) -> Response {
    match complete_google_oauth_callback(&state, query, forwarded_client_ip(&headers)).await {
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
    client_ip: Option<String>,
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
        client_ip.as_deref(),
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
    client_ip: Option<&str>,
) -> Result<Value, AppError> {
    let request = AuthService::request(
        method,
        path,
        Some(
            serde_json::to_vec(&body)
                .map_err(|error| AppError::Authentication(error.to_string()))?,
        ),
        authorization,
        client_ip,
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

fn validate_apple_sign_in(payload: &AppleSignIn) -> Result<(), AppError> {
    if payload.identity_token.is_empty() || payload.identity_token.len() > 16_384 {
        return Err(AppError::BadRequest(
            "Apple identity token is invalid".to_owned(),
        ));
    }
    if payload.authorization_code.is_empty() || payload.authorization_code.len() > 4096 {
        return Err(AppError::BadRequest(
            "Apple authorization code is invalid".to_owned(),
        ));
    }
    if payload.nonce.len() != 43
        || !payload
            .nonce
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
    {
        return Err(AppError::BadRequest(
            "Apple sign-in nonce is invalid".to_owned(),
        ));
    }
    Ok(())
}

fn reconcile_apple_identities(
    presented: VerifiedAppleIdentity,
    exchanged: VerifiedAppleIdentity,
) -> Result<VerifiedAppleIdentity, AppError> {
    if presented.subject != exchanged.subject {
        return Err(AppError::Unauthorized);
    }
    let (email, email_verified) = match (presented.email, exchanged.email) {
        (Some(presented_email), Some(exchanged_email)) => {
            if presented_email != exchanged_email {
                return Err(AppError::Unauthorized);
            }
            (
                Some(presented_email),
                presented.email_verified && exchanged.email_verified,
            )
        }
        (Some(email), None) => (Some(email), presented.email_verified),
        (None, Some(email)) => (Some(email), exchanged.email_verified),
        (None, None) => (None, false),
    };

    Ok(VerifiedAppleIdentity {
        subject: presented.subject,
        email,
        email_verified,
    })
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

/// The Caddy-appended client address, used to key Better Auth rate limiting.
fn forwarded_client_ip(headers: &HeaderMap) -> Option<String> {
    AuthService::trusted_client_ip(
        headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok()),
    )
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

fn map_auth_service_error(error: better_auth::AuthError) -> AppError {
    match error.status_code() {
        400 => AppError::BadRequest(error.to_string()),
        401 | 403 | 404 => AppError::Unauthorized,
        409 => AppError::Conflict("Apple account is already linked".to_owned()),
        429 => AppError::TooManyRequests,
        _ => AppError::Authentication(error.to_string()),
    }
}

fn map_apple_auth_error(error: AppleAuthError) -> AppError {
    match error {
        AppleAuthError::InvalidCredential(_) => AppError::Unauthorized,
        AppleAuthError::Configuration(message) => AppError::Authentication(message),
        AppleAuthError::Upstream(message) => AppError::ExternalService(message),
    }
}

async fn enforce_apple_rate_limit(
    auth: &AuthService,
    path: &str,
    client_ip: Option<&str>,
) -> Result<(), AppError> {
    if auth
        .apple_rate_limited(path, client_ip)
        .await
        .map_err(auth_internal_error)?
    {
        return Err(AppError::TooManyRequests);
    }
    Ok(())
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

async fn cleanup_expired_apple_challenges(pool: &sqlx::PgPool) -> Result<(), AppError> {
    sqlx::query("DELETE FROM auth_apple_challenges WHERE expires_at <= now()")
        .execute(pool)
        .await?;
    sqlx::query("DELETE FROM auth_apple_pending_sign_ins WHERE expires_at <= now()")
        .execute(pool)
        .await?;
    Ok(())
}

async fn store_pending_apple_sign_in(
    pool: &sqlx::PgPool,
    pending: PendingAppleSignIn,
) -> Result<String, AppError> {
    let email = pending
        .identity
        .email
        .ok_or_else(|| AppError::Authentication("Apple email is missing".to_owned()))?;
    let access_token = pending.tokens.access_token.ok_or_else(|| {
        AppError::Authentication("Encrypted Apple access token is missing".to_owned())
    })?;
    let id_token = pending.tokens.id_token.ok_or_else(|| {
        AppError::Authentication("Encrypted Apple identity token is missing".to_owned())
    })?;
    let mut token_bytes = [0_u8; APPLE_PENDING_TOKEN_BYTES];
    OsRng.fill_bytes(&mut token_bytes);
    let token = URL_SAFE_NO_PAD.encode(token_bytes);
    sqlx::query(
        r#"
        INSERT INTO auth_apple_pending_sign_ins (
            token_hash,
            apple_subject,
            email,
            display_name,
            access_token,
            refresh_token,
            id_token,
            access_token_expires_at,
            expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now() + make_interval(mins => $9))
        ON CONFLICT (apple_subject) DO UPDATE SET
            token_hash = EXCLUDED.token_hash,
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            access_token = EXCLUDED.access_token,
            refresh_token = EXCLUDED.refresh_token,
            id_token = EXCLUDED.id_token,
            access_token_expires_at = EXCLUDED.access_token_expires_at,
            expires_at = EXCLUDED.expires_at,
            created_at = now()
        "#,
    )
    .bind(sha256_bytes(&token))
    .bind(pending.identity.subject)
    .bind(email)
    .bind(pending.display_name)
    .bind(access_token)
    .bind(pending.tokens.refresh_token)
    .bind(id_token)
    .bind(pending.tokens.access_token_expires_at)
    .bind(APPLE_PENDING_TTL_MINUTES)
    .execute(pool)
    .await?;
    Ok(token)
}

async fn load_pending_apple_sign_in(
    pool: &sqlx::PgPool,
    token: &str,
) -> Result<PendingAppleSignIn, AppError> {
    if token.is_empty() || token.len() > 512 {
        return Err(AppError::Unauthorized);
    }
    let row = sqlx::query_as::<_, PendingAppleSignInRow>(
        r#"
        SELECT
            apple_subject,
            email,
            display_name,
            access_token,
            refresh_token,
            id_token,
            access_token_expires_at
        FROM auth_apple_pending_sign_ins
        WHERE token_hash = $1 AND expires_at > now()
        "#,
    )
    .bind(sha256_bytes(token))
    .fetch_optional(pool)
    .await?
    .ok_or(AppError::Unauthorized)?;
    Ok(pending_apple_sign_in_from_row(row))
}

async fn consume_pending_apple_sign_in(pool: &sqlx::PgPool, token: &str) -> Result<(), AppError> {
    if token.is_empty() || token.len() > 512 {
        return Err(AppError::Unauthorized);
    }
    let consumed = sqlx::query_scalar::<_, Vec<u8>>(
        r#"
        DELETE FROM auth_apple_pending_sign_ins
        WHERE token_hash = $1 AND expires_at > now()
        RETURNING token_hash
        "#,
    )
    .bind(sha256_bytes(token))
    .fetch_optional(pool)
    .await?;
    if consumed.is_none() {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

fn pending_apple_sign_in_from_row(row: PendingAppleSignInRow) -> PendingAppleSignIn {
    PendingAppleSignIn {
        identity: VerifiedAppleIdentity {
            subject: row.apple_subject,
            email: Some(row.email),
            email_verified: true,
        },
        display_name: row.display_name,
        tokens: StoredAppleTokens {
            access_token: Some(row.access_token),
            refresh_token: row.refresh_token,
            id_token: Some(row.id_token),
            access_token_expires_at: row.access_token_expires_at,
        },
    }
}

async fn consume_apple_challenge(pool: &sqlx::PgPool, nonce_hash: &[u8]) -> Result<bool, AppError> {
    Ok(sqlx::query_scalar::<_, Vec<u8>>(
        r#"
        DELETE FROM auth_apple_challenges
        WHERE nonce_hash = $1 AND expires_at > now()
        RETURNING nonce_hash
        "#,
    )
    .bind(nonce_hash)
    .fetch_optional(pool)
    .await?
    .is_some())
}

#[cfg(test)]
mod tests {
    use axum::http::{Method, StatusCode};
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    use serde_json::json;
    use sha2::{Digest, Sha256};
    use uuid::Uuid;

    use crate::{
        apple_auth::{AppleTokenSet, VerifiedAppleIdentity},
        auth_service::AppleSignInDecision,
        controller::test_support::{TestApi, response_uuid},
    };

    use super::{
        EMAIL_VERIFICATION_TTL_MINUTES, EmailTokenPurpose, consume_apple_challenge,
        issue_email_token, secure_verified_google_identity, sha256_bytes,
        store_pending_apple_sign_in, verify_email_token,
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
    async fn apple_sign_in_creates_and_restores_a_revocable_session() {
        let api = TestApi::new().await;
        let subject = format!("apple-{}", Uuid::new_v4());
        let email = format!("relay-{}@privaterelay.appleid.com", Uuid::new_v4());
        let first = api
            .sign_in_with_apple(
                apple_identity(&subject, Some(&email)),
                apple_tokens(Some("apple-refresh-token")),
                Some("Apple Player"),
            )
            .await;
        let user_id = api.domain_user_id_for_token(&first.token).await;
        let stored_refresh = sqlx::query_scalar::<_, String>(
            "SELECT refresh_token FROM accounts WHERE provider_id = 'apple' AND account_id = $1",
        )
        .bind(&subject)
        .fetch_one(&api.pool)
        .await
        .expect("load encrypted Apple refresh token");
        assert_ne!(stored_refresh, "apple-refresh-token");

        let returning = api
            .sign_in_with_apple(apple_identity(&subject, None), apple_tokens(None), None)
            .await;
        assert_eq!(
            api.domain_user_id_for_token(&returning.token).await,
            user_id
        );
        let retained_refresh = sqlx::query_scalar::<_, String>(
            "SELECT refresh_token FROM accounts WHERE provider_id = 'apple' AND account_id = $1",
        )
        .bind(&subject)
        .fetch_one(&api.pool)
        .await
        .expect("reload encrypted Apple refresh token");
        assert_eq!(retained_refresh, stored_refresh);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn unknown_apple_identity_requires_explicit_account_creation() {
        let api = TestApi::new().await;
        let subject = format!("apple-pending-{}", Uuid::new_v4());
        let email = format!("apple-pending-{}@example.test", Uuid::new_v4());
        let pending = match api
            .begin_apple_sign_in(
                apple_identity(&subject, Some(&email)),
                apple_tokens(Some("pending-refresh-token")),
                Some("Pending Player"),
            )
            .await
        {
            AppleSignInDecision::RegistrationRequired(pending) => pending,
            AppleSignInDecision::Authenticated(_) => {
                panic!("unknown Apple identity must not create an account")
            }
        };
        let user_count =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = $1")
                .bind(&email)
                .fetch_one(&api.pool)
                .await
                .expect("count users before explicit Apple registration");
        assert_eq!(user_count, 0);
        let pending_token = store_pending_apple_sign_in(&api.pool, pending)
            .await
            .expect("store pending Apple registration");

        let created = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/create",
                None,
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let user_id = response_uuid(&created.body["user"], "id");

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn authenticated_user_can_link_pending_apple_identity_once() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("apple-link-existing").await;
        let (auth_user_id, email) = sqlx::query_as::<_, (String, String)>(
            "SELECT auth_user_id, email FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&api.pool)
        .await
        .expect("load existing user");
        let subject = format!("apple-explicit-link-{}", Uuid::new_v4());
        let pending = match api
            .begin_apple_sign_in(
                apple_identity(&subject, Some(&format!("different-{email}"))),
                apple_tokens(Some("explicit-link-refresh")),
                Some("Different Apple Email"),
            )
            .await
        {
            AppleSignInDecision::RegistrationRequired(pending) => pending,
            AppleSignInDecision::Authenticated(_) => {
                panic!("different email must require a choice")
            }
        };
        let pending_token = store_pending_apple_sign_in(&api.pool, pending)
            .await
            .expect("store pending Apple link");

        let unauthenticated = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/link",
                None,
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(
            unauthenticated.status,
            StatusCode::UNAUTHORIZED,
            "{}",
            unauthenticated.body
        );

        let linked = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/link",
                Some(user_id),
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(linked.status, StatusCode::OK, "{}", linked.body);
        let linked_user = sqlx::query_scalar::<_, String>(
            "SELECT user_id FROM accounts WHERE provider_id = 'apple' AND account_id = $1",
        )
        .bind(&subject)
        .fetch_one(&api.pool)
        .await
        .expect("load explicitly linked Apple account");
        assert_eq!(linked_user, auth_user_id);

        let replay = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/link",
                Some(user_id),
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(replay.status, StatusCode::UNAUTHORIZED, "{}", replay.body);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn failed_apple_create_preserves_pending_token_for_retry() {
        let api = TestApi::new().await;
        let subject = format!("apple-retry-create-{}", Uuid::new_v4());
        let email = format!("apple-retry-create-{}@example.test", Uuid::new_v4());
        let pending = match api
            .begin_apple_sign_in(
                apple_identity(&subject, Some(&email)),
                apple_tokens(Some("retry-create-refresh")),
                Some("Retry Create Player"),
            )
            .await
        {
            AppleSignInDecision::RegistrationRequired(pending) => pending,
            AppleSignInDecision::Authenticated(_) => panic!("expected pending registration"),
        };
        let pending_token = store_pending_apple_sign_in(&api.pool, pending)
            .await
            .expect("store pending Apple registration");
        api.insert_user_with_email("conflict", &email).await;

        let failed = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/create",
                None,
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(failed.status, StatusCode::BAD_REQUEST, "{}", failed.body);
        let pending_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth_apple_pending_sign_ins WHERE apple_subject = $1",
        )
        .bind(&subject)
        .fetch_one(&api.pool)
        .await
        .expect("count pending Apple registration");
        assert_eq!(pending_count, 1);

        sqlx::query("DELETE FROM users WHERE email = $1")
            .bind(&email)
            .execute(&api.pool)
            .await
            .expect("remove conflicting user");

        let created = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/create",
                None,
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let user_id = response_uuid(&created.body["user"], "id");
        let pending_after_success = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth_apple_pending_sign_ins WHERE apple_subject = $1",
        )
        .bind(&subject)
        .fetch_one(&api.pool)
        .await
        .expect("count pending after successful create");
        assert_eq!(pending_after_success, 0);

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn failed_apple_link_without_auth_preserves_pending_token() {
        let api = TestApi::new().await;
        let subject = format!("apple-retry-link-{}", Uuid::new_v4());
        let email = format!("apple-retry-link-{}@example.test", Uuid::new_v4());
        let pending = match api
            .begin_apple_sign_in(
                apple_identity(&subject, Some(&email)),
                apple_tokens(Some("retry-link-refresh")),
                Some("Retry Link Player"),
            )
            .await
        {
            AppleSignInDecision::RegistrationRequired(pending) => pending,
            AppleSignInDecision::Authenticated(_) => panic!("expected pending registration"),
        };
        let pending_token = store_pending_apple_sign_in(&api.pool, pending)
            .await
            .expect("store pending Apple link");

        let failed = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/link",
                None,
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(failed.status, StatusCode::UNAUTHORIZED, "{}", failed.body);
        let pending_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth_apple_pending_sign_ins WHERE apple_subject = $1",
        )
        .bind(&subject)
        .fetch_one(&api.pool)
        .await
        .expect("count pending Apple link after failed auth");
        assert_eq!(pending_count, 1);

        sqlx::query("DELETE FROM auth_apple_pending_sign_ins WHERE apple_subject = $1")
            .bind(&subject)
            .execute(&api.pool)
            .await
            .expect("clean up pending Apple link");
    }

    #[tokio::test]
    async fn apple_create_truncates_oversized_display_name() {
        let api = TestApi::new().await;
        let subject = format!("apple-long-name-{}", Uuid::new_v4());
        let email = format!("apple-long-name-{}@example.test", Uuid::new_v4());
        let long_name = "N".repeat(150);
        let pending = match api
            .begin_apple_sign_in(
                apple_identity(&subject, Some(&email)),
                apple_tokens(Some("long-name-refresh")),
                Some(&long_name),
            )
            .await
        {
            AppleSignInDecision::RegistrationRequired(pending) => pending,
            AppleSignInDecision::Authenticated(_) => panic!("expected pending registration"),
        };
        assert_eq!(
            pending
                .display_name
                .as_ref()
                .map(|name| name.chars().count()),
            Some(100)
        );
        let pending_token = store_pending_apple_sign_in(&api.pool, pending)
            .await
            .expect("store pending Apple registration");

        let created = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/create",
                None,
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(created.status, StatusCode::OK, "{}", created.body);
        let user_id = response_uuid(&created.body["user"], "id");
        let display_name =
            sqlx::query_scalar::<_, String>("SELECT display_name FROM users WHERE id = $1")
                .bind(user_id)
                .fetch_one(&api.pool)
                .await
                .expect("load created Apple display name");
        assert_eq!(display_name.chars().count(), 100);
        assert_eq!(display_name, "N".repeat(100));

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn failed_apple_link_when_account_already_has_apple_preserves_pending_token() {
        let api = TestApi::new().await;
        let user_id = api.insert_user("apple-already-linked").await;
        let existing_subject = format!("apple-existing-{}", Uuid::new_v4());
        let email = sqlx::query_scalar::<_, String>("SELECT email FROM users WHERE id = $1")
            .bind(user_id)
            .fetch_one(&api.pool)
            .await
            .expect("existing user email");
        api.sign_in_with_apple(
            apple_identity(&existing_subject, Some(&email)),
            apple_tokens(Some("existing-apple-refresh")),
            Some("Existing Apple"),
        )
        .await;

        let new_subject = format!("apple-new-{}", Uuid::new_v4());
        let new_email = format!("apple-new-{}@example.test", Uuid::new_v4());
        let pending = match api
            .begin_apple_sign_in(
                apple_identity(&new_subject, Some(&new_email)),
                apple_tokens(Some("new-apple-refresh")),
                Some("New Apple"),
            )
            .await
        {
            AppleSignInDecision::RegistrationRequired(pending) => pending,
            AppleSignInDecision::Authenticated(_) => panic!("expected pending registration"),
        };
        let pending_token = store_pending_apple_sign_in(&api.pool, pending)
            .await
            .expect("store pending Apple link attempt");

        let failed = api
            .json(
                Method::POST,
                "/api/auth/oauth/apple/link",
                Some(user_id),
                Some(json!({ "pending_token": pending_token })),
            )
            .await;
        assert_eq!(failed.status, StatusCode::BAD_REQUEST, "{}", failed.body);
        let pending_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM auth_apple_pending_sign_ins WHERE apple_subject = $1",
        )
        .bind(&new_subject)
        .fetch_one(&api.pool)
        .await
        .expect("count pending after failed link");
        assert_eq!(pending_count, 1);

        sqlx::query("DELETE FROM auth_apple_pending_sign_ins WHERE apple_subject = $1")
            .bind(&new_subject)
            .execute(&api.pool)
            .await
            .expect("clean up pending Apple link");
        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn verified_apple_email_links_existing_user_and_removes_unverified_password_claim() {
        let api = TestApi::new().await;
        let email = format!("apple-link-{}@example.test", Uuid::new_v4());
        let signup = api
            .json(
                Method::POST,
                "/api/auth/sign-up/email",
                None,
                Some(json!({
                    "email": email,
                    "password": "a-good-test-password",
                    "display_name": "Original Player",
                    "city": "Oakland",
                    "skill_level": "intermediate",
                    "bio": null
                })),
            )
            .await;
        assert_eq!(signup.status, StatusCode::OK, "{}", signup.body);
        let (user_id, auth_user_id) = user_ids_for_email(&api, &email).await;
        let old_session = api.issue_session_for_auth_user(&auth_user_id).await;
        let subject = format!("apple-{}", Uuid::new_v4());

        let apple = api
            .sign_in_with_apple(
                apple_identity(&subject, Some(&email.to_ascii_uppercase())),
                apple_tokens(Some("linked-refresh-token")),
                Some("Should Not Overwrite"),
            )
            .await;
        assert_eq!(api.domain_user_id_for_token(&apple.token).await, user_id);
        let credential_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM accounts WHERE user_id = $1 AND provider_id = 'credential'",
        )
        .bind(&auth_user_id)
        .fetch_one(&api.pool)
        .await
        .expect("count credential accounts");
        assert_eq!(credential_count, 0);
        let old_session_count =
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sessions WHERE token = $1")
                .bind(old_session)
                .fetch_one(&api.pool)
                .await
                .expect("count revoked sessions");
        assert_eq!(old_session_count, 0);
        let profile = sqlx::query_as::<_, (String, bool)>(
            "SELECT display_name, email_verified FROM users WHERE id = $1",
        )
        .bind(user_id)
        .fetch_one(&api.pool)
        .await
        .expect("load linked Apple profile");
        assert_eq!(profile, ("Original Player".to_owned(), true));

        api.cleanup_users(&[user_id]).await;
    }

    #[tokio::test]
    async fn apple_private_relay_does_not_guess_link_a_different_email() {
        let api = TestApi::new().await;
        let existing_user_id = api.insert_user("apple-real-email").await;
        let relay_email = format!("relay-{}@privaterelay.appleid.com", Uuid::new_v4());
        let apple = api
            .sign_in_with_apple(
                apple_identity(&format!("apple-{}", Uuid::new_v4()), Some(&relay_email)),
                apple_tokens(Some("relay-refresh-token")),
                Some("Relay Player"),
            )
            .await;
        let apple_user_id = api.domain_user_id_for_token(&apple.token).await;

        assert_ne!(apple_user_id, existing_user_id);
        api.cleanup_users(&[existing_user_id, apple_user_id]).await;
    }

    #[tokio::test]
    async fn apple_challenge_can_only_be_consumed_once() {
        let api = TestApi::new().await;
        let nonce_hash = sha256_bytes("one-use-apple-nonce");
        sqlx::query(
            "INSERT INTO auth_apple_challenges (nonce_hash, expires_at) VALUES ($1, now() + interval '5 minutes')",
        )
        .bind(&nonce_hash)
        .execute(&api.pool)
        .await
        .expect("insert Apple challenge");

        assert!(
            consume_apple_challenge(&api.pool, &nonce_hash)
                .await
                .unwrap()
        );
        assert!(
            !consume_apple_challenge(&api.pool, &nonce_hash)
                .await
                .unwrap()
        );
    }

    fn apple_identity(subject: &str, email: Option<&str>) -> VerifiedAppleIdentity {
        VerifiedAppleIdentity {
            subject: subject.to_owned(),
            email: email.map(|value| value.trim().to_ascii_lowercase()),
            email_verified: email.is_some(),
        }
    }

    fn apple_tokens(refresh_token: Option<&str>) -> AppleTokenSet {
        AppleTokenSet {
            access_token: format!("apple-access-{}", Uuid::new_v4()),
            refresh_token: refresh_token.map(str::to_owned),
            id_token: format!("apple-id-{}", Uuid::new_v4()),
            expires_in_seconds: 3600,
        }
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
