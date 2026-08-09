"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Bell, ChevronDown, ChevronLeft, ChevronRight, Package, Palette, Refrigerator, Sparkles, TriangleAlert, X } from "lucide-react";
import { getExpiringOwnedItems, getFridgeHeroViews, getGuardianItem, getLowStockItem, getRecipesView, getScopeLabel, getScopedItems } from "@/lib/thatfridge/selectors";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import CrewScene from "../CrewScene";
import FoodIcon from "../FoodIcon";
import MarkdownText from "../MarkdownText";

const CLEAR_THRESHOLD = -80;
const OFFSCREEN_X = -420;
// Same landscape rectangle as the mobile hero card (roughly 420x236), not a square.
const CAROUSEL_CARD_W = 300;
const CAROUSEL_CARD_H = 168;
// Negative: peek cards are scaled down (CAROUSEL_PEEK_SCALE), which already opens up
// visual whitespace within their slot, so slots need to overlap to sit visually close.
const CAROUSEL_GAP = -24;
const CAROUSEL_PEEK_SCALE = 0.68;
const CAROUSEL_PEEK_OPACITY = 0.38;

function SwipeToClear({ marginBottom, onClear, children }: { marginBottom: number; onClear: () => void; children: React.ReactNode }) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const movedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingDeltaRef = useRef(0);

  const flushDrag = () => {
    rafRef.current = null;
    setDragX(pendingDeltaRef.current);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    draggingRef.current = true;
    movedRef.current = false;
    startXRef.current = e.clientX;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const delta = e.clientX - startXRef.current;
    if (Math.abs(delta) > 4 && !movedRef.current) {
      movedRef.current = true;
      // Capture only once a real drag starts, so a plain tap's click event is never suppressed.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    pendingDeltaRef.current = Math.min(0, delta);
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(flushDrag);
  };
  const onPointerUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (pendingDeltaRef.current < CLEAR_THRESHOLD) {
      setDragX(OFFSCREEN_X);
      setTimeout(onClear, 200);
    } else {
      setDragX(0);
    }
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      movedRef.current = false;
    }
  };

  return (
    <div style={{ position: "relative", marginBottom, borderRadius: 18, overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "#c1452e", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "0 22px" }}>
        <X size={17} color="#fff" strokeWidth={2.4} />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={onClickCapture}
        style={{ transform: `translateX(${dragX}px)`, transition: dragging ? "none" : "transform 0.2s ease", touchAction: "pan-y", willChange: "transform" }}
      >
        {children}
      </div>
    </div>
  );
}

