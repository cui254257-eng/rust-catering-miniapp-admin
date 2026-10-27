<script setup lang="ts">
import { onLoad, onPullDownRefresh, onShow } from "@dcloudio/uni-app";
import type { Product } from "@shop/contracts";
import { computed, ref } from "vue";
import {
  addCartLine,
  getCartLines,
  setCartLineQuantity,
  type CartLine,
} from "@/api/cart";
import { getActiveProducts } from "@/api/products";

type SortMode = "newest" | "price";

const products = ref<Product[]>([]);
const keyword = ref("");
const sortMode = ref<SortMode>("newest");
const selectedCategory = ref("全部");
const loading = ref(false);
const error = ref("");
const cartLines = ref<CartLine[]>([]);
const cartExpanded = ref(false);

const categories = computed(() => [
  "全部",
  ...new Set(products.value.map((product) => product.category).filter(Boolean)),
]);

const sortedProducts = computed(() => {
  const list = products.value.filter(
    (product) =>
      selectedCategory.value === "全部" ||
      product.category === selectedCategory.value,
  );
  if (sortMode.value === "price")
    return [...list].sort((a, b) => a.price - b.price);
  return [...list].sort((a, b) => b.id - a.id);
});
const cartCount = computed(() => cartLines.value.reduce((sum, line) => sum + line.quantity, 0));
const cartTotalCents = computed(() => cartLines.value.reduce((sum, line) => sum + Math.round(line.unit_price * 100) * line.quantity, 0));

function money(cents: number) {
  return (cents / 100).toFixed(2);
}

function refreshCart() {
  cartLines.value = getCartLines();
  if (!cartLines.value.length) cartExpanded.value = false;
}

function updateLine(line: CartLine, delta: number) {
  cartLines.value = setCartLineQuantity(line.key, line.quantity + delta);
  if (!cartLines.value.length) cartExpanded.value = false;
}

function productQuantity(productId: number) {
  return cartLines.value.reduce(
    (sum, line) => sum + (line.product_id === productId ? line.quantity : 0),
    0,
  );
}

function changeProductQuantity(product: Product, delta: number) {
  if (delta < 0) {
    const line = cartLines.value.find(
      (item) => item.product_id === product.id && item.quantity > 0,
    );
    if (line) updateLine(line, -1);
    return;
  }

  if (product.status !== "active" || product.stock <= 0) {
    uni.showToast({ title: "该菜品暂不可购买", icon: "none" });
    return;
  }
  if (productQuantity(product.id) >= product.stock) {
    uni.showToast({ title: `最多可点 ${product.stock} 份`, icon: "none" });
    return;
  }
  if (product.specifications?.length) {
    openProduct(product);
    return;
  }

  const added = addCartLine({
    key: `${product.id}:`,
    product_id: product.id,
    name: product.name,
    image_url: product.image_url,
    unit_price: product.price,
    discount_eligible: product.discount_eligible,
    quantity: 1,
    stock: product.stock,
    selections: [],
  });
  if (added) {
    refreshCart();
  } else {
    uni.showToast({ title: `最多可点 ${product.stock} 份`, icon: "none" });
  }
}

function formatSelections(line: CartLine) {
  return line.selections.map((selection) => `${selection.group_name}：${selection.option_name}`).join(' · ');
}

function goCheckout() {
  uni.navigateTo({ url: '/pages/checkout/index' });
}

async function loadProducts(resetCategory = false) {
  loading.value = true;
  error.value = "";
  try {
    if (resetCategory) selectedCategory.value = "全部";
    products.value = await getActiveProducts(keyword.value);
    if (
      selectedCategory.value !== "全部" &&
      !products.value.some((product) => product.category === selectedCategory.value)
    )
      selectedCategory.value = "全部";
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : "菜单加载失败";
  } finally {
    loading.value = false;
    uni.stopPullDownRefresh();
  }
}

function openProduct(product: Product) {
  uni.navigateTo({ url: `/subpackages/menu/pages/product/detail?id=${product.id}` });
}

function goBack() {
  uni.navigateBack();
}

