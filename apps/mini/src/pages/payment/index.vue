<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app'
import { computed, ref } from 'vue'
import { getMyOrders, payOrder, type OrderSummary } from '@/api/orders'
import { getCustomerProfile, type CustomerProfile } from '@/api/profile'

const orderNumber = ref('')
const order = ref<OrderSummary | null>(null)
const profile = ref<CustomerProfile | null>(null)
const loading = ref(true)
const paying = ref(false)
const loadError = ref('')
const selectedMethod = ref<'wallet' | 'wechat'>('wallet')
const paid = ref(false)

const balanceInsufficient = computed(() =>
  Boolean(order.value && profile.value && profile.value.balance_cents < order.value.total_cents),
)
const canPay = computed(() =>
  Boolean(order.value && profile.value && !balanceInsufficient.value && !paying.value && selectedMethod.value === 'wallet' && !paid.value),
)

function money(cents: number) {
  return (cents / 100).toFixed(2)
}

function modeLabel(mode: string) {
  if (mode === 'delivery') return '外卖配送'
  if (mode === 'takeaway') return '到店自取'
  return '堂食'
}

async function loadPayment() {
  loading.value = true
  loadError.value = ''
  try {
    const [orders] = await Promise.all([
      getMyOrders(),
      getCustomerProfile().then((value) => { profile.value = value }).catch(() => { profile.value = null }),
    ])
    order.value = orders.find((item) => item.order_number === orderNumber.value) ?? null
    if (!order.value) loadError.value = '订单不存在或已失效，请在我的订单中查看'
    else if (order.value.payment_status === 'paid') paid.value = true
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : '订单信息加载失败，请稍后重试'
  } finally {
    loading.value = false
  }
}

function chooseMethod(method: 'wallet' | 'wechat') {
  if (method === 'wechat') {
    uni.showToast({ title: '微信支付即将接入', icon: 'none' })
    return
  }
  selectedMethod.value = method
}

async function submitPayment() {
  if (!canPay.value || !order.value) return
  paying.value = true
  try {
    await payOrder(order.value.order_number, 'wallet')
    paid.value = true
    order.value = { ...order.value, payment_status: 'paid', status: 'paid', payment_method: 'wallet' }
    try { profile.value = await getCustomerProfile() } catch { /* payment is already confirmed server-side */ }
    uni.showToast({ title: '支付成功', icon: 'success' })
  } catch (error) {
    await loadPayment()
    uni.showModal({
      title: '支付未完成',
      content: error instanceof Error ? error.message : '请稍后重试',
      showCancel: false,
      confirmText: '知道了',
    })
  } finally {
    paying.value = false
  }
}

function openOrders() {
  uni.navigateTo({ url: '/subpackages/account/pages/orders/index' })
}

function goBack() {
  uni.navigateBack({ delta: 1 })
}

onLoad((query) => {
  orderNumber.value = String(query?.order_number || '')
  if (!orderNumber.value) {
    loadError.value = '缺少订单信息'
    loading.value = false
    return
  }
  void loadPayment()
})
</script>

