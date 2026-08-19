"use client";

import Image from "next/image";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: theme.bg.surface2,
  borderRadius: theme.radius.sm,
  padding: "13px 16px",
  fontSize: 14,
  color: theme.text.primary,
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: 0.3,
  color: theme.text.faint,
  marginBottom: 6,
};

// Desktop brand panel only - floating pixel-snowflake sprites drifting behind the
// headline. Positions/sizes are hand-placed (not random) to keep density low over the
// text and higher in the empty upper-right, so the animation reads as ambient texture
// rather than clutter.
const FROST_FLAKES: { left: string; top: string; size: number; opacity: number; duration: number; delay: number }[] = [
  { left: "80%", top: "8%", size: 30, opacity: 0.55, duration: 9, delay: 0 },
  { left: "16%", top: "6%", size: 18, opacity: 0.4, duration: 7, delay: 1.4 },
  { left: "56%", top: "16%", size: 14, opacity: 0.3, duration: 6, delay: 0.8 },
  { left: "90%", top: "30%", size: 40, opacity: 0.6, duration: 11, delay: 2 },
  { left: "6%", top: "34%", size: 24, opacity: 0.35, duration: 8, delay: 3 },
  { left: "70%", top: "46%", size: 17, opacity: 0.25, duration: 6.5, delay: 1 },
  { left: "93%", top: "58%", size: 26, opacity: 0.45, duration: 9.5, delay: 2.5 },
  { left: "82%", top: "80%", size: 20, opacity: 0.4, duration: 8.5, delay: 1.8 },
  { left: "4%", top: "68%", size: 32, opacity: 0.5, duration: 10, delay: 0.3 },
];

