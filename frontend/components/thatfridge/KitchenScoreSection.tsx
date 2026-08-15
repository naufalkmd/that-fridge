"use client";

import { useEffect } from "react";
import { computeFoodBalanceScore, computeWasteSaverScore, getScoreTrend, hasFullFoodGroupVariety, type KitchenScoreResult } from "@/lib/thatfridge/scoring";
import { computeStreak } from "@/lib/thatfridge/streak";
import { useThatFridgeCtx } from "./ThatFridgeContext";
import type { ScoreSnapshot } from "@/lib/thatfridge/types";

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

function ScoreCard({ result, snapshots, streak }: { result: KitchenScoreResult; snapshots: ScoreSnapshot[]; streak: number | null }) {
  return (
    <div style={{ flex: 1, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#16325c" }}>
          <span>{result.emoji}</span>
          {result.label}
        </div>
        {result.score !== null && <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(result.score) }}>{result.score}</div>}
      </div>
      {streak !== null && (
        <div style={{ fontSize: 11, fontWeight: 700, color: streak > 0 ? "#d98c2b" : "rgba(22,50,92,0.35)", marginBottom: 4 }}>
          🔥 {streak} week{streak === 1 ? "" : "s"} streak
        </div>
      )}
      <div style={{ fontSize: 11, lineHeight: 1.4, color: "rgba(22,50,92,0.55)", marginBottom: 6 }}>{result.headline}</div>
      {result.score !== null ? (
        <>
          <div style={{ fontSize: 10, lineHeight: 1.4, color: "rgba(22,50,92,0.4)", marginBottom: 6 }}>{result.detail}</div>
          <TrendLine snapshots={snapshots} result={result} />
        </>
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
        <ScoreCard result={waste} snapshots={state.scoreSnapshots} streak={streak} />
        <ScoreCard result={balance} snapshots={state.scoreSnapshots} streak={null} />
      </div>
      {state.badgeUnlockToast && (
        <div
          style={{
            marginTop: 10,
            background: "#16325c",
            color: "#fff",
            borderRadius: 14,
            padding: "10px 14px",
            fontSize: 12.5,
            fontWeight: 700,
            textAlign: "center",
          }}
        >
          🏅 {state.badgeUnlockToast}
        </div>
      )}
    </div>
  );
}
