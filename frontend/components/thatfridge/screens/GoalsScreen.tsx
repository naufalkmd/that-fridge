"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, X } from "lucide-react";
import { computeGoalProgress, GOAL_METRIC_META } from "@/lib/thatfridge/goals";
import { useThatFridgeCtx } from "../ThatFridgeContext";
import Switch from "../Switch";
import type { GoalMetricType, GoalPeriod } from "@/lib/thatfridge/types";

const METRIC_ORDER: GoalMetricType[] = ["waste_rate", "items_rescued", "freshness_at_use"];
const PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

const fieldStyle: React.CSSProperties = {
  width: "100%",
  border: "none",
  outline: "none",
  background: "#eaf6ff",
  borderRadius: 14,
  padding: "12px 14px",
  fontSize: 13.5,
  color: "#16325c",
  boxSizing: "border-box",
};

export default function GoalsScreen() {
  const { state, actions } = useThatFridgeCtx();
  const goal = state.userGoal;
  const progress = computeGoalProgress(state);
  const [targetInput, setTargetInput] = useState(String(goal?.targetValue ?? ""));

  // Keep the local draft in sync whenever the underlying goal changes from elsewhere (e.g.
  // switching metric resets the field to that goal's own current target), without fighting the
  // user's own keystrokes while they're mid-edit.
  useEffect(() => {
    setTargetInput(String(goal?.targetValue ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.metricType]);

  if (!goal) return null;

  const meta = GOAL_METRIC_META[goal.metricType];
  const targetDirty = targetInput !== String(goal.targetValue);
  const parsedTarget = parseInt(targetInput, 10);
  const targetValid = !isNaN(parsedTarget) && parsedTarget >= 1 && (goal.metricType === "items_rescued" || parsedTarget <= 100);

  const saveTarget = () => {
    if (!targetValid || !targetDirty) return;
    actions.updateUserGoalSettings({ targetValue: parsedTarget });
  };

  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#eaf6ff,#cfe8fb 55%,#eaf6ff)", display: "flex", flexDirection: "column" }}>
      <div className="thatfridge-wide-content" style={{ flex: "none", padding: "28px 20px 14px", display: "flex", alignItems: "center", gap: 12, boxSizing: "border-box" }}>
        <div
          onClick={actions.goHome}
          style={{ width: 32, height: 32, borderRadius: 16, background: "#fff", border: "1px solid rgba(22,50,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flex: "none" }}
        >
          <X className="thatfridge-hide-desktop" size={15} color="rgba(22,50,92,0.5)" strokeWidth={2} />
          <ChevronLeft className="thatfridge-show-desktop" size={17} color="rgba(22,50,92,0.5)" strokeWidth={2.2} />
        </div>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Goal</div>
          <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)" }}>Give your kitchen score something concrete to aim for</div>
        </div>
      </div>

      <div className="thatfridge-wide-content" style={{ flex: 1, overflowY: "auto", padding: "6px 20px 100px", boxSizing: "border-box" }}>
        {/* current progress */}
        <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: "14px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{meta.label}</div>
            {goal.isActive && progress && progress.currentValue !== null && (
              <div style={{ fontSize: 16, fontWeight: 800, color: progress.onTrack ? "#3f8f5c" : "#c1452e" }}>
                {progress.currentValue}
                {meta.unit === "%" ? "%" : ""} <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(22,50,92,0.4)" }}>/ {goal.targetValue}{meta.unit === "%" ? "%" : ""}</span>
              </div>
            )}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.4, color: "rgba(22,50,92,0.55)" }}>
            {!goal.isActive ? "Goal tracking is off — turn it back on below whenever you're ready." : progress?.explanation}
          </div>
          {goal.isActive && progress?.limitationNote && (
            <div style={{ fontSize: 10.5, lineHeight: 1.4, color: "rgba(22,50,92,0.4)", marginTop: 6 }}>{progress.limitationNote}</div>
          )}
        </div>

        {/* track toggle */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, padding: "13px 14px", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2 }}>Track this goal</div>
            <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)" }}>Turn off anytime — your metric and target are kept</div>
          </div>
          <Switch on={goal.isActive} onClick={() => actions.updateUserGoalSettings({ isActive: !goal.isActive })} />
        </div>

        {/* metric picker */}
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>METRIC</div>
        <div style={{ background: "#fff", boxShadow: "0 6px 16px rgba(22,50,92,0.06)", borderRadius: 16, overflow: "hidden", marginBottom: 6 }}>
          {METRIC_ORDER.map((key, i) => {
            const m = GOAL_METRIC_META[key];
            const active = goal.metricType === key;
            return (
              <div
                key={key}
                onClick={() => !active && actions.updateUserGoalSettings({ metricType: key })}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "13px 14px",
                  borderBottom: i < METRIC_ORDER.length - 1 ? "1px solid rgba(22,50,92,0.06)" : undefined,
                  cursor: active ? "default" : "pointer",
                  background: active ? "#eaf6ff" : "transparent",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 2, color: active ? "#2f6fb0" : "#16325c" }}>{m.label}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.5)", lineHeight: 1.35 }}>{m.description}</div>
                </div>
                {active && <div style={{ width: 9, height: 9, borderRadius: 5, background: "#2f6fb0", flex: "none" }} />}
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10.5, color: "rgba(22,50,92,0.4)", lineHeight: 1.4, marginBottom: 22 }}>
          &ldquo;Money saved&rdquo; isn&apos;t offered yet — ThatFridge doesn&apos;t track prices for your items, so there&apos;s no real number to show.
        </div>

        {/* target + period */}
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.3, color: "rgba(22,50,92,0.45)", marginBottom: 8 }}>TARGET</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
          <input
            type="number"
            min={1}
            max={goal.metricType === "items_rescued" ? undefined : 100}
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            onBlur={saveTarget}
            onKeyDown={(e) => e.key === "Enter" && saveTarget()}
            style={{ ...fieldStyle, flex: 1 }}
          />
          <div
            onClick={saveTarget}
            style={{
              flex: "none",
              display: "flex",
              alignItems: "center",
              padding: "0 18px",
              borderRadius: 14,
              background: targetDirty && targetValid ? "#16325c" : "rgba(22,50,92,0.15)",
              color: "#fff",
              fontSize: 12.5,
              fontWeight: 700,
              cursor: targetDirty && targetValid ? "pointer" : "default",
            }}
          >
            Save
          </div>
        </div>
        {!targetValid && (
          <div style={{ fontSize: 11, color: "#c1452e", marginBottom: 8 }}>
            {goal.metricType === "items_rescued" ? "Enter a number of at least 1." : "Enter a number between 1 and 100."}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 22 }}>
          {PERIODS.map((p) => {
            const active = goal.period === p.key;
            return (
              <div
                key={p.key}
                onClick={() => !active && actions.updateUserGoalSettings({ period: p.key })}
                style={{
                  flex: "none",
                  padding: "8px 16px",
                  borderRadius: 14,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: active ? "default" : "pointer",
                  background: active ? "#16325c" : "#fff",
                  color: active ? "#fff" : "#16325c",
                  boxShadow: "0 4px 10px rgba(22,50,92,0.08)",
                }}
              >
                {p.label}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 11.5, color: "rgba(22,50,92,0.4)", textAlign: "center", padding: "8px 12px", lineHeight: 1.4 }}>
          You can change your metric or target anytime — nothing here is locked in.
        </div>
      </div>
    </div>
  );
}