export default function AuthScreen() {
  const { state, actions } = useThatFridgeCtx();
  const isLogin = state.authMode === "login";

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    actions.submitAuth();
  };

  const tabs = (
    <div style={{ display: "flex", background: theme.bg.surface2, borderRadius: theme.radius.sm, padding: 4, gap: 4, marginBottom: 20, width: "fit-content" }}>
      <div
        onClick={() => actions.setAuthMode("login")}
        style={{
          textAlign: "center",
          padding: "9px 22px",
          borderRadius: theme.radius.sm,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          background: isLogin ? theme.bg.surface : "transparent",
          color: isLogin ? theme.text.primary : theme.text.muted,
        }}
      >
        Log in
      </div>
      <div
        onClick={() => actions.setAuthMode("signup")}
        style={{
          textAlign: "center",
          padding: "9px 22px",
          borderRadius: theme.radius.sm,
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          background: !isLogin ? theme.bg.surface : "transparent",
          color: !isLogin ? theme.text.primary : theme.text.muted,
        }}
      >
        Sign up
      </div>
    </div>
  );

  const formFields = (
    <>
      {!isLogin && (
        <div>
          <div style={labelStyle}>NAME</div>
          <input
            value={state.authName}
            onChange={(e) => actions.onAuthNameChange(e.target.value)}
            placeholder="Jordan Diaz"
            style={fieldStyle}
          />
        </div>
      )}
      <div>
        <div style={labelStyle}>EMAIL</div>
        <input
          type="email"
          value={state.authEmail}
          onChange={(e) => actions.onAuthEmailChange(e.target.value)}
          placeholder="you@example.com"
          style={fieldStyle}
        />
      </div>
      <div>
        <div style={labelStyle}>PASSWORD</div>
        <input
          type="password"
          value={state.authPassword}
          onChange={(e) => actions.onAuthPasswordChange(e.target.value)}
          placeholder="••••••••"
          style={fieldStyle}
        />
      </div>
      {!isLogin && (
        <div>
          <div style={labelStyle}>CONFIRM PASSWORD</div>
          <input
            type="password"
            value={state.authConfirmPassword}
            onChange={(e) => actions.onAuthConfirmPasswordChange(e.target.value)}
            placeholder="••••••••"
            style={fieldStyle}
          />
        </div>
      )}

      {state.authError && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: theme.bad }}>{state.authError}</div>
      )}

      <button
        type="submit"
        style={{
          marginTop: 4,
          textAlign: "center",
          padding: 14,
          borderRadius: theme.radius.sm,
          background: theme.amber,
          color: "#0a0a0c",
          fontSize: 14,
          fontWeight: 700,
          fontFamily: theme.fontMono,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          cursor: "pointer",
          border: "none",
        }}
      >
        {isLogin ? "Log in" : "Create account"}
      </button>
    </>
  );

  const switchLine = (
    <div style={{ textAlign: "center", fontSize: 12.5, color: theme.text.muted, marginTop: 18 }}>
      {isLogin ? (
        <>
          New here?{" "}
          <span onClick={() => actions.setAuthMode("signup")} style={{ color: theme.blue, fontWeight: 700, cursor: "pointer" }}>
            Create an account
          </span>
        </>
      ) : (
        <>
          Already have an account?{" "}
          <span onClick={() => actions.setAuthMode("login")} style={{ color: theme.blue, fontWeight: 700, cursor: "pointer" }}>
            Log in
          </span>
        </>
      )}
    </div>
  );

  return (
    <>
      <div
        className="thatfridge-auth-mobile"
        style={{
          position: "absolute",
          inset: 0,
          background: theme.bg.canvas,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          overflowY: "auto",
          padding: "56px 24px 40px",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
            }}
          >
            <Image src="/images/thatfridge/logo.svg" alt="ThatFridge" width={44} height={45} unoptimized style={{ objectFit: "contain" }} />
          </div>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 22, letterSpacing: 0.5, marginBottom: 6 }}>ThatFridge</div>
          <div style={{ fontSize: 13, color: theme.text.muted }}>Know what&apos;s inside before you open the door.</div>
        </div>

        <div style={{ background: theme.bg.surface, borderRadius: theme.radius.lg, padding: 20, border: `1px solid ${theme.border.hairline}` }}>
          {tabs}
          <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {formFields}
          </form>
        </div>

        {switchLine}
      </div>

      <div className="thatfridge-auth-wide" style={{ position: "absolute", inset: 0 }}>
        <div
          className="thatfridge-auth-brand-panel"
          style={{
            background: `radial-gradient(circle at 20% 15%, ${theme.amber}14 0, transparent 45%), ${theme.bg.surface}`,
            color: theme.text.primary,
            padding: "48px 44px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {FROST_FLAKES.map((f, i) => (
            <Image
              key={i}
              src="/images/thatfridge/snowflake.png"
              alt=""
              width={f.size}
              height={f.size}
              unoptimized
              className="thatfridge-frost-flake"
              style={{
                position: "absolute",
                left: f.left,
                top: f.top,
                opacity: f.opacity,
                imageRendering: "pixelated",
                animation: `frostDrift ${f.duration}s ease-in-out ${f.delay}s infinite`,
                pointerEvents: "none",
              }}
            />
          ))}

          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ position: "relative", width: 72, height: 72, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <div
                className="thatfridge-logo-glow"
                style={{
                  position: "absolute",
                  inset: -10,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${theme.amber}55 0%, transparent 70%)`,
                  filter: "blur(10px)",
                  animation: "logoGlowPulse 3.4s ease-in-out infinite",
                }}
              />
              <Image src="/images/thatfridge/logo.svg" alt="ThatFridge" width={64} height={65} unoptimized style={{ position: "relative", objectFit: "contain" }} />
            </div>
            <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 22, letterSpacing: 0.5 }}>ThatFridge</div>
          </div>

          <div style={{ position: "relative", maxWidth: 340 }}>
            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.18, marginBottom: 14 }}>
              Know what&apos;s inside before you open the door.
            </div>
            <div style={{ fontSize: 14.5, lineHeight: 1.6, color: theme.text.muted }}>
              Scan it, track it, and let your crew of AI helpers tell you what&apos;s about to go bad — before it does.
            </div>
          </div>

          <div style={{ position: "relative", fontSize: 11.5, color: theme.text.faint }}>© {new Date().getFullYear()} ThatFridge</div>
        </div>

        <div style={{ padding: "56px 64px", display: "flex", flexDirection: "column", justifyContent: "center", overflowY: "auto", minHeight: 0, background: theme.bg.canvas }}>
          <div style={{ maxWidth: 340, width: "100%", margin: "0 auto" }}>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.4, marginBottom: 6 }}>
              {isLogin ? "Welcome back" : "Create your account"}
            </div>
            <div style={{ fontSize: 13.5, color: theme.text.muted, marginBottom: 28 }}>
              {isLogin ? "Log in to see what's in your fridge." : "Start tracking what's in your fridge."}
            </div>
            {tabs}
            <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {formFields}
            </form>
            {switchLine}
          </div>
        </div>
      </div>
    </>
  );
}
