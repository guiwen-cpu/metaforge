/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1220",
        surface: "#f5f6fa",
        accent: "#4f46e5"
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "PingFang SC",
          "Hiragino Sans GB",
          "Microsoft YaHei",
          "sans-serif"
        ],
        mono: ["JetBrains Mono", "SFMono-Regular", "Menlo", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};