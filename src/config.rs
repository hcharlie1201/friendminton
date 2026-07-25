use std::{fmt, path::Path, str::FromStr};

use serde::Deserialize;
use thiserror::Error;

const DEFAULT_ENVIRONMENT: &str = "development";
const LOCAL_DATABASE_URL: &str = "postgres://friendminton:friendminton@localhost:5432/friendminton";
const DEVELOPMENT_AUTH_SECRET: &str =
    "friendminton-development-auth-secret-do-not-use-in-deployments";
const DEFAULT_MOBILE_AUTH_CALLBACK_URL: &str = "friendminton://auth/callback";
const DEFAULT_SES_REGION: &str = "us-west-2";
const DEFAULT_SES_FROM_NAME: &str = "Friendminton";

mod email_env {
    pub const PROVIDER: &str = "EMAIL_PROVIDER";
    pub const SES_REGION: &str = "SES_REGION";
    pub const SES_FROM_NAME: &str = "SES_FROM_NAME";
    pub const SES_FROM_ADDRESS: &str = "SES_FROM_ADDRESS";
    pub const SES_REPLY_TO_ADDRESS: &str = "SES_REPLY_TO_ADDRESS";
    pub const SES_CONFIGURATION_SET: &str = "SES_CONFIGURATION_SET";
    pub const SES_ACCESS_KEY_ID: &str = "SES_AWS_ACCESS_KEY_ID";
    pub const SES_SECRET_ACCESS_KEY: &str = "SES_AWS_SECRET_ACCESS_KEY";
    pub const SES_SESSION_TOKEN: &str = "SES_AWS_SESSION_TOKEN";
}

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub environment: Environment,
    pub database_url: String,
    pub public_base_url: String,
    pub server_addr: String,
    pub upload_dir: String,
    pub authentication: AuthenticationConfig,
    pub third_party: ThirdPartyConfig,
}

#[derive(Debug, Clone)]
pub struct AuthenticationConfig {
    pub secret: String,
    pub google_oauth_client_id: Option<String>,
    pub google_oauth_client_secret: Option<String>,
    pub mobile_callback_url: String,
    pub email: TransactionalEmailConfig,
}

#[derive(Debug, Clone)]
pub enum TransactionalEmailConfig {
    Log,
    Ses(SesEmailConfig),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EmailProvider {
    Log,
    Ses,
}

#[derive(Debug, Clone)]
pub struct SesEmailConfig {
    pub region: String,
    pub from_name: String,
    pub from_address: String,
    pub reply_to_address: Option<String>,
    pub configuration_set: String,
    pub access_key_id: String,
    pub secret_access_key: String,
    pub session_token: Option<String>,
    pub environment: Environment,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Environment {
    Development,
    Staging,
    Production,
}

impl Environment {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Staging => "staging",
            Self::Production => "production",
        }
    }

    fn is_deployed(self) -> bool {
        matches!(self, Self::Staging | Self::Production)
    }
}

impl fmt::Display for Environment {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl FromStr for Environment {
    type Err = ConfigError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "development" => Ok(Self::Development),
            "staging" => Ok(Self::Staging),
            "production" => Ok(Self::Production),
            _ => Err(ConfigError::UnsupportedEnvironment(value.to_owned())),
        }
    }
}

impl EmailProvider {
    fn default_for(environment: Environment) -> Self {
        if environment.is_deployed() {
            Self::Ses
        } else {
            Self::Log
        }
    }
}

impl FromStr for EmailProvider {
    type Err = ConfigError;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value.trim().to_ascii_lowercase().as_str() {
            "log" => Ok(Self::Log),
            "ses" => Ok(Self::Ses),
            _ => Err(ConfigError::UnsupportedEmailProvider(value.to_owned())),
        }
    }
}

#[derive(Debug, Clone)]
pub struct ThirdPartyConfig {
    pub object_storage: ObjectStorageConfig,
    pub google_places_api_key: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ObjectStorageConfig {
    pub provider: ObjectStorageProvider,
    pub aws_region: String,
    pub bucket: Option<String>,
}

#[derive(Debug, Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ObjectStorageProvider {
    Local,
    S3,
}

#[derive(Debug, Deserialize)]
struct Profile {
    public_base_url: Option<String>,
    server_addr: String,
    upload_dir: String,
    third_party: ProfileThirdParty,
}

#[derive(Debug, Deserialize)]
struct ProfileThirdParty {
    object_storage: ProfileObjectStorage,
}