<template>
  <view class="payment-page">
    <view class="payment-heading">
      <view class="heading-copy">
        <text class="heading-kicker">MONGA · CHECKOUT</text>
        <text class="heading-title">选择支付方式</text>
        <text class="heading-caption">订单已为你保留 15 分钟</text>
      </view>
      <view class="heading-mark">⌁</view>
    </view>

    <view v-if="loading" class="state-card">
      <text class="state-mark">···</text>
      <text class="state-title">正在准备支付</text>
      <text class="state-caption">请稍等片刻</text>
    </view>
    <view v-else-if="loadError" class="state-card">
      <text class="state-mark error-mark">!</text>
      <text class="state-title">无法打开支付订单</text>
      <text class="state-caption">{{ loadError }}</text>
      <view class="outline-button" @tap="goBack">返回结算</view>
    </view>
    <template v-else-if="order">
      <view class="amount-panel">
        <text class="amount-label">本次应付</text>
        <view class="amount-value"><text>¥</text>{{ money(order.total_cents) }}</view>
        <view class="amount-meta"><text>{{ modeLabel(order.fulfillment_mode) }}</text><text>订单号 {{ order.order_number }}</text></view>
      </view>

      <view class="section-label"><text>支付方式</text><text>PAYMENT</text></view>
      <view class="method-list">
        <view class="method-option" :class="{ selected: selectedMethod === 'wallet', disabled: !profile }" @tap="chooseMethod('wallet')">
          <view class="method-icon wallet-icon">¥</view>
          <view class="method-copy">
            <text class="method-title">余额支付</text>
            <text class="method-desc">储值余额 · 当前可用 {{ profile ? `¥${money(profile.balance_cents)}` : '暂不可用' }}</text>
          </view>
          <view class="method-check">{{ selectedMethod === 'wallet' ? '✓' : '' }}</view>
        </view>
        <view class="method-option unavailable" @tap="chooseMethod('wechat')">
          <view class="method-icon wechat-icon">信</view>
          <view class="method-copy">
            <text class="method-title">微信支付</text>
            <text class="method-desc">微信安全支付 · 即将接入</text>
          </view>
          <text class="coming-soon">即将开放</text>
        </view>
      </view>

      <view v-if="balanceInsufficient" class="insufficient-note">
        <text class="note-icon">!</text>
        <text>余额不足 ¥{{ money(order.total_cents - (profile?.balance_cents || 0)) }}，请先到储值余额充值</text>
      </view>
      <view v-else-if="!profile" class="insufficient-note neutral-note">
        <text class="note-icon">!</text><text>登录状态失效，请返回后重新登录</text>
      </view>

      <view class="order-mini-card">
        <view class="mini-heading"><text>订单明细</text><text>{{ order.items.reduce((sum, item) => sum + item.quantity, 0) }} 件商品</text></view>
        <view v-for="(item, index) in order.items" :key="`${item.product_name}-${index}`" class="mini-row">
          <text class="mini-name">{{ item.product_name }} <text class="mini-quantity">× {{ item.quantity }}</text></text>
          <text class="mini-price">¥{{ money(item.line_total_cents) }}</text>
        </view>
        <view v-if="order.discount_cents" class="mini-row discount-row"><text>会员优惠</text><text>-¥{{ money(order.discount_cents) }}</text></view>
        <view v-if="order.delivery_fee_cents" class="mini-row"><text>配送费</text><text>¥{{ money(order.delivery_fee_cents) }}</text></view>
      </view>

      <view v-if="paid" class="success-panel">
        <text class="success-icon">✓</text><text class="success-title">订单支付成功</text>
        <text class="success-caption">订单已提交门店，请留意制作进度</text>
        <view class="primary-button" @tap="openOrders">查看我的订单</view>
      </view>
      <wd-button v-else class="pay-button" block type="primary" :loading="paying" :disabled="!canPay" @click="submitPayment">
        {{ !profile ? '暂无法支付' : balanceInsufficient ? '余额不足，暂不能支付' : '确认支付 ¥' + money(order.total_cents) }}
      </wd-button>
      <view v-if="!paid" class="safe-caption">支付由门店安全系统处理 · 订单支付后开始制作</view>
    </template>
  </view>
</template>

