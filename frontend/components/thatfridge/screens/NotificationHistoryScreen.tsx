"use client";

import { useRef, useState } from "react";
import { Check, ChefHat, ChevronLeft, Hourglass, ShoppingCart, X } from "lucide-react";
import { timeAgo } from "@/lib/thatfridge/utils";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import type { NotificationEvent, NotificationKind } from "@/lib/thatfridge/types";

const CLEAR_THRESHOLD = -80;

const KIND_META: Record<NotificationKind, { Icon: typeof Hourglass; color: string }> = {
  expiring: { Icon: Hourglass, color: theme.agent.guardian },
  lowStock: { Icon: ShoppingCart, color: theme.agent.shopkeeper },
  recipe: { Icon: ChefHat, color: theme.agent.chef },
};

function NotificationRow({ event, onDismiss }: { event: NotificationEvent; onDismiss: (id: string) => void }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const meta = KIND_META[event.kind];

  const onPointerDown = (e: React.PointerEvent) => {
    if (event.done) return;
    startX.current = e.clientX;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragX(Math.min(0, e.clientX - startX.current));
  };
  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragX < CLEAR_THRESHOLD) onDismiss(event.id);
    setDragX(0);
  };

  return (
    <div style={{ position: "relative", borderRadius: theme.radius.md, marginBottom: 10, overflow: "hidden" }}>
      {dragX < 0 && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: theme.bad,
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "0 22px",
            color: theme.text.primary,
            fontSize: 12.5,
            fontWeight: 700,
          }}
        >
          Clear
        </div>
      )}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        style={{
          position: "relative",
          transform: `translateX(${dragX}px)`,
          transition: dragging ? "none" : "transform .2s ease",
          background: event.done ? theme.bg.surface2 : theme.bg.surface,
          borderRadius: theme.radius.md,
          padding: "13px 14px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          border: `1px solid ${theme.border.hairline}`,
          touchAction: "pan-y",
          userSelect: "none",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: theme.radius.sm,
            background: event.done ? theme.bg.surface2 : `${meta.color}1a`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <meta.Icon size={17} color={event.done ? theme.text.faint : meta.color} strokeWidth={2} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: event.done ? theme.text.faint : theme.text.primary,
              textDecoration: event.done ? "line-through" : "none",
              marginBottom: 2,
            }}
          >
            {event.message}
          </div>
          <div style={{ fontSize: 11, color: theme.text.faint }}>
            {event.fridgeName} · {timeAgo(event.createdAt)}
          </div>
        </div>
        {event.done ? (
          <Check size={17} color={theme.good} strokeWidth={2.5} style={{ flex: "none" }} />
        ) : (
          <div
            onClick={() => onDismiss(event.id)}
            style={{ fontSize: 11.5, fontWeight: 700, color: theme.blue, cursor: "pointer", padding: "6px 4px", flex: "none" }}
          >
            Clear
          </div>
        )}
      </div>
    </div>
  );
}

export default function NotificationHistoryScreen() {
  const { state, actions } = useThatFridgeCtx();
  const events = state.notificationEvents;

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
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 700, fontSize: 14 }}>Notifications</div>
          <div style={{ fontSize: 11.5, color: theme.text.faint }}>Swipe left or tap Clear to mark as done</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: theme.text.faint, fontSize: 13 }}>
            You&apos;re all caught up — no notifications yet.
          </div>
        ) : (
          events.map((event) => <NotificationRow key={event.id} event={event} onDismiss={actions.dismissNotificationWithUndo} />)
        )}
      </div>
    </div>
  );
}
