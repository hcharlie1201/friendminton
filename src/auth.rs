use axum::{
    extract::FromRequestParts,
    http::{HeaderMap, request::Parts},
};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Debug, Clone, Copy)]
pub struct CurrentUser {
    pub id: Uuid,
}

impl<S> FromRequestParts<S> for CurrentUser
where
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let id = user_id_from_headers(&parts.headers)?;
        Ok(Self { id })
    }
}

fn user_id_from_headers(headers: &HeaderMap) -> Result<Uuid, AppError> {
    headers
        .get("x-user-id")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Uuid::parse_str(value).ok())
        .ok_or(AppError::Unauthorized)
}
