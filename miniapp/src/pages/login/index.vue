<script setup lang="ts">
import { reactive, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { login, loginWithWechat, wechatConfig } from "@/api/auth";
import { errorMessage } from "@/api/request";
import { DEFAULT_APP_ID, DEFAULT_TENANT } from "@/lib/config";
import { getSession } from "@/lib/session";

const form = reactive({
  tenant: DEFAULT_TENANT,
  username: "alice",
  password: "alice123"
});
const appId = ref(DEFAULT_APP_ID);
const loading = ref(false);
const wechatLoading = ref(false);
const error = ref("");
const wechatChecked = ref(false);
const wechatEnabled = ref(false);
const wechatName = ref("微信登录");
const wechatTenant = ref("");

function launch(app?: string): void {
  const target = app || appId.value || DEFAULT_APP_ID;
  appId.value = target;
  uni.reLaunch({
    url: "/pages/runtime/index?appId=" + encodeURIComponent(target)
  });
}

function fillDemo(username: string, password: string): void {
  form.tenant = DEFAULT_TENANT;
  form.username = username;
  form.password = password;
}

async function loadWechatConfig(): Promise<void> {
  try {
    const config = await wechatConfig();
    wechatEnabled.value = config.enabled;
    wechatName.value = config.displayName || "微信登录";
    wechatTenant.value = config.tenant || "";
  } catch {
    wechatEnabled.value = false;
  } finally {
    wechatChecked.value = true;
  }
}

async function submit(): Promise<void> {
  if (loading.value) return;
  error.value = "";
  if (!form.tenant.trim() || !form.username.trim() || !form.password) {
    error.value = "请填写租户、用户名和密码";
    return;
  }
  loading.value = true;
  try {
    await login({
      tenant: form.tenant.trim(),
      username: form.username.trim(),
      password: form.password,
      appId: appId.value
    });
    uni.showToast({ title: "登录成功", icon: "success", duration: 900 });
    setTimeout(() => launch(), 350);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

function requestWechatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.login({
      provider: "weixin",
      success: (result) => {
        if (result.code) resolve(result.code);
        else reject(new Error("微信未返回登录 code"));
      },
      fail: (failure) => reject(new Error(failure.errMsg || "微信登录失败"))
    });
  });
}

async function submitWechat(): Promise<void> {
  if (wechatLoading.value || loading.value) return;
  error.value = "";
  if (!wechatEnabled.value) {
    error.value = "微信登录未配置，请使用账号密码登录";
    return;
  }
  wechatLoading.value = true;
  try {
    const code = await requestWechatCode();
    const tenant = (wechatTenant.value || form.tenant).trim();
    await loginWithWechat({ code, tenant, appId: appId.value });
    uni.showToast({ title: "登录成功", icon: "success", duration: 900 });
    setTimeout(() => launch(), 350);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    wechatLoading.value = false;
  }
}

onLoad((options?: Record<string, string>) => {
  if (options?.appId) appId.value = options.appId;
  if (getSession()) {
    launch(appId.value);
    return;
  }
  void loadWechatConfig();
});
</script>


<template>
  <view class="login-page">
    <view class="login-hero">
      <view class="login-mark">MF</view>
      <text class="login-title">MetaForge</text>
      <text class="login-subtitle">低代码移动运行时 · uni-app</text>
      <view class="login-platform">微信小程序 / H5</view>
    </view>

    <view class="login-card">
      <view class="login-card__head">
        <text class="login-card__title">登录应用</text>
        <text class="login-card__desc">使用租户账号进入已发布应用。</text>
      </view>

      <view v-if="wechatChecked && wechatEnabled" class="login-wechat-block">
        <button class="login-wechat" :disabled="loading || wechatLoading" @click="submitWechat">
          {{ wechatLoading ? "正在校验微信身份…" : wechatName }}
        </button>
        <view class="login-divider"><text>或使用账号密码</text></view>
      </view>
      <!-- #ifdef MP-WEIXIN -->
      <view v-else-if="wechatChecked" class="login-config-hint">
        微信登录未配置，当前可使用账号密码登录。
      </view>
      <!-- #endif -->
      <view class="login-field">
        <text class="login-label">租户</text>
        <input
          v-model="form.tenant"
          class="mf-input"
          placeholder="tenant_demo_school"
          :disabled="loading"
        />
      </view>
      <view class="login-field">
        <text class="login-label">用户名</text>
        <input
          v-model="form.username"
          class="mf-input"
          placeholder="alice"
          :disabled="loading"
        />
      </view>
      <view class="login-field">
        <text class="login-label">密码</text>
        <input
          v-model="form.password"
          class="mf-input"
          password
          placeholder="请输入密码"
          :disabled="loading"
          confirm-type="go"
          @confirm="submit"
        />
      </view>

      <view v-if="error" class="login-error">{{ error }}</view>

      <button class="login-submit" :disabled="loading" @click="submit">
        {{ loading ? "正在登录…" : "进入应用" }}
      </button>

      <view class="login-demo">
        <text class="login-demo__title">演示账号</text>
        <view class="login-demo__row">
          <button class="login-demo__chip" :disabled="loading" @click="fillDemo('alice', 'alice123')">
            alice / alice123
          </button>
          <button class="login-demo__chip" :disabled="loading" @click="fillDemo('hr', 'hr123')">
            hr / hr123
          </button>
        </view>
      </view>
    </view>

    <text class="login-foot">MetaForge · 统一发布件驱动的移动端运行时</text>
  </view>
