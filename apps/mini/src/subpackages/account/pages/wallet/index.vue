<script setup lang="ts">
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { getWallet, type WalletResponse, type WalletTransaction } from '@/api/wallet'

const wallet = ref<WalletResponse | null>(null)
const loading = ref(false)
const loadError = ref('')

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

function signedAmount(cents: number) {
  return `${cents >= 0 ? '+' : '-'}¥${money(Math.abs(cents))}`
}

function transactionTitle(transaction: WalletTransaction) {
  if (transaction.transaction_type === 'top_up') return '线下储值'
  if (transaction.transaction_type === 'order_payment') return '订单消费'
  return '余额变动'
}

// The server is authoritative for both the available balance and its transaction history.
async function loadWallet() {
  loading.value = true
  loadError.value = ''
  try {
    wallet.value = await getWallet()
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '储值记录加载失败'
  } finally {
    loading.value = false
  }
}

onShow(() => { void loadWallet() })
onPullDownRefresh(() => {
  void loadWallet().finally(() => uni.stopPullDownRefresh())
})
</script>

<template>
  <view class="wallet-page">
    <view class="wallet-heading">
      <text class="heading-kicker">MONGA · WALLET</text>
      <text class="heading-title">储值余额</text>
    </view>

    <view class="balance-panel">
      <text class="balance-label">可用余额</text>
      <view class="balance-value">
        <template v-if="wallet"><text>¥</text>{{ money(wallet.balance_cents) }}</template>
        <text v-else>--</text>
      </view>
      <text class="balance-caption">线下储值与赠送余额均可用于小程序订单付款</text>
    </view>

    <view class="ledger-heading">
      <text class="ledger-title">余额明细</text>
      <text class="ledger-caption">最近 50 笔</text>
    </view>

    <view v-if="loading && !wallet" class="state-message">正在加载储值记录…</view>
    <view v-else-if="loadError" class="state-message error-message" @tap="loadWallet">
      {{ loadError }} · 点击重试
    </view>
    <view v-else-if="wallet?.transactions.length" class="transaction-list">
      <view v-for="transaction in wallet.transactions" :key="transaction.id" class="transaction-row">
        <view class="transaction-copy">
          <text class="transaction-title">{{ transactionTitle(transaction) }}</text>
          <text class="transaction-note">{{ transaction.note || transaction.order_number || '储值余额变动' }}</text>
          <text class="transaction-date">{{ transaction.created_at }}</text>
          <text v-if="transaction.transaction_type === 'top_up'" class="top-up-detail">
            实收 ¥{{ money(transaction.paid_cents) }}<text v-if="transaction.bonus_cents"> · 赠送 ¥{{ money(transaction.bonus_cents) }}</text>
          </text>
        </view>
        <view class="transaction-amount">
          <text :class="transaction.delta_cents >= 0 ? 'amount-credit' : 'amount-debit'">
            {{ signedAmount(transaction.delta_cents) }}
          </text>
          <text class="balance-after">余额 ¥{{ money(transaction.balance_after_cents) }}</text>
        </view>
      </view>
    </view>
    <view v-else-if="wallet" class="state-message">暂无储值记录</view>
  </view>
</template>

<style scoped>
.wallet-page { min-height: 100vh; box-sizing: border-box; padding: 24px 16px calc(32px + env(safe-area-inset-bottom)); background: #f7f4f1; color: #34291f; }
.wallet-heading { display: flex; flex-direction: column; gap: 7px; margin: 0 2px 20px; }
.heading-kicker { color: #ad8b71; font-size: 9px; font-weight: 700; letter-spacing: 2px; }
.heading-title { color: #392d23; font-family: serif; font-size: 25px; font-weight: 750; }
.balance-panel { padding: 20px; border-radius: 14px; background: #315b50; color: #fff; }
.balance-label { color: #d5e4dd; font-size: 11px; }
.balance-value { margin-top: 9px; font-size: 34px; font-weight: 750; }
.balance-value text { margin-right: 4px; font-size: 18px; }
.balance-caption { display: block; margin-top: 10px; color: #d5e4dd; font-size: 10px; line-height: 1.6; }
.ledger-heading { display: flex; align-items: baseline; justify-content: space-between; margin: 25px 2px 12px; }
.ledger-title { color: #44372d; font-size: 14px; font-weight: 750; }
.ledger-caption { color: #a59a8d; font-size: 10px; }
.transaction-list { display: flex; flex-direction: column; }
.transaction-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 2px; border-bottom: 1px solid #e9e3dd; }
.transaction-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5px; }
.transaction-title { color: #44372d; font-size: 12px; font-weight: 650; }
.transaction-note { overflow: hidden; color: #8f8376; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.transaction-date, .top-up-detail { color: #aaa094; font-size: 9px; }
.top-up-detail { color: #638161; }
.transaction-amount { display: flex; flex: 0 0 auto; flex-direction: column; align-items: flex-end; gap: 6px; }
.amount-credit { color: #638161; font-size: 12px; font-weight: 700; }
.amount-debit { color: #a34f4f; font-size: 12px; font-weight: 700; }
.balance-after { color: #aaa094; font-size: 9px; }
.state-message { padding: 32px 10px; color: #9a9085; font-size: 11px; text-align: center; }
.error-message { color: #a34f4f; }
</style>
