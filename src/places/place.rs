use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PlaceAutocompleteQuery {
    pub input: String,
    pub session_token: String,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct PlacePrediction {
    pub place_id: String,
    pub primary_text: String,
    pub secondary_text: Option<String>,
    pub full_text: String,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct PlaceDetailsQuery {
    pub session_token: String,
}

#[derive(Debug, Serialize, JsonSchema)]
pub struct ResolvedPlace {
    pub place_id: String,
    pub formatted_address: String,
    pub city: Option<String>,
    pub latitude: f64,
    pub longitude: f64,
}
