use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub(crate) struct WalletTopUpInput {
    pub(crate) paid_cents: i64,
    pub(crate) bonus_cents: i64,
    pub(crate) request_key: String,
    pub(crate) note: Option<String>,
}

#[derive(Debug, Serialize)]
pub(crate) struct WalletResponse {
    pub(crate) balance_cents: i64,
    pub(crate) transactions: Vec<WalletTransaction>,
}

#[derive(Debug, Serialize)]
pub(crate) struct WalletTopUpResponse {
    pub(crate) balance_cents: i64,
    pub(crate) transaction: WalletTransaction,
}

#[derive(Debug, Serialize)]
pub(crate) struct WalletTransaction {
    pub(crate) id: i64,
    pub(crate) transaction_type: String,
    pub(crate) paid_cents: i64,
    pub(crate) bonus_cents: i64,
    pub(crate) delta_cents: i64,
    pub(crate) balance_after_cents: i64,
    pub(crate) order_number: Option<String>,
    pub(crate) note: String,
    pub(crate) created_at: String,
}
