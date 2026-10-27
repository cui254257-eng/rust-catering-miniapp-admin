mod controller;
mod service;

pub(crate) use service::AmapService;

use crate::app::AppState;
use axum::{
    Router,
    routing::{get, post},
};

pub(crate) fn routes() -> Router<AppState> {
    Router::new()
        .route("/_AMapService/{*path}", get(controller::proxy_geocoder))
        .route(
            "/api/maps/riding-distance",
            post(controller::riding_distance),
        )
        .route(
            "/api/maps/reverse-geocode",
            post(controller::reverse_geocode),
        )
}
