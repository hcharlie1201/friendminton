use std::net::IpAddr;
use std::sync::Arc;

use better_auth::{
    AuthBuilder, AuthConfig, AuthError, AuthRequest, AuthResponse, AuthResult, BetterAuth,
    HttpMethod,
    adapters::SqlxAdapter,
    plugins::{
        AccountManagementPlugin, EmailPasswordPlugin, OAuthPlugin, SessionManagementPlugin,
        oauth::{OAuthProvider, OAuthUserInfo, encryption::maybe_encrypt},
    },
};
use better_auth_core::{
    AccountConfig, AccountLinkingConfig, AccountOps, AuthAccount, AuthSession, AuthUser,
    CreateAccount, CreateUser, Middleware, RateLimitConfig, RateLimitMiddleware, UpdateAccount,
    UserOps,
};
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{Pool, Postgres};
use uuid::Uuid;

use crate::{
    apple_auth::{AppleTokenSet, VerifiedAppleIdentity},
    config::AuthenticationConfig,
};

const AUTH_BASE_PATH: &str = "/api/auth";
const GOOGLE_PROVIDER_ID: &str = "google";
const APPLE_PROVIDER_ID: &str = "apple";

pub(crate) struct AppleSignInResult {
    pub token: String,
    pub auth_user_id: String,
}

pub(crate) enum AppleSignInDecision {
    Authenticated(AppleSignInResult),
    RegistrationRequired(PendingAppleSignIn),
}

pub(crate) struct PendingAppleSignIn {
    pub identity: VerifiedAppleIdentity,
    pub display_name: Option<String>,
    pub tokens: StoredAppleTokens,
}

pub(crate) struct StoredAppleTokens {
    pub access_token: Option<String>,
    pub refresh_token: Option<String>,
    pub id_token: Option<String>,
    pub access_token_expires_at: Option<DateTime<Utc>>,
}

/// Better Auth's view of a Friendminton user.
///
/// Better Auth owns the string `auth_user_id`, while `product_user_id` remains
/// the stable UUID referenced by the rest of Friendminton's schema.
#[derive(Clone, Debug, Serialize, AuthUser)]
#[auth(from_row, table = "users")]
pub(crate) struct AuthUserRow {
    #[auth(field = "id", column = "auth_user_id")]
    #[serde(rename = "id")]
    auth_user_id: String,
    email: Option<String>,
    #[auth(field = "name", column = "display_name")]
    #[serde(rename = "name")]
    display_name: Option<String>,
    #[serde(rename = "emailVerified")]
    email_verified: bool,
    image: Option<String>,
    #[serde(rename = "createdAt")]
    created_at: DateTime<Utc>,
    #[serde(rename = "updatedAt")]
    updated_at: DateTime<Utc>,
    username: Option<String>,
    #[serde(rename = "displayUsername")]
    display_username: Option<String>,
    #[serde(rename = "twoFactorEnabled")]
    two_factor_enabled: bool,
    role: Option<String>,
    banned: bool,
    #[serde(rename = "banReason")]
    ban_reason: Option<String>,
    #[serde(rename = "banExpires")]
    ban_expires: Option<DateTime<Utc>>,
    #[auth(json)]
    #[serde(skip_serializing)]
    metadata: Value,
    #[auth(column = "id")]
    #[serde(skip_serializing)]
    product_user_id: Uuid,
}

impl AuthUserRow {
    pub(crate) fn product_user_id(&self) -> Uuid {
        self.product_user_id
    }
}

pub(crate) type AuthDatabase = SqlxAdapter<AuthUserRow>;

/// Cloneable application wrapper around Better Auth.
#[derive(Clone)]
pub(crate) struct AuthService {
    auth: Arc<BetterAuth<AuthDatabase>>,
    pool: Pool<Postgres>,
    secret: Arc<str>,
    apple_rate_limiter: Arc<RateLimitMiddleware>,
    public_base_url: Arc<str>,
    mobile_callback_url: Arc<str>,
    google_enabled: bool,
}

