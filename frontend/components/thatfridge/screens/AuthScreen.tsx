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
              borderRadius: theme.radius.lg,
              background: theme.bg.surface2,
              border: `1px solid ${theme.border.hairline}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 14px",
            }}
          >
            <Image src="/images/thatfridge/logo.svg" alt="ThatFridge" width={32} height={33} unoptimized style={{ objectFit: "contain" }} />
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
            background: `radial-gradient(circle at 20% 15%, rgba(245,166,35,0.08) 0, transparent 45%), ${theme.bg.surface}`,
            color: theme.text.primary,
            padding: "48px 44px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: theme.radius.sm,
                background: theme.bg.surface2,
                border: `1px solid ${theme.border.hairline}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flex: "none",
              }}
            >
              <Image src="/images/thatfridge/logo.svg" alt="ThatFridge" width={24} height={25} unoptimized style={{ objectFit: "contain" }} />
            </div>
            <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 16, letterSpacing: 0.5 }}>ThatFridge</div>
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
