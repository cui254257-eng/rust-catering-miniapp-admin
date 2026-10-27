use sqlx::MySqlPool;

use crate::common::ApiError;

use super::{
    dto::{WalletResponse, WalletTopUpInput, WalletTopUpResponse},
    repository::WalletRepository,
};

#[derive(Clone)]
pub(crate) struct WalletService {
    repository: WalletRepository,
}

impl WalletService {
    pub(crate) fn new(pool: MySqlPool) -> Self {
        Self {
            repository: WalletRepository::new(pool),
        }
    }

    pub(crate) async fn get_wallet(&self, customer_id: i64) -> Result<WalletResponse, ApiError> {
        Ok(self.repository.get_wallet(customer_id).await?)
    }

    pub(crate) async fn top_up(
        &self,
        customer_id: i64,
        mut input: WalletTopUpInput,
    ) -> Result<WalletTopUpResponse, ApiError> {
        input.request_key = input.request_key.trim().to_owned();
        if !(1..=10_000_000).contains(&input.paid_cents)
            || !(0..=10_000_000).contains(&input.bonus_cents)
        {
            return Err(ApiError::bad_request(
                "实收金额需大于 0，充值和赠送金额不能超过 100,000 元",
            ));
        }
        if input.paid_cents.checked_add(input.bonus_cents).is_none() {
            return Err(ApiError::bad_request("到账金额超出范围"));
        }
        if !(8..=64).contains(&input.request_key.len())
            || !input
                .request_key
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_'))
        {
            return Err(ApiError::bad_request("储值请求标识无效，请重新操作"));
        }
        let note = input.note.take().unwrap_or_default().trim().to_owned();
        if note.chars().count() > 255 || note.chars().any(char::is_control) {
            return Err(ApiError::bad_request("储值备注不能超过 255 个字符"));
        }
        input.note = Some(note);
        Ok(self.repository.top_up(customer_id, input).await?)
    }
}