impl AuthService {
    pub(crate) async fn new(
        pool: Pool<Postgres>,
        public_base_url: &str,
        config: &AuthenticationConfig,
    ) -> AuthResult<Self> {
        let public_base_url = public_base_url.trim_end_matches('/');
        let auth_base_url = format!("{public_base_url}{AUTH_BASE_PATH}");

        let account = AccountConfig {
            update_account_on_sign_in: true,
            account_linking: AccountLinkingConfig {
                enabled: true,
                trusted_providers: vec![GOOGLE_PROVIDER_ID.to_owned()],
                allow_different_emails: false,
                allow_unlinking_all: false,
                update_user_info_on_link: false,
            },
            encrypt_oauth_tokens: true,
        };
        let auth_config = AuthConfig::new(&config.secret)
            .app_name("Friendminton")
            .base_url(&auth_base_url)
            .base_path(AUTH_BASE_PATH)
            .account(account)
            .password_min_length(8);

        let database = AuthDatabase::from_pool(pool.clone());
        let mut builder = AuthBuilder::new(auth_config)
            .database(database)
            // Friendminton issues no session until its own hashed email token
            // flow has verified ownership. Better Auth 0.10's verification
            // flags do not enforce this themselves.
            .plugin(
                EmailPasswordPlugin::new()
                    .enable_signup(true)
                    .auto_sign_in(false)
                    .require_email_verification(true),
            )
            .plugin(SessionManagementPlugin::new())
            .plugin(AccountManagementPlugin::new());

        let google_enabled = match (
            config.google_oauth_client_id.as_deref(),
            config.google_oauth_client_secret.as_deref(),
        ) {
            (Some(client_id), Some(client_secret)) => {
                let mut google = OAuthProvider::google(client_id, client_secret);
                google.map_user_info = map_verified_google_user_info;
                builder =
                    builder.plugin(OAuthPlugin::new().add_provider(GOOGLE_PROVIDER_ID, google));
                true
            }
            (None, None) => false,
            _ => {
                return Err(AuthError::config(
                    "Google OAuth client ID and client secret must be configured together",
                ));
            }
        };

        let auth = Arc::new(builder.build().await?);

        Ok(Self {
            auth,
            pool,
            secret: config.secret.clone().into(),
            apple_rate_limiter: Arc::new(RateLimitMiddleware::new(RateLimitConfig::default())),
            public_base_url: public_base_url.into(),
            mobile_callback_url: config.mobile_callback_url.clone().into(),
            google_enabled,
        })
    }

    pub(crate) async fn handle_request(&self, request: AuthRequest) -> AuthResult<AuthResponse> {
        self.auth.handle_request(request).await
    }

    pub(crate) async fn apple_rate_limited(
        &self,
        path: &str,
        client_ip: Option<&str>,
    ) -> AuthResult<bool> {
        let request = Self::request(HttpMethod::Post, path, None, None, client_ip);
        Ok(self
            .apple_rate_limiter
            .before_request(&request)
            .await?
            .is_some())
    }

    pub(crate) async fn begin_apple_sign_in(
        &self,
        identity: VerifiedAppleIdentity,
        tokens: AppleTokenSet,
        display_name: Option<&str>,
        client_ip: Option<&str>,
    ) -> AuthResult<AppleSignInDecision> {
        let tokens = self.encrypt_apple_tokens(tokens)?;
        let database = self.auth.database();
        if let Some(account) = database
            .get_account(APPLE_PROVIDER_ID, &identity.subject)
            .await?
        {
            let user = self
                .refresh_apple_account(account.id(), account.user_id(), tokens)
                .await?;
            return self
                .create_apple_session(user, client_ip)
                .await
                .map(AppleSignInDecision::Authenticated);
        }

        let email = verified_apple_email(&identity)?;
        if let Some(user) = database.get_user_by_email(email).await? {
            self.attach_apple_account(&user, identity.subject, tokens)
                .await?;
            return self
                .create_apple_session(user, client_ip)
                .await
                .map(AppleSignInDecision::Authenticated);
        }

        Ok(AppleSignInDecision::RegistrationRequired(
            PendingAppleSignIn {
                identity,
                display_name: normalized_display_name(display_name),
                tokens,
            },
        ))
    }

    pub(crate) async fn complete_apple_registration(
        &self,
        pending: PendingAppleSignIn,
        client_ip: Option<&str>,
    ) -> AuthResult<AppleSignInResult> {
        let email = verified_apple_email(&pending.identity)?;
        if self
            .auth
            .database()
            .get_user_by_email(email)
            .await?
            .is_some()
        {
            return Err(AuthError::bad_request(
                "An account already uses this email; sign in to link Apple",
            ));
        }
        let name = normalized_display_name(pending.display_name.as_deref())
            .unwrap_or_else(|| email.to_owned());
        let user = self
            .auth
            .database()
            .create_user(
                CreateUser::new()
                    .with_email(email)
                    .with_name(name)
                    .with_email_verified(true),
            )
            .await?;
        self.attach_apple_account(&user, pending.identity.subject, pending.tokens)
            .await?;
        self.create_apple_session(user, client_ip).await
    }