<style scoped>
.payment-page { min-height: 100vh; box-sizing: border-box; padding: 24px 16px calc(34px + env(safe-area-inset-bottom)); background: #f6f4f0; color: #34291f; }
.payment-heading { display: flex; align-items: flex-start; justify-content: space-between; margin: 0 2px 21px; }
.heading-copy { display: flex; flex-direction: column; gap: 6px; }
.heading-kicker { color: #a66343; font-size: 9px; font-weight: 700; letter-spacing: 1.8px; }
.heading-title { color: #392d23; font-family: serif; font-size: 24px; font-weight: 750; letter-spacing: .5px; }
.heading-caption { color: #a59a8d; font-size: 10px; }
.heading-mark { display: grid; width: 43px; height: 43px; place-items: center; border: 1px solid #eee4d8; border-radius: 14px; background: #fffdfa; color: #c21850; font-size: 23px; box-shadow: 0 6px 16px rgb(54 41 29 / 5%); }
.amount-panel { padding: 21px 20px 17px; border-radius: 16px; background: #315b50; color: #fff; box-shadow: 0 9px 24px rgb(49 91 80 / 15%); }
.amount-label { color: #d5e4dd; font-size: 10px; }
.amount-value { margin-top: 7px; font-size: 32px; font-weight: 750; letter-spacing: .5px; }
.amount-value text { margin-right: 3px; font-size: 17px; }
.amount-meta { display: flex; justify-content: space-between; gap: 10px; margin-top: 14px; color: #d5e4dd; font-size: 9px; }
.section-label { display: flex; align-items: center; justify-content: space-between; margin: 24px 2px 10px; color: #53473b; font-size: 13px; font-weight: 700; }
.section-label text:last-child { color: #b1a497; font-size: 8px; font-weight: 600; letter-spacing: 1.5px; }
.method-list { display: flex; flex-direction: column; gap: 9px; }
.method-option { display: flex; min-height: 64px; align-items: center; gap: 11px; padding: 10px 13px; border: 1px solid #e9e0d6; border-radius: 14px; background: #fffdfa; box-shadow: 0 5px 16px rgb(54 41 29 / 3%); }
.method-option.selected { border-color: #c21850; box-shadow: 0 5px 16px rgb(194 24 80 / 9%); }
.method-option.unavailable { opacity: .72; }
.method-icon { display: grid; width: 36px; height: 36px; flex: 0 0 36px; place-items: center; border-radius: 11px; color: #fff; font-size: 16px; font-weight: 750; }
.wallet-icon { background: #c21850; }
.wechat-icon { background: #7ca17a; font-size: 14px; }
.method-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.method-title { color: #44372d; font-size: 12px; font-weight: 700; }
.method-desc { overflow: hidden; color: #9d9185; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.method-check { display: grid; width: 20px; height: 20px; place-items: center; border: 1px solid #d7cdc1; border-radius: 50%; color: #fff; font-size: 12px; }
.selected .method-check { border-color: #c21850; background: #c21850; }
.coming-soon { color: #ad9d8e; font-size: 8px; white-space: nowrap; }
.insufficient-note { display: flex; align-items: center; gap: 7px; margin-top: 11px; padding: 10px 11px; border-radius: 10px; background: #fff1ed; color: #a34f4f; font-size: 9px; line-height: 1.45; }
.neutral-note { background: #f1eee9; color: #8e8377; }
.note-icon { display: grid; width: 16px; height: 16px; flex: 0 0 16px; place-items: center; border-radius: 50%; background: currentColor; color: #fff; font-size: 10px; font-weight: 700; }
.order-mini-card { margin-top: 17px; padding: 14px; border: 1px solid #ebe4db; border-radius: 14px; background: #fffdfa; }
.mini-heading, .mini-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.mini-heading { padding-bottom: 10px; border-bottom: 1px solid #f0ebe4; color: #55493e; font-size: 11px; font-weight: 700; }
.mini-heading text:last-child { color: #a79b8e; font-size: 9px; font-weight: 400; }
.mini-row { padding-top: 9px; color: #877a6e; font-size: 10px; }
.mini-name { overflow: hidden; flex: 1; text-overflow: ellipsis; white-space: nowrap; }
.mini-quantity { color: #aaa094; }
.mini-price { color: #665a4f; }
.discount-row { color: #a66343; }
.pay-button { width: 100%; margin-top: 22px; }
.safe-caption { margin-top: 10px; color: #aaa094; font-size: 8px; text-align: center; }
.success-panel { display: flex; align-items: center; flex-direction: column; margin-top: 20px; padding: 22px 16px 17px; border-radius: 14px; background: #edf5ef; }
.success-icon { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 50%; background: #638161; color: #fff; font-size: 22px; }
.success-title { margin-top: 9px; color: #496448; font-size: 14px; font-weight: 700; }
.success-caption { margin-top: 5px; color: #7f927f; font-size: 9px; }
.primary-button, .outline-button { margin-top: 15px; padding: 11px 23px; border-radius: 22px; font-size: 10px; font-weight: 700; }
.primary-button { background: #638161; color: #fff; }
.outline-button { border: 1px solid #d8cec1; color: #75685d; }
.state-card { display: flex; min-height: 240px; align-items: center; flex-direction: column; justify-content: center; padding: 24px; border: 1px solid #eee8df; border-radius: 17px; background: #fffdfa; text-align: center; }
.state-mark { display: grid; width: 48px; height: 48px; place-items: center; margin-bottom: 12px; border-radius: 50%; background: #f8eee4; color: #b66d4c; font-size: 19px; }
.error-mark { background: #fff1ed; color: #a34f4f; }
.state-title { color: #514237; font-size: 13px; font-weight: 700; }
.state-caption { max-width: 240px; margin-top: 7px; color: #9e9388; font-size: 10px; line-height: 1.6; }
</style>
