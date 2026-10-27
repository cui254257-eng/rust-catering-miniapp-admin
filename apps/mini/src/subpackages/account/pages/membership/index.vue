<script setup lang="ts">
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { getMembershipConfig, type MembershipConfig } from '@/api/membership'
import { getCustomerProfile, type CustomerProfile } from '@/api/profile'

const profile = ref<CustomerProfile | null>(null)
const config = ref<MembershipConfig | null>(null)
const loading = ref(false)
const needsLogin = ref(false)
const errorMessage = ref('')

const tiers = computed(() => config.value?.tiers ?? [])
const currentTier = computed(() => {
  if (!profile.value) return null
  return tiers.value.find((tier) => tier.level === profile.value?.member_level) ?? null
})
const nextTier = computed(() => {
  if (!profile.value) return null
  return tiers.value.find((tier) => tier.required_points > profile.value!.points) ?? null
})
const pointsToNext = computed(() => {
  if (!profile.value || !nextTier.value) return 0
  return Math.max(0, nextTier.value.required_points - profile.value.points)
})
const progressPercent = computed(() => {
  if (!profile.value || !currentTier.value || !nextTier.value) return 100
  const span = nextTier.value.required_points - currentTier.value.required_points
  if (span <= 0) return 100
  const progress = profile.value.points - currentTier.value.required_points
  return Math.min(100, Math.max(0, (progress / span) * 100))
})
const spendingToNext = computed(() => {
  if (!config.value || !pointsToNext.value) return '0'
  const cents = Math.ceil(
    (pointsToNext.value * config.value.spend_step_cents) / config.value.points_per_step,
  )
  return (cents / 100).toFixed(2).replace(/\.00$/, '')
})

function discountLabel(rate: number) {
  if (rate >= 1) return '原价'
  return `${(rate * 10).toFixed(1).replace(/\.0$/, '')} 折`
}

function spendingLabel(points: number) {
  if (!config.value || config.value.points_per_step <= 0) return '—'
  const cents = Math.ceil((points * config.value.spend_step_cents) / config.value.points_per_step)
  const amount = (cents / 100).toFixed(2).replace(/\.00$/, '')
  return `¥${amount}`
}

function openLogin() {
  uni.navigateTo({ url: '/subpackages/account/pages/login/index' })
}

async function loadMembership() {
  if (!uni.getStorageSync('customer-token')) {
    needsLogin.value = true
    profile.value = null
    config.value = null
    return
  }

  loading.value = true
  errorMessage.value = ''
  needsLogin.value = false
  try {
    const [customerProfile, membershipConfig] = await Promise.all([
      getCustomerProfile(),
      getMembershipConfig(),
    ])
    profile.value = customerProfile
    config.value = membershipConfig
  } catch (error) {
    if (!uni.getStorageSync('customer-token')) needsLogin.value = true
    errorMessage.value = error instanceof Error ? error.message : '会员信息暂时没能加载，请稍后重试'
  } finally {
    loading.value = false
  }
}

onShow(() => { void loadMembership() })
onPullDownRefresh(() => {
  void loadMembership().finally(() => uni.stopPullDownRefresh())
})
</script>