#[derive(Debug, Deserialize)]
struct ProfileObjectStorage {
    provider: ObjectStorageProvider,
    aws_region: String,
    bucket: Option<String>,
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("failed to load environment profile: {0}")]
    Profile(#[from] ::config::ConfigError),
    #[error("unsupported APP_ENV `{0}`; expected development, staging, or production")]
    UnsupportedEnvironment(String),
    #[error("{variable} is required when APP_ENV={environment}")]
    MissingVariable {
        variable: &'static str,
        environment: Environment,
    },
    #[error("PUBLIC_BASE_URL must use HTTPS when APP_ENV={0}")]
    InsecurePublicBaseUrl(Environment),
    #[error("object storage provider must be s3 when APP_ENV={0}")]
    InvalidObjectStorageProvider(Environment),
    #[error(
        "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET must either both be set or both be unset"
    )]
    IncompleteGoogleOauth,
    #[error("BETTER_AUTH_SECRET must contain at least 32 characters")]
    AuthSecretTooShort,
    #[error("MOBILE_AUTH_CALLBACK_URL must use the friendminton:// scheme")]
    InvalidMobileAuthCallbackUrl,
    #[error("unsupported EMAIL_PROVIDER `{0}`; expected log or ses")]
    UnsupportedEmailProvider(String),
    #[error("EMAIL_PROVIDER must be ses when APP_ENV={0}")]
    InvalidDeployedEmailProvider(Environment),
    #[error("{variable} must look like an email address")]
    InvalidEmailAddress { variable: &'static str },
}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let _ = dotenvy::dotenv();
        Self::load_from(Path::new("config"), |key| std::env::var(key).ok())
    }

    fn load_from(
        config_dir: &Path,
        get_env: impl Fn(&str) -> Option<String>,
    ) -> Result<Self, ConfigError> {
        let environment: Environment = get_env("APP_ENV")
            .unwrap_or_else(|| DEFAULT_ENVIRONMENT.to_owned())
            .parse()?;
        let profile_path = config_dir.join(format!("{}.toml", environment.as_str()));
        let profile = ::config::Config::builder()
            .add_source(::config::File::from(profile_path))
            .build()?
            .try_deserialize::<Profile>()?;

        let database_url = non_empty(get_env("DATABASE_URL"))
            .or_else(|| (!environment.is_deployed()).then(|| LOCAL_DATABASE_URL.to_owned()))
            .ok_or(ConfigError::MissingVariable {
                variable: "DATABASE_URL",
                environment,
            })?;
        let public_base_url = non_empty(get_env("PUBLIC_BASE_URL"))
            .or(profile.public_base_url)
            .ok_or(ConfigError::MissingVariable {
                variable: "PUBLIC_BASE_URL",
                environment,
            })?
            .trim_end_matches('/')
            .to_owned();
        let provider = profile.third_party.object_storage.provider;
        let bucket = non_empty(get_env("S3_BUCKET")).or(profile.third_party.object_storage.bucket);
        let google_places_api_key = non_empty(get_env("GOOGLE_PLACES_API_KEY"));
        let auth_secret = non_empty(get_env("BETTER_AUTH_SECRET"))
            .or_else(|| (!environment.is_deployed()).then(|| DEVELOPMENT_AUTH_SECRET.to_owned()))
            .ok_or(ConfigError::MissingVariable {
                variable: "BETTER_AUTH_SECRET",
                environment,
            })?;
        let google_oauth_client_id = non_empty(get_env("GOOGLE_OAUTH_CLIENT_ID"));
        let google_oauth_client_secret = non_empty(get_env("GOOGLE_OAUTH_CLIENT_SECRET"));
        let mobile_callback_url = non_empty(get_env("MOBILE_AUTH_CALLBACK_URL"))
            .unwrap_or_else(|| DEFAULT_MOBILE_AUTH_CALLBACK_URL.to_owned());

        if environment.is_deployed() && !public_base_url.starts_with("https://") {
            return Err(ConfigError::InsecurePublicBaseUrl(environment));
        }
        if environment.is_deployed() && provider != ObjectStorageProvider::S3 {
            return Err(ConfigError::InvalidObjectStorageProvider(environment));
        }
        if provider == ObjectStorageProvider::S3 && bucket.is_none() {
            return Err(ConfigError::MissingVariable {
                variable: "S3_BUCKET",
                environment,
            });
        }
        if environment.is_deployed() && google_places_api_key.is_none() {
            return Err(ConfigError::MissingVariable {
                variable: "GOOGLE_PLACES_API_KEY",
                environment,
            });
        }
        if google_oauth_client_id.is_some() != google_oauth_client_secret.is_some() {
            return Err(ConfigError::IncompleteGoogleOauth);
        }
        if auth_secret.chars().count() < 32 {
            return Err(ConfigError::AuthSecretTooShort);
        }
        if url::Url::parse(&mobile_callback_url)
            .map(|url| url.scheme() != "friendminton")
            .unwrap_or(true)
        {
            return Err(ConfigError::InvalidMobileAuthCallbackUrl);
        }
        let email_provider = non_empty(get_env(email_env::PROVIDER))
            .map(|value| value.parse())
            .transpose()?
            .unwrap_or_else(|| EmailProvider::default_for(environment));
        let email = match email_provider {
            EmailProvider::Log if environment.is_deployed() => {
                return Err(ConfigError::InvalidDeployedEmailProvider(environment));
            }
            EmailProvider::Log => TransactionalEmailConfig::Log,
            EmailProvider::Ses => {
                let from_address =
                    required_env(&get_env, email_env::SES_FROM_ADDRESS, environment)?;
                if !looks_like_email(&from_address) {
                    return Err(ConfigError::InvalidEmailAddress {
                        variable: email_env::SES_FROM_ADDRESS,
                    });
                }
                let reply_to_address = non_empty(get_env(email_env::SES_REPLY_TO_ADDRESS));
                if reply_to_address
                    .as_deref()
                    .is_some_and(|value| !looks_like_email(value))
                {
                    return Err(ConfigError::InvalidEmailAddress {
                        variable: email_env::SES_REPLY_TO_ADDRESS,
                    });
                }
                TransactionalEmailConfig::Ses(SesEmailConfig {
                    region: non_empty(get_env(email_env::SES_REGION))
                        .unwrap_or_else(|| DEFAULT_SES_REGION.to_owned()),
                    from_name: non_empty(get_env(email_env::SES_FROM_NAME))
                        .unwrap_or_else(|| DEFAULT_SES_FROM_NAME.to_owned()),
                    from_address,
                    reply_to_address,
                    configuration_set: required_env(
                        &get_env,
                        email_env::SES_CONFIGURATION_SET,
                        environment,
                    )?,
                    access_key_id: required_env(
                        &get_env,
                        email_env::SES_ACCESS_KEY_ID,
                        environment,
                    )?,
                    secret_access_key: required_env(
                        &get_env,
                        email_env::SES_SECRET_ACCESS_KEY,
                        environment,
                    )?,
                    session_token: non_empty(get_env(email_env::SES_SESSION_TOKEN)),
                    environment,
                })
            }
        };

        Ok(Self {
            environment,
            database_url,
            public_base_url,
            server_addr: non_empty(get_env("SERVER_ADDR")).unwrap_or(profile.server_addr),
            upload_dir: non_empty(get_env("UPLOAD_DIR")).unwrap_or(profile.upload_dir),
            authentication: AuthenticationConfig {
                secret: auth_secret,
                google_oauth_client_id,
                google_oauth_client_secret,
                mobile_callback_url,
                email,
            },
            third_party: ThirdPartyConfig {
                object_storage: ObjectStorageConfig {
                    provider,
                    aws_region: non_empty(get_env("AWS_REGION"))
                        .unwrap_or(profile.third_party.object_storage.aws_region),
                    bucket,
                },
                google_places_api_key,
            },
        })
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

fn required_env(
    get_env: &impl Fn(&str) -> Option<String>,
    variable: &'static str,
    environment: Environment,
) -> Result<String, ConfigError> {
    non_empty(get_env(variable)).ok_or(ConfigError::MissingVariable {
        variable,
        environment,
    })
}

fn looks_like_email(value: &str) -> bool {
    let (local, domain) = value.trim().split_once('@').unwrap_or_default();
    !local.is_empty() && domain.contains('.') && !domain.ends_with('.')
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::Path};

    use super::{
        AppConfig, ConfigError, Environment, ObjectStorageProvider, TransactionalEmailConfig,
    };

    #[test]
    fn development_uses_safe_local_defaults() {
        let config = load(HashMap::new()).unwrap();

        assert_eq!(config.environment, Environment::Development);
        assert_eq!(config.public_base_url, "http://localhost:3000");
        assert_eq!(
            config.third_party.object_storage.provider,
            ObjectStorageProvider::Local
        );
        assert!(config.third_party.object_storage.bucket.is_none());
        assert!(matches!(
            config.authentication.email,
            TransactionalEmailConfig::Log
        ));
    }

    #[test]
    fn staging_loads_profile_and_secret_environment_values() {
        let config = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
            ("GOOGLE_PLACES_API_KEY", "staging-google-key"),
            (
                "BETTER_AUTH_SECRET",
                "staging-auth-secret-that-is-at-least-32-characters",
            ),
            ("SES_FROM_ADDRESS", "no-reply@staging.friendminton.com"),
            (
                "SES_CONFIGURATION_SET",
                "friendminton-staging-transactional",
            ),
            ("SES_AWS_ACCESS_KEY_ID", "staging-ses-key-id"),
            ("SES_AWS_SECRET_ACCESS_KEY", "staging-ses-secret"),
        ]))
        .unwrap();

        assert_eq!(config.environment, Environment::Staging);
        assert_eq!(config.database_url, "postgres://staging-secret");
        assert_eq!(
            config.third_party.object_storage.bucket.as_deref(),
            Some("friendminton-media-us-west-2")
        );
    }

    #[test]
    fn production_fails_fast_when_deployment_secrets_are_missing() {
        let error = load(HashMap::from([("APP_ENV", "production")])).unwrap_err();

        assert!(matches!(
            error,
            ConfigError::MissingVariable {
                variable: "DATABASE_URL",
                environment: Environment::Production,
            }
        ));
    }

    #[test]
    fn production_accepts_explicit_isolated_service_configuration() {
        let config = load(HashMap::from([
            ("APP_ENV", "production"),
            ("DATABASE_URL", "postgres://production-secret"),
            ("PUBLIC_BASE_URL", "https://api.friendminton.com/"),
            ("S3_BUCKET", "friendminton-media-production"),
            ("GOOGLE_PLACES_API_KEY", "production-google-key"),
            (
                "BETTER_AUTH_SECRET",
                "production-auth-secret-that-is-at-least-32-characters",
            ),
            ("SES_FROM_ADDRESS", "no-reply@friendminton.com"),
            (
                "SES_CONFIGURATION_SET",
                "friendminton-production-transactional",
            ),
            ("SES_AWS_ACCESS_KEY_ID", "production-ses-key-id"),
            ("SES_AWS_SECRET_ACCESS_KEY", "production-ses-secret"),
        ]))
        .unwrap();

        assert_eq!(config.public_base_url, "https://api.friendminton.com");
        assert_eq!(
            config.third_party.object_storage.bucket.as_deref(),
            Some("friendminton-media-production")
        );
        assert!(matches!(
            config.authentication.email,
            TransactionalEmailConfig::Ses(_)
        ));
    }

    #[test]
    fn deployed_environments_reject_insecure_public_urls() {
        let error = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
            ("PUBLIC_BASE_URL", "http://staging.example.com"),
            ("GOOGLE_PLACES_API_KEY", "staging-google-key"),
            (
                "BETTER_AUTH_SECRET",
                "staging-auth-secret-that-is-at-least-32-characters",
            ),
        ]))
        .unwrap_err();

        assert!(matches!(
            error,
            ConfigError::InsecurePublicBaseUrl(Environment::Staging)
        ));
    }

    #[test]
    fn deployed_environments_require_a_better_auth_secret() {
        let error = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
            ("GOOGLE_PLACES_API_KEY", "staging-google-key"),
        ]))
        .unwrap_err();

        assert!(matches!(
            error,
            ConfigError::MissingVariable {
                variable: "BETTER_AUTH_SECRET",
                environment: Environment::Staging,
            }
        ));
    }

    #[test]
    fn deployed_environments_refuse_console_email_delivery() {
        let error = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
            ("GOOGLE_PLACES_API_KEY", "staging-google-key"),
            (
                "BETTER_AUTH_SECRET",
                "staging-auth-secret-that-is-at-least-32-characters",
            ),
            ("EMAIL_PROVIDER", "log"),
        ]))
        .unwrap_err();

        assert!(matches!(
            error,
            ConfigError::InvalidDeployedEmailProvider(Environment::Staging)
        ));
    }

    #[test]
    fn deployed_ses_delivery_requires_a_sender_address() {
        let error = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
            ("GOOGLE_PLACES_API_KEY", "staging-google-key"),
            (
                "BETTER_AUTH_SECRET",
                "staging-auth-secret-that-is-at-least-32-characters",
            ),
        ]))
        .unwrap_err();

        assert!(matches!(
            error,
            ConfigError::MissingVariable {
                variable: "SES_FROM_ADDRESS",
                environment: Environment::Staging,
            }
        ));
    }

    #[test]
    fn google_oauth_credentials_must_be_configured_as_a_pair() {
        let error = load(HashMap::from([(
            "GOOGLE_OAUTH_CLIENT_ID",
            "google-client-id",
        )]))
        .unwrap_err();

        assert!(matches!(error, ConfigError::IncompleteGoogleOauth));
    }

    #[test]
    fn short_auth_secrets_are_rejected() {
        let error = load(HashMap::from([("BETTER_AUTH_SECRET", "too-short")])).unwrap_err();

        assert!(matches!(error, ConfigError::AuthSecretTooShort));
    }

    fn load(values: HashMap<&str, &str>) -> Result<AppConfig, ConfigError> {
        AppConfig::load_from(Path::new("config"), |key| {
            values.get(key).map(|value| (*value).to_owned())
        })
    }
}
