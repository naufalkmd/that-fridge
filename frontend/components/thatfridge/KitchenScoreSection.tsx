"use client";

import { useEffect, useState } from "react";
import { Award, ChevronDown, Flame } from "lucide-react";
import {
  computeFoodBalanceScore,
  computeOrganizerScore,
  computeShopkeeperScore,
  computeWasteSaverScore,
  getOverallScore,
  hasFullFoodGroupVariety,
  type KitchenScoreResult,
} from "@/lib/thatfridge/scoring";
import { computeStreak } from "@/lib/thatfridge/streak";
import { theme } from "@/lib/thatfridge/theme";
import { useThatFridgeCtx } from "./ThatFridgeContext";
import AgentScoreCard, { AGENT_META } from "./AgentScoreCard";

const AGENT_ORDER: KitchenScoreResult["key"][] = ["waste", "balance", "organizer", "shopkeeper"];

// Half-circle "sunrise arc" gauge (r=70, center 88,88), swept 180°→360° so it domes over the
// top with flat ends at the card's horizontal midline. The 4 segments are fixed equal-width
// brand markers (they don't scale with each agent's actual score - only the puck position,
// computed from the live overall score, is data-driven).
const ARC_R = 70;
const ARC_CENTER = 88;
const ARC_DASH = "51.31 388.51"; // 42° segment length, 4° gaps either side, out of a 439.82 circumference
const ARC_ROTATIONS = [180, 226, 272, 318]; // one per AGENT_ORDER entry, each segment's start angle

function puckPosition(overall: number) {
  const angleDeg = 180 + Math.max(0, Math.min(100, overall)) * 1.8; // 180°→360° maps to 0-100
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: ARC_CENTER + ARC_R * Math.cos(angleRad),
    y: ARC_CENTER + ARC_R * Math.sin(angleRad),
  };
}

// One vertical bar per agent, bottom-anchored, height proportional to that agent's score -
// a glanceable "4 agents contributing" readout that sits beside the big number, separate
// from the dropdown below (which trades this at-a-glance view for the full per-agent card).
const BAR_MAX_HEIGHT = 32;
const BAR_MIN_HEIGHT = 6; // a sliver rather than nothing, so a low score still reads as a bar

function AgentBar({ result }: { result: KitchenScoreResult }) {
  const meta = AGENT_META[result.key];
  const height = result.score !== null ? Math.max(BAR_MIN_HEIGHT, (result.score / 100) * BAR_MAX_HEIGHT) : BAR_MIN_HEIGHT;
  const color = result.score !== null ? meta.segment : theme.border.strong;
  return (
    <div title={`${meta.name}: ${result.score !== null ? result.score : "not enough data yet"}`} style={{ width: 7, height: BAR_MAX_HEIGHT, display: "flex", alignItems: "flex-end", flexShrink: 0 }}>
      <div style={{ width: "100%", height, borderRadius: 2, background: color }} />
    </div>
  );
}

