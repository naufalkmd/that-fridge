"use client";

import Image from "next/image";
import { ChevronLeft, X } from "lucide-react";
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
        accent: "#c1452e",
      },
      {
        key: "lowStock",
        label: "Low stock reminders",
        desc: "Shopkeeper flags essentials you're running low on",
        icon: "/images/thatfridge/shopkeeper.gif",
        accent: "#3f8f5c",
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
        accent: "#d99a2b",
      },
      {
        key: "weeklyDigest",
        label: "Weekly digest",
        desc: "A Sunday summary of your fridge health",
        icon: "/images/thatfridge/organizer.gif",
        accent: "#2f6fb0",
      },
    ],
  },
];

export default function NotificationsScreen() {
  const { state, actions } = useThatFridgeCtx();

  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#eaf6ff,#cfe8fb 55%,#eaf6ff)", display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: "#fff", border: "1px solid rgba(22,50,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color="rgba(22,50,92,0.5)" strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color="rgba(22,50,92,0.5)" strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Notifications</div>
          <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)" }}>Choose what your crew should ping you about</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        {GROUPS.map((group) => (
          <div key={group.title} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>
              {group.title}
            </div>
            <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, overflow: "hidden" }}>
              {group.rows.map((row, i) => (
                <div
                  key={row.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "13px 14px",
                    borderBottom: i < group.rows.length - 1 ? "1px solid rgba(22,50,92,0.06)" : undefined,
                  }}
                >
                  <div
                    style={{
                      position: "relative",
                      width: 34,
                      height: 34,
                      flex: "none",
                      borderRadius: 10,
                      background: `${row.accent}1a`,
                    }}
                  >
                    <Image src={row.icon} alt="" width={34} height={34} unoptimized style={{ objectFit: "contain" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>{row.label}</div>
                    <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)", lineHeight: 1.35 }}>{row.desc}</div>
                  </div>
                  <Switch on={state.notificationPrefs[row.key]} onClick={() => actions.toggleNotificationPref(row.key)} />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.4)", textAlign: "center", padding: "8px 12px", lineHeight: 1.4 }}>
          You can change these anytime — they only affect alerts inside ThatFridge.
        </div>
      </div>
    </div>
  );
}
