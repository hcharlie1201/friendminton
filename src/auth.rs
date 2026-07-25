use aide::{OperationInput, generate::GenContext, openapi::Operation};
use axum::{
    extract::FromRequestParts,
    http::{header::AUTHORIZATION, request::Parts},
};
use uuid::Uuid;

use crate::{app::AppState, error::AppError};

#[derive(Debug, Clone, Copy)]
pub struct CurrentUser {
    pub id: Uuid,
}

impl FromRequestParts<AppState> for CurrentUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let authorization = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|value| value.to_str().ok());
        let id = state
            .auth
            .domain_user_id_for_bearer(authorization)
            .await
            .map_err(|error| {
                if error.status_code() >= 500 {
                    AppError::Authentication(error.to_string())
                } else {
                    AppError::Unauthorized
                }
            })?;
        Ok(Self { id })
    }
}

impl OperationInput for CurrentUser {
    fn operation_input(_ctx: &mut GenContext, _operation: &mut Operation) {}
}