export default function KitchenScoreSection() {
  const { state, actions } = useThatFridgeCtx();
  const [expanded, setExpanded] = useState(false);
  const waste = computeWasteSaverScore(state);
  const balance = computeFoodBalanceScore(state);
  const organizer = computeOrganizerScore(state);
  const shopkeeper = computeShopkeeperScore(state);
  const results: Record<KitchenScoreResult["key"], KitchenScoreResult> = { waste, balance, organizer, shopkeeper };
  const orderedResults = AGENT_ORDER.map((key) => results[key]);
  const overall = getOverallScore(orderedResults);
  const scoredCount = orderedResults.filter((r) => r.score !== null).length;
  const fullVariety = hasFullFoodGroupVariety(state);

  // Nothing to show before the cron has ever run for this account - a "0 week streak" on a
  // brand new signup would read as a broken streak that was never actually started.
  const streak = state.scoreSnapshots.length > 0 ? computeStreak(state.scoreSnapshots) : null;

  useEffect(() => {
    if (fullVariety) actions.awardBadgeProgress("full_week_variety", 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullVariety]);

  const puck = overall !== null ? puckPosition(overall) : null;

  return (
    <div>
      <div style={{ fontFamily: theme.fontPixel, fontSize: 14, letterSpacing: 0.5, color: theme.text.muted, marginBottom: 9 }}>Your Kitchen This Week</div>

      <div
        style={{
          position: "relative",
          borderRadius: theme.radius.lg,
          padding: "22px 18px 16px",
          textAlign: "center",
          background: `radial-gradient(120% 55% at 50% -10%, rgba(245,166,35,0.06), transparent 60%), ${theme.bg.surface}`,
          border: `1px solid ${theme.border.hairline}`,
        }}
      >
        <span style={{ position: "absolute", top: -1, left: -1, width: 10, height: 10, borderTop: `1.5px solid ${theme.amber}`, borderLeft: `1.5px solid ${theme.amber}` }} />
        <span style={{ position: "absolute", top: -1, right: -1, width: 10, height: 10, borderTop: `1.5px solid ${theme.amber}`, borderRight: `1.5px solid ${theme.amber}` }} />
        <span style={{ position: "absolute", bottom: -1, left: -1, width: 10, height: 10, borderBottom: `1.5px solid ${theme.amber}`, borderLeft: `1.5px solid ${theme.amber}` }} />
        <span style={{ position: "absolute", bottom: -1, right: -1, width: 10, height: 10, borderBottom: `1.5px solid ${theme.amber}`, borderRight: `1.5px solid ${theme.amber}` }} />

        <div style={{ fontFamily: theme.fontMono, fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: theme.text.faint, marginBottom: 12 }}>
          {"// kitchen score"}
        </div>

        {overall !== null && puck ? (
          <>
            <div style={{ width: 176, height: 100, margin: "0 auto" }}>
              <svg width={176} height={100} viewBox="0 0 176 100">
                {AGENT_ORDER.map((key, i) => (
                  <circle
                    key={key}
                    cx={ARC_CENTER}
                    cy={ARC_CENTER}
                    r={ARC_R}
                    fill="none"
                    stroke={AGENT_META[key].segment}
                    strokeWidth={10}
                    strokeDasharray={ARC_DASH}
                    transform={`rotate(${ARC_ROTATIONS[i]} ${ARC_CENTER} ${ARC_CENTER})`}
                  />
                ))}
                <circle cx={puck.x} cy={puck.y} r={11} fill={theme.amber} opacity={0.22} />
                <rect x={puck.x - 5} y={puck.y - 5} width={10} height={10} fill={theme.bg.surface} stroke={theme.amber} strokeWidth={1.5} transform={`rotate(45 ${puck.x} ${puck.y})`} />
              </svg>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 18, marginTop: 2 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontFamily: theme.fontPixel, fontSize: 34, color: theme.text.primary, lineHeight: 1 }}>{overall}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: theme.text.faint }}>/ 100</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 5 }}>
                {orderedResults.map((result) => (
                  <AgentBar key={result.key} result={result} />
                ))}
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: theme.text.faint }}>
              {scoredCount === 4 ? "Guardian, Chef, Organizer & Shopkeeper, averaged" : `Averaged across ${scoredCount} of 4 agents so far`}
            </div>
          </>
        ) : (
          <div style={{ padding: "18px 8px", fontSize: 11.5, lineHeight: 1.5, color: theme.text.muted }}>
            Building your kitchen score — add a few items and start using ThatFridge to get going.
          </div>
        )}

        {streak !== null && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              marginTop: 16,
              padding: "5px 12px",
              borderRadius: 20,
              background: streak > 0 ? `${theme.amber}1a` : theme.bg.surface2,
              border: `1px solid ${streak > 0 ? theme.amber : theme.border.strong}`,
            }}
          >
            <Flame size={13} strokeWidth={2.4} color={streak > 0 ? theme.amber : theme.text.faint} />
            <span style={{ fontFamily: theme.fontMono, fontSize: 11.5, fontWeight: 700, color: streak > 0 ? theme.amber : theme.text.faint }}>
              {streak > 0 ? `${streak} week${streak === 1 ? "" : "s"} streak` : "No streak yet"}
            </span>
          </div>
        )}

        <div style={{ height: 1, background: theme.border.hairline, margin: "16px 0 12px" }} />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "8px 12px",
            borderRadius: theme.radius.sm,
            background: theme.bg.surface2,
            border: "none",
            cursor: "pointer",
            fontFamily: theme.fontMono,
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.5,
            textTransform: "uppercase",
            color: theme.text.muted,
          }}
        >
          <span>Agent scores</span>
          <ChevronDown size={13} strokeWidth={2.2} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.18s ease" }} />
        </button>
        {expanded && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {orderedResults.map((result) => (
              <AgentScoreCard key={result.key} result={result} state={state} />
            ))}
          </div>
        )}
      </div>

      {state.badgeUnlockToast && (
        <div
          style={{
            marginTop: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: theme.amber,
            color: "#0a0a0c",
            borderRadius: theme.radius.sm,
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
