use std::collections::HashMap;

use axum::{
    Json,
    extract::{Path, Query, State},
    http::HeaderMap,
    response::Response,
};
use serde::{Deserialize, Serialize};

use crate::{app::AppState, common::ApiError};

pub(crate) async fn proxy_geocoder(
    State(state): State<AppState>,
    Path(path): Path<String>,
    Query(parameters): Query<HashMap<String, String>>,
) -> Result<Response, ApiError> {
    if !matches!(
        path.as_str(),
        "v3/geocode/geo" | "v3/geocode/regeo" | "v3/assistant/inputtips"
    ) {
        return Err(ApiError::not_found("高德地图代理路径不存在"));
    }
    state.amap.proxy_geocoder(&path, parameters).await
}

#[derive(Debug, Deserialize)]
pub(crate) struct RidingDistanceInput {
    destination_longitude: Option<f64>,
    destination_latitude: Option<f64>,
    destination_address: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct RidingDistanceResponse {
    distance_meters: u64,
    duration_seconds: u64,
    destination_longitude: f64,
    destination_latitude: f64,
}

#[derive(Debug, Deserialize)]
pub(crate) struct ReverseGeocodeInput {
    longitude: f64,
    latitude: f64,
}

#[derive(Debug, Serialize)]
pub(crate) struct ReverseGeocodeResponse {
    province: String,
    city: String,
    district: String,
    formatted_address: String,
}

pub(crate) async fn reverse_geocode(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<ReverseGeocodeInput>,
) -> Result<Json<ReverseGeocodeResponse>, ApiError> {
    state.auth.authenticate(&headers).await?;
    let result = state
        .amap
        .reverse_geocode(input.longitude, input.latitude)
        .await?;
    Ok(Json(ReverseGeocodeResponse {
        province: result.province,
        city: result.city,
        district: result.district,
        formatted_address: result.formatted_address,
    }))
}

pub(crate) async fn riding_distance(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(input): Json<RidingDistanceInput>,
) -> Result<Json<RidingDistanceResponse>, ApiError> {
    state.auth.authenticate(&headers).await?;
    let (destination_longitude, destination_latitude) = match (
        input.destination_address,
        input.destination_longitude,
        input.destination_latitude,
    ) {
        (Some(address), None, None) => {
            let address = address.trim();
            if address.is_empty()
                || address.chars().count() > 255
                || address.chars().any(char::is_control)
            {
                return Err(ApiError::bad_request(
                    "收货地址不能为空且不能超过 255 个字符",
                ));
            }
            state.amap.geocode_address(address).await?
        }
        (None, Some(longitude), Some(latitude)) => (longitude, latitude),
        _ => return Err(ApiError::bad_request("请提供完整的收货地址")),
    };
    let settings = state.restaurant_settings.get().await?;
    let origin_latitude = settings
        .store_latitude
        .ok_or_else(|| ApiError::conflict("门店位置尚未配置，请联系门店"))?;
    let origin_longitude = settings
        .store_longitude
        .ok_or_else(|| ApiError::conflict("门店位置尚未配置，请联系门店"))?;
    let result = state
        .amap
        .riding_distance(
            origin_longitude,
            origin_latitude,
            destination_longitude,
            destination_latitude,
        )
        .await?;
    Ok(Json(RidingDistanceResponse {
        distance_meters: result.distance_meters,
        duration_seconds: result.duration_seconds,
        destination_longitude,
        destination_latitude,
    }))
}