    pub(crate) async fn link_apple_account(
        &self,
        authorization: Option<&str>,
        pending: PendingAppleSignIn,
    ) -> AuthResult<()> {
        let token = Self::bearer_token(authorization)?;
        let user = self.authenticated_user_for_token(token).await?;
        let database = self.auth.database();
        if let Some(account) = database
            .get_account(APPLE_PROVIDER_ID, &pending.identity.subject)
            .await?
        {
            if account.user_id() != user.id() {
                return Err(AuthError::bad_request(
                    "This Apple account is already linked to another account",
                ));
            }
            self.refresh_apple_account(account.id(), account.user_id(), pending.tokens)
                .await?;
            return Ok(());
        }
        if database
            .get_user_accounts(user.id())
            .await?
            .iter()
            .any(|account| account.provider_id() == APPLE_PROVIDER_ID)
        {
            return Err(AuthError::bad_request(
                "This account already has a different Apple account linked",
            ));
        }
        self.attach_apple_account(&user, pending.identity.subject, pending.tokens)
            .await?;
        Ok(())
    }

    async fn create_apple_session(
        &self,
        user: AuthUserRow,
        client_ip: Option<&str>,
    ) -> AuthResult<AppleSignInResult> {
        let user = self.secure_verified_social_user(user).await?;
        let session = self
            .auth
            .session_manager()
            .create_session(&user, client_ip.map(str::to_owned), None)
            .await?;

        Ok(AppleSignInResult {
            token: session.token().to_owned(),
            auth_user_id: user.id().to_owned(),
        })
    }

    fn encrypt_apple_tokens(&self, tokens: AppleTokenSet) -> AuthResult<StoredAppleTokens> {
        Ok(StoredAppleTokens {
            access_token: maybe_encrypt(Some(tokens.access_token), true, &self.secret)?,
            refresh_token: maybe_encrypt(tokens.refresh_token, true, &self.secret)?,
            id_token: maybe_encrypt(Some(tokens.id_token), true, &self.secret)?,
            access_token_expires_at: Some(
                Utc::now() + Duration::seconds(tokens.expires_in_seconds.max(0)),
            ),
        })
    }

    async fn attach_apple_account(
        &self,
        user: &AuthUserRow,
        apple_subject: String,
        tokens: StoredAppleTokens,
    ) -> AuthResult<()> {
        self.auth
            .database()
            .create_account(CreateAccount {
                user_id: user.id().to_owned(),
                account_id: apple_subject,
                provider_id: APPLE_PROVIDER_ID.to_owned(),
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                id_token: tokens.id_token,
                access_token_expires_at: tokens.access_token_expires_at,
                refresh_token_expires_at: None,
                scope: Some("name email".to_owned()),
                password: None,
            })
            .await?;
        Ok(())
    }

    async fn refresh_apple_account(
        &self,
        account_id: &str,
        user_id: &str,
        tokens: StoredAppleTokens,
    ) -> AuthResult<AuthUserRow> {
        let database = self.auth.database();
        database
            .update_account(
                account_id,
                UpdateAccount {
                    access_token: tokens.access_token,
                    refresh_token: tokens.refresh_token,
                    id_token: tokens.id_token,
                    access_token_expires_at: tokens.access_token_expires_at,
                    ..Default::default()
                },
            )
            .await?;
        database
            .get_user_by_id(user_id)
            .await?
            .ok_or(AuthError::UserNotFound)
    }

    async fn secure_verified_social_user(&self, user: AuthUserRow) -> AuthResult<AuthUserRow> {
        if user.email_verified {
            return Ok(user);
        }

        let mut transaction = self.pool.begin().await?;
        sqlx::query("DELETE FROM accounts WHERE user_id = $1 AND provider_id = 'credential'")
            .bind(user.id())
            .execute(&mut *transaction)
            .await?;
        sqlx::query("DELETE FROM sessions WHERE user_id = $1")
            .bind(user.id())
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
        .bind(user.id())
        .execute(&mut *transaction)
        .await?;
        transaction.commit().await?;

        self.auth
            .database()
            .get_user_by_id(user.id())
            .await?
            .ok_or(AuthError::UserNotFound)
    }

