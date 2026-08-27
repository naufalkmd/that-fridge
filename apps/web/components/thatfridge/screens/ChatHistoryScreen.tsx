"use client";

import { ChevronLeft, MessageCircle, Trash2, X } from "lucide-react";
import { timeAgo } from "@/lib/thatfridge/utils";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";

export default function ChatHistoryScreen() {
  const { state, actions } = useThatFridgeCtx();
  const threads = state.chatThreads;

  return (
    <div style={{ position: "absolute", inset: 0, background: theme.bg.canvas, display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={actions.closeChatHistory}
          style={{ width: 32, height: 32, borderRadius: 16, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color={theme.text.muted} strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color={theme.text.muted} strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 14 }}>Chat History</div>
          <div style={{ fontSize: 11.5, color: theme.text.faint }}>Tap a conversation to pick it back up</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        {threads.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: theme.text.faint, fontSize: 13 }}>
            No past conversations yet — start a new chat to see it here later.
          </div>
        ) : (
          <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
            {threads.map((thread, i) => (
              <div
                key={thread.id}
                onClick={() => actions.restoreChatThread(thread.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 14px",
                  borderBottom: i < threads.length - 1 ? `1px solid ${theme.border.hairline}` : undefined,
                  cursor: "pointer",
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: theme.radius.sm, background: `${theme.blue}1a`, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <MessageCircle size={16} color={theme.blue} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{thread.title}</div>
                  <div style={{ fontSize: 11, color: theme.text.faint }}>
                    {thread.messageCount} message{thread.messageCount === 1 ? "" : "s"} · {timeAgo(thread.updatedAt)}
                  </div>
                </div>
                <div
                  onClick={(e) => {
                    e.stopPropagation();
                    actions.deleteChatThread(thread.id);
                  }}
                  style={{ width: 30, height: 30, borderRadius: 15, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                >
                  <Trash2 size={15} color={theme.text.faint} strokeWidth={2} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
