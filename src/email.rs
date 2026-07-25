use aws_config::BehaviorVersion;
use aws_credential_types::Credentials;
use aws_sdk_sesv2::{
    Client,
    types::{Body, Content, Destination, EmailContent, Message, MessageTag},
};
use aws_types::region::Region;

use crate::config::{SesEmailConfig, TransactionalEmailConfig};

#[derive(Clone)]
pub enum TransactionalEmail {
    Log,
    Ses(SesEmailSender),
}

#[derive(Clone)]
pub struct SesEmailSender {
    client: Client,
    from: String,
    reply_to: Option<String>,
    configuration_set: String,
    environment: String,
}

#[derive(Clone, Copy)]
pub enum EmailKind {
    EmailVerification,
    PasswordReset,
}

impl EmailKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::EmailVerification => "email_verification",
            Self::PasswordReset => "password_reset",
        }
    }
}

#[derive(Debug, thiserror::Error)]
#[error("transactional email could not be delivered")]
pub struct EmailDeliveryError;

impl TransactionalEmail {
    pub async fn from_config(config: &TransactionalEmailConfig) -> Self {
        match config {
            TransactionalEmailConfig::Log => Self::Log,
            TransactionalEmailConfig::Ses(config) => {
                Self::Ses(SesEmailSender::from_config(config).await)
            }
        }
    }

    pub async fn send(
        &self,
        kind: EmailKind,
        to: &str,
        subject: &str,
        html: &str,
        text: &str,
    ) -> Result<(), EmailDeliveryError> {
        match self {
            Self::Log => {
                eprintln!(
                    "[EMAIL:{}] To: {to} | Subject: {subject}\n{text}",
                    kind.as_str()
                );
                Ok(())
            }
            Self::Ses(sender) => sender.send(kind, to, subject, html, text).await,
        }
    }
}

impl SesEmailSender {
    async fn from_config(config: &SesEmailConfig) -> Self {
        // Lightsail's instance metadata credentials are scoped to its attached
        // object-storage bucket. A separate, least-privilege SES credential
        // provider prevents these keys from overriding the S3 credential chain.
        let credentials = Credentials::new(
            config.access_key_id.clone(),
            config.secret_access_key.clone(),
            config.session_token.clone(),
            None,
            "friendminton-ses",
        );
        let sdk_config = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(config.region.clone()))
            .credentials_provider(credentials)
            .load()
            .await;

        Self {
            client: Client::new(&sdk_config),
            from: format!("{} <{}>", config.from_name, config.from_address),
            reply_to: config.reply_to_address.clone(),
            configuration_set: config.configuration_set.clone(),
            environment: config.environment.as_str().to_owned(),
        }
    }

    async fn send(
        &self,
        kind: EmailKind,
        to: &str,
        subject: &str,
        html: &str,
        text: &str,
    ) -> Result<(), EmailDeliveryError> {
        let destination = Destination::builder().to_addresses(to).build();
        let subject = Content::builder()
            .data(subject)
            .charset("UTF-8")
            .build()
            .map_err(|_| EmailDeliveryError)?;
        let html = Content::builder()
            .data(html)
            .charset("UTF-8")
            .build()
            .map_err(|_| EmailDeliveryError)?;
        let text = Content::builder()
            .data(text)
            .charset("UTF-8")
            .build()
            .map_err(|_| EmailDeliveryError)?;
        let body = Body::builder().html(html).text(text).build();
        let message = Message::builder().subject(subject).body(body).build();
        let content = EmailContent::builder().simple(message).build();
        let environment_tag = MessageTag::builder()
            .name("environment")
            .value(&self.environment)
            .build()
            .map_err(|_| EmailDeliveryError)?;
        let kind_tag = MessageTag::builder()
            .name("kind")
            .value(kind.as_str())
            .build()
            .map_err(|_| EmailDeliveryError)?;

        let mut request = self
            .client
            .send_email()
            .from_email_address(&self.from)
            .destination(destination)
            .content(content)
            .configuration_set_name(&self.configuration_set)
            .email_tags(environment_tag)
            .email_tags(kind_tag);
        if let Some(reply_to) = &self.reply_to {
            request = request.reply_to_addresses(reply_to);
        }

        match request.send().await {
            Ok(output) => {
                tracing::info!(
                    message_id = output.message_id(),
                    kind = kind.as_str(),
                    "transactional email accepted by SES"
                );
                Ok(())
            }
            Err(error) => {
                tracing::error!(
                    error = %error,
                    kind = kind.as_str(),
                    "SES transactional email send failed"
                );
                Err(EmailDeliveryError)
            }
        }
    }
}
