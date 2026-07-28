use std::{
    sync::Arc,
    time::{Duration, Instant},
};

use base64::{Engine, engine::general_purpose::STANDARD};
use chrono::Utc;
use jsonwebtoken::{
    Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, decode_header, encode,
};
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

use crate::config::AppleAuthenticationConfig;

const APPLE_ISSUER: &str = "https://appleid.apple.com";
const APPLE_JWKS_URL: &str = "https://appleid.apple.com/auth/keys";
const APPLE_TOKEN_URL: &str = "https://appleid.apple.com/auth/token";
const CLIENT_SECRET_TTL_SECONDS: i64 = 600;
const JWKS_CACHE_TTL: Duration = Duration::from_secs(6 * 60 * 60);

#[derive(Clone)]
pub(crate) struct AppleAuthClient {
    inner: Arc<AppleAuthClientInner>,
}

struct AppleAuthClientInner {
    client: reqwest::Client,
    client_id: String,
    team_id: String,
    key_id: String,
    private_key: EncodingKey,
    jwks: RwLock<Option<CachedJwks>>,
    jwks_url: String,
    token_url: String,
}

struct CachedJwks {
    fetched_at: Instant,
    keys: Vec<AppleJwk>,
}

#[derive(Clone, Debug, Deserialize)]
struct AppleJwks {
    keys: Vec<AppleJwk>,
}

#[derive(Clone, Debug, Deserialize)]
struct AppleJwk {
    kid: String,
    n: String,
    e: String,
}

