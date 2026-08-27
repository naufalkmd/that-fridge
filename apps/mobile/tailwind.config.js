/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // ThatFridge "dark neon pixel tech" palette — mirror of apps/web theme.ts.
      // Keep in sync until packages/core owns the shared token source.
      colors: {
        canvas: "#0b0f14",
        surface: "#141b23",
        hairline: "#243040",
        ink: "#e8eef4",
        muted: "#9fb0c0",
        faint: "#5f7285",
        good: "#3f8f5c",
        warn: "#d99a2b",
        bad: "#c1452e",
        accent: "#4de1c1",
      },
    },
  },
  plugins: [],
};
