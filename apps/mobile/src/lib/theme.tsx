import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as SecureStore from "expo-secure-store";
import { colorScheme as nativewindColorScheme, useColorScheme } from "nativewind";

// Local-only, per-device preference - same pattern as lib/fridgeReminder.ts. Bump the key
// suffix if the set of valid values ever changes shape.
const MODE_KEY = "thatfridge_theme_v1";

export type ThemeMode = "light" | "dark" | "system";
export type ColorScheme = "light" | "dark";

export interface ThemeColors {
  canvas: string;
  surface: string;
  surface2: string;
  hairline: string;
  hairlineStrong: string;
  ink: string;
  muted: string;
  faint: string;
  accent: string;
  blue: string;
  good: string;
  warn: string;
  bad: string;
  agentGuardian: string;
  agentOrganizer: string;
  agentChef: string;
  agentShopkeeper: string;
}

// Mirrors tailwind.config.js's existing "dark neon pixel tech" palette exactly.
export const darkColors: ThemeColors = {
  canvas: "#0a0a0c",
  surface: "#131316",
  surface2: "#1a1a1f",
  hairline: "rgba(255,255,255,0.09)",
  hairlineStrong: "rgba(255,255,255,0.18)",
  ink: "#eaeaec",
  muted: "rgba(234,234,236,0.58)",
  faint: "rgba(234,234,236,0.34)",
  accent: "#26c6da",
  blue: "#5b8dee",
  good: "#39e07f",
  warn: "#f5a623",
  bad: "#ff5567",
  agentGuardian: "#ff5f56",
  agentOrganizer: "#3d6fe0",
  agentChef: "#f5a623",
  agentShopkeeper: "#39e07f",
};

// First light-mode pass - same shape as darkColors, hues deepened from the neon dark
// values where needed for contrast on a white/light surface. Flag for visual QA.
export const lightColors: ThemeColors = {
  canvas: "#f5f6f7",
  surface: "#ffffff",
  surface2: "#eef0f2",
  hairline: "rgba(10,10,12,0.08)",
  hairlineStrong: "rgba(10,10,12,0.16)",
  ink: "#16171a",
  muted: "rgba(22,23,26,0.58)",
  faint: "rgba(22,23,26,0.38)",
  accent: "#0f9fb0",
  blue: "#3f68c9",
  good: "#1fa863",
  warn: "#c97c12",
  bad: "#e02f45",
  agentGuardian: "#e0433a",
  agentOrganizer: "#2f5bc9",
  agentChef: "#c97c12",
  agentShopkeeper: "#1fa863",
};

/**
 * Maps colors to the same "--color-x" CSS variable names tailwind.config.js's className
 * tokens (bg-surface, text-ink, etc.) read from. Applied via NativeWind's `vars()` on the
 * app root, driven directly by this same React state - relying on NativeWind's own
 * class-based dark-mode toggle (":root"/".dark" in global.css) proved unreliable for
 * already-mounted native views, so the CSS variables now come straight from `colors`
 * instead of a separate class-toggle mechanism.
 */
export function themeCssVars(colors: ThemeColors): Record<string, string> {
  return {
    "--color-canvas": colors.canvas,
    "--color-surface": colors.surface,
    "--color-surface2": colors.surface2,
    "--color-hairline": colors.hairline,
    "--color-hairline-strong": colors.hairlineStrong,
    "--color-ink": colors.ink,
    "--color-muted": colors.muted,
    "--color-faint": colors.faint,
    "--color-accent": colors.accent,
    "--color-blue": colors.blue,
    "--color-good": colors.good,
    "--color-warn": colors.warn,
    "--color-bad": colors.bad,
    "--color-agent-guardian": colors.agentGuardian,
    "--color-agent-organizer": colors.agentOrganizer,
    "--color-agent-chef": colors.agentChef,
    "--color-agent-shopkeeper": colors.agentShopkeeper,
  };
}

interface ThemeValue {
  /** SecureStore read has completed - avoid painting before this to prevent a flash. */
  ready: boolean;
  /** The user's stored preference - "system" follows the OS setting. */
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => Promise<void>;
  /** The resolved scheme actually in effect right now ("system" already resolved). */
  scheme: ColorScheme;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [mode, setModeState] = useState<ThemeMode>("system");
  // NativeWind's own hook already resolves "system" against the OS and stays reactive to
  // OS changes - no need to duplicate that with React Native's own useColorScheme too.
  const { colorScheme } = useColorScheme();

  useEffect(() => {
    SecureStore.getItemAsync(MODE_KEY)
      .then((stored) => {
        const initial: ThemeMode =
          stored === "light" || stored === "dark" || stored === "system"
            ? stored
            : "system";
        setModeState(initial);
        nativewindColorScheme.set(initial);
      })
      .catch(() => {
        nativewindColorScheme.set("system");
      })
      .finally(() => setReady(true));
  }, []);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    nativewindColorScheme.set(next);
    try {
      await SecureStore.setItemAsync(MODE_KEY, next);
    } catch {
      /* best effort - worst case the choice doesn't survive a reinstall */
    }
  }, []);

  const scheme: ColorScheme = colorScheme === "light" ? "light" : "dark";

  const value = useMemo<ThemeValue>(
    () => ({
      ready,
      mode,
      setMode,
      scheme,
      colors: scheme === "light" ? lightColors : darkColors,
    }),
    [ready, mode, setMode, scheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
