mod controller;
mod dto;
mod repository;
mod service;

pub(crate) use service::WalletService;

use axum::{
    Router,
    routing::{get, post},
};

use crate::app::AppState;

pub(crate) fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/wallet", get(controller::get_wallet))
        .route(
            "/api/admin/customers/{customer_id}/wallet/top-ups",
            post(controller::top_up_customer),
        )
}
