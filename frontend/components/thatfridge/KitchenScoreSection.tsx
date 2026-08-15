"use client";

import { useEffect } from "react";
import { computeFoodBalanceScore, computeWasteSaverScore, getScoreTrend, recordDailyScoreSnapshot, type KitchenScoreResult } from "@/lib/thatfridge/scoring";
import { useThatFridgeCtx } from "./ThatFridgeContext";

function scoreColor(score: number | null): string {
  if (score === null) return "rgba(22,50,92,0.35)";
  if (score >= 80) return "#3f8f5c";
  if (score >= 55) return "#d99a2b";
  return "#c1452e";
}

function TrendLine({ userEmail, result }: { userEmail: string | null | undefined; result: KitchenScoreResult }) {
  const trend = getScoreTrend(userEmail, result.key, result.score);
  if (!trend) return null;
  if (trend.delta === 0) return <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(22,50,92,0.4)" }}>Same as {trend.days}d ago</div>;
  const up = trend.delta > 0;
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: up ? "#3f8f5c" : "#c1452e" }}>
      {up ? "↑" : "↓"} {Math.abs(trend.delta)} from {trend.days}d ago
    </div>
  );
}

function ScoreCard({ result, userEmail }: { result: KitchenScoreResult; userEmail: string | null | undefined }) {
  return (
    <div style={{ flex: 1, background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, color: "#16325c" }}>
          <span>{result.emoji}</span>
          {result.label}
        </div>
        {result.score !== null && <div style={{ fontSize: 18, fontWeight: 800, color: scoreColor(result.score) }}>{result.score}</div>}
      </div>
      <div style={{ fontSize: 11, lineHeight: 1.4, color: "rgba(22,50,92,0.55)", marginBottom: 6 }}>{result.headline}</div>
      {result.score !== null ? (
        <>
          <div style={{ fontSize: 10, lineHeight: 1.4, color: "rgba(22,50,92,0.4)", marginBottom: 6 }}>{result.detail}</div>
          <TrendLine userEmail={userEmail} result={result} />
        </>
      ) : (
        <div style={{ fontSize: 10, lineHeight: 1.4, color: "rgba(22,50,92,0.4)" }}>{result.detail}</div>
      )}
    </div>
  );
}

export default function KitchenScoreSection() {
  const { state } = useThatFridgeCtx();
  const waste = computeWasteSaverScore(state);
  const balance = computeFoodBalanceScore(state);
  const userEmail = state.currentUser?.email;

  useEffect(() => {
    recordDailyScoreSnapshot(userEmail, waste.score, balance.score);
    // Only re-snapshot when the actual score values change (or the user changes) - not on
    // every render, since recordDailyScoreSnapshot is itself already idempotent per day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail, waste.score, balance.score]);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.3, color: "rgba(22,50,92,0.5)", marginBottom: 8 }}>YOUR KITCHEN THIS WEEK</div>
      <div style={{ display: "flex", gap: 10 }}>
        <ScoreCard result={waste} userEmail={userEmail} />
        <ScoreCard result={balance} userEmail={userEmail} />
      </div>
    </div>
  );
}