export default function HomeScreen() {
  const { state, actions } = useThatFridgeCtx();
  const [showScopeMenu, setShowScopeMenu] = useState(false);
  const [dismissedGuardianFor, setDismissedGuardianFor] = useState<string | null>(null);
  const [dismissedLowStockFor, setDismissedLowStockFor] = useState<string | null>(null);
  const [dismissedChefFor, setDismissedChefFor] = useState<string | null>(null);
  const fridgesView = getFridgeHeroViews(state);
  const heroSlide = state.heroSlide;
  const heroSlideCount = fridgesView.length + 1;
  const heroSlideWidthPct = 100 / heroSlideCount;
  const heroTrackWidth = `${heroSlideCount * 100}%`;
  const heroTranslate = `translateX(-${heroSlide * heroSlideWidthPct}%)`;
  const fridgeCount = fridgesView.length;
  const carouselIndex = fridgeCount ? Math.min(state.activeFridge, fridgeCount - 1) : 0;

  const guardianItem = getGuardianItem(state);
  const lowStockItem = getLowStockItem(state);
  const scopedItems = getScopedItems(state);
  const hasItems = scopedItems.length > 0;

  const totalItemCount = scopedItems.length;
  const expiringCount = scopedItems.filter((i) => i.freshness < 50).length;
  const suggestionCount = getRecipesView(state).filter((r) => r.haveCount > 0).length;

  // Only "expiring" events are generated server-side (the daily freshness cron, one per
  // item — see backend/API.md); low-stock and recipe tips have no backend notification
  // counterpart yet, so those two stay session-only (dismissedLowStockFor/dismissedChefFor).
  // Correlating by itemId (rather than a synthetic id) means clearing the Guardian card here
  // also marks the real notification_events row done, and vice versa from the Notifications page.
  const guardianEventId = guardianItem
    ? state.notificationEvents.find((n) => n.kind === "expiring" && n.itemId === guardianItem.id)?.id ?? null
    : null;
  const isEventDone = (id: string | null) => !!id && state.notificationEvents.find((n) => n.id === id)?.done;

  const chefKey = guardianItem?.id ?? "none";
  const guardianVisible = !!guardianItem && dismissedGuardianFor !== guardianItem.id && !isEventDone(guardianEventId);
  const lowStockVisible = !!lowStockItem && dismissedLowStockFor !== lowStockItem.id;
  const chefVisible = dismissedChefFor !== chefKey;

  // These cards used to interpolate a canned template ("Try X tonight...") and label it
  // Chef/Guardian/Shopkeeper — styled as AI advice but never actually asked an agent
  // anything. They now show the real per-agent chat response (same call FoodHub's
  // "Activate {agent}" button makes), fetched once per session via ensureAgentInsight.
  const chefMessage = !hasItems
    ? "Your kitchen looks well stocked tonight."
    : state.agentInsights.Chef ?? (state.agentInsightLoading.Chef ? "Thinking…" : "");
  const guardianMessage = state.agentInsights.Guardian ?? (state.agentInsightLoading.Guardian ? "Thinking…" : "");
  const shopkeeperMessage = state.agentInsights.Shopkeeper ?? (state.agentInsightLoading.Shopkeeper ? "Thinking…" : "");

  useEffect(() => {
    if (guardianVisible) actions.ensureAgentInsight("Guardian");
    if (chefVisible && hasItems) actions.ensureAgentInsight("Chef");
    if (lowStockVisible) actions.ensureAgentInsight("Shopkeeper");
    // actions is a fresh object every render; guardianVisible/chefVisible/lowStockVisible/
    // hasItems are the only things this effect should react to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardianVisible, chefVisible, lowStockVisible, hasItems]);

  const dotCount = heroSlideCount;
  const pendingNotifications = state.notificationEvents.filter((n) => !n.done).length;
  const expiringItems = getExpiringOwnedItems(state, 6);

  const userInitials = (state.currentUser?.name || "Friend")
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <>
    <div className="thatfridge-home-mobile" style={{ position: "absolute", inset: 0, overflowY: "auto", padding: "28px 20px 180px" }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div
          onClick={actions.openProfile}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            background: "#16325c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
            flex: "none",
          }}
        >
          {userInitials}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>ThatFridge</div>
        <div
          onClick={actions.openNotificationHistory}
          style={{
            position: "relative",
            width: 34,
            height: 34,
            borderRadius: 17,
            background: "rgba(255,255,255,0.75)",
            backdropFilter: "blur(8px)",
            border: "1px solid rgba(22,50,92,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <Bell size={16} color="#16325c" strokeWidth={2} />
          {pendingNotifications > 0 && (
            <div
              style={{
                position: "absolute",
                top: 3,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "#c1452e",
                border: "1.5px solid #fff",
              }}
            />
          )}
        </div>
      </div>

      {/* fridge scope picker */}
      <div style={{ position: "relative", marginBottom: 14, width: "fit-content" }}>
        <div
          onClick={() => setShowScopeMenu((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "7px 12px",
            borderRadius: 12,
            background: "#fff",
            boxShadow: "0 4px 10px rgba(22,50,92,0.08)",
            cursor: "pointer",
            fontSize: 12.5,
            fontWeight: 700,
            color: "#16325c",
          }}
        >
          <Refrigerator size={14} color="#16325c" strokeWidth={2.2} />
          {getScopeLabel(state)}
          <ChevronDown size={13} color="#16325c" strokeWidth={2.2} />
        </div>
        {showScopeMenu && (
          <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, boxShadow: "0 10px 24px rgba(22,50,92,0.14)", padding: 6, zIndex: 5, minWidth: 160 }}>
            {(
              [{ id: "all" as const, name: "All Fridges" }, ...state.fridges.map((f, i) => ({ id: i, name: f.name }))]
            ).map((opt) => {
              const active = opt.id === "all" ? state.kitchenScope === "all" : state.kitchenScope === "active" && state.activeFridge === opt.id;
              return (
                <div
                  key={opt.id}
                  onClick={() => {
                    actions.selectFridgeScope(opt.id);
                    setShowScopeMenu(false);
                  }}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 8,
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    color: active ? "#2f6fb0" : "#16325c",
                    background: active ? "#eaf6ff" : "transparent",
                  }}
                >
                  {opt.name}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* overview */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Overview</div>
        <div style={{ display: "flex", gap: 10 }}>
          {[
            { label: "Items", value: totalItemCount, color: "#2f6fb0", bg: "#eaf1fb", Icon: Package, onClick: () => actions.goTab("inventory") },
            {
              label: "Expiring soon",
              value: expiringCount,
              color: "#c1452e",
              bg: "#fbeae7",
              Icon: TriangleAlert,
              onClick: () => {
                actions.setInventorySortMode("expiry");
                actions.goTab("inventory");
              },
            },
            { label: "Suggestions", value: suggestionCount, color: "#3f8f5c", bg: "#eaf6ef", Icon: Sparkles, onClick: actions.openRecipesHub },
          ].map((k) => (
            <div
              key={k.label}
              onClick={k.onClick}
              style={{ flex: 1, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: "12px 8px", textAlign: "center", cursor: "pointer" }}
            >
              <div style={{ width: 28, height: 28, borderRadius: 9, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 8px" }}>
                <k.Icon size={14} color={k.color} strokeWidth={2.2} />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#16325c" }}>{k.value}</div>
              <div style={{ fontSize: 10, color: "rgba(22,50,92,0.5)", marginTop: 2 }}>{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* fridge hero carousel */}
      <div style={{ position: "relative", overflow: "hidden", marginBottom: 10 }}>
        <div
          style={{ display: "flex", width: heroTrackWidth, transform: heroTranslate, transition: "transform .3s ease" }}
          onTouchStart={actions.onHeroSwipeStart}
          onTouchEnd={actions.onHeroSwipeEnd}
        >
          {fridgesView.map((fr, i) => (
            <div key={fr.id} style={{ width: `${heroSlideWidthPct}%`, flex: "none" }}>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: 236,
                  borderRadius: 28,
                  overflow: "hidden",
                  background: fr.bg,
                  animation: "glow 5s ease-in-out infinite",
                }}
              >
                {!fr.isCustom && (
                  <Image
                    src={fr.photoSrc}
                    alt="Illustration of a stocked fridge"
                    fill
                    sizes="420px"
                    style={{ objectFit: "cover", objectPosition: "center 15%" }}
                  />
                )}
                {fr.isCustom && (
                  <img
                    src={fr.photoSrc}
                    alt="Custom fridge photo"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 15%", willChange: "transform", transform: "translateZ(0)" }}
                  />
                )}
                <div style={{ position: "absolute", top: 22, left: "16%", width: 3, height: 3, borderRadius: "50%", background: "#eaf3fb", animation: "drip 4s ease-in infinite" }} />
                <div style={{ position: "absolute", top: 18, left: "52%", width: 3, height: 3, borderRadius: "50%", background: "#eaf3fb", animation: "drip 4s ease-in infinite 1.3s" }} />
                <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(255,255,255,0.85)", color: "#16325c", fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 14 }}>
                  {fr.name}
                </div>
                <div style={{ position: "absolute", bottom: 12, left: 16, background: "rgba(22,50,92,0.55)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20 }}>
                  {fr.itemCount} items tracked
                </div>
                <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(255,255,255,0.85)", color: fr.color, fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 14 }}>
                  {fr.freshness}% fresh
                </div>
                <div
                  onClick={() => actions.openStylePicker(i)}
                  style={{
                    position: "absolute",
                    right: 14,
                    bottom: 12,
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    background: "rgba(255,255,255,0.85)",
                    backdropFilter: "blur(6px)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    zIndex: 2,
                  }}
                >
                  <Palette size={16} color="#16325c" strokeWidth={2} />
                </div>
              </div>
            </div>
          ))}
          <div style={{ width: `${heroSlideWidthPct}%`, flex: "none" }}>
            <div
              style={{
                width: "100%",
                height: 236,
                borderRadius: 28,
                background: "rgba(255,255,255,0.5)",
                border: "2px dashed rgba(22,50,92,0.22)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "0 30px",
                boxSizing: "border-box",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#16325c" }}>Add another fridge</div>
              <input
                value={state.newFridgeName}
                onChange={(e) => actions.onNewFridgeNameChange(e.target.value)}
                onKeyDown={(e) => actions.onNewFridgeNameKeyDown(e.key)}
                placeholder="e.g. Garage, Office…"
                style={{ width: "100%", border: "none", outline: "none", background: "#fff", borderRadius: 12, padding: "10px 14px", fontSize: 13, color: "#16325c", boxSizing: "border-box" }}
              />
              <div onClick={actions.addFridge} style={{ background: "#16325c", color: "#fff", fontSize: 13, fontWeight: 700, padding: "9px 18px", borderRadius: 12, cursor: "pointer" }}>
                Add fridge
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 10 }}>
          {Array.from({ length: dotCount }).map((_, i) => (
            <div
              key={i}
              onClick={() => actions.selectHero(i)}
              style={{ width: 7, height: 7, borderRadius: 4, background: i === heroSlide ? "#16325c" : "rgba(22,50,92,0.25)", cursor: "pointer" }}
            />
          ))}
        </div>
      </div>
      <div style={{ height: 8 }} />

      {/* meet your crew */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Your crew</div>
        <CrewScene />
      </div>

      {/* guardian tip */}
      {guardianVisible && guardianItem && (
        <SwipeToClear
          marginBottom={14}
          onClear={() => {
            setDismissedGuardianFor(guardianItem.id);
            if (guardianEventId) actions.dismissNotificationWithUndo(guardianEventId);
          }}
        >
          <div
            onClick={() => actions.selectItem(guardianItem.id)}
            style={{ background: "#fff", boxShadow: "0 10px 24px rgba(22,50,92,0.1)", borderRadius: 18, padding: "14px 16px", cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <TriangleAlert size={15} color="#d99a2b" strokeWidth={2.2} />
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "#16325c" }}>EXPIRING SOON</div>
              </div>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#c1452e", background: "#c1452e1a", padding: "2px 7px", borderRadius: 6 }}>GUARDIAN</div>
            </div>
            <MarkdownText text={guardianMessage} style={{ fontSize: 13.5, lineHeight: 1.4, color: "#16325c" }} />
          </div>
        </SwipeToClear>
      )}

      {/* low stock */}
      {lowStockVisible && lowStockItem && (
        <SwipeToClear
          marginBottom={18}
          onClear={() => setDismissedLowStockFor(lowStockItem.id)}
        >
          <div onClick={actions.openShoppingHub} style={{ background: "#fff", boxShadow: "0 10px 24px rgba(22,50,92,0.1)", borderRadius: 18, padding: "14px 16px", cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "#16325c" }}>LOW STOCK</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#3f8f5c", background: "#3f8f5c1a", padding: "2px 7px", borderRadius: 6 }}>SHOPKEEPER</div>
            </div>
            <MarkdownText text={shopkeeperMessage} style={{ fontSize: 13.5, lineHeight: 1.4, color: "#16325c" }} />
          </div>
        </SwipeToClear>
      )}

      {/* chef's pick */}
      {chefVisible && (
        <SwipeToClear
          marginBottom={22}
          onClear={() => setDismissedChefFor(chefKey)}
        >
          <div
            onClick={actions.openRecipesHub}
            style={{ background: "#fff", boxShadow: "0 10px 24px rgba(22,50,92,0.1)", borderRadius: 18, padding: "14px 16px", cursor: "pointer" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: "#16325c" }}>CHEF&apos;S PICK</div>
              <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#d99a2b", background: "#d99a2b1a", padding: "2px 7px", borderRadius: 6 }}>CHEF</div>
            </div>
            <MarkdownText text={chefMessage} style={{ fontSize: 13.5, lineHeight: 1.4, color: "#16325c" }} />
          </div>
        </SwipeToClear>
      )}
    </div>

    {/* ============ Wide layout (>=900px) — see .thatfridge-home-wide in globals.css ============ */}
    <div className="thatfridge-home-wide">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>Home</div>
          <div style={{ position: "relative", width: "fit-content" }}>
            <div
              onClick={() => setShowScopeMenu((v) => !v)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 12px", borderRadius: 12, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", cursor: "pointer", fontSize: 12.5, fontWeight: 700, color: "#16325c" }}
            >
              <Refrigerator size={14} color="#16325c" strokeWidth={2.2} />
              {getScopeLabel(state)}
              <ChevronDown size={13} color="#16325c" strokeWidth={2.2} />
            </div>
            {showScopeMenu && (
              <div style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", background: "#fff", borderRadius: 12, boxShadow: "0 10px 24px rgba(22,50,92,0.14)", padding: 6, zIndex: 5, minWidth: 180 }}>
                {([{ id: "all" as const, name: "All Fridges" }, ...state.fridges.map((f, i) => ({ id: i, name: f.name }))]).map((opt) => {
                  const active = opt.id === "all" ? state.kitchenScope === "all" : state.kitchenScope === "active" && state.activeFridge === opt.id;
                  return (
                    <div
                      key={opt.id}
                      onClick={() => {
                        actions.selectFridgeScope(opt.id);
                        setShowScopeMenu(false);
                      }}
                      style={{ padding: "8px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: "pointer", color: active ? "#2f6fb0" : "#16325c", background: active ? "#eaf6ff" : "transparent" }}
                    >
                      {opt.name}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div
          onClick={actions.openNotificationHistory}
          style={{ position: "relative", width: 38, height: 38, borderRadius: 19, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <Bell size={17} color="#16325c" strokeWidth={2} />
          {pendingNotifications > 0 && (
            <div style={{ position: "absolute", top: 4, right: 5, width: 8, height: 8, borderRadius: 4, background: "#c1452e", border: "1.5px solid #fff" }} />
          )}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
        {[
          { label: "Items tracked", value: totalItemCount, color: "#2f6fb0", bg: "rgba(47,111,176,0.12)", Icon: Package, onClick: () => actions.goTab("inventory") },
          {
            label: "Expiring soon",
            value: expiringCount,
            color: "#c1452e",
            bg: "rgba(193,69,46,0.12)",
            Icon: TriangleAlert,
            onClick: () => {
              actions.setInventorySortMode("expiry");
              actions.goTab("inventory");
            },
          },
          { label: "Suggestions", value: suggestionCount, color: "#3f8f5c", bg: "rgba(63,143,92,0.12)", Icon: Sparkles, onClick: actions.openRecipesHub },
        ].map((k) => (
          <div
            key={k.label}
            onClick={k.onClick}
            style={{ display: "flex", alignItems: "center", gap: 14, background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: "18px 20px", cursor: "pointer" }}
          >
            <div style={{ width: 42, height: 42, borderRadius: 13, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <k.Icon size={20} color={k.color} strokeWidth={2.2} />
            </div>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: "rgba(22,50,92,0.55)", fontWeight: 600, marginTop: 3 }}>{k.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20, marginBottom: 20, alignItems: "start" }}>
        <div style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: 20, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 14 }}>Your fridges</div>

          <div style={{ position: "relative" }}>
            {fridgeCount > 1 && (
              <div
                onClick={() => carouselIndex > 0 && actions.selectFridgeScope(carouselIndex - 1)}
                style={{
                  position: "absolute",
                  left: -4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 3,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: "#fff",
                  boxShadow: "0 6px 16px rgba(22,50,92,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: carouselIndex === 0 ? "default" : "pointer",
                  opacity: carouselIndex === 0 ? 0.35 : 1,
                }}
              >
                <ChevronLeft size={17} color="#16325c" strokeWidth={2.4} />
              </div>
            )}

            <div style={{ overflow: "hidden", height: CAROUSEL_CARD_H + 10 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "100%",
                  transform: `translateX(calc(50% - ${carouselIndex * (CAROUSEL_CARD_W + CAROUSEL_GAP) + CAROUSEL_CARD_W / 2}px))`,
                  transition: "transform .45s cubic-bezier(.22,.9,.34,1)",
                }}
              >
                {fridgesView.map((fr, i) => {
                  const isActive = i === carouselIndex;
                  return (
                    <div
                      key={fr.id}
                      onClick={() => actions.selectFridgeScope(i)}
                      style={{
                        position: "relative",
                        flex: `0 0 ${CAROUSEL_CARD_W}px`,
                        marginRight: CAROUSEL_GAP,
                        height: CAROUSEL_CARD_H,
                        borderRadius: 20,
                        overflow: "hidden",
                        background: "linear-gradient(160deg,#234b7a,#16325c 70%)",
                        cursor: "pointer",
                        transform: `scale(${isActive ? 1 : CAROUSEL_PEEK_SCALE})`,
                        opacity: isActive ? 1 : CAROUSEL_PEEK_OPACITY,
                        boxShadow: isActive ? "0 20px 36px rgba(22,50,92,0.28)" : "0 8px 16px rgba(22,50,92,0.12)",
                        transition: "all .45s cubic-bezier(.22,.9,.34,1)",
                      }}
                    >
                      <img
                        src={fr.photoSrc}
                        alt="Fridge preview"
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }}
                      />
                      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(22,50,92,0.1) 0%, rgba(22,50,92,0.5) 100%)" }} />
                      <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(255,255,255,0.85)", color: "#16325c", fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 14, whiteSpace: "nowrap" }}>
                        {fr.name}
                      </div>
                      <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.85)", color: fr.color, fontSize: 12, fontWeight: 800, padding: "6px 11px", borderRadius: 14 }}>
                        {fr.freshness}%
                      </div>
                      {isActive && (
                        <>
                          <div style={{ position: "absolute", bottom: 12, left: 14, background: "rgba(22,50,92,0.55)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20 }}>
                            {fr.itemCount} items tracked
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              actions.openStylePicker(i);
                            }}
                            style={{
                              position: "absolute",
                              right: 10,
                              bottom: 10,
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "7px 10px",
                              borderRadius: 999,
                              background: "rgba(255,255,255,0.15)",
                              backdropFilter: "blur(6px)",
                              border: "1px solid rgba(255,255,255,0.14)",
                              cursor: "pointer",
                              boxShadow: "0 8px 16px rgba(10, 30, 60, 0.16)",
                            }}
                          >
                            <Palette size={13} color="#fff" strokeWidth={2.2} />
                            <div style={{ fontSize: 10.5, fontWeight: 800, color: "#fff" }}>Customize</div>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {fridgeCount > 1 && (
              <div
                onClick={() => carouselIndex < fridgeCount - 1 && actions.selectFridgeScope(carouselIndex + 1)}
                style={{
                  position: "absolute",
                  right: -4,
                  top: "50%",
                  transform: "translateY(-50%)",
                  zIndex: 3,
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  background: "#fff",
                  boxShadow: "0 6px 16px rgba(22,50,92,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: carouselIndex === fridgeCount - 1 ? "default" : "pointer",
                  opacity: carouselIndex === fridgeCount - 1 ? 0.35 : 1,
                }}
              >
                <ChevronRight size={17} color="#16325c" strokeWidth={2.4} />
              </div>
            )}
          </div>

          {fridgeCount > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 6 }}>
              {fridgesView.map((fr, i) => (
                <div
                  key={fr.id}
                  onClick={() => actions.selectFridgeScope(i)}
                  style={{
                    width: i === carouselIndex ? 18 : 7,
                    height: 7,
                    borderRadius: 4,
                    background: i === carouselIndex ? "#16325c" : "rgba(22,50,92,0.25)",
                    cursor: "pointer",
                    transition: "all .3s ease",
                  }}
                />
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <input
              value={state.newFridgeName}
              onChange={(e) => actions.onNewFridgeNameChange(e.target.value)}
              onKeyDown={(e) => actions.onNewFridgeNameKeyDown(e.key)}
              placeholder="Add another fridge — e.g. Garage, Office…"
              style={{ flex: 1, border: "1px solid rgba(22,50,92,0.12)", outline: "none", background: "#f9fbfd", borderRadius: 10, padding: "7px 12px", fontSize: 12.5, color: "#16325c", boxSizing: "border-box" }}
            />
            <div onClick={actions.addFridge} style={{ background: "#16325c", color: "#fff", fontSize: 12.5, fontWeight: 700, padding: "7px 16px", borderRadius: 10, cursor: "pointer", flex: "none" }}>
              Add
            </div>
          </div>
        </div>

        <div style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: 20 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 14 }}>Needs attention</div>
          {expiringItems.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.5)" }}>Nothing expiring soon — you&apos;re all set.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {expiringItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => actions.selectItem(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 12, cursor: "pointer" }}
                >
                  <div style={{ position: "relative", width: 34, height: 34, borderRadius: 10, background: "#eaf6ff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", padding: 6, boxSizing: "border-box" }}>
                    <FoodIcon icon={item.icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(22,50,92,0.5)" }}>{item.fridgeName}</div>
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 8px", borderRadius: 20, flex: "none", color: freshColor(item.freshness), background: `${freshColor(item.freshness)}1a` }}>
                    {daysLabel(item.days)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: 20 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 14 }}>Your crew</div>
        <CrewScene scale={1.12} mapScale={0.9} mapOffsetY={-22} />
      </div>

      <div style={{ height: 20 }} />

      <div style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: 20 }}>
        <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 14 }}>Your crew</div>
        {!guardianVisible && !lowStockVisible && !chefVisible ? (
          <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.5)" }}>No tips right now — check back after your next shop.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {chefVisible && (
              <div onClick={actions.openRecipesHub} style={{ background: "#f9fbfd", borderRadius: 16, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>Chef</div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#d99a2b", background: "#d99a2b1a", padding: "2px 7px", borderRadius: 6 }}>PICK</div>
                </div>
                <MarkdownText text={chefMessage} style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(22,50,92,0.75)" }} />
              </div>
            )}
            {guardianVisible && guardianItem && (
              <div onClick={() => actions.selectItem(guardianItem.id)} style={{ background: "#f9fbfd", borderRadius: 16, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>Guardian</div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#c1452e", background: "#c1452e1a", padding: "2px 7px", borderRadius: 6 }}>ALERT</div>
                </div>
                <MarkdownText text={guardianMessage} style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(22,50,92,0.75)" }} />
              </div>
            )}
            {lowStockVisible && lowStockItem && (
              <div onClick={actions.openShoppingHub} style={{ background: "#f9fbfd", borderRadius: 16, padding: 16, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800 }}>Shopkeeper</div>
                  <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.3, color: "#3f8f5c", background: "#3f8f5c1a", padding: "2px 7px", borderRadius: 6 }}>LOW STOCK</div>
                </div>
                <MarkdownText text={shopkeeperMessage} style={{ fontSize: 12, lineHeight: 1.5, color: "rgba(22,50,92,0.75)" }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
