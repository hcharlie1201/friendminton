use std::{fmt, path::Path, str::FromStr};

use serde::Deserialize;
use thiserror::Error;

const DEFAULT_ENVIRONMENT: &str = "development";
const LOCAL_DATABASE_URL: &str = "postgres://friendminton:friendminton@localhost:5432/friendminton";

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub environment: Environment,
    pub database_url: String,
    pub public_base_url: String,
    pub server_addr: String,
    pub upload_dir: String,
    pub third_party: ThirdPartyConfig,
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

#[derive(Debug, Clone)]
pub struct ThirdPartyConfig {
    pub object_storage: ObjectStorageConfig,
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
}

impl AppConfig {
    pub fn load() -> Result<Self, ConfigError> {
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

        Ok(Self {
            environment,
            database_url,
            public_base_url,
            server_addr: non_empty(get_env("SERVER_ADDR")).unwrap_or(profile.server_addr),
            upload_dir: non_empty(get_env("UPLOAD_DIR")).unwrap_or(profile.upload_dir),
            third_party: ThirdPartyConfig {
                object_storage: ObjectStorageConfig {
                    provider,
                    aws_region: non_empty(get_env("AWS_REGION"))
                        .unwrap_or(profile.third_party.object_storage.aws_region),
                    bucket,
                },
            },
        })
    }
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|value| !value.trim().is_empty())
}

#[cfg(test)]
mod tests {
    use std::{collections::HashMap, path::Path};

    use super::{AppConfig, ConfigError, Environment, ObjectStorageProvider};

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
    }

    #[test]
    fn staging_loads_profile_and_secret_environment_values() {
        let config = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
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
        ]))
        .unwrap();

        assert_eq!(config.public_base_url, "https://api.friendminton.com");
        assert_eq!(
            config.third_party.object_storage.bucket.as_deref(),
            Some("friendminton-media-production")
        );
    }

    #[test]
    fn deployed_environments_reject_insecure_public_urls() {
        let error = load(HashMap::from([
            ("APP_ENV", "staging"),
            ("DATABASE_URL", "postgres://staging-secret"),
            ("PUBLIC_BASE_URL", "http://staging.example.com"),
        ]))
        .unwrap_err();

        assert!(matches!(
            error,
            ConfigError::InsecurePublicBaseUrl(Environment::Staging)
        ));
    }

    fn load(values: HashMap<&str, &str>) -> Result<AppConfig, ConfigError> {
        AppConfig::load_from(Path::new("config"), |key| {
            values.get(key).map(|value| (*value).to_owned())
        })
    }
}
