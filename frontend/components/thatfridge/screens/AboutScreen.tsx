"use client";

import Image from "next/image";
import { ChevronLeft, Refrigerator, X } from "lucide-react";
import { AGENTS } from "@/lib/thatfridge/data";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";

const AGENT_ACCENT: Record<string, string> = {
  chef: theme.agent.chef,
  guardian: theme.agent.guardian,
  organizer: theme.agent.organizer,
  shopkeeper: theme.agent.shopkeeper,
};

const AGENT_ICON: Record<string, string> = {
  chef: "/images/thatfridge/chef.gif",
  guardian: "/images/thatfridge/guardian.gif",
  organizer: "/images/thatfridge/organizer.gif",
  shopkeeper: "/images/thatfridge/shopkeeper.gif",
};

const APP_VERSION = "0.1.0";

export default function AboutScreen() {
  const { actions } = useThatFridgeCtx();

  return (
    <div style={{ position: "absolute", inset: 0, background: theme.bg.canvas, display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color={theme.text.muted} strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color={theme.text.muted} strokeWidth={2.2} />
        </div>
        <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 700, fontSize: 14 }}>About ThatFridge</div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "20px 12px 26px" }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: theme.radius.lg,
              background: theme.bg.surface2,
              border: `1px solid ${theme.border.hairline}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Refrigerator size={30} color={theme.amber} strokeWidth={1.8} />
          </div>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 19, letterSpacing: 0.5, marginBottom: 5 }}>ThatFridge</div>
          <div style={{ fontSize: 12, color: theme.text.faint, fontWeight: 600, marginBottom: 10 }}>Version {APP_VERSION}</div>
          <div style={{ fontSize: 13, color: theme.text.muted, lineHeight: 1.5, maxWidth: 300 }}>
            A calmer way to track what&apos;s in your fridge — four little agents keep watch on freshness, storage,
            meals and shopping so you don&apos;t have to.
          </div>
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>
          MEET YOUR CREW
        </div>
        <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 20 }}>
          {AGENTS.map((agent, i) => (
            <div
              key={agent.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "13px 14px",
                borderBottom: i < AGENTS.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: 34,
                  height: 34,
                  flex: "none",
                  borderRadius: theme.radius.sm,
                  background: `${AGENT_ACCENT[agent.id]}1a`,
                }}
              >
                <Image
                  src={AGENT_ICON[agent.id]}
                  alt=""
                  width={34}
                  height={34}
                  unoptimized
                  style={{ objectFit: "contain" }}
                />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2, color: AGENT_ACCENT[agent.id] }}>{agent.name}</div>
                <div style={{ fontSize: 11.5, color: theme.text.faint, lineHeight: 1.35 }}>{agent.summary}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>BUILD INFO</div>
        <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 20 }}>
          {[
            { label: "Version", value: APP_VERSION },
            { label: "Platform", value: "Web" },
          ].map((row, i, arr) => (
            <div
              key={row.label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderBottom: i < arr.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
              }}
            >
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>{row.label}</div>
              <div style={{ fontSize: 13, color: theme.text.faint }}>{row.value}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>CREDITS</div>
        <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 14px" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Pixel typeface</div>
            <div style={{ fontSize: 13, color: theme.text.faint }}>PixelMix by Andrew Tyler</div>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: theme.text.faint, textAlign: "center", padding: "8px 12px" }}>
          Made with care for people who forget what&apos;s in the back of the fridge.
        </div>
      </div>
    </div>
  );
}
