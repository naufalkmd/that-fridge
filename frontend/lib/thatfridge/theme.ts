// "Dark neon pixel tech" visual system - replaces the old light blue/cream + soft-rounded
// look app-wide. Single source of truth so every screen re-themes to the same values instead
// of re-deriving hex codes (the old light theme's colors were duplicated ad hoc across files -
// see AGENT_ACCENT in AboutScreen.tsx/FoodHubScreen.tsx/NotificationsScreen.tsx for how that
// drifted). Import from here for any new dark-theme work.
//
// Migration map from the old light theme (for converting an existing screen):
//   card bg #fff                                  -> bg.surface, drop boxShadow, add hairline border
//   ink #16325c (solid text)                       -> text.primary
//   muted ink rgba(22,50,92,0.55-0.65)              -> text.muted
//   faint ink rgba(22,50,92,0.35-0.5)               -> text.faint
//   screen bg linear-gradient(#eaf6ff,#cfe8fb,...)  -> bg.canvas (flat; local radial glow ok for hero moments)
//   green #3f8f5c (good/fresh)                      -> good
//   amber #d99a2b (warn/Chef)                       -> warn (same value as amber)
//   red/rust #c1452e (bad/Guardian)                 -> bad
//   blue #2f6fb0 (Organizer)                        -> blue
//   box-shadow "0 6px 16px rgba(22,50,92,0.06)"     -> remove; border: `1px solid ${border.hairline}`
//   border-radius 16                                -> radius.md (8)
//   border-radius 20/22 (larger cards/sheets)        -> radius.lg (10)
//   border-radius 28 (hero/sheet tops)               -> radius.xl (14)
//   border-radius 10/12/14 (chips/pills/inputs)      -> radius.sm (6)
export const theme = {
  bg: {
    canvas: "#0a0a0c",
    surface: "#131316",
    surface2: "#1a1a1f",
  },
  border: {
    hairline: "rgba(255,255,255,0.09)",
    strong: "rgba(255,255,255,0.18)",
  },
  text: {
    primary: "#eaeaec",
    muted: "rgba(234,234,236,0.58)",
    faint: "rgba(234,234,236,0.34)",
  },
  amber: "#f5a623",
  blue: "#5b8dee",
  // Re-tuned brighter than the old light-mode values (#d99a2b/#c1452e/#2f6fb0/#3f8f5c) so they
  // stay legible on near-black - same agent identity, same hue family, lifted luminance.
  agent: {
    guardian: "#ff5f56",
    chef: "#f5a623",
    organizer: "#5b8dee",
    shopkeeper: "#39e07f",
  },
  good: "#39e07f",
  warn: "#f5a623",
  bad: "#ff5567",
  radius: { sm: 6, md: 8, lg: 10, xl: 14 },
  fontMono: 'var(--font-geist-mono), "SF Mono", Consolas, monospace',
  fontPixel: "var(--font-pixel)",
} as const;
