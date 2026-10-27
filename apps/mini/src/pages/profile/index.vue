<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import { logoutCustomer } from "@/api/auth";
import { getCustomerProfile, type CustomerProfile } from "@/api/profile";

const loggedIn = ref(false);
const checking = ref(false);
const loggingOut = ref(false);
const profile = ref(
  (uni.getStorageSync("customer-profile") as CustomerProfile | undefined) ??
    null,
);

function refreshSession() {
  if (!uni.getStorageSync("customer-token")) {
    loggedIn.value = false;
    profile.value = null;
    return;
  }

  loggedIn.value = true;
  checking.value = true;
  void getCustomerProfile()
    .then((customerProfile) => {
      profile.value = customerProfile;
      loggedIn.value = true;
    })
    .catch(() => {
      const token = Boolean(uni.getStorageSync("customer-token"));
      loggedIn.value = token;
      if (!token) profile.value = null;
    })
    .finally(() => {
      checking.value = false;
    });
}

function openLogin() {
  uni.navigateTo({ url: "/subpackages/account/pages/login/index" });
}

function openProfileEdit() {
  uni.navigateTo({ url: "/subpackages/account/pages/profile/edit" });
}

function openAddresses() {
  uni.navigateTo({ url: "/subpackages/account/pages/address/index" });
}

function openOrders() {
  if (!uni.getStorageSync("customer-token")) {
    openLogin();
    return;
  }
  uni.navigateTo({ url: "/subpackages/account/pages/orders/index" });
}

function openMembership() {
  uni.navigateTo({ url: "/subpackages/account/pages/membership/index" });
}

function openWallet() {
  if (!uni.getStorageSync("customer-token")) {
    openLogin();
    return;
  }
  uni.navigateTo({ url: "/subpackages/account/pages/wallet/index" });
}

function confirmLogout() {
  if (loggingOut.value) return;
  uni.showModal({
    title: "退出登录",
    content: "确定退出当前微信账号吗？",
    confirmText: "退出登录",
    confirmColor: "#c21850",
    success: async ({ confirm }) => {
      if (!confirm) return;

      loggingOut.value = true;
      try {
        await logoutCustomer();
      } catch {
        // Local credentials are cleared in logoutCustomer even if the server is unavailable.
      } finally {
        loggedIn.value = false;
        profile.value = null;
        checking.value = false;
        loggingOut.value = false;
      }
      uni.showToast({ title: "已退出登录", icon: "success" });
    },
  });
}

onShow(refreshSession);
</script>

