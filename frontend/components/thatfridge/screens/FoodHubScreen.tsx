"use client";

import { useState } from "react";
import Image from "next/image";
import { ChefHat, Heart, MapPin, Plus, Refrigerator, RefreshCw, Sparkles, X } from "lucide-react";
import { FOOD_TAB_ORDER, RECIPE_CATEGORIES, STORAGE_LOCATIONS } from "@/lib/thatfridge/data";
import {
  getExpiringOwnedItems,
  getRecipesView,
  getScopeLabel,
  getScopedItems,
  getShoppingRecommendations,
  getTonightPick,
  type ItemWithSection,
  type ShoppingRecommendation,
} from "@/lib/thatfridge/selectors";
import {
  computeFoodBalanceScore,
  computeOrganizerScore,
  computeShopkeeperScore,
  computeWasteSaverScore,
  type KitchenScoreResult,
} from "@/lib/thatfridge/scoring";
import { daysLabel, freshColor } from "@/lib/thatfridge/utils";
import { theme } from "@/lib/thatfridge/theme";
import type { ChatAgentName } from "@/lib/thatfridge/api";
import type { FoodSubtab, RecipeCategory } from "@/lib/thatfridge/types";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import { bandColor } from "../AgentScoreCard";
import { ScoreMeter } from "../CrewScene";
import FoodIcon from "../FoodIcon";
import LocationIcon from "../LocationIcon";
import MarkdownText from "../MarkdownText";
import ShoppingListPanel from "../ShoppingListPanel";
import Switch from "../Switch";

const REC_SOURCE_META: Record<ShoppingRecommendation["source"], { label: string; color: string }> = {
  recipe: { label: "Recipe", color: theme.amber },
  nutrition: { label: "Nutrition", color: theme.good },
  habit: { label: "Habit", color: theme.bad },
};

const TAB_META: Record<FoodSubtab, { label: string; color: string; icon: string; blurb: string }> = {
  recipes: { label: "Recipes", color: theme.agent.chef, icon: "/images/thatfridge/chef.gif", blurb: "Chef's picks from what you already have" },
  shopping: { label: "Shopping", color: theme.agent.shopkeeper, icon: "/images/thatfridge/shopkeeper.gif", blurb: "Your list, plus what to buy again" },
  guardian: { label: "Guardian", color: theme.agent.guardian, icon: "/images/thatfridge/guardian.gif", blurb: "Riskiest items are listed first" },
  organizer: { label: "Organizer", color: theme.agent.organizer, icon: "/images/thatfridge/organizer.gif", blurb: "Tap a spot to move an item there" },
};

const AGENT_NAME_BY_TAB: Record<FoodSubtab, ChatAgentName> = {
  recipes: "Chef",
  shopping: "Shopkeeper",
  guardian: "Guardian",
  organizer: "Organizer",
};

// Each tab is one agent's home, so it gets that same agent's Kitchen Score card - the one
// place on this screen that says "how's this agent actually doing", not just "what does it
// want you to look at right now".
const SCORE_COMPUTE_BY_TAB: Record<FoodSubtab, (state: Parameters<typeof computeWasteSaverScore>[0]) => KitchenScoreResult> = {
  recipes: computeFoodBalanceScore,
  shopping: computeShopkeeperScore,
  guardian: computeWasteSaverScore,
  organizer: computeOrganizerScore,
};

const RISK_BUCKETS: { key: string; label: string; test: (f: number) => boolean; hint: string }[] = [
  { key: "risk", label: "Act now", test: (f) => f < 30, hint: "Going bad soon — use or lose it" },
  { key: "watch", label: "Use soon", test: (f) => f >= 30 && f < 60, hint: "Plan to use within a few days" },
  { key: "fresh", label: "Fresh", test: (f) => f >= 60, hint: "Holding up well" },
];

