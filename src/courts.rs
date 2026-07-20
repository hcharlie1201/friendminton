mod court;

use sqlx::{Pool, Postgres, QueryBuilder};
use uuid::Uuid;

use crate::error::AppError;

use court::CourtSource;
pub use court::{Court, CourtSearch, CreateCourt};

const COURT_COLUMNS: &str = r#"
    c.id, c.google_place_id, c.created_by, c.name, c.address, c.city,
    c.latitude, c.longitude, c.environment, c.court_count,
    c.drop_in_available, c.amenities, c.website_url, c.reservation_url,
    c.phone, c.source, c.verified_at, c.created_at, c.updated_at
"#;
const DEFAULT_RADIUS_KM: f64 = 25.0;
const MAX_RADIUS_KM: f64 = 100.0;
const MAX_SEARCH_CHARS: usize = 100;

pub async fn create_court(
    pool: &Pool<Postgres>,
    created_by: Uuid,
    mut payload: CreateCourt,
) -> Result<Court, AppError> {
    normalize_court(&mut payload);
    validate_court(&payload)?;

    let court = sqlx::query_as::<_, Court>(&format!(
        r#"
        INSERT INTO courts AS c (
            google_place_id, created_by, name, address, city, latitude,
            longitude, environment, court_count, drop_in_available, amenities,
            website_url, reservation_url, phone, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING {COURT_COLUMNS}, NULL::DOUBLE PRECISION AS distance_km
        "#
    ))
    .bind(payload.google_place_id)
    .bind(created_by)
    .bind(payload.name)
    .bind(payload.address)
    .bind(payload.city)
    .bind(payload.latitude)
    .bind(payload.longitude)
    .bind(payload.environment)
    .bind(payload.court_count)
    .bind(payload.drop_in_available)
    .bind(payload.amenities)
    .bind(payload.website_url)
    .bind(payload.reservation_url)
    .bind(payload.phone)
    .bind(CourtSource::Community)
    .fetch_one(pool)
    .await?;

    Ok(court)
}

pub async fn get_court(pool: &Pool<Postgres>, court_id: Uuid) -> Result<Court, AppError> {
    Ok(sqlx::query_as::<_, Court>(&format!(
        "SELECT {COURT_COLUMNS}, NULL::DOUBLE PRECISION AS distance_km FROM courts AS c WHERE c.id = $1"
    ))
    .bind(court_id)
    .fetch_one(pool)
    .await?)
}

pub async fn find_courts(
    pool: &Pool<Postgres>,
    search: CourtSearch,
) -> Result<Vec<Court>, AppError> {
    let validated = validate_search(search)?;
    let mut query = QueryBuilder::<Postgres>::new("SELECT ");
    query.push(COURT_COLUMNS);

    if let Some((latitude, longitude)) = validated.coordinates {
        push_distance_expression(&mut query, latitude, longitude);
    } else {
        query.push(", NULL::DOUBLE PRECISION AS distance_km");
    }
    query.push(" FROM courts AS c");

    let mut has_filter = false;
    if let Some(city) = validated.city {
        push_filter(&mut query, &mut has_filter);
        query
            .push("c.city ILIKE ")
            .push_bind(format!("%{}%", escape_like(&city)))
            .push(" ESCAPE '\\'");
    }
    if let Some(term) = validated.query {
        push_filter(&mut query, &mut has_filter);
        query
            .push("(c.name || ' ' || c.address || ' ' || c.city) ILIKE ")
            .push_bind(format!("%{}%", escape_like(&term)))
            .push(" ESCAPE '\\'");
    }
    if let Some((latitude, longitude)) = validated.coordinates {
        push_filter(&mut query, &mut has_filter);
        query
            .push("ST_DWithin(c.location, ST_SetSRID(ST_MakePoint(")
            .push_bind(longitude)
            .push(", ")
            .push_bind(latitude)
            .push("), 4326)::GEOGRAPHY, ")
            .push_bind(validated.radius_km * 1_000.0)
            .push(")");
    }

    if validated.coordinates.is_some() {
        query.push(" ORDER BY distance_km ASC, c.name ASC");
    } else {
        query.push(" ORDER BY c.name ASC, c.id ASC");
    }
    query.push(" LIMIT ").push_bind(validated.limit);

    Ok(query.build_query_as::<Court>().fetch_all(pool).await?)
}

struct ValidatedSearch {
    city: Option<String>,
    query: Option<String>,
    coordinates: Option<(f64, f64)>,
    radius_km: f64,
    limit: i64,
}

fn validate_search(search: CourtSearch) -> Result<ValidatedSearch, AppError> {
    let coordinates = match (search.latitude, search.longitude) {
        (Some(latitude), Some(longitude)) if valid_coordinates(latitude, longitude) => {
            Some((latitude, longitude))
        }
        (None, None) => None,
        _ => {
            return Err(AppError::BadRequest(
                "latitude and longitude must be provided together and be valid".to_owned(),
            ));
        }
    };
    let radius_km = search.radius_km.unwrap_or(DEFAULT_RADIUS_KM);
    if !(0.5..=MAX_RADIUS_KM).contains(&radius_km) {
        return Err(AppError::BadRequest(format!(
            "radius_km must be between 0.5 and {MAX_RADIUS_KM}"
        )));
    }
    let city = normalized_search_text("city", search.city)?;
    let query = normalized_search_text("query", search.query)?;
    Ok(ValidatedSearch {
        city,
        query,
        coordinates,
        radius_km,
        limit: search.limit.unwrap_or(50).clamp(1, 100),
    })
}

fn normalize_court(payload: &mut CreateCourt) {
    payload.google_place_id = normalized_optional(payload.google_place_id.take());
    payload.name = payload.name.trim().to_owned();
    payload.address = payload.address.trim().to_owned();
    payload.city = payload.city.trim().to_owned();
    payload.website_url = normalized_optional(payload.website_url.take());
    payload.reservation_url = normalized_optional(payload.reservation_url.take());
    payload.phone = normalized_optional(payload.phone.take());
}

fn validate_court(payload: &CreateCourt) -> Result<(), AppError> {
    validate_text("name", &payload.name, 200)?;
    validate_text("address", &payload.address, 300)?;
    validate_text("city", &payload.city, 100)?;
    if !valid_coordinates(payload.latitude, payload.longitude) {
        return Err(AppError::BadRequest(
            "court coordinates are invalid".to_owned(),
        ));
    }
    if !matches!(payload.court_count, None | Some(1..=100)) {
        return Err(AppError::BadRequest(
            "court_count must be between 1 and 100".to_owned(),
        ));
    }
    for (index, amenity) in payload.amenities.iter().enumerate() {
        if payload.amenities[..index].contains(amenity) {
            return Err(AppError::BadRequest(
                "amenities cannot contain duplicates".to_owned(),
            ));
        }
    }
    Ok(())
}

fn push_distance_expression(query: &mut QueryBuilder<'_, Postgres>, latitude: f64, longitude: f64) {
    query
        .push(", ST_Distance(c.location, ST_SetSRID(ST_MakePoint(")
        .push_bind(longitude)
        .push(", ")
        .push_bind(latitude)
        .push("), 4326)::GEOGRAPHY) / 1000.0 AS distance_km");
}

fn push_filter(query: &mut QueryBuilder<'_, Postgres>, has_filter: &mut bool) {
    query.push(if *has_filter { " AND " } else { " WHERE " });
    *has_filter = true;
}

fn valid_coordinates(latitude: f64, longitude: f64) -> bool {
    latitude.is_finite()
        && longitude.is_finite()
        && (-90.0..=90.0).contains(&latitude)
        && (-180.0..=180.0).contains(&longitude)
}

fn normalized_search_text(field: &str, value: Option<String>) -> Result<Option<String>, AppError> {
    let value = normalized_optional(value);
    if value
        .as_ref()
        .is_some_and(|value| value.chars().count() > MAX_SEARCH_CHARS)
    {
        return Err(AppError::BadRequest(format!(
            "{field} must be at most {MAX_SEARCH_CHARS} characters"
        )));
    }
    Ok(value)
}

fn normalized_optional(value: Option<String>) -> Option<String> {
    value.and_then(|value| {
        let trimmed = value.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_owned())
    })
}

fn validate_text(field: &str, value: &str, max: usize) -> Result<(), AppError> {
    let length = value.chars().count();
    if !(1..=max).contains(&length) {
        return Err(AppError::BadRequest(format!(
            "{field} must be between 1 and {max} characters"
        )));
    }
    Ok(())
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

#[cfg(test)]
mod tests {
    use super::{CourtSearch, DEFAULT_RADIUS_KM, validate_search};

    #[test]
    fn court_search_requires_valid_coordinate_pairs() {
        let missing_longitude = CourtSearch {
            city: None,
            query: None,
            latitude: Some(37.8),
            longitude: None,
            radius_km: None,
            limit: None,
        };
        assert!(validate_search(missing_longitude).is_err());

        let valid = CourtSearch {
            city: Some(" Oakland ".to_owned()),
            query: None,
            latitude: Some(37.8),
            longitude: Some(-122.2),
            radius_km: None,
            limit: None,
        };
        let validated = validate_search(valid).unwrap();
        assert_eq!(validated.city.as_deref(), Some("Oakland"));
        assert_eq!(validated.radius_km, DEFAULT_RADIUS_KM);
    }
}
