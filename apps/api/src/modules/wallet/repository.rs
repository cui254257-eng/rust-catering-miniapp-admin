use sqlx::{FromRow, MySqlPool};

use crate::common::ApiError;

use super::dto::{WalletResponse, WalletTopUpInput, WalletTopUpResponse, WalletTransaction};

#[derive(Debug, FromRow)]
struct WalletTransactionRow {
    id: i64,
    transaction_type: String,
    paid_cents: i64,
    bonus_cents: i64,
    delta_cents: i64,
    balance_after_cents: i64,
    order_number: Option<String>,
    note: String,
    created_at: String,
}

impl From<WalletTransactionRow> for WalletTransaction {
    fn from(row: WalletTransactionRow) -> Self {
        Self {
            id: row.id,
            transaction_type: row.transaction_type,
            paid_cents: row.paid_cents,
            bonus_cents: row.bonus_cents,
            delta_cents: row.delta_cents,
            balance_after_cents: row.balance_after_cents,
            order_number: row.order_number,
            note: row.note,
            created_at: row.created_at,
        }
    }
}

#[derive(Clone)]
pub(crate) struct WalletRepository {
    pool: MySqlPool,
}

impl WalletRepository {
    pub(crate) fn new(pool: MySqlPool) -> Self {
        Self { pool }
    }

    pub(crate) async fn get_wallet(&self, customer_id: i64) -> Result<WalletResponse, sqlx::Error> {
        let balance_cents: i64 =
            sqlx::query_scalar("SELECT balance_cents FROM customers WHERE id = ?")
                .bind(customer_id)
                .fetch_one(&self.pool)
                .await?;
        let transactions = sqlx::query_as::<_, WalletTransactionRow>(
            "SELECT id, transaction_type, paid_cents, bonus_cents, delta_cents, balance_after_cents, \
             order_number, note, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at \
             FROM customer_wallet_transactions WHERE customer_id = ? ORDER BY created_at DESC, id DESC LIMIT 50",
        )
        .bind(customer_id)
        .fetch_all(&self.pool)
        .await?
        .into_iter()
        .map(WalletTransaction::from)
        .collect();

        Ok(WalletResponse {
            balance_cents,
            transactions,
        })
    }

    pub(crate) async fn top_up(
        &self,
        customer_id: i64,
        input: WalletTopUpInput,
    ) -> Result<WalletTopUpResponse, ApiError> {
        let mut tx = self.pool.begin().await?;
        let balance_cents: Option<i64> =
            sqlx::query_scalar("SELECT balance_cents FROM customers WHERE id = ? FOR UPDATE")
                .bind(customer_id)
                .fetch_optional(&mut *tx)
                .await?;
        let balance_cents = balance_cents.ok_or_else(|| ApiError::not_found("顾客不存在"))?;
        if balance_cents < 0 {
            return Err(ApiError::conflict("顾客储值余额数据异常，请联系技术人员"));
        }

        let existing = sqlx::query_as::<_, WalletTransactionRow>(
            "SELECT id, transaction_type, paid_cents, bonus_cents, delta_cents, balance_after_cents, \
             order_number, note, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at \
             FROM customer_wallet_transactions WHERE customer_id = ? AND request_key = ?",
        )
        .bind(customer_id)
        .bind(&input.request_key)
        .fetch_optional(&mut *tx)
        .await?;
        if let Some(transaction) = existing.map(WalletTransaction::from) {
            if transaction.transaction_type != "top_up"
                || transaction.paid_cents != input.paid_cents
                || transaction.bonus_cents != input.bonus_cents
                || transaction.note.as_str() != input.note.as_deref().unwrap_or_default()
            {
                return Err(ApiError::conflict("该储值操作已提交，请刷新后确认余额"));
            }
            tx.commit().await?;
            return Ok(WalletTopUpResponse {
                balance_cents,
                transaction,
            });
        }

        let credited_cents = input
            .paid_cents
            .checked_add(input.bonus_cents)
            .ok_or_else(|| ApiError::bad_request("到账金额超出范围"))?;
        let new_balance = balance_cents
            .checked_add(credited_cents)
            .filter(|balance| *balance <= 9_000_000_000_000_000)
            .ok_or_else(|| ApiError::conflict("储值余额超出可记录范围"))?;
        sqlx::query("UPDATE customers SET balance_cents = ? WHERE id = ?")
            .bind(new_balance)
            .bind(customer_id)
            .execute(&mut *tx)
            .await?;
        let result = sqlx::query(
            "INSERT INTO customer_wallet_transactions \
             (customer_id, transaction_type, paid_cents, bonus_cents, delta_cents, balance_after_cents, request_key, note) \
             VALUES (?, 'top_up', ?, ?, ?, ?, ?, ?)",
        )
        .bind(customer_id)
        .bind(input.paid_cents)
        .bind(input.bonus_cents)
        .bind(credited_cents)
        .bind(new_balance)
        .bind(&input.request_key)
        .bind(input.note.as_deref().unwrap_or_default())
        .execute(&mut *tx)
        .await?;
        let transaction = sqlx::query_as::<_, WalletTransactionRow>(
            "SELECT id, transaction_type, paid_cents, bonus_cents, delta_cents, balance_after_cents, \
             order_number, note, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at \
             FROM customer_wallet_transactions WHERE id = ?",
        )
        .bind(result.last_insert_id() as i64)
        .fetch_one(&mut *tx)
        .await?;
        tx.commit().await?;

        Ok(WalletTopUpResponse {
            balance_cents: new_balance,
            transaction: WalletTransaction::from(transaction),
        })
    }
}
