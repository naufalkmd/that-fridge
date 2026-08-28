/** @type {import('tailwindcss').Config} */
// Mirror of apps/web/lib/thatfridge/theme.ts — the "dark neon pixel tech" system.
// Keep these values in exact sync with the web theme until packages/core owns them.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "#0a0a0c",
        surface: "#131316",
        surface2: "#1a1a1f",
        hairline: "rgba(255,255,255,0.09)",
        "hairline-strong": "rgba(255,255,255,0.18)",
        ink: "#eaeaec",
        muted: "rgba(234,234,236,0.58)",
        faint: "rgba(234,234,236,0.34)",
        // brand accent — primary CTAs, active nav, brand moments (turquoise, not the amber)
        accent: "#26c6da",
        blue: "#5b8dee",
        good: "#39e07f",
        warn: "#f5a623",
        bad: "#ff5567",
        "agent-guardian": "#ff5f56",
        "agent-organizer": "#3d6fe0",
        "agent-chef": "#f5a623",
        "agent-shopkeeper": "#39e07f",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        md: "8px",
        lg: "10px",
        xl: "14px",
      },
      fontFamily: {
        pixel: ["PixelMix"],
        "pixel-bold": ["PixelMix-Bold"],
      },
    },
  },
  plugins: [],
};