</template>

<style scoped>
.login-wechat-block {
  margin-top: 6rpx;
}
.login-wechat {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  border: 1rpx solid #16a34a;
  border-radius: 18rpx;
  background: #16a34a;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
}
.login-wechat[disabled] {
  opacity: 0.55;
}
.login-divider {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin: 26rpx 0 4rpx;
  color: #94a3b8;
  font-size: 21rpx;
}
.login-divider::before,
.login-divider::after {
  flex: 1;
  height: 1rpx;
  background: #e2e8f0;
  content: "";
}
.login-config-hint {
  margin-top: 22rpx;
  padding: 16rpx 18rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 12rpx;
  background: #f8fafc;
  color: #64748b;
  font-size: 21rpx;
  line-height: 1.5;
}
.login-page {
  min-height: 100vh;
  padding: calc(56rpx + env(safe-area-inset-top)) 36rpx 60rpx;
  background:
    radial-gradient(circle at 88% 8%, rgba(99, 102, 241, 0.2), transparent 38%),
    radial-gradient(circle at 8% 72%, rgba(14, 165, 233, 0.13), transparent 34%),
    #f4f6fb;
}
.login-hero {
  padding: 20rpx 8rpx 46rpx;
}
.login-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 82rpx;
  height: 82rpx;
  border-radius: 24rpx;
  background: linear-gradient(135deg, #4f46e5, #7c3aed);
  box-shadow: 0 18rpx 36rpx rgba(79, 70, 229, 0.28);
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 800;
  letter-spacing: 1rpx;
}
.login-title {
  display: block;
  margin-top: 28rpx;
  color: #0f172a;
  font-size: 52rpx;
  font-weight: 800;
  letter-spacing: -1.5rpx;
}
.login-subtitle {
  display: block;
  margin-top: 6rpx;
  color: #475569;
  font-size: 26rpx;
}
.login-platform {
  display: inline-flex;
  margin-top: 18rpx;
  padding: 8rpx 16rpx;
  border: 1rpx solid #c7d2fe;
  border-radius: 999rpx;
  background: #eef2ff;
  color: #4338ca;
  font-size: 21rpx;
  font-weight: 500;
}
.login-card {
  padding: 32rpx;
  border: 1rpx solid rgba(226, 232, 240, 0.9);
  border-radius: 30rpx;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 24rpx 60rpx rgba(15, 23, 42, 0.08);
}
.login-card__head {
  margin-bottom: 26rpx;
}
.login-card__title {
  display: block;
  color: #0f172a;
  font-size: 33rpx;
  font-weight: 700;
}
.login-card__desc {
  display: block;
  margin-top: 5rpx;
  color: #64748b;
  font-size: 23rpx;
}
.login-field {
  display: flex;
  flex-direction: column;
  gap: 9rpx;
  margin-top: 20rpx;
}
.login-label {
  color: #475569;
  font-size: 23rpx;
  font-weight: 500;
}
.login-error {
  margin-top: 20rpx;
  padding: 16rpx 18rpx;
  border: 1rpx solid #fecdd3;
  border-radius: 12rpx;
  background: #fff1f2;
  color: #be123c;
  font-size: 23rpx;
  line-height: 1.5;
}
.login-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 88rpx;
  margin-top: 28rpx;
  border: none;
  border-radius: 18rpx;
  background: linear-gradient(120deg, #4f46e5, #6d28d9);
  box-shadow: 0 16rpx 30rpx rgba(79, 70, 229, 0.24);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 600;
}
.login-submit[disabled] {
  opacity: 0.55;
}
.login-demo {
  margin-top: 30rpx;
  padding-top: 24rpx;
  border-top: 1rpx solid #f1f5f9;
}
.login-demo__title {
  color: #94a3b8;
  font-size: 21rpx;
}
.login-demo__row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 12rpx;
}
.login-demo__chip {
  padding: 9rpx 16rpx;
  border: 1rpx solid #e2e8f0;
  border-radius: 999rpx;
  background: #f8fafc;
  color: #475569;
  font-size: 21rpx;
  line-height: 1.3;
}
.login-foot {
  display: block;
  margin-top: 40rpx;
  color: #94a3b8;
  font-size: 20rpx;
  text-align: center;
}
</style>