onLoad((query) => {
  keyword.value = String(query?.q ?? "");
  const sort = String(query?.sort ?? "");
  if (sort === "price" || sort === "newest") sortMode.value = sort;
  void loadProducts();
});
onPullDownRefresh(() => {
  void loadProducts();
});
onShow(refreshCart);
</script>

<template>
  <view class="catalog-page" :class="{ 'has-cart': cartCount > 0 }">
    <view class="catalog-search">
      <wd-icon name="search" size="17px" color="#8b8a84" />
      <input
        v-model="keyword"
        placeholder="搜索菜品、饮品"
        confirm-type="search"
        @confirm="loadProducts(true)"
      />
      <text
        v-if="keyword"
        class="catalog-clear"
        @click="
          keyword = '';
          loadProducts(true);
        "
        >清除</text
      >
    </view>

    <view class="catalog-layout">
      <scroll-view class="category-sidebar" scroll-y :show-scrollbar="false">
        <view
          v-for="category in categories"
          :key="category"
          class="category-item"
          :class="{ active: selectedCategory === category }"
          @tap="selectedCategory = category"
        >
          {{ category }}
        </view>
      </scroll-view>

      <view class="product-panel">
        <view class="product-toolbar">
          <text class="active-category">{{ selectedCategory }}</text>
          <view class="sort-options">
            <text
              :class="{ selected: sortMode === 'newest' }"
              @tap="sortMode = 'newest'"
              >推荐</text
            >
            <text
              :class="{ selected: sortMode === 'price' }"
              @tap="sortMode = 'price'"
              >价格</text
            >
          </view>
        </view>
        <scroll-view
          :key="`${selectedCategory}-${keyword}-${sortMode}`"
          class="product-list"
          scroll-y
          :show-scrollbar="false"
        >
          <view v-if="loading && products.length === 0" class="catalog-state">
            正在加载菜单…
          </view>
          <view v-else-if="error" class="catalog-state">
            <text>{{ error }}</text>
            <wd-button class="mt-3" size="small" plain @click="loadProducts">
              重试
            </wd-button>
          </view>
          <view v-else-if="sortedProducts.length === 0" class="catalog-state">
            暂时没有找到相关菜品
          </view>
          <view v-else class="product-rows">
            <view
              v-for="product in sortedProducts"
              :key="product.id"
              class="product-row"
              @tap="openProduct(product)"
            >
              <view class="product-image">
                <image
                  v-if="product.image_url"
                  :src="product.image_url"
                  mode="aspectFill"
                />
                <text v-else>{{ product.name.slice(0, 1) }}</text>
              </view>
              <view class="product-info">
                <text class="product-name">{{ product.name }}</text>
                <text class="product-description">
                  {{ product.description || product.category }}
                </text>
                <text v-if="product.discount_eligible" class="catalog-member-tag">
                  会员折扣
                </text>
              </view>
              <view class="product-purchase-side" @tap.stop>
                <text class="catalog-price">¥{{ product.price.toFixed(2) }}</text>
                <view class="product-quantity-control">
                  <text
                    v-if="productQuantity(product.id)"
                    class="quantity-button"
                    @tap.stop="changeProductQuantity(product, -1)"
                    >−</text
                  >
                  <text v-if="productQuantity(product.id)" class="quantity-value">
                    {{ productQuantity(product.id) }}
                  </text>
                  <text
                    class="quantity-button plus"
                    :class="{ disabled: productQuantity(product.id) >= product.stock }"
                    @tap.stop="changeProductQuantity(product, 1)"
                    >＋</text
                  >
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <view v-if="cartExpanded" class="cart-scrim" @tap="cartExpanded = false" />
    <view v-if="cartExpanded" class="cart-sheet">
      <view class="sheet-heading">
        <view><text class="sheet-title">已选菜品</text><text class="sheet-caption">共 {{ cartCount }} 份</text></view>
        <!-- <text class="sheet-close" @tap="cartExpanded = false">收起 ˅</text> -->
      </view>
      <scroll-view class="cart-lines" scroll-y>
        <view v-for="line in cartLines" :key="line.key" class="cart-line">
          <view class="line-art">
            <image v-if="line.image_url" :src="line.image_url" mode="aspectFill" />
            <text v-else>{{ line.name.slice(0, 1) }}</text>
          </view>
          <view class="line-info">
            <text class="line-name">{{ line.name }}</text>
            <text v-if="line.selections.length" class="line-selections">{{ formatSelections(line) }}</text>
            <text class="line-price">¥{{ line.unit_price.toFixed(2) }}</text>
          </view>
          <view class="line-quantity">
            <text class="quantity-button" @tap="updateLine(line, -1)">−</text>
            <text class="quantity-value">{{ line.quantity }}</text>
            <text class="quantity-button plus" :class="{ disabled: line.quantity >= line.stock }" @tap="updateLine(line, 1)">＋</text>
          </view>
        </view>
      </scroll-view>
    </view>
    <view v-if="cartCount" class="cart-dock">
      <view class="cart-summary">
        <view class="cart-bag" @tap.stop="cartExpanded = !cartExpanded"><text>🛍</text><text class="cart-badge">{{ cartCount }}</text></view>
        <view class="cart-total-copy"><text class="cart-total-label">购物篮 · {{ cartCount }} 份</text><text class="cart-total-price">¥{{ money(cartTotalCents) }}</text></view>
      </view>
      <view class="checkout-action" @tap="goCheckout">立即支付</view>
    </view>
  </view>
