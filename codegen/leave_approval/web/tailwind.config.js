/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{vue,ts}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        surface: "#f6f7fb"
      }
    }
  },
  plugins: []
};