function RingTimer({ freshness }: { freshness: number }) {
  const size = 44;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = freshColor(freshness);
  return (
    <svg width={size} height={size} style={{ flex: "none", transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={theme.border.hairline} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c - (freshness / 100) * c}
        strokeLinecap="round"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={11}
        fontWeight={800}
        fill={color}
        transform={`rotate(90 ${size / 2} ${size / 2})`}
      >
        {freshness}
      </text>
    </svg>
  );
}

export default function FoodHubScreen() {
  const { state, actions } = useThatFridgeCtx();
  const activeTab = state.foodSubtab;
  const activeIndex = FOOD_TAB_ORDER.indexOf(activeTab);
  const activeMeta = TAB_META[activeTab];

  const [recipeFilter, setRecipeFilter] = useState<"all" | "favorites" | RecipeCategory>("all");
  const recipesView = getRecipesView(state);
  const filteredRecipesView =
    recipeFilter === "all"
      ? recipesView
      : recipeFilter === "favorites"
        ? recipesView.filter((r) => r.isFavorite)
        : recipesView.filter((r) => r.category === recipeFilter);
  const tonightPick = getTonightPick(recipesView);
  const expiringOwned = getExpiringOwnedItems(state, 5);
  const recommendations = getShoppingRecommendations(state, 6);
  const allItems = getScopedItems(state);
  const showFridgeTags = state.kitchenScope === "all";
  const riskGroups = RISK_BUCKETS.map((b) => ({
    ...b,
    items: allItems.slice().sort((a, b2) => a.freshness - b2.freshness).filter((i) => b.test(i.freshness)),
  })).filter((g) => g.items.length > 0);

  const agentName = AGENT_NAME_BY_TAB[activeTab];
  const agentScore = SCORE_COMPUTE_BY_TAB[activeTab](state);
  const insightText = state.agentInsights[agentName];
  const isActivating = !!state.agentInsightLoading[agentName];

  const riskCount = allItems.filter((i) => i.freshness < 30).length;
  const watchCount = allItems.filter((i) => i.freshness >= 30 && i.freshness < 60).length;
  const freshCount = allItems.length - riskCount - watchCount;
  const barTotal = Math.max(1, allItems.length);

  const heroLine =
    activeTab === "guardian"
      ? allItems.length === 0
        ? "Nothing in this fridge yet"
        : riskCount > 0
          ? `${riskCount} item${riskCount === 1 ? "" : "s"} need attention`
          : "Everything's holding up well"
      : activeTab === "recipes"
        ? tonightPick
          ? `${tonightPick.haveCount}/${tonightPick.total} ingredients ready for tonight`
          : "No recipes yet"
        : activeTab === "shopping"
          ? recommendations.length > 0
            ? `${recommendations.length} item${recommendations.length === 1 ? "" : "s"} to restock`
            : "Nothing needed right now"
          : allItems.length > 0
            ? `${allItems.length} item${allItems.length === 1 ? "" : "s"} across ${STORAGE_LOCATIONS.length} spots`
            : "Nothing to organize yet";

  return (
    <div style={{ position: "absolute", inset: 0, background: theme.bg.canvas, overflowY: "auto" }}>
      {activeTab === "recipes" && (
        <div
          onClick={actions.openWhatToEat}
          style={{
            position: "fixed",
            right: 20,
            bottom: 100,
            width: 52,
            height: 52,
            borderRadius: 26,
            background: theme.amber,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${theme.border.strong}`,
            cursor: "pointer",
            zIndex: 5,
          }}
        >
          <ChefHat size={22} color="#0a0a0c" strokeWidth={2.2} />
        </div>
      )}
      <div style={{ background: theme.bg.surface2 }}>
      <div className="thatfridge-wide-content" style={{ padding: "24px 20px 24px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ fontFamily: "var(--font-pixel)", fontWeight: 400, fontSize: 16, color: theme.text.primary }}>Crew</div>
          <div
            onClick={() => actions.goTab("home")}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "5px 10px",
              borderRadius: theme.radius.sm,
              background: theme.bg.surface,
              fontSize: 11,
              fontWeight: 700,
              color: theme.text.muted,
              cursor: "pointer",
            }}
          >
            <Refrigerator size={11} strokeWidth={2.2} />
            {getScopeLabel(state)}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "138px 1fr", gap: 14, marginBottom: 20, alignItems: "stretch" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
            <Image
              src={activeMeta.icon}
              alt=""
              width={118}
              height={118}
              unoptimized
              style={{ objectFit: "contain", imageRendering: "pixelated", filter: "drop-shadow(0 8px 14px rgba(0,0,0,0.35))" }}
            />
          </div>
          <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.lg, padding: "14px 16px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: activeMeta.color }}>{agentName}</div>
            <div style={{ fontSize: 11.5, color: theme.text.muted, lineHeight: 1.4 }}>{heroLine}</div>

            {activeTab === "guardian" && allItems.length > 0 && (
              <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(riskCount / barTotal) * 100}%`, background: theme.bad }} />
                <div style={{ width: `${(watchCount / barTotal) * 100}%`, background: theme.warn }} />
                <div style={{ width: `${(freshCount / barTotal) * 100}%`, background: theme.good }} />
              </div>
            )}

            <div style={{ fontSize: 11.5, color: theme.text.primary, lineHeight: 1.5, background: `${bandColor(agentScore.score)}14`, borderRadius: theme.radius.sm, padding: "9px 11px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span>{agentScore.headline}</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums", color: bandColor(agentScore.score) }}>
                  {agentScore.score !== null ? agentScore.score : "–"}
                </span>
                <ScoreMeter score={agentScore.score} color={activeMeta.color} float={false} />
              </span>
            </div>

            <div
              onClick={() => !isActivating && actions.activateAgent(agentName)}
              style={{
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: 8,
                borderRadius: theme.radius.sm,
                background: insightText ? `${activeMeta.color}14` : activeMeta.color,
                color: insightText ? activeMeta.color : "#0a0a0c",
                fontSize: 12,
                fontWeight: 700,
                cursor: isActivating ? "default" : "pointer",
                opacity: isActivating ? 0.6 : 1,
              }}
            >
              {insightText ? <RefreshCw size={13} strokeWidth={2.4} /> : <Sparkles size={13} strokeWidth={2.4} />}
              {isActivating ? "Thinking…" : insightText ? "Refresh insight" : `Activate ${agentName}`}
            </div>

            {activeTab === "organizer" && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 2, paddingTop: 8, borderTop: `1px solid ${theme.border.hairline}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: theme.text.muted, lineHeight: 1.3 }}>Let Organizer move items for you</div>
                <Switch on={!!state.notificationPrefs.crewActionsEnabled} onClick={() => actions.toggleNotificationPref("crewActionsEnabled")} />
              </div>
            )}

            {activeTab === "organizer" && state.organizerMovesLoading && (
              <div style={{ fontSize: 11, color: theme.text.faint, textAlign: "center" }}>Checking for misplaced items…</div>
            )}

            {activeTab === "organizer" &&
              state.organizerSuggestedMoves.map((move) => {
                const locationLabel = STORAGE_LOCATIONS.find((l) => l.key === move.location)?.label || move.location;
                return (
                  <div key={move.itemId} style={{ display: "flex", alignItems: "center", gap: 8, background: `${activeMeta.color}0f`, borderRadius: theme.radius.sm, padding: "7px 6px 7px 10px" }}>
                    <div style={{ flex: 1, fontSize: 11.5, color: theme.text.primary, lineHeight: 1.3 }}>
                      Move <strong>{move.itemName}</strong> to {locationLabel}
                    </div>
                    <div
                      onClick={() => actions.applyOrganizerMove(move.itemId, move.location)}
                      style={{ fontSize: 11, fontWeight: 700, color: activeMeta.color, cursor: "pointer", padding: "5px 9px", borderRadius: theme.radius.sm, background: theme.bg.surface, flex: "none" }}
                    >
                      Apply
                    </div>
                    <div
                      onClick={() => actions.dismissOrganizerMove(move.itemId)}
                      style={{ cursor: "pointer", color: theme.text.faint, flex: "none", display: "flex" }}
                    >
                      <X size={13} strokeWidth={2.4} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {insightText && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: theme.fontMono, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: theme.text.faint, marginBottom: 8 }}>
              {"// " + agentName.toLowerCase() + " says"}
            </div>
            <div
              style={{
                position: "relative",
                textAlign: "left",
                background: `linear-gradient(${activeMeta.color}12, ${activeMeta.color}12), ${theme.bg.surface2}`,
                border: `1px solid ${theme.border.hairline}`,
                borderLeft: `3px solid ${activeMeta.color}`,
                borderRadius: theme.radius.sm,
                padding: "10px 30px 10px 12px",
              }}
            >
              <div
                onClick={() => actions.dismissAgentInsight(agentName)}
                style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: theme.text.faint }}
              >
                <X size={12} strokeWidth={2.4} />
              </div>
              <div style={{ fontSize: 11.5, color: theme.text.primary, lineHeight: 1.5 }}>
                <MarkdownText text={insightText} />
              </div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
          {FOOD_TAB_ORDER.map((tab) => {
            const meta = TAB_META[tab];
            const active = tab === activeTab;
            return (
              <div
                key={tab}
                onClick={() => actions.selectFoodTab(tab)}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "10px 4px",
                  borderRadius: theme.radius.sm,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                  background: active ? meta.color : theme.bg.surface,
                  color: active ? "#0a0a0c" : theme.text.faint,
                  transition: "background .15s ease, color .15s ease",
                }}
              >
                {meta.label}
              </div>
            );
          })}
        </div>
      </div>
      </div>

      <div className="thatfridge-wide-content" style={{ overflowX: "hidden", position: "relative", boxSizing: "border-box" }} onTouchStart={actions.onSwipeStart} onTouchEnd={actions.onSwipeEnd}>
        <div
          style={{
            display: "flex",
            width: `${FOOD_TAB_ORDER.length * 100}%`,
            alignItems: "flex-start",
            transform: `translateX(-${activeIndex * (100 / FOOD_TAB_ORDER.length)}%)`,
            transition: "transform .28s ease",
          }}
        >
          {/* recipes pane */}
          <div style={{ width: `${100 / FOOD_TAB_ORDER.length}%`, flex: "none", padding: "20px 20px 100px", boxSizing: "border-box" }}>
            {tonightPick && (
              <div onClick={() => actions.openRecipeDetail(tonightPick.id)} style={{ position: "relative", background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.lg, padding: "14px 16px", marginBottom: 18, cursor: "pointer" }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.4, color: theme.text.primary, marginBottom: 8 }}>TONIGHT&apos;S PICK</div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 46, height: 46, flex: "none", borderRadius: theme.radius.sm, background: theme.bg.surface2, padding: 8, boxSizing: "border-box" }}>
                    <FoodIcon icon={tonightPick.icon} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{tonightPick.name}</div>
                    <div style={{ fontSize: 12, color: theme.text.faint }}>
                      {tonightPick.minutes} min · {tonightPick.ratioLabel}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint }}>ALL RECIPES</div>
              <div
                onClick={() => actions.openNewRecipeForm()}
                style={{ display: "flex", alignItems: "center", gap: 4, color: theme.blue, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
              >
                <Plus size={14} strokeWidth={2.4} />
                Add recipe
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, paddingBottom: 2 }}>
              {[
                { key: "all" as const, label: "All" },
                { key: "favorites" as const, label: "Favorites" },
                ...RECIPE_CATEGORIES,
              ].map((opt) => {
                const active = recipeFilter === opt.key;
                return (
                  <div
                    key={opt.key}
                    onClick={() => setRecipeFilter(opt.key)}
                    style={{
                      flex: "none",
                      whiteSpace: "nowrap",
                      padding: "7px 14px",
                      borderRadius: theme.radius.sm,
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: active ? theme.amber : theme.bg.surface2,
                      color: active ? "#0a0a0c" : theme.text.primary,
                    }}
                  >
                    {opt.label}
                  </div>
                );
              })}
            </div>

            <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
              {filteredRecipesView.length === 0 && (
                <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 12.5, color: theme.text.faint }}>No recipes here yet.</div>
              )}
              {filteredRecipesView.map((r) => {
                const categoryLabel = RECIPE_CATEGORIES.find((c) => c.key === r.category)?.label;
                return (
                  <div key={r.id} onClick={() => actions.openRecipeDetail(r.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}>
                    <div style={{ position: "relative", width: 38, height: 38, flex: "none", borderRadius: theme.radius.sm, background: theme.bg.surface2, padding: 6, boxSizing: "border-box" }}>
                      <FoodIcon icon={r.icon} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{r.name}</div>
                        {r.isFavorite && <Heart size={11} color={theme.bad} fill={theme.bad} strokeWidth={0} />}
                      </div>
                      <div style={{ fontSize: 11.5, color: theme.text.faint, display: "flex", alignItems: "center", gap: 6 }}>
                        {r.minutes} min
                        {categoryLabel && (
                          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3, color: theme.blue, background: `${theme.blue}1a`, padding: "2px 7px", borderRadius: theme.radius.sm }}>
                            {categoryLabel.toUpperCase()}
                          </span>
                        )}
                        {!r.isMine && r.isCustom && r.ownerUsername && <span>by @{r.ownerUsername}</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: r.ratioColor, background: r.ratioBg, padding: "5px 10px", borderRadius: theme.radius.sm }}>{r.ratioLabel}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* shopping pane */}
          <div style={{ width: `${100 / FOOD_TAB_ORDER.length}%`, flex: "none", padding: "20px 20px 100px", boxSizing: "border-box" }}>
            {expiringOwned.length > 0 && (
              <div style={{ marginBottom: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 2 }}>ALREADY HAVE — DON&apos;T REBUY</div>
                <div style={{ fontSize: 11, color: theme.text.faint, marginBottom: 8 }}>Use these up before buying more</div>
                <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.sm, overflow: "hidden" }}>
                  {expiringOwned.map((item, i) => (
                    <div
                      key={item.id}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: i < expiringOwned.length - 1 ? `1px solid ${theme.border.hairline}` : undefined }}
                    >
                      <div style={{ position: "relative", width: 22, height: 22, flex: "none" }}>
                        <FoodIcon icon={item.icon} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600 }}>
                        {item.name}
                        {showFridgeTags && <span style={{ fontWeight: 500, color: theme.text.faint }}> · {item.fridgeName}</span>}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: freshColor(item.freshness), flex: "none" }}>{daysLabel(item.days)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>SHOPPING LIST</div>
            <ShoppingListPanel />

            {recommendations.length > 0 && (
              <div style={{ marginTop: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: theme.text.faint, marginBottom: 8 }}>RECOMMENDED FOR YOU</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {recommendations.map((rec) => {
                    const meta = REC_SOURCE_META[rec.source];
                    return (
                      <div key={rec.id} style={{ display: "flex", alignItems: "center", gap: 12, background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.sm, padding: "10px 14px" }}>
                        <div style={{ position: "relative", width: 26, height: 26, flex: "none" }}>
                          <FoodIcon icon={rec.icon} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{rec.name}</div>
                            <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.2, color: meta.color, background: `${meta.color}1a`, padding: "2px 6px", borderRadius: 6, flex: "none" }}>
                              {meta.label.toUpperCase()}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: theme.text.faint }}>{rec.reason}</div>
                        </div>
                        <div
                          onClick={() => actions.addPredictedToShopping(rec.name, rec.icon)}
                          style={{ width: 30, height: 30, borderRadius: theme.radius.sm, background: theme.amber, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
                        >
                          <Plus size={16} color="#0a0a0c" strokeWidth={2.3} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* guardian pane */}
          <div style={{ width: `${100 / FOOD_TAB_ORDER.length}%`, flex: "none", padding: "20px 20px 100px", boxSizing: "border-box" }}>
            {allItems.length === 0 && (
              <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 40 }}>
                Nothing in this fridge yet — add items to have Guardian watch over them.
              </div>
            )}
            {riskGroups.map((g) => (
              <div key={g.key} style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: theme.text.muted }}>
                    {g.label.toUpperCase()} ({g.items.length})
                  </div>
                  <div style={{ fontSize: 11, color: theme.text.faint }}>{g.hint}</div>
                </div>
                <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
                  {g.items.map((item: ItemWithSection) => (
                    <div
                      key={item.id}
                      onClick={() => actions.selectItem(item.id)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: `1px solid ${theme.border.hairline}`, cursor: "pointer" }}
                    >
                      <RingTimer freshness={item.freshness} />
                      <div style={{ position: "relative", width: 28, height: 28, flex: "none" }}>
                        <FoodIcon icon={item.icon} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{item.name}</div>
                        <div style={{ fontSize: 11.5, color: theme.text.faint, display: "flex", alignItems: "center", gap: 4 }}>
                          {item.sectionName} · {item.note}
                          {showFridgeTags && (
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 2, background: theme.bg.surface2, color: theme.text.muted, fontWeight: 700, padding: "1px 6px", borderRadius: theme.radius.sm }}>
                              <MapPin size={9} strokeWidth={2.5} />
                              {item.fridgeName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: freshColor(item.freshness) }}>{daysLabel(item.days)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* organizer pane */}
          <div style={{ width: `${100 / FOOD_TAB_ORDER.length}%`, flex: "none", padding: "20px 20px 100px", boxSizing: "border-box" }}>
            {allItems.length === 0 && (
              <div style={{ textAlign: "center", color: theme.text.faint, fontSize: 13, marginTop: 40 }}>
                Nothing to organize yet — add items to sort them into place.
              </div>
            )}
            {STORAGE_LOCATIONS.map((loc) => {
              const locItems = allItems.filter((i) => (i.location || "fridge") === loc.key);
              return (
                <div key={loc.key} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: loc.color }}>
                      {loc.label.toUpperCase()} ({locItems.length})
                    </div>
                    <div style={{ fontSize: 11, color: theme.text.faint }}>{loc.blurb}</div>
                  </div>
                  <div style={{ background: theme.bg.surface, border: `1px solid ${theme.border.hairline}`, borderRadius: theme.radius.md, overflow: "hidden" }}>
                    {locItems.length === 0 && (
                      <div style={{ padding: "14px", fontSize: 12.5, color: theme.text.faint, textAlign: "center" }}>Nothing here yet</div>
                    )}
                    {locItems.map((item) => {
                      const current = item.location || "fridge";
                      return (
                        <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderBottom: `1px solid ${theme.border.hairline}` }}>
                          <div style={{ position: "relative", width: 26, height: 26, flex: "none" }}>
                            <FoodIcon icon={item.icon} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{item.name}</div>
                            {showFridgeTags && (
                              <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10.5, fontWeight: 700, color: theme.text.faint }}>
                                <MapPin size={9} strokeWidth={2.5} />
                                {item.fridgeName}
                              </div>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 4, flex: "none" }}>
                            {STORAGE_LOCATIONS.map((opt) => {
                              const active = opt.key === current;
                              return (
                                <div
                                  key={opt.key}
                                  onClick={() => actions.setItemLocation(item.id, opt.key)}
                                  title={opt.label}
                                  style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: theme.radius.sm,
                                    background: active ? opt.color : theme.bg.surface2,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    cursor: "pointer",
                                  }}
                                >
                                  <LocationIcon location={opt.key} size={13} color={active ? theme.text.primary : theme.text.faint} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