<template>
  <view class="profile-page">
    <view class="profile-card" :class="{ 'guest-card': !loggedIn }">
      <view class="avatar-wrap">
        <view class="avatar-glow" />
        <image
          v-if="profile?.avatar_data_url"
          class="profile-avatar-image"
          :src="profile.avatar_data_url"
          mode="aspectFill"
        />
        <view v-else class="profile-avatar">{{
          profile?.nickname?.slice(0, 1) || "微"
        }}</view>
      </view>
      <view class="profile-copy">
        <text class="profile-name">{{
          loggedIn ? profile?.nickname || "微信用户" : "欢迎来到 MONGA·艋舺"
        }}</text>
        <text class="profile-status">{{
          loggedIn ? (checking ? "正在确认登录状态" : "") : "登录后继续点餐"
        }}</text>
      </view>
      <view v-if="!loggedIn" class="login-button" @tap="openLogin">登录</view>
      <view v-else class="member-mark"
        ><text>V{{ profile?.member_level ?? 1 }}</text
        ><text class="member-star">✦</text></view
      >
    </view>

    <view
      v-if="loggedIn && profile"
      class="membership-card"
      @tap="openMembership"
    >
      <view class="membership-top">
        <text class="membership-level">V{{ profile.member_level }} 会员</text>
        <view class="membership-top-right">
          <text class="membership-benefit">{{
            (profile.discount_rate ?? 1) < 1
              ? `${((profile.discount_rate ?? 1) * 10).toFixed(1)} 折`
              : "暂无折扣"
          }}</text>
          <text class="membership-arrow">›</text>
        </view>
      </view>
      <view class="membership-points"
        ><text>当前积分</text><strong>{{ profile.points ?? 0 }}</strong></view
      >
      <view
        v-if="profile.points_to_next_level != null"
        class="membership-progress-copy"
        >再得 {{ profile.points_to_next_level }} 积分升级 V{{
          profile.next_level
        }}</view
      >
      <view v-else class="membership-progress-copy">已达最高等级</view>
      <view class="membership-link">查看等级与升级详情 <text>→</text></view>
    </view>

    <view class="service-section">
      <view class="section-heading">
        <text class="section-title">个人服务</text>
        <text class="section-caption">PERSONAL SERVICE</text>
      </view>
      <view class="service-card">
        <view class="service-row" @tap="openOrders">
          <view class="service-icon order-icon">
            <image class="service-icon-svg" src="/static/icons/order.svg" mode="aspectFit" />
          </view>
          <view class="service-copy">
            <text class="service-title">我的订单</text>
            <text class="service-caption">查看点餐记录与订单状态</text>
          </view>
          <wd-icon name="arrow-right" size="16px" color="#b6aa9d" />
        </view>
        <view class="service-divider" />

        <view v-if="loggedIn && profile" class="service-row" @tap="openWallet">
          <view class="service-icon wallet-icon">¥</view>
          <view class="service-copy">
            <text class="service-title">储值余额</text>
            <text class="service-caption">当前 ¥{{ ((profile.balance_cents ?? 0) / 100).toFixed(2) }} · 查看储值明细</text>
          </view>
          <wd-icon name="arrow-right" size="16px" color="#b6aa9d" />
        </view>
        <view v-if="loggedIn && profile" class="service-divider" />

        <view v-if="loggedIn" class="service-row" @tap="openProfileEdit">
          <view class="service-icon profile-icon">
            <image
              class="service-icon-svg"
              src="/static/icons/profile.svg"
              mode="aspectFit"
            />
          </view>
          <view class="service-copy">
            <text class="service-title">个人资料</text>
            <text class="service-caption">修改头像和昵称</text>
          </view>
          <wd-icon name="arrow-right" size="16px" color="#b6aa9d" />
        </view>
        <view v-if="loggedIn" class="service-divider" />

        <view class="service-divider" />
        <view class="service-row" @tap="openAddresses">
          <view class="service-icon address-icon">
            <image
              class="service-icon-svg"
              src="/static/icons/address.svg"
              mode="aspectFit"
            />
          </view>
          <view class="service-copy">
            <text class="service-title">收货地址</text>
            <text class="service-caption">管理外卖收件信息</text>
          </view>
          <wd-icon name="arrow-right" size="16px" color="#b6aa9d" />
        </view>
      </view>
    </view>

    <view
      v-if="loggedIn"
      class="logout-button"
      :class="{ busy: loggingOut }"
      @tap="confirmLogout"
    >
      {{ loggingOut ? "正在退出…" : "退出登录" }}
    </view>

    <view class="footer-stamp"
      ><view class="stamp-line" />MONGA·艋舺 · 用心做好每一餐<view
        class="stamp-line"
    /></view>
  </view>
</template>

