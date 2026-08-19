"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import { Apple, Carrot, Check, Drumstick, Milk, TriangleAlert, Wheat, type LucideIcon } from "lucide-react";
import { getFoodGroupCoverage, getOverdueItemStats, type KitchenScoreResult } from "@/lib/thatfridge/scoring";
import { getScopedItems } from "@/lib/thatfridge/selectors";
import { theme } from "@/lib/thatfridge/theme";
import type { ThatFridgeState } from "@/lib/thatfridge/useThatFridge";
import { ScoreMeter } from "./CrewScene";

// Used by KitchenScoreSection's dropdown (all 4 agents at once). Order here is also
// KitchenScoreSection's arc segment order.
export const AGENT_META: Record<KitchenScoreResult["key"], { name: string; icon: string; segment: string }> = {
  waste: { name: "Guardian", icon: "/images/thatfridge/guardian.gif", segment: theme.agent.guardian },
  balance: { name: "Chef", icon: "/images/thatfridge/chef.gif", segment: theme.agent.chef },
  organizer: { name: "Organizer", icon: "/images/thatfridge/organizer.gif", segment: theme.agent.organizer },
  shopkeeper: { name: "Shopkeeper", icon: "/images/thatfridge/shopkeeper.gif", segment: theme.agent.shopkeeper },
};

// Same 80/55 cutoffs the rest of the app uses.
export function bandColor(score: number | null): string {
  if (score === null) return theme.text.faint;
  if (score >= 80) return theme.good;
  if (score >= 55) return theme.warn;
  return theme.bad;
}

// Each agent's own little visual signature on its card - drawn from the same real data that
// feeds its score, not decoration for its own sake. Guardian gets an alert-style pill (its
// score is fundamentally an overdue-items check), Chef the 5 food-group icons (identical logic
// to hasFullFoodGroupVariety), Organizer a completion ring (its tally IS a ratio), Shopkeeper a
// receipt-style progress bar (its score IS the checked/total split).

const FOOD_GROUP_ICON: Record<string, LucideIcon> = { protein: Drumstick, vegetables: Carrot, fruit: Apple, grains: Wheat, dairy: Milk };

function GuardianExtra({ state }: { state: ThatFridgeState }) {
  const { overdueCount } = getOverdueItemStats(getScopedItems(state));
  const clear = overdueCount === 0;
  const color = clear ? theme.good : theme.bad;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 8, padding: "3px 8px", borderRadius: 20, background: `${color}1a`, border: `1px solid ${color}` }}>
      {clear ? <Check size={10} strokeWidth={3} color={color} /> : <TriangleAlert size={10} strokeWidth={2.5} color={color} />}
      <span style={{ fontSize: 9.5, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.3 }}>{clear ? "nothing overdue" : `${overdueCount} overdue`}</span>
    </div>
  );
}

function ChefExtra({ state }: { state: ThatFridgeState }) {
  const coverage = getFoodGroupCoverage(state);
  if (!coverage) return null;
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
      {coverage.map((c) => {
        const Icon = FOOD_GROUP_ICON[c.key];
        return (
          <div
            key={c.key}
            title={c.label}
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: c.used ? `${theme.good}22` : "transparent",
              border: `1px solid ${c.used ? theme.good : theme.border.strong}`,
            }}
          >
            {Icon && <Icon size={10} strokeWidth={2.4} color={c.used ? theme.good : theme.text.faint} />}
          </div>
        );
      })}
    </div>
  );
}

function OrganizerExtra({ state }: { state: ThatFridgeState }) {
  const tally = state.organizerTally;
  if (!tally || tally.itemsCheckedTotal === 0) return null;
  const ratio = tally.itemsCorrectTotal / tally.itemsCheckedTotal;
  const r = 12;
  const circumference = 2 * Math.PI * r;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
      <svg width={28} height={28} viewBox="0 0 28 28">
        <circle cx={14} cy={14} r={r} fill="none" stroke={theme.border.strong} strokeWidth={3} />
        <circle
          cx={14}
          cy={14}
          r={r}
          fill="none"
          stroke={theme.agent.organizer}
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          transform="rotate(-90 14 14)"
        />
      </svg>
      <span style={{ fontSize: 10, fontWeight: 700, color: theme.text.faint }}>
        {tally.itemsCorrectTotal}/{tally.itemsCheckedTotal} in the right spot
      </span>
    </div>
  );
}

function ShopkeeperExtra({ state }: { state: ThatFridgeState }) {
  const list = state.shoppingList;
  if (list.length === 0) return null;
  const checkedCount = list.filter((i) => i.checked).length;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ height: 4, borderRadius: 2, background: theme.border.strong, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 2, width: `${(checkedCount / list.length) * 100}%`, background: theme.agent.shopkeeper }} />
      </div>
      <div style={{ marginTop: 4, fontSize: 10, fontWeight: 700, color: theme.text.faint }}>
        {checkedCount}/{list.length} picked up
      </div>
    </div>
  );
}

const AGENT_EXTRA: Record<KitchenScoreResult["key"], (props: { state: ThatFridgeState }) => ReactElement | null> = {
  waste: GuardianExtra,
  balance: ChefExtra,
  organizer: OrganizerExtra,
  shopkeeper: ShopkeeperExtra,
};

// A single agent's bordered card - icon, name, score + pip meter up top, headline + the longer
// descriptive sentence below, then that agent's own little data visual. A colored left rail +
// soft background tint (both the agent's own color) make it read as "this agent's card" at a
// glance among the other three in KitchenScoreSection's dropdown.
export default function AgentScoreCard({ result, state }: { result: KitchenScoreResult; state: ThatFridgeState }) {
  const meta = AGENT_META[result.key];
  const Extra = AGENT_EXTRA[result.key];
  return (
    <div
      style={{
        textAlign: "left",
        background: `linear-gradient(${meta.segment}12, ${meta.segment}12), ${theme.bg.surface2}`,
        border: `1px solid ${theme.border.hairline}`,
        borderLeft: `3px solid ${meta.segment}`,
        borderRadius: theme.radius.sm,
        padding: "10px 12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: theme.radius.sm, background: theme.bg.surface, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden", position: "relative" }}>
          <Image src={meta.icon} alt="" width={22} height={22} unoptimized style={{ objectFit: "contain", imageRendering: "pixelated" }} />
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: theme.text.muted }}>{meta.name}</span>
        <span style={{ fontSize: 14.5, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: bandColor(result.score), flexShrink: 0 }}>
          {result.score !== null ? result.score : "–"}
        </span>
        <ScoreMeter score={result.score} color={meta.segment} float={false} />
      </div>
      <div style={{ marginTop: 6, fontSize: 11, fontWeight: 700, color: theme.text.primary }}>{result.headline}</div>
      <div style={{ marginTop: 2, fontSize: 10.5, lineHeight: 1.4, color: theme.text.faint }}>{result.detail}</div>
      <Extra state={state} />
    </div>
  );
}
