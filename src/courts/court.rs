use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, Type};
use time::OffsetDateTime;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum CourtEnvironment {
    #[default]
    Indoor,
    Outdoor,
    Mixed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum CourtAmenity {
    Parking,
    Showers,
    LockerRooms,
    ProShop,
    EquipmentRental,
    Water,
    Seating,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize, JsonSchema, Type)]
#[serde(rename_all = "snake_case")]
#[sqlx(type_name = "text", rename_all = "snake_case")]
pub enum CourtSource {
    #[default]
    Community,
    GooglePlaces,
    Admin,
}

#[derive(Debug, Serialize, FromRow, JsonSchema)]
pub struct Court {
    pub id: Uuid,
    pub google_place_id: Option<String>,
    pub created_by: Option<Uuid>,
    pub name: String,
    pub address: String,
    pub city: String,
    pub latitude: f64,
    pub longitude: f64,
    pub environment: CourtEnvironment,
    pub court_count: Option<i32>,
    pub drop_in_available: bool,
    pub amenities: Vec<CourtAmenity>,
    pub website_url: Option<String>,
    pub reservation_url: Option<String>,
    pub phone: Option<String>,
    pub source: CourtSource,
    #[serde(with = "time::serde::rfc3339::option")]
    #[schemars(with = "Option<String>")]
    pub verified_at: Option<OffsetDateTime>,
    pub distance_km: Option<f64>,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub created_at: OffsetDateTime,
    #[serde(with = "time::serde::rfc3339")]
    #[schemars(with = "String")]
    pub updated_at: OffsetDateTime,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CreateCourt {
    pub google_place_id: Option<String>,
    pub name: String,
    pub address: String,
    pub city: String,
    pub latitude: f64,
    pub longitude: f64,
    #[serde(default)]
    pub environment: CourtEnvironment,
    pub court_count: Option<i32>,
    #[serde(default)]
    pub drop_in_available: bool,
    #[serde(default)]
    pub amenities: Vec<CourtAmenity>,
    pub website_url: Option<String>,
    pub reservation_url: Option<String>,
    pub phone: Option<String>,
}

#[derive(Debug, Deserialize, JsonSchema)]
pub struct CourtSearch {
    pub city: Option<String>,
    pub query: Option<String>,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    pub radius_km: Option<f64>,
    pub limit: Option<i64>,
}