    pub(crate) fn request(
        method: HttpMethod,
        path: impl Into<String>,
        body: Option<Vec<u8>>,
        authorization: Option<&str>,
        client_ip: Option<&str>,
    ) -> AuthRequest {
        let mut request = AuthRequest::new(method, path);
        request.body = body;
        if request.body.is_some() {
            request
                .headers
                .insert("content-type".to_owned(), "application/json".to_owned());
        }
        if let Some(authorization) = authorization {
            request
                .headers
                .insert("authorization".to_owned(), authorization.to_owned());
        }
        if let Some(client_ip) = client_ip {
            // Better Auth keys its rate-limit buckets on this header. Without
            // it, every caller shares one global bucket.
            request
                .headers
                .insert("x-forwarded-for".to_owned(), client_ip.to_owned());
        }
        request
    }

    /// Extract the trusted client address from an `X-Forwarded-For` value.
    ///
    /// Caddy is the only public edge and always appends the address of the
    /// peer it accepted the connection from, so the rightmost entry is the
    /// only one a client cannot forge. Entries that do not parse as an IP
    /// address are rejected rather than used as a shared bucket key.
    pub(crate) fn trusted_client_ip(forwarded_for: Option<&str>) -> Option<String> {
        forwarded_for?
            .rsplit(',')
            .next()?
            .trim()
            .parse::<IpAddr>()
            .ok()
            .map(|ip| ip.to_string())
    }

    pub(crate) async fn domain_user_id_for_bearer(
        &self,
        authorization: Option<&str>,
    ) -> AuthResult<Uuid> {
        let token = Self::bearer_token(authorization)?;
        self.domain_user_id_for_token(token).await
    }

    pub(crate) async fn domain_user_id_for_token(&self, token: &str) -> AuthResult<Uuid> {
        Ok(self
            .authenticated_user_for_token(token)
            .await?
            .product_user_id())
    }

    async fn authenticated_user_for_token(&self, token: &str) -> AuthResult<AuthUserRow> {
        if !self.auth.session_manager().validate_token_format(token) {
            return Err(AuthError::Unauthenticated);
        }

        let session = self
            .auth
            .session_manager()
            .get_session(token)
            .await?
            .ok_or(AuthError::SessionNotFound)?;
        let user = self
            .auth
            .database()
            .get_user_by_id(session.user_id())
            .await?
            .ok_or(AuthError::UserNotFound)?;
        if !user.email_verified {
            return Err(AuthError::Unauthenticated);
        }

        Ok(user)
    }

    pub(crate) async fn revoke_session(&self, token: &str) -> AuthResult<bool> {
        if !self.auth.session_manager().validate_token_format(token) {
            return Ok(false);
        }
        self.auth.session_manager().revoke_session(token).await
    }

    pub(crate) fn bearer_token(authorization: Option<&str>) -> AuthResult<&str> {
        let authorization = authorization.ok_or(AuthError::Unauthenticated)?;
        let (scheme, token) = authorization
            .split_once(' ')
            .ok_or(AuthError::Unauthenticated)?;

        if !scheme.eq_ignore_ascii_case("bearer")
            || token.is_empty()
            || token.chars().any(char::is_whitespace)
        {
            return Err(AuthError::Unauthenticated);
        }

        Ok(token)
    }

    pub(crate) fn google_enabled(&self) -> bool {
        self.google_enabled
    }

    pub(crate) fn mobile_callback_url(&self) -> &str {
        &self.mobile_callback_url
    }

    pub(crate) fn public_base_url(&self) -> &str {
        &self.public_base_url
    }

    #[cfg(test)]
    pub(crate) async fn issue_test_session(&self, auth_user_id: &str) -> AuthResult<String> {
        let user = self
            .auth
            .database()
            .get_user_by_id(auth_user_id)
            .await?
            .ok_or(AuthError::UserNotFound)?;
        let session = self
            .auth
            .session_manager()
            .create_session(&user, None, None)
            .await?;

        Ok(session.token().to_owned())
    }
}

