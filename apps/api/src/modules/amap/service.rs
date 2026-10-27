use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use crate::common::ApiError;
use axum::{
    body::Body,
    http::{StatusCode, header::CONTENT_TYPE},
    response::Response,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

const AMAP_GEOCODE_API: &str = "https://restapi.amap.com";
const RIDING_DISTANCE_CACHE_TTL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, Deserialize, Serialize)]
pub(crate) struct RidingDistance {
    pub(crate) distance_meters: u64,
    pub(crate) duration_seconds: u64,
}

#[derive(Debug)]
pub(crate) struct ReverseGeocodeResult {
    pub(crate) province: String,
    pub(crate) city: String,
    pub(crate) district: String,
    pub(crate) formatted_address: String,
}

#[derive(Clone)]
pub(crate) struct AmapService {
    http: reqwest::Client,
    js_api_key: String,
    security_code: String,
    web_service_api_key: String,
    riding_cache: Arc<Mutex<HashMap<(i64, i64, i64, i64), (Instant, RidingDistance)>>>,
}

impl AmapService {
    pub(crate) fn new(
        js_api_key: String,
        security_code: String,
        web_service_api_key: String,
    ) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(10))
                .build()
                .expect("reqwest client configuration is valid"),
            js_api_key,
            security_code,
            web_service_api_key,
            riding_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub(crate) async fn proxy_geocoder(
        &self,
        path: &str,
        mut parameters: HashMap<String, String>,
    ) -> Result<Response, ApiError> {
        if self.js_api_key.trim().is_empty() || self.security_code.trim().is_empty() {
            return Err(ApiError::service_unavailable(
                "服务端尚未配置高德地图 AMAP_JS_API_KEY 或 AMAP_JS_SECURITY_CODE",
            ));
        }
        // Always use the server-side key. This keeps the proxy independent from
        // the browser query string and prevents callers from swapping keys.
        parameters.insert("key".into(), self.js_api_key.clone());
        parameters.insert("jscode".into(), self.security_code.clone());
        let response = self
            .http
            .get(format!("{AMAP_GEOCODE_API}/{path}"))
            .query(&parameters)
            .send()
            .await
            .map_err(|_| ApiError::bad_gateway("暂时无法连接高德地图服务，请稍后重试"))?;
        let status =
            StatusCode::from_u16(response.status().as_u16()).unwrap_or(StatusCode::BAD_GATEWAY);
        let content_type = response.headers().get(CONTENT_TYPE).cloned();
        let body = response
            .bytes()
            .await
            .map_err(|_| ApiError::bad_gateway("读取高德地图服务响应失败"))?;

        let mut proxy_response = Response::new(Body::from(body));
        *proxy_response.status_mut() = status;
        if let Some(content_type) = content_type {
            proxy_response
                .headers_mut()
                .insert(CONTENT_TYPE, content_type);
        }
        Ok(proxy_response)
    }

    pub(crate) async fn riding_distance(
        &self,
        origin_longitude: f64,
        origin_latitude: f64,
        destination_longitude: f64,
        destination_latitude: f64,
    ) -> Result<RidingDistance, ApiError> {
        let coordinates = [
            origin_longitude,
            origin_latitude,
            destination_longitude,
            destination_latitude,
        ];
        if coordinates.iter().any(|coordinate| !coordinate.is_finite())
            || !(-180.0..=180.0).contains(&origin_longitude)
            || !(-90.0..=90.0).contains(&origin_latitude)
            || !(-180.0..=180.0).contains(&destination_longitude)
            || !(-90.0..=90.0).contains(&destination_latitude)
        {
            return Err(ApiError::bad_request("骑行路线起点或终点坐标无效"));
        }
        if self.web_service_api_key.trim().is_empty() {
            return Err(ApiError::service_unavailable(
                "骑行路线服务尚未配置 Web 服务类型 Key，请设置 AMAP_WEB_SERVICE_API_KEY",
            ));
        }

        let coordinate_keys =
            coordinates.map(|coordinate| (coordinate * 1_000_000.0).round() as i64);
        let cache_key = (
            coordinate_keys[0],
            coordinate_keys[1],
            coordinate_keys[2],
            coordinate_keys[3],
        );
        if let Some((created_at, result)) = self
            .riding_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .get(&cache_key)
            .copied()
        {
            if created_at.elapsed() < RIDING_DISTANCE_CACHE_TTL {
                return Ok(result);
            }
        }

        let origin = format!("{:.6},{:.6}", origin_longitude, origin_latitude);
        let destination = format!("{:.6},{:.6}", destination_longitude, destination_latitude);
        let response = self
            .http
            .get(format!("{AMAP_GEOCODE_API}/v4/direction/bicycling"))
            .query(&[
                ("key", self.web_service_api_key.as_str()),
                ("origin", origin.as_str()),
                ("destination", destination.as_str()),
            ])
            .send()
            .await
            .map_err(|_| ApiError::bad_gateway("暂时无法连接高德骑行路线服务，请稍后重试"))?;
        if !response.status().is_success() {
            return Err(ApiError::bad_gateway("高德骑行路线服务暂时不可用"));
        }
        let payload = response
            .json::<Value>()
            .await
            .map_err(|_| ApiError::bad_gateway("高德骑行路线服务返回了无法识别的结果"))?;
        let error_code = payload.get("errcode").and_then(Value::as_i64).unwrap_or(-1);
        if error_code != 0 {
            let detail = payload
                .get("errdetail")
                .or_else(|| payload.get("errmsg"))
                .and_then(Value::as_str)
                .unwrap_or("请求失败");
            return Err(ApiError::bad_gateway(format!(
                "高德骑行路线计算失败：{detail}"
            )));
        }
        let distance_meters = payload
            .pointer("/data/paths/0/distance")
            .and_then(Value::as_f64)
            .filter(|distance| distance.is_finite() && *distance >= 0.0)
            .ok_or_else(|| {
                let detail = payload
                    .get("errdetail")
                    .or_else(|| payload.get("errmsg"))
                    .and_then(Value::as_str)
                    .unwrap_or("没有可用路线");
                ApiError::bad_gateway(format!("高德未能规划骑行路线：{detail}"))
            })?;
        let duration_seconds = payload
            .pointer("/data/paths/0/duration")
            .and_then(Value::as_f64)
            .filter(|duration| duration.is_finite() && *duration >= 0.0)
            .unwrap_or_default();
        let result = RidingDistance {
            distance_meters: distance_meters.round() as u64,
            duration_seconds: duration_seconds.round() as u64,
        };
        let mut cache = self
            .riding_cache
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        cache.retain(|_, (created_at, _)| created_at.elapsed() < RIDING_DISTANCE_CACHE_TTL);
        cache.insert(cache_key, (Instant::now(), result));
        Ok(result)
    }

    pub(crate) async fn geocode_address(&self, address: &str) -> Result<(f64, f64), ApiError> {
        if self.web_service_api_key.trim().is_empty() {
            return Err(ApiError::service_unavailable(
                "地址解析服务尚未配置 Web 服务类型 Key，请设置 AMAP_WEB_SERVICE_API_KEY",
            ));
        }

        let response = self
            .http
            .get(format!("{AMAP_GEOCODE_API}/v3/geocode/geo"))
            .query(&[
                ("key", self.web_service_api_key.as_str()),
                ("address", address),
            ])
            .send()
            .await
            .map_err(|_| ApiError::bad_gateway("暂时无法连接高德地址解析服务，请稍后重试"))?;
        if !response.status().is_success() {
            return Err(ApiError::bad_gateway("高德地址解析服务暂时不可用"));
        }
        let payload = response
            .json::<Value>()
            .await
            .map_err(|_| ApiError::bad_gateway("高德地址解析服务返回了无法识别的结果"))?;
        if payload.get("status").and_then(Value::as_str) != Some("1") {
            let detail = payload
                .get("info")
                .and_then(Value::as_str)
                .unwrap_or("请求失败");
            return Err(ApiError::bad_gateway(format!("高德地址解析失败：{detail}")));
        }

        let location = payload
            .pointer("/geocodes/0/location")
            .and_then(Value::as_str)
            .ok_or_else(|| ApiError::bad_request("无法识别该收货地址，请补充详细地址"))?;
        let (longitude, latitude) = location
            .split_once(',')
            .and_then(|(longitude, latitude)| {
                Some((
                    longitude.parse::<f64>().ok()?,
                    latitude.parse::<f64>().ok()?,
                ))
            })
            .ok_or_else(|| ApiError::bad_gateway("高德地址解析返回了无效坐标"))?;
        if !longitude.is_finite()
            || !latitude.is_finite()
            || !(-180.0..=180.0).contains(&longitude)
            || !(-90.0..=90.0).contains(&latitude)
        {
            return Err(ApiError::bad_gateway("高德地址解析返回了无效坐标"));
        }

        Ok((longitude, latitude))
    }

    pub(crate) async fn reverse_geocode(
        &self,
        longitude: f64,
        latitude: f64,
    ) -> Result<ReverseGeocodeResult, ApiError> {
        if !longitude.is_finite()
            || !latitude.is_finite()
            || !(-180.0..=180.0).contains(&longitude)
            || !(-90.0..=90.0).contains(&latitude)
        {
            return Err(ApiError::bad_request("地图选点坐标无效"));
        }
        if self.web_service_api_key.trim().is_empty() {
            return Err(ApiError::service_unavailable(
                "地址解析服务尚未配置 Web 服务类型 Key，请设置 AMAP_WEB_SERVICE_API_KEY",
            ));
        }

        let location = format!("{longitude:.6},{latitude:.6}");
        let response = self
            .http
            .get(format!("{AMAP_GEOCODE_API}/v3/geocode/regeo"))
            .query(&[
                ("key", self.web_service_api_key.as_str()),
                ("location", location.as_str()),
                ("extensions", "base"),
            ])
            .send()
            .await
            .map_err(|_| ApiError::bad_gateway("暂时无法连接高德地址解析服务，请稍后重试"))?;
        if !response.status().is_success() {
            return Err(ApiError::bad_gateway("高德地址解析服务暂时不可用"));
        }
        let payload = response
            .json::<Value>()
            .await
            .map_err(|_| ApiError::bad_gateway("高德地址解析服务返回了无法识别的结果"))?;
        if payload.get("status").and_then(Value::as_str) != Some("1") {
            let detail = payload
                .get("info")
                .and_then(Value::as_str)
                .unwrap_or("请求失败");
            return Err(ApiError::bad_gateway(format!("高德地址解析失败：{detail}")));
        }

        let components = payload
            .pointer("/regeocode/addressComponent")
            .ok_or_else(|| ApiError::bad_gateway("高德地址解析未返回所在地区"))?;
        let component = |key: &str| {
            components
                .get(key)
                .and_then(|value| match value {
                    Value::String(text) => Some(text.clone()),
                    Value::Array(values) => {
                        values.iter().find_map(Value::as_str).map(str::to_owned)
                    }
                    _ => None,
                })
                .unwrap_or_default()
                .trim()
                .to_owned()
        };
        let province = component("province");
        let mut city = component("city");
        let district = component("district");
        if city.is_empty() {
            city = province.clone();
        }
        if province.is_empty() || city.is_empty() || district.is_empty() {
            return Err(ApiError::bad_gateway("高德未能识别完整的省、市、区信息"));
        }
        let formatted_address = payload
            .pointer("/regeocode/formatted_address")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_owned();

        Ok(ReverseGeocodeResult {
            province,
            city,
            district,
            formatted_address,
        })
    }
}
