"use client";

import { Brain, ChevronLeft, ChevronRight, MessageCircle, Sparkles, Trash2, X } from "lucide-react";
import { timeAgo } from "@/lib/thatfridge/utils";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

export default function AIDataScreen() {
  const { state, actions } = useThatFridgeCtx();
  const threadCount = state.chatThreads.length;
  const usage = state.usageHistory.slice().sort((a, b) => b.lastAt - a.lastAt);

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
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 14 }}>AI Data &amp; Memory</div>
          <div style={{ fontSize: 11.5, color: theme.text.faint }}>See and manage what your crew remembers</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>CHAT HISTORY</div>
        <div
          onClick={actions.openChatHistory}
          style={{ display: "flex", alignItems: "center", gap: 12, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, padding: "13px 14px", cursor: "pointer", marginBottom: 10 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: theme.radius.sm, background: `${theme.blue}1a`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <MessageCircle size={16} color={theme.blue} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>
              {threadCount} saved conversation{threadCount === 1 ? "" : "s"}
            </div>
            <div style={{ fontSize: 11.5, color: theme.text.faint }}>View, reopen, or delete individual conversations</div>
          </div>
          <ChevronRight size={16} color={theme.text.faint} />
        </div>
        {threadCount > 0 && (
          <div
            onClick={actions.clearAllChatData}
            style={{ textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.bad}40`, color: theme.bad, fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 22 }}
          >
            Clear all chat data
          </div>
        )}
        {threadCount === 0 && <div style={{ marginBottom: 22 }} />}

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 4 }}>MEMORY</div>
        <div style={{ fontSize: 11, color: theme.text.faint, marginBottom: 8, lineHeight: 1.4 }}>
          What the crew has picked up about you from your conversations.
        </div>
        {state.memoryFacts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: theme.text.faint, fontSize: 13, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, marginBottom: 22 }}>
            Nothing remembered yet — chat with the crew and they&apos;ll start picking up on your preferences.
          </div>
        ) : (
          <>
            <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 10 }}>
              {state.memoryFacts.map((fact, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < state.memoryFacts.length - 1 ? `1px solid ${theme.border.hairline}` : undefined }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 15, background: `${theme.blue}1a`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Sparkles size={14} color={theme.blue} strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{fact}</div>
                  <div
                    onClick={() => actions.deleteMemoryFact(i)}
                    style={{ width: 30, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Trash2 size={15} color={theme.text.faint} strokeWidth={2} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.clearMemoryFacts}
              style={{ textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.bad}40`, color: theme.bad, fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 22 }}
            >
              Clear memory
            </div>
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 4 }}>FREQUENTLY USED ITEMS</div>
        <div style={{ fontSize: 11, color: theme.text.faint, marginBottom: 8, lineHeight: 1.4 }}>
          Shopkeeper remembers items you use often, to suggest restocking them.
        </div>
        {usage.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: theme.text.faint, fontSize: 13, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, marginBottom: 22 }}>
            Nothing here yet — use up a few items to build this up.
          </div>
        ) : (
          <>
            <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden", marginBottom: 10 }}>
              {usage.map((h, i) => (
                <div
                  key={h.key}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < usage.length - 1 ? `1px solid ${theme.border.hairline}` : undefined }}
                >
                  <div style={{ position: "relative", width: 30, height: 30, flex: "none" }}>
                    <FoodIcon icon={h.icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: theme.text.faint }}>
                      Used {h.count}× · {timeAgo(h.lastAt)}
                    </div>
                  </div>
                  <div
                    onClick={() => actions.deleteUsageHistoryEntry(h.id)}
                    style={{ width: 30, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Trash2 size={15} color={theme.text.faint} strokeWidth={2} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.clearUsageHistory}
              style={{ textAlign: "center", padding: 11, borderRadius: theme.radius.sm, background: theme.bg.surface, border: `1px solid ${theme.bad}40`, color: theme.bad, fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 22 }}
            >
              Clear frequently used items
            </div>
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>PREFERENCES</div>
        <div
          onClick={actions.openNotifications}
          style={{ display: "flex", alignItems: "center", gap: 12, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, padding: "13px 14px", cursor: "pointer" }}
        >
          <div style={{ width: 36, height: 36, borderRadius: theme.radius.sm, background: `${theme.good}1a`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <Brain size={16} color={theme.good} strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Notification preferences</div>
            <div style={{ fontSize: 11.5, color: theme.text.faint }}>Choose what your crew should ping you about</div>
          </div>
          <ChevronRight size={16} color={theme.text.faint} />
        </div>
      </div>
    </div>
  );
}
