mod place;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

pub use place::{PlaceAutocompleteQuery, PlaceDetailsQuery, PlacePrediction, ResolvedPlace};

const PLACES_BASE_URL: &str = "https://places.googleapis.com/v1";
const AUTOCOMPLETE_FIELDS: &str = "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text";
const DETAILS_FIELDS: &str = "id,formattedAddress,location,addressComponents";

#[derive(Clone)]
pub struct GooglePlaces {
    api_key: Option<String>,
    client: Client,
}

impl GooglePlaces {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            api_key,
            client: Client::new(),
        }
    }

    pub async fn autocomplete(
        &self,
        query: PlaceAutocompleteQuery,
    ) -> Result<Vec<PlacePrediction>, AppError> {
        validate_autocomplete_query(&query)?;
        let key = self.api_key()?;
        let body = AutocompleteRequest {
            input: &query.input,
            session_token: &query.session_token,
            location_bias: coordinate_pair(query.latitude, query.longitude)?.map(
                |(latitude, longitude)| LocationBias {
                    circle: BiasCircle {
                        center: GoogleLocation {
                            latitude,
                            longitude,
                        },
                        radius: 50_000.0,
                    },
                },
            ),
        };
        let response = self
            .client
            .post(format!("{PLACES_BASE_URL}/places:autocomplete"))
            .header("X-Goog-Api-Key", key)
            .header("X-Goog-FieldMask", AUTOCOMPLETE_FIELDS)
            .json(&body)
            .send()
            .await
            .map_err(external_error)?;
        let response = checked_response(response).await?;
        let payload = response
            .json::<AutocompleteResponse>()
            .await
            .map_err(external_error)?;
        Ok(payload
            .suggestions
            .into_iter()
            .filter_map(|suggestion| {
                let prediction = suggestion.place_prediction?;
                Some(PlacePrediction {
                    place_id: prediction.place_id,
                    primary_text: prediction.structured_format.main_text.text,
                    secondary_text: prediction
                        .structured_format
                        .secondary_text
                        .map(|text| text.text),
                    full_text: prediction.text.text,
                })
            })
            .collect())
    }

    pub async fn resolve(
        &self,
        place_id: &str,
        query: PlaceDetailsQuery,
    ) -> Result<ResolvedPlace, AppError> {
        validate_session_token(&query.session_token)?;
        validate_place_id(place_id)?;
        let key = self.api_key()?;
        let response = self
            .client
            .get(format!("{PLACES_BASE_URL}/places/{place_id}"))
            .query(&[("sessionToken", query.session_token)])
            .header("X-Goog-Api-Key", key)
            .header("X-Goog-FieldMask", DETAILS_FIELDS)
            .send()
            .await
            .map_err(external_error)?;
        let response = checked_response(response).await?;
        let place = response
            .json::<PlaceDetailsResponse>()
            .await
            .map_err(external_error)?;
        let city = place
            .address_components
            .iter()
            .find(|component| {
                component
                    .types
                    .iter()
                    .any(|kind| kind == "locality" || kind == "postal_town")
            })
            .map(|component| component.long_text.clone());
        Ok(ResolvedPlace {
            place_id: place.id,
            formatted_address: place.formatted_address,
            city,
            latitude: place.location.latitude,
            longitude: place.location.longitude,
        })
    }

    fn api_key(&self) -> Result<&str, AppError> {
        self.api_key.as_deref().ok_or(AppError::ServiceUnavailable(
            "location search is not configured yet",
        ))
    }
}

async fn checked_response(response: reqwest::Response) -> Result<reqwest::Response, AppError> {
    let status = response.status();
    if status.is_success() {
        return Ok(response);
    }
    let body = response.text().await.unwrap_or_default();
    Err(AppError::ExternalService(format!(
        "Google Places returned {status}: {body}"
    )))
}

fn validate_autocomplete_query(query: &PlaceAutocompleteQuery) -> Result<(), AppError> {
    if !(3..=200).contains(&query.input.trim().chars().count()) {
        return Err(AppError::BadRequest(
            "input must be between 3 and 200 characters".to_owned(),
        ));
    }
    validate_session_token(&query.session_token)?;
    coordinate_pair(query.latitude, query.longitude)?;
    Ok(())
}

fn validate_session_token(token: &str) -> Result<(), AppError> {
    Uuid::parse_str(token)
        .map_err(|_| AppError::BadRequest("session_token must be a UUID".to_owned()))?;
    Ok(())
}

fn validate_place_id(place_id: &str) -> Result<(), AppError> {
    if place_id.is_empty()
        || place_id.len() > 255
        || !place_id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
    {
        return Err(AppError::BadRequest("invalid place_id".to_owned()));
    }
    Ok(())
}

fn coordinate_pair(
    latitude: Option<f64>,
    longitude: Option<f64>,
) -> Result<Option<(f64, f64)>, AppError> {
    match (latitude, longitude) {
        (None, None) => Ok(None),
        (Some(latitude), Some(longitude))
            if latitude.is_finite()
                && longitude.is_finite()
                && (-90.0..=90.0).contains(&latitude)
                && (-180.0..=180.0).contains(&longitude) =>
        {
            Ok(Some((latitude, longitude)))
        }
        _ => Err(AppError::BadRequest(
            "latitude and longitude must be provided together and be valid".to_owned(),
        )),
    }
}

fn external_error(error: reqwest::Error) -> AppError {
    AppError::ExternalService(error.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AutocompleteRequest<'a> {
    input: &'a str,
    session_token: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    location_bias: Option<LocationBias>,
}

#[derive(Serialize)]
struct LocationBias {
    circle: BiasCircle,
}

#[derive(Serialize)]
struct BiasCircle {
    center: GoogleLocation,
    radius: f64,
}

#[derive(Serialize, Deserialize)]
struct GoogleLocation {
    latitude: f64,
    longitude: f64,
}

#[derive(Deserialize)]
struct AutocompleteResponse {
    #[serde(default)]
    suggestions: Vec<AutocompleteSuggestion>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AutocompleteSuggestion {
    place_prediction: Option<GooglePlacePrediction>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GooglePlacePrediction {
    place_id: String,
    text: GoogleText,
    structured_format: StructuredFormat,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StructuredFormat {
    main_text: GoogleText,
    secondary_text: Option<GoogleText>,
}

#[derive(Deserialize)]
struct GoogleText {
    text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaceDetailsResponse {
    id: String,
    formatted_address: String,
    location: GoogleLocation,
    #[serde(default)]
    address_components: Vec<AddressComponent>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddressComponent {
    long_text: String,
    #[serde(default)]
    types: Vec<String>,
}

#[cfg(test)]
mod tests {
    use super::{coordinate_pair, validate_place_id, validate_session_token};

    #[test]
    fn place_inputs_are_bounded_and_coordinate_pairs_are_complete() {
        assert!(validate_session_token("not-a-uuid").is_err());
        assert!(validate_place_id("../../secret").is_err());
        assert!(coordinate_pair(Some(37.8), None).is_err());
        assert_eq!(
            coordinate_pair(Some(37.8), Some(-122.2)).unwrap(),
            Some((37.8, -122.2))
        );
    }
}