#[derive(Clone, Debug)]
pub(crate) struct VerifiedAppleIdentity {
    pub subject: String,
    pub email: Option<String>,
    pub email_verified: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct AppleTokenSet {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub id_token: String,
    pub expires_in_seconds: i64,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum AppleAuthError {
    #[error("invalid Apple credential: {0}")]
    InvalidCredential(&'static str),
    #[error("invalid Apple authentication configuration: {0}")]
    Configuration(String),
    #[error("Apple authentication is temporarily unavailable: {0}")]
    Upstream(String),
}

#[derive(Debug, Deserialize)]
struct AppleTokenResponse {
    access_token: String,
    expires_in: i64,
    id_token: String,
    refresh_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct AppleTokenError {
    error: Option<String>,
}

#[derive(Debug, Serialize)]
struct AppleClientSecretClaims<'a> {
    iss: &'a str,
    iat: i64,
    exp: i64,
    aud: &'static str,
    sub: &'a str,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct AppleIdentityClaims {
    iss: String,
    aud: String,
    exp: usize,
    iat: usize,
    sub: String,
    nonce: Option<String>,
    email: Option<String>,
    email_verified: Option<AppleBoolean>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
enum AppleBoolean {
    Boolean(bool),
    String(String),
}

impl AppleBoolean {
    fn is_true(&self) -> bool {
        match self {
            Self::Boolean(value) => *value,
            Self::String(value) => value.eq_ignore_ascii_case("true"),
        }
    }
}

impl AppleAuthClient {
    pub(crate) fn from_config(
        config: Option<&AppleAuthenticationConfig>,
    ) -> Result<Option<Self>, AppleAuthError> {
        let Some(config) = config else {
            return Ok(None);
        };
        let private_key_bytes = STANDARD
            .decode(&config.private_key_base64)
            .map_err(|error| AppleAuthError::Configuration(error.to_string()))?;
        let private_key = EncodingKey::from_ec_pem(&private_key_bytes)
            .map_err(|error| AppleAuthError::Configuration(error.to_string()))?;

        Ok(Some(Self {
            inner: Arc::new(AppleAuthClientInner {
                client: reqwest::Client::new(),
                client_id: config.client_id.clone(),
                team_id: config.team_id.clone(),
                key_id: config.key_id.clone(),
                private_key,
                jwks: RwLock::new(None),
                jwks_url: APPLE_JWKS_URL.to_owned(),
                token_url: APPLE_TOKEN_URL.to_owned(),
            }),
        }))
    }

    pub(crate) async fn verify_identity_token(
        &self,
        token: &str,
        expected_nonce: Option<&str>,
    ) -> Result<VerifiedAppleIdentity, AppleAuthError> {
        let header = decode_header(token)
            .map_err(|_| AppleAuthError::InvalidCredential("identity token header is invalid"))?;
        if header.alg != Algorithm::RS256 {
            return Err(AppleAuthError::InvalidCredential(
                "identity token algorithm is invalid",
            ));
        }
        let kid = header
            .kid
            .as_deref()
            .ok_or(AppleAuthError::InvalidCredential(
                "identity token key ID is missing",
            ))?;
        let key = self.decoding_key(kid).await?;
        decode_identity_token(token, &key, &self.inner.client_id, expected_nonce)
    }

    pub(crate) async fn exchange_authorization_code(
        &self,
        code: &str,
    ) -> Result<AppleTokenSet, AppleAuthError> {
        let client_secret = self.client_secret()?;
        let body = url::form_urlencoded::Serializer::new(String::new())
            .append_pair("client_id", &self.inner.client_id)
            .append_pair("client_secret", &client_secret)
            .append_pair("code", code)
            .append_pair("grant_type", "authorization_code")
            .finish();
        let response = self
            .inner
            .client
            .post(&self.inner.token_url)
            .header("content-type", "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(|error| AppleAuthError::Upstream(error.to_string()))?;
        let status = response.status();
        let body = response
            .bytes()
            .await
            .map_err(|error| AppleAuthError::Upstream(error.to_string()))?;
        if !status.is_success() {
            let provider_error = serde_json::from_slice::<AppleTokenError>(&body)
                .ok()
                .and_then(|response| response.error)
                .unwrap_or_else(|| status.to_string());
            return Err(if status.is_client_error() {
                AppleAuthError::InvalidCredential("authorization code was rejected")
            } else {
                AppleAuthError::Upstream(provider_error)
            });
        }
        let response: AppleTokenResponse = serde_json::from_slice(&body)
            .map_err(|error| AppleAuthError::Upstream(error.to_string()))?;

        Ok(AppleTokenSet {
            access_token: response.access_token,
            refresh_token: response.refresh_token,
            id_token: response.id_token,
            expires_in_seconds: response.expires_in,
        })
    }

    fn client_secret(&self) -> Result<String, AppleAuthError> {
        let now = Utc::now().timestamp();
        let mut header = Header::new(Algorithm::ES256);
        header.kid = Some(self.inner.key_id.clone());
        encode(
            &header,
            &AppleClientSecretClaims {
                iss: &self.inner.team_id,
                iat: now,
                exp: now + CLIENT_SECRET_TTL_SECONDS,
                aud: APPLE_ISSUER,
                sub: &self.inner.client_id,
            },
            &self.inner.private_key,
        )
        .map_err(|error| AppleAuthError::Configuration(error.to_string()))
    }

    async fn decoding_key(&self, kid: &str) -> Result<DecodingKey, AppleAuthError> {
        if let Some(key) = self.cached_key(kid).await {
            return decoding_key_from_jwk(&key);
        }
        self.refresh_jwks().await?;
        let key = self
            .cached_key(kid)
            .await
            .ok_or(AppleAuthError::InvalidCredential(
                "identity token signing key is unknown",
            ))?;
        decoding_key_from_jwk(&key)
    }

    async fn cached_key(&self, kid: &str) -> Option<AppleJwk> {
        let cache = self.inner.jwks.read().await;
        cache.as_ref().and_then(|cache| {
            (cache.fetched_at.elapsed() < JWKS_CACHE_TTL)
                .then(|| cache.keys.iter().find(|key| key.kid == kid).cloned())
                .flatten()
        })
    }

    async fn refresh_jwks(&self) -> Result<(), AppleAuthError> {
        let response = self
            .inner
            .client
            .get(&self.inner.jwks_url)
            .send()
            .await
            .map_err(|error| AppleAuthError::Upstream(error.to_string()))?
            .error_for_status()
            .map_err(|error| AppleAuthError::Upstream(error.to_string()))?
            .json::<AppleJwks>()
            .await
            .map_err(|error| AppleAuthError::Upstream(error.to_string()))?;
        *self.inner.jwks.write().await = Some(CachedJwks {
            fetched_at: Instant::now(),
            keys: response.keys,
        });
        Ok(())
    }
}

fn decoding_key_from_jwk(jwk: &AppleJwk) -> Result<DecodingKey, AppleAuthError> {
    DecodingKey::from_rsa_components(&jwk.n, &jwk.e)
        .map_err(|_| AppleAuthError::InvalidCredential("identity token key is invalid"))
}

fn decode_identity_token(
    token: &str,
    key: &DecodingKey,
    client_id: &str,
    expected_nonce: Option<&str>,
) -> Result<VerifiedAppleIdentity, AppleAuthError> {
    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&[APPLE_ISSUER]);
    validation.set_audience(&[client_id]);
    validation.sub = None;
    let claims = decode::<AppleIdentityClaims>(token, key, &validation)
        .map_err(|_| AppleAuthError::InvalidCredential("identity token validation failed"))?
        .claims;
    if claims.sub.trim().is_empty() {
        return Err(AppleAuthError::InvalidCredential(
            "identity token subject is missing",
        ));
    }
    if let Some(expected_nonce) = expected_nonce
        && claims.nonce.as_deref() != Some(expected_nonce)
    {
        return Err(AppleAuthError::InvalidCredential(
            "identity token nonce does not match",
        ));
    }

    Ok(VerifiedAppleIdentity {
        subject: claims.sub,
        email: claims
            .email
            .map(|email| email.trim().to_ascii_lowercase())
            .filter(|email| !email.is_empty()),
        email_verified: claims.email_verified.is_some_and(|value| value.is_true()),
    })
}

#[cfg(test)]
mod tests {
    use axum::{Json, Router, routing::get};
    use serde_json::json;

    use super::*;

    const CLIENT_ID: &str = "com.hcharlie1201.friendminton";
    const NONCE: &str = "test-nonce";
    const RSA_PRIVATE_KEY: &[u8] = include_bytes!("../tests/fixtures/apple_test_private_rsa.pem");
    const RSA_PUBLIC_KEY: &[u8] = include_bytes!("../tests/fixtures/apple_test_public_rsa.pem");
    const WRONG_RSA_PUBLIC_KEY: &[u8] =
        include_bytes!("../tests/fixtures/apple_wrong_public_rsa.pem");
    const EC_PRIVATE_KEY: &[u8] = include_bytes!("../tests/fixtures/apple_test_private_ec.pem");
    const TEST_RSA_MODULUS: &str = "yRE6rHuNR0QbHO3H3Kt2pOKGVhQqGZXInOduQNxXzuKlvQTLUTv4l4sggh5_CYYi_cvI-SXVT9kPWSKXxJXBXd_4LkvcPuUakBoAkfh-eiFVMh2VrUyWyj3MFl0HTVF9KwRXLAcwkREiS3npThHRyIxuy0ZMeZfxVL5arMhw1SRELB8HoGfG_AtH89BIE9jDBHZ9dLelK9a184zAf8LwoPLxvJb3Il5nncqPcSfKDDodMFBIMc4lQzDKL5gvmiXLXB1AGLm8KBjfE8s3L5xqi-yUod-j8MtvIj812dkS4QMiRVN_by2h3ZY8LYVGrqZXZTcgn2ujn8uKjXLZVD5TdQ";

    #[test]
    fn validates_apple_identity_claims() {
        let token = identity_token(identity_claims());
        let identity = decode_identity_token(
            &token,
            &DecodingKey::from_rsa_pem(RSA_PUBLIC_KEY).unwrap(),
            CLIENT_ID,
            Some(NONCE),
        )
        .unwrap();

        assert_eq!(identity.subject, "apple-user");
        assert_eq!(identity.email.as_deref(), Some("player@example.com"));
        assert!(identity.email_verified);
    }

    #[test]
    fn rejects_wrong_audience_issuer_signature_and_expiry() {
        let key = DecodingKey::from_rsa_pem(RSA_PUBLIC_KEY).unwrap();

        let mut wrong_audience = identity_claims();
        wrong_audience.aud = "another-app".to_owned();
        assert!(
            decode_identity_token(
                &identity_token(wrong_audience),
                &key,
                CLIENT_ID,
                Some(NONCE),
            )
            .is_err()
        );

        let mut wrong_issuer = identity_claims();
        wrong_issuer.iss = "https://example.com".to_owned();
        assert!(
            decode_identity_token(&identity_token(wrong_issuer), &key, CLIENT_ID, Some(NONCE),)
                .is_err()
        );

        let mut expired = identity_claims();
        expired.exp = (Utc::now().timestamp() - 120) as usize;
        assert!(
            decode_identity_token(&identity_token(expired), &key, CLIENT_ID, Some(NONCE),).is_err()
        );

        assert!(
            decode_identity_token(
                &identity_token(identity_claims()),
                &DecodingKey::from_rsa_pem(WRONG_RSA_PUBLIC_KEY).unwrap(),
                CLIENT_ID,
                Some(NONCE),
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_missing_or_incorrect_nonce() {
        let key = DecodingKey::from_rsa_pem(RSA_PUBLIC_KEY).unwrap();
        let mut missing_nonce = identity_claims();
        missing_nonce.nonce = None;
        assert!(
            decode_identity_token(&identity_token(missing_nonce), &key, CLIENT_ID, Some(NONCE),)
                .is_err()
        );
        assert!(
            decode_identity_token(
                &identity_token(identity_claims()),
                &key,
                CLIENT_ID,
                Some("different-nonce"),
            )
            .is_err()
        );
    }

    #[tokio::test]
    async fn refreshes_jwks_when_apple_rotates_to_an_unknown_key() {
        let app = Router::new().route(
            "/keys",
            get(|| async {
                Json(json!({
                    "keys": [{
                        "kid": "new-key",
                        "n": TEST_RSA_MODULUS,
                        "e": "AQAB"
                    }]
                }))
            }),
        );
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        let client = AppleAuthClient {
            inner: Arc::new(AppleAuthClientInner {
                client: reqwest::Client::new(),
                client_id: CLIENT_ID.to_owned(),
                team_id: "TEAM".to_owned(),
                key_id: "KEY".to_owned(),
                private_key: EncodingKey::from_ec_pem(EC_PRIVATE_KEY).unwrap(),
                jwks: RwLock::new(Some(CachedJwks {
                    fetched_at: Instant::now(),
                    keys: vec![AppleJwk {
                        kid: "old-key".to_owned(),
                        n: TEST_RSA_MODULUS.to_owned(),
                        e: "AQAB".to_owned(),
                    }],
                })),
                jwks_url: format!("http://{address}/keys"),
                token_url: "http://unused.test".to_owned(),
            }),
        };

        assert!(client.decoding_key("new-key").await.is_ok());
        server.abort();
    }

    fn identity_claims() -> AppleIdentityClaims {
        let now = Utc::now().timestamp() as usize;
        AppleIdentityClaims {
            iss: APPLE_ISSUER.to_owned(),
            aud: CLIENT_ID.to_owned(),
            exp: now + 300,
            iat: now,
            sub: "apple-user".to_owned(),
            nonce: Some(NONCE.to_owned()),
            email: Some(" Player@Example.COM ".to_owned()),
            email_verified: Some(AppleBoolean::String("true".to_owned())),
        }
    }

    fn identity_token(claims: AppleIdentityClaims) -> String {
        encode(
            &Header::new(Algorithm::RS256),
            &claims,
            &EncodingKey::from_rsa_pem(RSA_PRIVATE_KEY).unwrap(),
        )
        .unwrap()
    }
}