<template>
  <view class="membership-page">
    <view class="page-intro">
      <text class="intro-kicker">MONGA·艋舺 · 会员礼遇</text>
      <text class="intro-title">常来坐坐，积分会记得</text>
      <text class="intro-caption">每一笔有效消费，都会为下一份礼遇添一点进度。</text>
    </view>

    <view v-if="loading && !profile" class="state-card">
      <text class="state-title">正在查询会员信息</text>
      <text class="state-caption">请稍等片刻</text>
    </view>

    <view v-else-if="needsLogin" class="state-card login-state">
      <view class="state-stamp"><image src="/static/icons/membership-card.svg" mode="aspectFit" /></view>
      <text class="state-title">登录后查看你的会员进度</text>
      <text class="state-caption">积分和等级与当前微信账号关联</text>
      <view class="login-action" @tap="openLogin">微信登录</view>
    </view>

    <view v-else-if="errorMessage && !profile" class="state-card">
      <text class="state-title">会员信息暂不可用</text>
      <text class="state-caption">{{ errorMessage }}</text>
      <view class="retry-action" @tap="loadMembership">再试一次</view>
    </view>

    <template v-else-if="profile">
      <view class="member-card">
        <view class="member-card-top">
          <view>
            <text class="card-eyebrow">当前会员等级</text>
            <view class="member-level-line"><text class="level-number">V{{ profile.member_level }}</text><text class="level-word">会员</text></view>
          </view>
          <view class="benefit-seal">
            <text class="seal-caption">本级礼遇</text>
            <text class="seal-value">{{ discountLabel(profile.discount_rate) }}</text>
          </view>
        </view>
        <view class="card-rule" />
        <view class="points-row">
          <view>
            <text class="points-caption">已经攒下</text>
            <view class="points-number">{{ profile.points.toLocaleString() }}<text> 积分</text></view>
          </view>
          <view class="points-note">消费 1 元<br />= 1 积分</view>
        </view>
        <view class="card-footnote">积分按实付商品金额累计，不含配送费</view>
      </view>

      <view v-if="nextTier" class="progress-card">
        <view class="section-topline">
          <view>
            <text class="section-title">下一站，V{{ nextTier.level }}</text>
            <text class="section-caption">再往前一点，就能解锁新的礼遇</text>
          </view>
          <text class="progress-percent">{{ Math.floor(progressPercent) }}%</text>
        </view>
        <view class="progress-track"><view class="progress-fill" :style="{ width: `${progressPercent}%` }" /></view>
        <view class="progress-meta"><text>当前 {{ profile.points }} 积分</text><text>还差 {{ pointsToNext }} 积分</text></view>
        <view class="upgrade-amount">
          <view class="amount-copy"><text>按当前积分规则，预计还需消费</text><view><text class="amount-currency">¥</text><text class="amount-number">{{ spendingToNext }}</text></view></view>
          <view class="amount-side"><text>即可升级至</text><text class="next-level">V{{ nextTier.level }}</text></view>
        </view>
        <view class="next-benefit">升级后享 {{ discountLabel(nextTier.discount_rate) }}{{ nextTier.discount_rate < profile.discount_rate ? '，点餐更实惠' : '会员礼遇' }}</view>
      </view>

      <view v-else class="top-tier-card">
        <view class="top-tier-mark"><image src="/static/icons/membership-award.svg" mode="aspectFit" /></view>
        <view><text class="top-tier-title">已经是最高等级</text><text class="top-tier-copy">感谢你常来，好味一直为你留着好味道。</text></view>
      </view>

      <view class="tiers-section">
        <view class="tiers-heading"><text class="section-title">会员等级一览</text><text class="tiers-heading-note">按累计积分升级</text></view>
        <view class="tiers-card">
          <view v-for="tier in tiers" :key="tier.level" class="tier-row" :class="{ 'tier-current': tier.level === profile.member_level }">
            <view class="tier-level"><text class="tier-dot" :class="{ 'dot-current': tier.level === profile.member_level }" /><text>V{{ tier.level }}</text></view>
            <text class="tier-threshold">{{ tier.required_points === 0 ? '注册即享' : `累计消费 ${spendingLabel(tier.required_points)} 起` }}</text>
            <text class="tier-discount">{{ discountLabel(tier.discount_rate) }}</text>
            <text v-if="tier.level === profile.member_level" class="current-tag">当前</text>
          </view>
        </view>
        <text class="tiers-footnote">消费 1 元 = 1 积分。积分以订单确认收款后实际到账为准。</text>
      </view>
    </template>

    <view v-if="errorMessage && profile" class="inline-error" @tap="loadMembership">{{ errorMessage }} · 点击刷新</view>
    <view class="page-footer">MONGA·艋舺 · 用心做好每一餐</view>
  </view>
</template>

