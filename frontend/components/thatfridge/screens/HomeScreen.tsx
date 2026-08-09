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
  const recipesView = getRecipesView(state);
  const recipeIdeas = recipesView.filter((r) => r.haveCount > 0).sort((a, b) => b.haveCount / b.total - a.haveCount / a.total);
  const suggestionCount = recipeIdeas.length;

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
  const firstName = state.currentUser?.name?.split(/\s+/)[0];

  // Desktop-only horizontally-scrolling rows (Needs attention / Your fridges / Recipe
  // ideas) - refs so the row-arrow buttons can scroll the right track.
  const attnRowRef = useRef<HTMLDivElement>(null);
  const fridgesRowRef = useRef<HTMLDivElement>(null);
  const recipesRowRef = useRef<HTMLDivElement>(null);
  const scrollRowBy = (ref: React.RefObject<HTMLDivElement | null>, delta: number) => ref.current?.scrollBy({ left: delta, behavior: "smooth" });
  const rowArrowStyle: React.CSSProperties = { width: 28, height: 28, borderRadius: 14, background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" };

  // The right-edge fade only makes sense while there's actually more to scroll to - shown
  // unconditionally, it sits on top of (and washes out) whatever card lands at the visible
  // edge, including the "Add another fridge" form when that's the last, fully-visible card.
  const [attnCanScrollRight, setAttnCanScrollRight] = useState(false);
  const [fridgesCanScrollRight, setFridgesCanScrollRight] = useState(false);
  const canScrollRight = (el: HTMLDivElement | null) => !!el && el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
  useEffect(() => {
    const check = () => {
      setAttnCanScrollRight(canScrollRight(attnRowRef.current));
      setFridgesCanScrollRight(canScrollRight(fridgesRowRef.current));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [expiringItems.length, fridgesView.length]);

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
      {/* header: title/greeting/fridge-scope toggle on the left, overview stats + bell on the right */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 25, fontWeight: 800, letterSpacing: -0.4, marginBottom: 3 }}>Home</div>
          <div style={{ fontSize: 12.5, color: "rgba(22,50,92,0.55)", marginBottom: 10 }}>
            Welcome back{firstName ? `, ${firstName}` : ""} — here&apos;s what&apos;s going on in your kitchen.
          </div>
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

        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          <div style={{ display: "flex", gap: 10 }}>
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
                style={{ display: "flex", alignItems: "center", gap: 9, background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 14, padding: "10px 13px", cursor: "pointer" }}
              >
                <div style={{ width: 28, height: 28, borderRadius: 9, background: k.bg, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                  <k.Icon size={13} color={k.color} strokeWidth={2.2} />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>{k.value}</div>
                  <div style={{ fontSize: 9.5, color: "rgba(22,50,92,0.55)", fontWeight: 600, marginTop: 2 }}>{k.label}</div>
                </div>
              </div>
            ))}
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
      </div>

      {/* Needs attention: horizontally-scrolling row */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Needs attention</div>
            <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.55)" }}>
              {expiringItems.length === 0 ? "All caught up" : `${expiringItems.length} item${expiringItems.length === 1 ? "" : "s"} expiring soon`}
            </div>
          </div>
          {expiringItems.length > 0 && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => scrollRowBy(attnRowRef, -300)} style={rowArrowStyle}>
                <ChevronLeft size={14} color="#16325c" strokeWidth={2.4} />
              </button>
              <button onClick={() => scrollRowBy(attnRowRef, 300)} style={rowArrowStyle}>
                <ChevronRight size={14} color="#16325c" strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>
        {expiringItems.length === 0 ? (
          <div style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: 20, fontSize: 12.5, color: "rgba(22,50,92,0.5)" }}>
            Nothing expiring soon — you&apos;re all set.
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <div
              ref={attnRowRef}
              className="thatfridge-scroll-row"
              onScroll={(e) => setAttnCanScrollRight(canScrollRight(e.currentTarget))}
              style={{ display: "flex", gap: 14, overflowX: "auto", scrollSnapType: "x proximity", scrollBehavior: "smooth", padding: "4px 4px 6px", margin: "-4px -4px -6px" }}
            >
              {expiringItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => actions.selectItem(item.id)}
                  style={{ scrollSnapAlign: "start", flex: "none", width: 200, display: "flex", alignItems: "center", gap: 10, background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 16, padding: "10px 12px", cursor: "pointer" }}
                >
                  <div style={{ position: "relative", width: 36, height: 36, borderRadius: 11, background: "#f9fbfd", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", padding: 6, boxSizing: "border-box" }}>
                    <FoodIcon icon={item.icon} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: "rgba(22,50,92,0.5)", marginBottom: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.fridgeName}</div>
                    <div style={{ display: "inline-block", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, color: freshColor(item.freshness), background: `${freshColor(item.freshness)}1a` }}>
                      {daysLabel(item.days)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {attnCanScrollRight && (
              <div style={{ position: "absolute", top: 0, right: 0, bottom: 6, width: 44, background: "linear-gradient(90deg, transparent, #eaf6ff)", pointerEvents: "none" }} />
            )}
          </div>
        )}
      </div>

      {/* Your fridges: bigger cards, click to focus (Netflix-style) */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 9 }}>
            <div style={{ fontSize: 15.5, fontWeight: 800 }}>Your fridges</div>
            <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.55)" }}>
              {fridgeCount} space{fridgeCount === 1 ? "" : "s"}
            </div>
          </div>
          {fridgeCount > 1 && (
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => scrollRowBy(fridgesRowRef, -320)} style={rowArrowStyle}>
                <ChevronLeft size={14} color="#16325c" strokeWidth={2.4} />
              </button>
              <button onClick={() => scrollRowBy(fridgesRowRef, 320)} style={rowArrowStyle}>
                <ChevronRight size={14} color="#16325c" strokeWidth={2.4} />
              </button>
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <div
            ref={fridgesRowRef}
            className="thatfridge-scroll-row"
            onScroll={(e) => setFridgesCanScrollRight(canScrollRight(e.currentTarget))}
            style={{ display: "flex", gap: 22, overflowX: "auto", scrollSnapType: "x proximity", scrollBehavior: "smooth", padding: "18px 18px 22px", margin: "-18px -18px -22px" }}
          >
            {fridgesView.map((fr, i) => {
              const isActive = i === carouselIndex;
              return (
                <div
                  key={fr.id}
                  onClick={() => actions.selectFridgeScope(i)}
                  style={{
                    scrollSnapAlign: "start",
                    flex: "none",
                    position: "relative",
                    width: 300,
                    height: 190,
                    borderRadius: 20,
                    overflow: "hidden",
                    cursor: "pointer",
                    transform: isActive ? "scale(1.1)" : "scale(0.93)",
                    opacity: isActive ? 1 : 0.6,
                    zIndex: isActive ? 4 : 1,
                    // Blur radius kept small enough that the active card's shadow doesn't spread
                    // across the row gap and wash over the (lower z-index) neighboring card.
                    boxShadow: isActive ? "0 12px 22px rgba(22,50,92,0.28)" : "0 8px 18px rgba(22,50,92,0.16)",
                    transition: "transform .24s cubic-bezier(.22,.9,.34,1), opacity .24s ease, box-shadow .24s ease",
                  }}
                >
                  <img
                    src={fr.photoSrc}
                    alt="Fridge preview"
                    style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%" }}
                  />
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(22,50,92,0.1) 0%, rgba(22,50,92,0.5) 100%)" }} />
                  <div style={{ position: "absolute", top: 12, left: 12, background: "rgba(255,255,255,0.9)", color: "#16325c", fontSize: 12.5, fontWeight: 800, padding: "6px 11px", borderRadius: 14, whiteSpace: "nowrap" }}>
                    {fr.name}
                  </div>
                  <div style={{ position: "absolute", top: 12, right: 12, background: "rgba(255,255,255,0.9)", color: fr.color, fontSize: 12.5, fontWeight: 800, padding: "6px 11px", borderRadius: 14 }}>
                    {fr.freshness}%
                  </div>
                  <div style={{ position: "absolute", bottom: 12, left: 12, background: "rgba(22,50,92,0.5)", backdropFilter: "blur(6px)", color: "#fff", fontSize: 11, fontWeight: 600, padding: "5px 10px", borderRadius: 20 }}>
                    {fr.itemCount} items
                  </div>
                  {isActive && (
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
                  )}
                </div>
              );
            })}
            <div
              style={{
                scrollSnapAlign: "start",
                flex: "none",
                width: 300,
                height: 190,
                borderRadius: 20,
                background: "rgba(255,255,255,0.5)",
                border: "2px dashed rgba(22,50,92,0.22)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
                padding: "0 26px",
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
          {fridgesCanScrollRight && (
            <div style={{ position: "absolute", top: -18, right: 0, bottom: -22, width: 44, background: "linear-gradient(90deg, transparent, #eaf6ff)", pointerEvents: "none" }} />
          )}
        </div>
      </div>

      {/* Your crew: scene on the left, tips + recipe ideas on the right */}
      <div style={{ background: "#fff", boxShadow: "0 6px 20px rgba(22,50,92,0.07)", borderRadius: 22, padding: 20, display: "grid", gridTemplateColumns: "minmax(0, 0.82fr) minmax(0, 1fr)", gap: 22 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ fontSize: 14.5, fontWeight: 800 }}>Your crew</div>
            <div onClick={actions.openRecipesHub} style={{ fontSize: 11.5, fontWeight: 700, color: "#2f6fb0", cursor: "pointer" }}>
              Open →
            </div>
          </div>
          <CrewScene />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: "rgba(22,50,92,0.55)", marginBottom: 10 }}>Crew tips</div>
            {!guardianVisible && !lowStockVisible && !chefVisible ? (
              <div style={{ fontSize: 12, color: "rgba(22,50,92,0.5)" }}>No tips right now — check back after your next shop.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {guardianVisible && guardianItem && (
                  <div
                    onClick={() => actions.selectItem(guardianItem.id)}
                    style={{ padding: "10px 12px", borderRadius: 12, background: "#f9fbfd", borderLeft: "3px solid #c1452e", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>Guardian</div>
                      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: "#c1452e", background: "#c1452e1a", padding: "2px 6px", borderRadius: 5 }}>ALERT</div>
                    </div>
                    <MarkdownText text={guardianMessage} style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(22,50,92,0.75)" }} />
                  </div>
                )}
                {chefVisible && (
                  <div
                    onClick={actions.openRecipesHub}
                    style={{ padding: "10px 12px", borderRadius: 12, background: "#f9fbfd", borderLeft: "3px solid #d99a2b", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>Chef</div>
                      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: "#d99a2b", background: "#d99a2b1a", padding: "2px 6px", borderRadius: 5 }}>PICK</div>
                    </div>
                    <MarkdownText text={chefMessage} style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(22,50,92,0.75)" }} />
                  </div>
                )}
                {lowStockVisible && lowStockItem && (
                  <div
                    onClick={actions.openShoppingHub}
                    style={{ padding: "10px 12px", borderRadius: 12, background: "#f9fbfd", borderLeft: "3px solid #3f8f5c", cursor: "pointer" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <div style={{ fontSize: 12, fontWeight: 800 }}>Shopkeeper</div>
                      <div style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.3, color: "#3f8f5c", background: "#3f8f5c1a", padding: "2px 6px", borderRadius: 5 }}>LOW STOCK</div>
                    </div>
                    <MarkdownText text={shopkeeperMessage} style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(22,50,92,0.75)" }} />
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.4, color: "rgba(22,50,92,0.55)", marginBottom: 10 }}>Recipe ideas</div>
            {recipeIdeas.length === 0 ? (
              <div style={{ fontSize: 12, color: "rgba(22,50,92,0.5)" }}>Add a few more items and recipe ideas will show up here.</div>
            ) : (
              <div ref={recipesRowRef} className="thatfridge-scroll-row" style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 2 }}>
                {recipeIdeas.slice(0, 8).map((r) => (
                  <div
                    key={r.id}
                    onClick={() => actions.openRecipeDetail(r.id)}
                    style={{ flex: "none", width: 112, borderRadius: 12, overflow: "hidden", background: "#f9fbfd", cursor: "pointer" }}
                  >
                    <div style={{ position: "relative", width: "100%", height: 54, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <FoodIcon icon={r.icon} />
                    </div>
                    <div style={{ padding: "8px 9px 9px" }}>
                      <div style={{ fontSize: 10.5, fontWeight: 800, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                      <div style={{ fontSize: 9, color: r.ratioColor }}>{r.ratioLabel}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
