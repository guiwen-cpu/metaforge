<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
import { ensureSession } from "@/lib/session";

onLaunch(() => {
  ensureSession();
});
</script>

<style>
page {
  --mf-bg: #f4f6fb;
  --mf-surface: #ffffff;
  --mf-ink: #0f172a;
  --mf-muted: #64748b;
  --mf-line: #e2e8f0;
  --mf-primary: #4f46e5;
  --mf-primary-soft: #eef2ff;
  --mf-danger: #e11d48;
  --mf-warning: #d97706;
  --mf-success: #059669;
  background: var(--mf-bg);
  color: var(--mf-ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  font-size: 28rpx;
  line-height: 1.55;
}

view,
text,
scroll-view,
input,
textarea,
button,
image {
  box-sizing: border-box;
}

button {
  margin: 0;
  padding: 0;
  line-height: 1.4;
  background: transparent;
  border-radius: 0;
  font-size: inherit;
  color: inherit;
}

button::after {
  border: none;
}

.mf-shell {
  width: 100%;
  max-width: 750px;
  margin: 0 auto;
  min-height: 100vh;
}

.mf-card {
  background: var(--mf-surface);
  border: 1rpx solid var(--mf-line);
  border-radius: 24rpx;
  box-shadow: 0 10rpx 30rpx rgba(15, 23, 42, 0.04);
}

.mf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  min-height: 68rpx;
  padding: 0 26rpx;
  border: 1rpx solid var(--mf-line);
  border-radius: 16rpx;
  background: #ffffff;
  color: #334155;
  font-size: 26rpx;
  font-weight: 500;
}

.mf-btn--primary {
  border-color: var(--mf-primary);
  background: var(--mf-primary);
  color: #ffffff;
}

.mf-btn--success {
  border-color: var(--mf-success);
  background: var(--mf-success);
  color: #ffffff;
}

.mf-btn--warning {
  border-color: #f59e0b;
  background: #f59e0b;
  color: #ffffff;
}

.mf-btn--danger {
  border-color: var(--mf-danger);
  background: var(--mf-danger);
  color: #ffffff;
}

.mf-btn--plain {
  background: #ffffff;
  color: var(--mf-primary);
  border-color: #c7d2fe;
}

.mf-btn--disabled {
  opacity: 0.45;
}

.mf-btn--sm {
  min-height: 56rpx;
  padding: 0 18rpx;
  font-size: 24rpx;
  border-radius: 12rpx;
}

.mf-muted {
  color: var(--mf-muted);
}

.mf-chip {
  display: inline-flex;
  align-items: center;
  min-height: 44rpx;
  padding: 0 14rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  line-height: 1;
}

.mf-chip--info {
  background: #f1f5f9;
  color: #475569;
}

.mf-chip--primary {
  background: #eef2ff;
  color: #4338ca;
}

.mf-chip--success {
  background: #ecfdf5;
  color: #047857;
}

.mf-chip--warning {
  background: #fffbeb;
  color: #b45309;
}

.mf-chip--danger {
  background: #fff1f2;
  color: #be123c;
}

.mf-field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.mf-label {
  color: #475569;
  font-size: 24rpx;
  font-weight: 500;
}

.mf-input,
.mf-textarea {
  width: 100%;
  min-height: 72rpx;
  padding: 0 20rpx;
  border: 1rpx solid var(--mf-line);
  border-radius: 14rpx;
  background: #f8fafc;
  color: var(--mf-ink);
  font-size: 26rpx;
}

.mf-textarea {
  min-height: 160rpx;
  padding: 18rpx 20rpx;
  line-height: 1.5;
}

.mf-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(15, 23, 42, 0.46);
}

.mf-sheet {
  width: 100%;
  max-width: 750px;
  max-height: 88vh;
  border-radius: 28rpx 28rpx 0 0;
  background: #ffffff;
  overflow: hidden;
}

.mf-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 28rpx 30rpx 20rpx;
  border-bottom: 1rpx solid #f1f5f9;
}

.mf-sheet__body {
  max-height: 66vh;
  padding: 24rpx 30rpx;
}

.mf-sheet__foot {
  display: flex;
  justify-content: flex-end;
  gap: 16rpx;
  padding: 20rpx 30rpx calc(24rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid #f1f5f9;
}

.mf-empty {
  padding: 70rpx 20rpx;
  color: #94a3b8;
  text-align: center;
  font-size: 25rpx;
}
</style>
