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
}

#[derive(Serialize, JsonSchema)]
pub struct ErrorBody {
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
                    (Some(500), response),
                ]
            })
            .unwrap_or_default()
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> AxumResponse {
        let status = match &self {
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Sqlx(sqlx::Error::RowNotFound) => StatusCode::NOT_FOUND,
            AppError::Sqlx(_)
            | AppError::Migration(_)
            | AppError::Io(_)
            | AppError::AddrParse(_) => StatusCode::INTERNAL_SERVER_ERROR,
        };

        let body = Json(ErrorBody {
            error: self.to_string(),
        });

        (status, body).into_response()
    }
}