<style scoped>
.profile-page {
  min-height: 100vh;
  box-sizing: border-box;
  padding: calc(env(safe-area-inset-top) + 18px) 18px 32px;
  background: #faf6f7;
  color: #34291f;
}
.page-heading {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 2px 2px 19px;
}
.page-kicker {
  color: #ae8b70;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 2.2px;
}
.page-title {
  color: #33271e;
  font-family: serif;
  font-size: 27px;
  font-weight: 700;
  letter-spacing: 1px;
}
.profile-card {
  position: relative;
  display: flex;
  min-height: 108px;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  padding: 18px 17px;
  border: 1px solid rgb(255 255 255 / 50%);
  border-radius: 22px;
  background: linear-gradient(118deg, #761329, #a81746 58%, #d6336c);
  box-shadow: 0 10px 26px rgb(118 19 41 / 18%);
}
.profile-card::after {
  position: absolute;
  top: -55px;
  right: -30px;
  width: 160px;
  height: 160px;
  border: 1px solid rgb(255 255 255 / 34%);
  border-radius: 50%;
  content: "";
}
.membership-card {
  margin: 12px 0 24px;
  padding: 16px 18px;
  border: 1px solid #e9dac4;
  border-radius: 18px;
  background: linear-gradient(125deg, #fffaf1, #f5e8d3);
  box-shadow: 0 7px 22px rgb(54 41 29 / 4%);
}
.membership-top,
.membership-points {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.membership-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
.membership-arrow {
  color: #b39a80;
  font-size: 20px;
  line-height: 1;
}
.membership-level {
  color: #795530;
  font-size: 12px;
  font-weight: 750;
}
.membership-benefit {
  color: #a35e43;
  font-size: 11px;
  font-weight: 700;
}
.membership-points {
  margin-top: 13px;
  color: #897d6c;
  font-size: 10px;
}
.membership-points strong {
  color: #4d4337;
  font-size: 23px;
}
.membership-progress-copy {
  margin-top: 7px;
  color: #a39787;
  font-size: 9px;
}
.membership-link {
  display: flex;
  justify-content: space-between;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid rgb(188 159 124 / 20%);
  color: #927353;
  font-size: 10px;
}
.guest-card {
  min-height: 156px;
  align-items: flex-start;
  padding-top: 22px;
}
.avatar-wrap {
  position: relative;
  z-index: 1;
  display: grid;
  width: 58px;
  height: 58px;
  flex: 0 0 58px;
  place-items: center;
}
.avatar-glow {
  position: absolute;
  width: 58px;
  height: 58px;
  border: 1px solid rgb(255 255 255 / 45%);
  border-radius: 50%;
}
.profile-avatar {
  display: grid;
  width: 49px;
  height: 49px;
  place-items: center;
  border: 2px solid #fff8ef;
  border-radius: 50%;
  background: #fff5e8;
  box-shadow: 0 3px 9px rgb(86 55 33 / 12%);
  color: #c21850;
  font-family: serif;
  font-size: 23px;
  font-weight: 700;
}
.profile-avatar-image {
  width: 53px;
  height: 53px;
  border: 2px solid #fff8ef;
  border-radius: 50%;
  background: #fff5e8;
  box-shadow: 0 3px 9px rgb(86 55 33 / 12%);
}
.profile-copy {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 7px;
}
.profile-name {
  overflow: hidden;
  color: #fff;
  font-size: 16px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-status {
  color: #ffe5ed;
  font-size: 10px;
  letter-spacing: 0.2px;
}
.login-button {
  position: absolute;
  z-index: 2;
  right: 17px;
  bottom: 17px;
  display: flex;
  height: 34px;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 17px;
  border: 0;
  border-radius: 18px;
  background: #fffaf3;
  box-shadow: 0 4px 10px rgb(104 64 39 / 10%);
  color: #9b123f;
  font-size: 11px;
  font-weight: 700;
  line-height: 34px;
}
.login-button::after {
  border: 0;
}
.login-button.busy {
  opacity: 0.7;
}
.member-mark {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 5px 8px;
  border: 1px solid rgb(255 250 243 / 60%);
  border-radius: 12px;
  color: #fff;
  font-size: 9px;
}
.member-star {
  color: #ffd6e3;
}
.service-section {
  margin-top: 27px;
}
.section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 0 3px 12px;
}
.section-title {
  color: #44372d;
  font-size: 14px;
  font-weight: 750;
}
.section-caption {
  color: #b3a596;
  font-size: 8px;
  letter-spacing: 1.4px;
}
.service-card {
  padding: 3px 16px;
  border: 1px solid #eee8df;
  border-radius: 19px;
  background: #fffdfa;
  box-shadow: 0 6px 20px rgb(54 41 29 / 3%);
}
.service-row {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 14px 0;
}
.service-icon {
  display: grid;
  width: 39px;
  height: 39px;
  flex: 0 0 39px;
  place-items: center;
  border-radius: 13px;
  color: #a35e43;
  font-family: serif;
  font-size: 15px;
  font-weight: 700;
}
.service-icon-svg {
  width: 22px;
  height: 22px;
}
.cart-icon {
  background: #f8eee4;
}
.address-icon {
  background: #eef1e5;
  color: #77815b;
}
.profile-icon {
  background: #f2ebf2;
  color: #8b6b8f;
}
.order-icon {
  background: #fbefe5;
  color: #ad6948;
  font-family: inherit;
  font-size: 14px;
}
.wallet-icon {
  background: #eaf1ed;
  color: #557d69;
  font-family: inherit;
  font-size: 17px;
}
.service-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}
.service-title {
  color: #43392f;
  font-size: 12px;
  font-weight: 650;
}
.service-caption {
  color: #aaa195;
  font-size: 10px;
}
.service-divider {
  height: 1px;
  margin-left: 52px;
  background: #f1ece5;
}
.logout-button {
  display: flex;
  height: 46px;
  align-items: center;
  justify-content: center;
  margin-top: 18px;
  border: 1px solid #eee2d8;
  border-radius: 14px;
  background: #fffdfa;
  color: #a35e43;
  font-size: 12px;
  font-weight: 600;
}
.logout-button.busy {
  opacity: 0.6;
}
.footer-stamp {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 39px;
  color: #b1a393;
  font-size: 9px;
  letter-spacing: 0.7px;
}
.stamp-line {
  width: 22px;
  height: 1px;
  background: #d8cec1;
}
</style>
