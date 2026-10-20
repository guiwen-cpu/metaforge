import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import uniModule from "@dcloudio/vite-plugin-uni";

// 当前 alpha 版本把工厂函数包在嵌套 default 中，兼容两种导出形态。
const uni = (uniModule as any).default ?? uniModule;

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url))
    }
  },
  server: {
    port: 5180,
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET ?? "http://localhost:8080",
        changeOrigin: true
      }
    }
  }
});