fn verified_apple_email(identity: &VerifiedAppleIdentity) -> AuthResult<&str> {
    identity
        .email
        .as_deref()
        .filter(|_| identity.email_verified)
        .ok_or_else(|| {
            AuthError::bad_request(
                "Apple must provide a verified email address when creating an account",
            )
        })
}

const MAX_APPLE_DISPLAY_NAME_CHARS: usize = 100;

fn normalized_display_name(display_name: Option<&str>) -> Option<String> {
    sanitize_apple_display_name(display_name)
}

fn sanitize_apple_display_name(display_name: Option<&str>) -> Option<String> {
    display_name
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(|name| name.chars().take(MAX_APPLE_DISPLAY_NAME_CHARS).collect())
}

fn map_verified_google_user_info(value: Value) -> Result<OAuthUserInfo, String> {
    if value["email_verified"].as_bool() != Some(true) {
        return Err("Google did not verify this account's email address".to_owned());
    }

    let id = value["sub"]
        .as_str()
        .filter(|id| !id.trim().is_empty())
        .ok_or_else(|| "missing Google subject".to_owned())?
        .to_owned();
    let email = value["email"]
        .as_str()
        .map(str::trim)
        .filter(|email| !email.is_empty())
        .ok_or_else(|| "missing Google email".to_owned())?
        .to_ascii_lowercase();

    Ok(OAuthUserInfo {
        id,
        email,
        name: value["name"].as_str().map(str::to_owned),
        image: value["picture"].as_str().map(str::to_owned),
        email_verified: true,
    })
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{AuthService, map_verified_google_user_info, sanitize_apple_display_name};

    #[test]
    fn sanitize_apple_display_name_trims_and_caps_length() {
        assert_eq!(sanitize_apple_display_name(None), None);
        assert_eq!(sanitize_apple_display_name(Some("   ")), None);
        assert_eq!(
            sanitize_apple_display_name(Some("  Apple Player  ")),
            Some("Apple Player".to_owned())
        );
        let long_name = "A".repeat(150);
        let sanitized = sanitize_apple_display_name(Some(&long_name)).expect("sanitized name");
        assert_eq!(sanitized.chars().count(), 100);
        assert_eq!(sanitized, "A".repeat(100));
    }

    #[test]
    fn bearer_token_requires_one_nonempty_bearer_credential() {
        assert_eq!(
            AuthService::bearer_token(Some("Bearer session_abc")).unwrap(),
            "session_abc"
        );
        assert_eq!(
            AuthService::bearer_token(Some("bearer session_abc")).unwrap(),
            "session_abc"
        );
        assert!(AuthService::bearer_token(None).is_err());
        assert!(AuthService::bearer_token(Some("Basic session_abc")).is_err());
        assert!(AuthService::bearer_token(Some("Bearer ")).is_err());
        assert!(AuthService::bearer_token(Some("Bearer one two")).is_err());
    }

    #[test]
    fn trusted_client_ip_uses_only_the_rightmost_valid_address() {
        assert_eq!(
            AuthService::trusted_client_ip(Some("203.0.113.7")),
            Some("203.0.113.7".to_owned())
        );
        // Caddy appends the real peer after any client-supplied entries.
        assert_eq!(
            AuthService::trusted_client_ip(Some("10.0.0.1, 198.51.100.2 , 203.0.113.7")),
            Some("203.0.113.7".to_owned())
        );
        assert_eq!(
            AuthService::trusted_client_ip(Some("2001:db8::1")),
            Some("2001:db8::1".to_owned())
        );
        // A forged, unparsable rightmost entry must not fall back to an
        // earlier client-controlled entry.
        assert_eq!(
            AuthService::trusted_client_ip(Some("198.51.100.2, not-an-ip")),
            None
        );
        assert_eq!(AuthService::trusted_client_ip(Some("")), None);
        assert_eq!(AuthService::trusted_client_ip(None), None);
    }

    #[test]
    fn google_mapping_requires_a_verified_normalized_email() {
        let user = map_verified_google_user_info(json!({
            "sub": "google-user-id",
            "email": "  Player@Example.COM ",
            "email_verified": true,
            "name": "Player"
        }))
        .unwrap();
        assert_eq!(user.email, "player@example.com");
        assert!(user.email_verified);

        let error = map_verified_google_user_info(json!({
            "sub": "google-user-id",
            "email": "player@example.com",
            "email_verified": false
        }))
        .unwrap_err();
        assert!(error.contains("verify"));
    }
}
