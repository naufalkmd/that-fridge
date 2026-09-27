// Design tokens shared by every screen: kept apart from the theme hook so screens (and tests that
// mock the theme) always get the same values.

/**
 * Corner radii, one scale for the whole app (roughly Apple's: small controls 8, buttons / fields /
 * list cards 12, large cards and sheets 16). Use with `borderCurve: "continuous"` for iOS-style
 * smooth corners. Circles (radius = half the size), dots and thin bars keep their own values.
 */
export const RADIUS = { xs: 4, sm: 8, md: 12, lg: 16 } as const;

/** Type roles. Screen titles match Inventory's: PixelMix 16 (PixelText already sets letterSpacing 0.5). */
export const TYPE = {
  /** Screen title, via <PixelText>. */
  title: { fontSize: 16 },
  /** A thing's own name at the top of its page or sheet (a recipe, an item, a person). */
  contentTitle: { fontSize: 18, fontWeight: "700" },
  /** Small uppercase label over a section. */
  section: { fontSize: 11, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase" },
} as const;
