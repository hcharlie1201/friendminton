use aide::{
    OperationOutput,
    generate::GenContext,
    openapi::{Operation, Response},
};
use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response as AxumResponse},
};
use schemars::JsonSchema;
use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error(transparent)]
    Config(#[from] crate::config::ConfigError),
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("unauthorized")]
    Unauthorized,
    #[error(transparent)]
    Sqlx(#[from] sqlx::Error),
    #[error(transparent)]
    Migration(#[from] sqlx::migrate::MigrateError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    AddrParse(#[from] std::net::AddrParseError),
    #[error("media storage error: {0}")]
    Media(String),
    #[error("service unavailable: {0}")]
    ServiceUnavailable(&'static str),
    #[error("external service error: {0}")]
    ExternalService(String),
}

#[derive(Debug, Clone, Copy, Serialize, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    BadRequest,
    InternalServerError,
    NotFound,
    ServiceUnavailable,
    UpstreamServiceError,
    Unauthorized,
}

#[derive(Serialize, JsonSchema)]
pub struct ErrorBody {
    pub code: ErrorCode,
    pub error: String,
}

impl OperationOutput for AppError {
    type Inner = ErrorBody;

    fn operation_response(ctx: &mut GenContext, operation: &mut Operation) -> Option<Response> {
        Json::<ErrorBody>::operation_response(ctx, operation)
    }

    fn inferred_responses(
        ctx: &mut GenContext,
        operation: &mut Operation,
    ) -> Vec<(Option<u16>, Response)> {
        Json::<ErrorBody>::operation_response(ctx, operation)
            .map(|response| {
                vec![
                    (Some(400), response.clone()),
                    (Some(401), response.clone()),
                    (Some(404), response.clone()),
                    (Some(500), response.clone()),
                    (Some(502), response.clone()),
                    (Some(503), response),
                ]
            })
            .unwrap_or_default()
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> AxumResponse {
        let (status, code, message) = match &self {
            AppError::BadRequest(message) => (
                StatusCode::BAD_REQUEST,
                ErrorCode::BadRequest,
                format!("bad request: {message}"),
            ),
            AppError::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                ErrorCode::Unauthorized,
                "unauthorized".to_owned(),
            ),
            AppError::ServiceUnavailable(message) => (
                StatusCode::SERVICE_UNAVAILABLE,
                ErrorCode::ServiceUnavailable,
                (*message).to_owned(),
            ),
            AppError::ExternalService(message) => {
                tracing::error!(error = %message, "external service request failed");
                (
                    StatusCode::BAD_GATEWAY,
                    ErrorCode::UpstreamServiceError,
                    "location service is temporarily unavailable".to_owned(),
                )
            }
            AppError::Sqlx(sqlx::Error::RowNotFound) => (
                StatusCode::NOT_FOUND,
                ErrorCode::NotFound,
                "resource not found".to_owned(),
            ),
            AppError::Config(_)
            | AppError::Sqlx(_)
            | AppError::Migration(_)
            | AppError::Io(_)
            | AppError::AddrParse(_)
            | AppError::Media(_) => {
                tracing::error!(error = ?self, "request failed with an internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    ErrorCode::InternalServerError,
                    "internal server error".to_owned(),
                )
            }
        };

        let body = Json(ErrorBody {
            code,
            error: message,
        });

        (status, body).into_response()
    }
}
