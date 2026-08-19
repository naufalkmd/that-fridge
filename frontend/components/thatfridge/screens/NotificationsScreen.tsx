"use client";

import Image from "next/image";
import { ChevronLeft, X } from "lucide-react";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import Switch from "../Switch";
import type { NotificationPrefs } from "@/lib/thatfridge/types";

const GROUPS: {
  title: string;
  rows: { key: keyof NotificationPrefs; label: string; desc: string; icon: string; accent: string }[];
}[] = [
  {
    title: "FRESHNESS & STOCK",
    rows: [
      {
        key: "expiryAlerts",
        label: "Expiry alerts",
        desc: "Guardian pings you before items go bad",
        icon: "/images/thatfridge/guardian.gif",
        accent: theme.agent.guardian,
      },
      {
        key: "lowStock",
        label: "Low stock reminders",
        desc: "Shopkeeper flags essentials you're running low on",
        icon: "/images/thatfridge/shopkeeper.gif",
        accent: theme.agent.shopkeeper,
      },
    ],
  },
  {
    title: "MEALS & SUMMARIES",
    rows: [
      {
        key: "recipeTips",
        label: "Recipe suggestions",
        desc: "Chef's picks based on what's fresh right now",
        icon: "/images/thatfridge/chef.gif",
        accent: theme.agent.chef,
      },
      {
        key: "weeklyDigest",
        label: "Weekly digest",
        desc: "A Sunday summary of your fridge health",
        icon: "/images/thatfridge/organizer.gif",
        accent: theme.agent.organizer,
      },
    ],
  },
];

export default function NotificationsScreen() {
  const { state, actions } = useThatFridgeCtx();

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
        <div>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 14 }}>Notifications</div>
          <div style={{ fontSize: 11.5, color: theme.text.faint }}>Choose what your crew should ping you about</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        {GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>
              {group.title}
            </div>
            <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
              {group.rows.map((row, i) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 14px",
                    borderBottom: i < group.rows.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: 34,
                      height: 34,
                      flex: "none",
                      borderRadius: theme.radius.sm,
                      background: `${row.accent}1a`,
                    }}
                  >
                    <Image src={row.icon} alt="" width={34} height={34} unoptimized style={{ objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontSize: 11.5, color: theme.text.faint, lineHeight: 1.35 }}>{row.desc}</div>
                  </div>
                  <Switch on={state.notificationPrefs[row.key]} onClick={() => actions.toggleNotificationPref(row.key)} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 11.5, color: theme.text.faint, textAlign: "center", padding: "8px 12px", lineHeight: 1.4 }}>
          You can change these anytime — they only affect alerts inside ThatFridge.
        </div>
      </div>
    </div>
  );
}