</template>

<style scoped>
.catalog-page {
  box-sizing: border-box;
  display: flex;
  height: 100vh;
  min-height: 480px;
  flex-direction: column;
  padding: 16px 0px calc(12px + env(safe-area-inset-bottom));
  overflow: hidden;
  background: #f4f2ed;
  color: #26241f;
}
.catalog-page.has-cart {
  padding-bottom: calc(82px + env(safe-area-inset-bottom));
}
.catalog-search {
  display: flex;
  height: 42px;
  align-items: center;
  gap: 9px;
  padding: 0 14px;
  border-radius: 12px;
  background: #fff;
}
.catalog-search input {
  min-width: 0;
  flex: 1;
  color: #514f48;
  font-size: 12px;
}
.catalog-clear {
  color: #c21850;
  font-size: 11px;
}
.catalog-layout {
  display: flex;
  min-height: 0;
  flex: 1;
  margin-top: 12px;
  overflow: hidden;
}
.category-sidebar {
  width: 82px;
  height: 100%;
  flex: 0 0 82px;
  background: #eeece6;
}
.category-item {
  position: relative;
  display: flex;
  min-height: 52px;
  align-items: center;
  justify-content: center;
  padding: 0 8px;
  color: #79776f;
  font-size: 11px;
  line-height: 1.35;
  text-align: center;
}
.category-item.active {
  background: #fff;
  color: #9b123f;
  font-weight: 700;
}
.category-item.active::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: #c21850;
  content: "";
}
.product-panel {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
}
.product-toolbar {
  display: flex;
  height: 44px;
  flex: 0 0 44px;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-bottom: 1px solid #f2f0eb;
}
.active-category {
  overflow: hidden;
  color: #454139;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sort-options {
  display: flex;
  flex: 0 0 auto;
  gap: 14px;
  color: #99948a;
  font-size: 10px;
}
.sort-options text.selected {
  color: #c21850;
  font-weight: 700;
}
.product-list {
  width: 100%;
  height: 0;
  min-height: 0;
  flex: 1;
}
.product-rows {
  padding: 0 12px;
}
.product-row {
  display: flex;
  min-height: 98px;
  align-items: center;
  gap: 11px;
  padding: 11px 0;
  border-bottom: 1px solid #f2f0eb;
}
.product-image {
  display: grid;
  width: 76px;
  height: 76px;
  flex: 0 0 76px;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  background: #f2eee6;
  color: #987351;
  font-size: 24px;
}
.product-image image {
  width: 100%;
  height: 100%;
}
.product-info {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}
.product-name {
  width: 100%;
  overflow: hidden;
  color: #34312b;
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-description {
  width: 100%;
  overflow: hidden;
  color: #9b968d;
  font-size: 9px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.product-purchase-side { display: flex; flex: 0 0 68px; align-items: flex-end; flex-direction: column; gap: 8px; }
.catalog-price {
  color: #c21850;
  font-size: 12px;
  font-weight: 700;
}
.catalog-member-tag {
  display: inline-block;
  padding: 3px 6px;
  margin-top: 1px;
  border-radius: 4px;
  background: #f7f0e5;
  color: #9a7849;
  font-size: 8px;
}
.product-quantity-control { display: flex; min-height: 24px; align-items: center; gap: 6px; }
.product-quantity-control .quantity-button { width: 21px; height: 21px; font-size: 13px; }
.product-quantity-control .quantity-value { min-width: 11px; color: #4c4841; font-size: 10px; text-align: center; }
.catalog-state {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 12px;
  color: #969187;
  font-size: 12px;
  text-align: center;
}
.cart-scrim { position: fixed; z-index: 20; inset: 0; background: rgb(35 31 26 / 30%); }
.cart-sheet { position: fixed; z-index: 21; right: 12px; bottom: calc(72px + env(safe-area-inset-bottom)); left: 12px; max-height: 58vh; overflow: hidden; border: 1px solid #eee8df; border-radius: 20px; background: #fff; box-shadow: 0 14px 42px rgb(35 31 26 / 17%); }
.sheet-heading { display: flex; align-items: center; justify-content: space-between; padding: 16px 17px 12px; border-bottom: 1px solid #f2eee8; }
.sheet-heading > view { display: flex; align-items: baseline; gap: 8px; }
.sheet-title { color: #37332d; font-size: 13px; font-weight: 750; }
.sheet-caption, .sheet-close { color: #9c958a; font-size: 9px; }
.cart-lines { max-height: 45vh; padding: 0 16px; box-sizing: border-box; }
.cart-line { display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid #f4f1ec; }
.cart-line:last-child { border-bottom: 0; }
.line-art { display: grid; width: 48px; height: 48px; flex: 0 0 48px; place-items: center; overflow: hidden; border-radius: 11px; background: #f5ebdf; color: #aa704d; font-size: 19px; }
.line-art image { width: 100%; height: 100%; }
.line-info { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.line-name { overflow: hidden; color: #454038; font-size: 10px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.line-selections { overflow: hidden; color: #a39c91; font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }
.line-price { color: #c21850; font-size: 10px; font-weight: 700; }
.line-quantity { display: flex; align-items: center; gap: 7px; }
.quantity-button { display: grid; width: 23px; height: 23px; place-items: center; border-radius: 50%; background: #f3f0ea; color: #706b62; font-size: 14px; }
.quantity-button.plus { background: #c21850; color: #fff; }
.quantity-button.disabled { opacity: .4; }
.quantity-value { min-width: 10px; color: #4c4841; font-size: 9px; text-align: center; }
.cart-dock { position: fixed; z-index: 22; right: 0; bottom: 0; left: 0; display: flex; min-height: 60px; align-items: center; gap: 12px; padding: 8px 14px calc(8px + env(safe-area-inset-bottom)); border-top: 1px solid #eee9e1; background: rgb(255 255 255 / 97%); box-shadow: 0 -7px 24px rgb(49 39 22 / 6%); }
.cart-summary { display: flex; min-width: 0; flex: 1; align-items: center; gap: 10px; }
.cart-bag { position: relative; display: grid; width: 39px; height: 39px; flex: 0 0 39px; place-items: center; border-radius: 14px; background: #fbf1e8; font-size: 19px; cursor: pointer; }
.cart-badge { position: absolute; top: -5px; right: -5px; display: grid; min-width: 16px; height: 16px; place-items: center; padding: 0 3px; border-radius: 10px; background: #c21850; color: #fff; font-size: 8px; }
.cart-total-copy { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.cart-total-label { color: #8b857c; font-size: 8px; }
.cart-total-price { color: #c21850; font-size: 15px; font-weight: 750; }
.checkout-action { display: flex; min-width: 110px; height: 42px; align-items: center; justify-content: center; gap: 6px; border-radius: 23px; background: #c21850; color: #fff; font-size: 11px; font-weight: 700; }
</style>
