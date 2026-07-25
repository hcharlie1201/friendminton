use std::sync::Arc;

use better_auth::{
    AuthBuilder, AuthConfig, AuthError, AuthRequest, AuthResponse, AuthResult, BetterAuth,
    HttpMethod,
    adapters::SqlxAdapter,
    plugins::{
        AccountManagementPlugin, EmailPasswordPlugin, OAuthPlugin, SessionManagementPlugin,
        oauth::{OAuthProvider, OAuthUserInfo},
    },
};
use better_auth_core::{AccountConfig, AccountLinkingConfig, AuthSession, AuthUser, UserOps};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{Pool, Postgres};
use uuid::Uuid;

use crate::config::AuthenticationConfig;

const AUTH_BASE_PATH: &str = "/api/auth";
const GOOGLE_PROVIDER_ID: &str = "google";

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

        let database = AuthDatabase::from_pool(pool);
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
            public_base_url: public_base_url.into(),
            mobile_callback_url: config.mobile_callback_url.clone().into(),
            google_enabled,
        })
    }

    pub(crate) async fn handle_request(&self, request: AuthRequest) -> AuthResult<AuthResponse> {
        self.auth.handle_request(request).await
    }

    pub(crate) fn request(
        method: HttpMethod,
        path: impl Into<String>,
        body: Option<Vec<u8>>,
        authorization: Option<&str>,
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
        request
    }

    pub(crate) async fn domain_user_id_for_bearer(
        &self,
        authorization: Option<&str>,
    ) -> AuthResult<Uuid> {
        let token = Self::bearer_token(authorization)?;
        self.domain_user_id_for_token(token).await
    }

    pub(crate) async fn domain_user_id_for_token(&self, token: &str) -> AuthResult<Uuid> {
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

        Ok(user.product_user_id())
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

    use super::{AuthService, map_verified_google_user_info};

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
