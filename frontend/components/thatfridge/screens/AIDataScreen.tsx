"use client";

import { Brain, ChevronLeft, ChevronRight, MessageCircle, Sparkles, Trash2, X } from "lucide-react";
import { timeAgo } from "@/lib/thatfridge/utils";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import FoodIcon from "../FoodIcon";

export default function AIDataScreen() {
  const { state, actions } = useThatFridgeCtx();
  const threadCount = state.chatThreads.length;
  const usage = state.usageHistory.slice().sort((a, b) => b.lastAt - a.lastAt);

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
          <div style={{ fontSize: 18, fontWeight: 800 }}>AI Data &amp; Memory</div>
          <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)" }}>See and manage what your crew remembers</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>CHAT HISTORY</div>
        <div
          onClick={actions.openChatHistory}
          style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: "13px 14px", cursor: "pointer", marginBottom: 10 }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(47,111,176,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <MessageCircle size={16} color="#2f6fb0" strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>
              {threadCount} saved conversation{threadCount === 1 ? "" : "s"}
            </div>
            <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.45)" }}>View, reopen, or delete individual conversations</div>
          </div>
          <ChevronRight size={16} color="rgba(22,50,92,0.3)" />
        </div>
        {threadCount > 0 && (
          <div
            onClick={actions.clearAllChatData}
            style={{ textAlign: "center", padding: 11, borderRadius: 12, background: "#fff", border: "1px solid rgba(193,69,46,0.25)", color: "#c1452e", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 22 }}
          >
            Clear all chat data
          </div>
        )}
        {threadCount === 0 && <div style={{ marginBottom: 22 }} />}

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 4 }}>MEMORY</div>
        <div style={{ fontSize: 11, color: "rgba(22,50,92,0.4)", marginBottom: 8, lineHeight: 1.4 }}>
          What the crew has picked up about you from your conversations.
        </div>
        {state.memoryFacts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: "rgba(22,50,92,0.45)", fontSize: 13, background: "#fff", borderRadius: 16, marginBottom: 22 }}>
            Nothing remembered yet — chat with the crew and they&apos;ll start picking up on your preferences.
          </div>
        ) : (
          <>
            <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, overflow: "hidden", marginBottom: 10 }}>
              {state.memoryFacts.map((fact, i) => (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < state.memoryFacts.length - 1 ? "1px solid rgba(22,50,92,0.06)" : undefined }}
                >
                  <div style={{ width: 30, height: 30, borderRadius: 15, background: "rgba(47,111,176,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                    <Sparkles size={14} color="#2f6fb0" strokeWidth={2} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600 }}>{fact}</div>
                  <div
                    onClick={() => actions.deleteMemoryFact(i)}
                    style={{ width: 30, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Trash2 size={15} color="rgba(22,50,92,0.35)" strokeWidth={2} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.clearMemoryFacts}
              style={{ textAlign: "center", padding: 11, borderRadius: 12, background: "#fff", border: "1px solid rgba(193,69,46,0.25)", color: "#c1452e", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 22 }}
            >
              Clear memory
            </div>
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 4 }}>FREQUENTLY USED ITEMS</div>
        <div style={{ fontSize: 11, color: "rgba(22,50,92,0.4)", marginBottom: 8, lineHeight: 1.4 }}>
          Shopkeeper remembers items you use often, to suggest restocking them.
        </div>
        {usage.length === 0 ? (
          <div style={{ textAlign: "center", padding: "30px 20px", color: "rgba(22,50,92,0.45)", fontSize: 13, background: "#fff", borderRadius: 16, marginBottom: 22 }}>
            Nothing here yet — use up a few items to build this up.
          </div>
        ) : (
          <>
            <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, overflow: "hidden", marginBottom: 10 }}>
              {usage.map((h, i) => (
                <div
                  key={h.key}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: i < usage.length - 1 ? "1px solid rgba(22,50,92,0.06)" : undefined }}
                >
                  <div style={{ position: "relative", width: 30, height: 30, flex: "none" }}>
                    <FoodIcon icon={h.icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 2 }}>{h.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(22,50,92,0.4)" }}>
                      Used {h.count}× · {timeAgo(h.lastAt)}
                    </div>
                  </div>
                  <div
                    onClick={() => actions.deleteUsageHistoryEntry(h.id)}
                    style={{ width: 30, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                  >
                    <Trash2 size={15} color="rgba(22,50,92,0.35)" strokeWidth={2} />
                  </div>
                </div>
              ))}
            </div>
            <div
              onClick={actions.clearUsageHistory}
              style={{ textAlign: "center", padding: 11, borderRadius: 12, background: "#fff", border: "1px solid rgba(193,69,46,0.25)", color: "#c1452e", fontSize: 12.5, fontWeight: 700, cursor: "pointer", marginBottom: 22 }}
            >
              Clear frequently used items
            </div>
          </>
        )}

        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>PREFERENCES</div>
        <div
          onClick={actions.openNotifications}
          style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: "13px 14px", cursor: "pointer" }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(63,143,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <Brain size={16} color="#3f8f5c" strokeWidth={2} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Notification preferences</div>
            <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.45)" }}>Choose what your crew should ping you about</div>
          </div>
          <ChevronRight size={16} color="rgba(22,50,92,0.3)" />
        </div>
      </div>
    </div>
  );
}