<style scoped>
.membership-page { min-height: 100vh; box-sizing: border-box; padding: 20px 18px 34px; background: #f5f2ec; color: #34291f; }
.page-intro { display: flex; flex-direction: column; gap: 7px; margin: 2px 2px 20px; }
.intro-kicker { color: #a66c4f; font-size: 11px; letter-spacing: 1.2px; }
.intro-title { color: #382b21; font-family: serif; font-size: 22px; font-weight: 700; letter-spacing: .5px; }
.intro-caption { color: #9b8e7e; font-size: 11px; line-height: 1.7; }
.member-card { position: relative; overflow: hidden; padding: 20px; border: 1px solid #dfc6a7; border-radius: 20px; background: linear-gradient(135deg, #fffaf0 0%, #f3e6d1 100%); box-shadow: 0 9px 24px rgb(87 62 39 / 6%); }
.member-card::after { position: absolute; top: -48px; right: -46px; width: 145px; height: 145px; border: 1px solid rgb(178 139 94 / 15%); border-radius: 50%; content: ''; }
.member-card-top, .points-row { position: relative; z-index: 1; display: flex; align-items: center; justify-content: space-between; }
.card-eyebrow, .points-caption, .seal-caption { display: block; color: #9a8268; font-size: 10px; }
.member-level-line { display: flex; align-items: baseline; gap: 7px; margin-top: 7px; color: #60452c; }
.level-number { font-family: Georgia, serif; font-size: 35px; font-weight: 700; line-height: 1; }
.level-word { font-size: 13px; }
.benefit-seal { display: flex; width: 62px; height: 62px; flex-direction: column; align-items: center; justify-content: center; border: 1px solid rgb(165 116 74 / 32%); border-radius: 50%; background: rgb(255 252 245 / 55%); }
.seal-caption { color: #a0896f; font-size: 8px; }
.seal-value { margin-top: 4px; color: #a35e43; font-size: 13px; font-weight: 700; }
.card-rule { height: 1px; margin: 16px 0 13px; background: rgb(171 139 104 / 20%); }
.points-number { margin-top: 3px; color: #49382a; font-family: Georgia, serif; font-size: 26px; font-weight: 700; }
.points-number text { color: #8a765f; font-family: sans-serif; font-size: 11px; font-weight: 500; }
.points-note { padding: 7px 10px; border-radius: 10px; background: rgb(255 255 255 / 45%); color: #9a704f; font-size: 10px; line-height: 1.6; text-align: center; }
.card-footnote { margin-top: 12px; color: #aa9985; font-size: 9px; }
.progress-card, .tiers-card, .state-card { border: 1px solid #ece5db; border-radius: 18px; background: #fffdfa; box-shadow: 0 5px 18px rgb(54 41 29 / 3%); }
.progress-card { margin-top: 13px; padding: 18px; }
.section-topline, .tiers-heading { display: flex; align-items: center; justify-content: space-between; }
.section-title { display: block; color: #473a2e; font-size: 14px; font-weight: 700; }
.section-caption { display: block; margin-top: 5px; color: #a79a89; font-size: 10px; }
.progress-percent { color: #ad704e; font-family: Georgia, serif; font-size: 17px; font-weight: 700; }
.progress-track { height: 6px; overflow: hidden; margin-top: 17px; border-radius: 8px; background: #eee8df; }
.progress-fill { height: 100%; border-radius: 8px; background: linear-gradient(90deg, #c58c63, #a75e42); transition: width .25s ease; }
.progress-meta { display: flex; justify-content: space-between; margin-top: 8px; color: #a99c8b; font-size: 9px; }
.upgrade-amount { display: flex; align-items: center; justify-content: space-between; margin-top: 17px; padding: 13px 14px; border-radius: 13px; background: #f8f3eb; }
.amount-copy > text, .amount-side > text:first-child { display: block; color: #988875; font-size: 9px; }
.amount-copy > view { display: flex; align-items: baseline; margin-top: 2px; color: #9c583f; }
.amount-currency { font-size: 13px; font-weight: 650; }
.amount-number { margin-left: 2px; font-family: Georgia, serif; font-size: 27px; font-weight: 700; }
.amount-side { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
.next-level { color: #75583d; font-size: 13px; font-weight: 700; }
.next-benefit { margin-top: 11px; color: #a07859; font-size: 10px; }
.top-tier-card { display: flex; align-items: center; gap: 13px; margin-top: 13px; padding: 17px; border: 1px solid #e8dac5; border-radius: 17px; background: #faf5ec; }
.top-tier-mark { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 50%; background: #efe0ca; }
.top-tier-mark image { width: 22px; height: 22px; }
.top-tier-title, .top-tier-copy { display: block; }
.top-tier-title { color: #664b33; font-size: 13px; font-weight: 700; }
.top-tier-copy { margin-top: 5px; color: #a0917e; font-size: 10px; }
.tiers-section { margin-top: 24px; }
.tiers-heading { margin: 0 3px 11px; }
.tiers-heading-note { color: #aa9b88; font-size: 9px; }
.tiers-card { padding: 3px 14px; }
.tier-row { position: relative; display: flex; min-height: 49px; align-items: center; gap: 7px; border-bottom: 1px solid #f1ece5; color: #8e8375; font-size: 10px; }
.tier-row:last-child { border-bottom: 0; }
.tier-current { color: #76543a; }
.tier-level { display: flex; width: 38px; flex: 0 0 38px; align-items: center; gap: 6px; font-weight: 700; }
.tier-dot { width: 7px; height: 7px; border: 1px solid #c9b69f; border-radius: 50%; }
.dot-current { border-color: #aa7049; background: #aa7049; box-shadow: 0 0 0 3px #f3e7d8; }
.tier-threshold { flex: 1; }
.tier-discount { width: 39px; color: #9b674b; text-align: right; }
.current-tag { padding: 3px 6px; border-radius: 8px; background: #f5eade; color: #a26043; font-size: 8px; }
.tiers-footnote { display: block; margin: 10px 3px 0; color: #a99d8c; font-size: 9px; line-height: 1.6; }
.state-card { display: flex; min-height: 210px; flex-direction: column; align-items: center; justify-content: center; padding: 20px; text-align: center; }
.state-stamp { display: grid; width: 45px; height: 45px; place-items: center; margin-bottom: 12px; border: 1px solid #eadac7; border-radius: 50%; background: #fffaf3; }
.state-stamp image { width: 25px; height: 25px; }
.state-title { color: #524336; font-size: 13px; font-weight: 700; }
.state-caption { margin-top: 7px; color: #a39889; font-size: 10px; line-height: 1.6; }
.login-action, .retry-action { margin-top: 16px; padding: 9px 24px; border-radius: 20px; background: #c21850; color: #fff; font-size: 11px; }
.retry-action { background: #f4e8dc; color: #965c40; }
.inline-error { margin-top: 12px; color: #a15d43; font-size: 10px; text-align: center; }
.page-footer { margin-top: 29px; color: #b2a595; font-size: 9px; letter-spacing: .6px; text-align: center; }
</style>
