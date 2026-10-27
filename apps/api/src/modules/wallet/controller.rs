use axum::{
    Json,
    extract::{Path, State},
    http::HeaderMap,
};

use crate::{app::AppState, common::ApiError};

use super::dto::{WalletResponse, WalletTopUpInput, WalletTopUpResponse};

pub(crate) async fn get_wallet(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<WalletResponse>, ApiError> {
    let customer_id = state.auth.authenticate(&headers).await?;
    Ok(Json(state.wallet.get_wallet(customer_id).await?))
}

pub(crate) async fn top_up_customer(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(customer_id): Path<i64>,
    Json(input): Json<WalletTopUpInput>,
) -> Result<Json<WalletTopUpResponse>, ApiError> {
    state.authenticate_admin(&headers)?;
    Ok(Json(state.wallet.top_up(customer_id, input).await?))
}
