/** @type {import('tailwindcss').Config} */
// Light/dark values live as CSS variables in src/global.css (":root" = light, ".dark" = dark),
// kept in exact sync with apps/mobile/src/lib/theme.tsx's darkColors/lightColors - that file is
// the source of truth for the "dark neon pixel tech" system; this just points Tailwind's
// classNames (bg-surface, text-ink, etc.) at the same variables so they follow the toggle too.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  darkMode: "class",
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        surface2: "var(--color-surface2)",
        hairline: "var(--color-hairline)",
        "hairline-strong": "var(--color-hairline-strong)",
        ink: "var(--color-ink)",
        muted: "var(--color-muted)",
        faint: "var(--color-faint)",
        // brand accent — primary CTAs, active nav, brand moments (turquoise, not the amber)
        accent: "var(--color-accent)",
        blue: "var(--color-blue)",
        good: "var(--color-good)",
        warn: "var(--color-warn)",
        bad: "var(--color-bad)",
        "agent-guardian": "var(--color-agent-guardian)",
        "agent-organizer": "var(--color-agent-organizer)",
        "agent-chef": "var(--color-agent-chef)",
        "agent-shopkeeper": "var(--color-agent-shopkeeper)",
        // Text/icon color for anything drawn on an accent/status/agent-colored fill -
        // those fills are the same bright value in both themes, so the right
        // contrasting text is always this near-black token, never canvas/ink.
        "on-accent": "var(--color-on-accent)",
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
