"use client";

import { useEffect } from "react";
import { Apple, Award, Carrot, Drumstick, Flame, Leaf, Milk, Salad, Wheat, type LucideIcon } from "lucide-react";
import {
  computeFoodBalanceScore,
  computeWasteSaverScore,
  getFoodGroupCoverage,
  getScoreSeries,
  getScoreTrend,
  hasFullFoodGroupVariety,
  type FoodGroupCoverage,
  type KitchenScoreResult,
  type ScoreSeriesPoint,
} from "@/lib/thatfridge/scoring";
import { computeStreak } from "@/lib/thatfridge/streak";
import { useThatFridgeCtx } from "./ThatFridgeContext";
import type { ScoreSnapshot } from "@/lib/thatfridge/types";

const CARD_ICON: Record<KitchenScoreResult["key"], LucideIcon> = {
  waste: Leaf,
  balance: Salad,
};

const FOOD_GROUP_ICON: Record<string, LucideIcon> = {
  protein: Drumstick,
  vegetables: Carrot,
  fruit: Apple,
  grains: Wheat,
  dairy: Milk,
};

function scoreColor(score: number | null): string {
  if (score === null) return "rgba(22,50,92,0.35)";
  if (score >= 80) return "#3f8f5c";
  if (score >= 55) return "#d99a2b";
  return "#c1452e";
}

function TrendLine({ snapshots, result }: { snapshots: ScoreSnapshot[]; result: KitchenScoreResult }) {
  const trend = getScoreTrend(snapshots, result.key, result.score);
  if (!trend) return null;
  if (trend.delta === 0) return <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(22,50,92,0.4)" }}>Same as last check-in</div>;
  const up = trend.delta > 0;
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: up ? "#3f8f5c" : "#c1452e" }}>
      {up ? "↑" : "↓"} {Math.abs(trend.delta)} since last check-in
    </div>
  );
}

function Sparkline({ points, color }: { points: ScoreSeriesPoint[]; color: string }) {
  if (points.length < 2) return null;
  const w = 58;
  const h = 24;
  const scores = points.map((p) => p.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min || 1;
  const stepX = w / (points.length - 1);
  const coords = points.map((p, i) => [i * stepX, h - ((p.score - min) / range) * (h - 4) - 2] as const);
  const linePoints = coords.map(([x, y]) => `${x},${y}`).join(" ");
  const [lastX, lastY] = coords[coords.length - 1];
  const fillPoints = `0,${h} ${linePoints} ${lastX},${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polygon points={fillPoints} fill={color} opacity={0.12} />
      <polyline points={linePoints} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={2.4} fill={color} />
    </svg>
  );
}

function FoodGroupDots({ coverage }: { coverage: FoodGroupCoverage[] }) {
  const usedCount = coverage.filter((c) => c.used).length;
  const missing = coverage.filter((c) => !c.used).map((c) => c.label);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
        {coverage.map((c) => {
          const Icon = FOOD_GROUP_ICON[c.key];
          return (
            <div
              key={c.key}
              title={`${c.label} — ${c.used ? "used this month" : "none used recently"}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: c.used ? "#eaf6ef" : "transparent",
                color: c.used ? "#3f8f5c" : "rgba(22,50,92,0.24)",
                border: `1.5px solid ${c.used ? "#bfe3cc" : "rgba(22,50,92,0.16)"}`,
              }}
            >
              {Icon && <Icon size={11} strokeWidth={2.3} />}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(22,50,92,0.4)", marginTop: 5 }}>
        {usedCount}/{coverage.length} groups{missing.length > 0 ? ` — missing ${missing.join(", ")}` : ""}
      </div>
    </div>
  );
}

function ScoreCard({
  result,
  snapshots,
  streak,
  foodGroupCoverage,
}: {
  result: KitchenScoreResult;
  snapshots: ScoreSnapshot[];
  streak: number | null;
  foodGroupCoverage: FoodGroupCoverage[] | null;
}) {
  const Icon = CARD_ICON[result.key];
  const color = scoreColor(result.score);
  const series = result.key === "waste" ? getScoreSeries(snapshots, "waste", result.score) : [];

  return (
    <div style={{ flex: 1, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#16325c" }}>
          <Icon size={14} color={color} strokeWidth={2.2} />
          {result.label}
        </div>
        {result.score !== null && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontSize: 18, fontWeight: 800, color }}>
            {result.score}
            <span style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(22,50,92,0.35)" }}>/100</span>
          </div>
        )}
      </div>
      {streak !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: streak > 0 ? "#d98c2b" : "rgba(22,50,92,0.35)", marginBottom: 4 }}>
          <Flame size={12} strokeWidth={2.2} />
          {streak} week{streak === 1 ? "" : "s"} streak
        </div>
      )}
      <div style={{ fontSize: 11, lineHeight: 1.4, color: "rgba(22,50,92,0.55)", marginBottom: 6 }}>{result.headline}</div>
      {result.score !== null ? (
        result.key === "waste" ? (
          <>
            <div style={{ fontSize: 10, lineHeight: 1.4, color: "rgba(22,50,92,0.4)", marginBottom: 6 }}>{result.detail}</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <Sparkline points={series} color={color} />
              <TrendLine snapshots={snapshots} result={result} />
            </div>
          </>
        ) : (
          <>
            {foodGroupCoverage && <FoodGroupDots coverage={foodGroupCoverage} />}
            <div style={{ marginTop: 7 }}>
              <TrendLine snapshots={snapshots} result={result} />
            </div>
          </>
        )
      ) : (
        <div style={{ fontSize: 10, lineHeight: 1.4, color: "rgba(22,50,92,0.4)" }}>{result.detail}</div>
      )}
    </div>
  );
}

export default function KitchenScoreSection() {
  const { state, actions } = useThatFridgeCtx();
  const waste = computeWasteSaverScore(state);
  const balance = computeFoodBalanceScore(state);
  const foodGroupCoverage = getFoodGroupCoverage(state);
  // Nothing to show before the cron has ever run for this account - a "0 week streak" on a
  // brand new signup would read as a broken streak that was never actually started.
  const streak = state.scoreSnapshots.length > 0 ? computeStreak(state.scoreSnapshots) : null;
  const fullVariety = hasFullFoodGroupVariety(state);

  useEffect(() => {
    if (fullVariety) actions.awardBadgeProgress("full_week_variety", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullVariety]);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: "rgba(22,50,92,0.5)", marginBottom: 8 }}>YOUR KITCHEN THIS WEEK</div>
      <div style={{ display: "flex", gap: 10 }}>
        <ScoreCard result={waste} snapshots={state.scoreSnapshots} streak={streak} foodGroupCoverage={null} />
        <ScoreCard result={balance} snapshots={state.scoreSnapshots} streak={null} foodGroupCoverage={foodGroupCoverage} />
      </div>
      {state.badgeUnlockToast && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: "#16325c",
            color: "#fff",
            borderRadius: 14,
            padding: "10px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          <Award size={14} strokeWidth={2.2} />
          {state.badgeUnlockToast}
        </div>
      )}
    </div>
  );
}
