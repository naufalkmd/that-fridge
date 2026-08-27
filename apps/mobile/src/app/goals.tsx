import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  GOAL_METRIC_META,
  computeGoalProgress,
  describeError,
  type GoalMetricType,
  type GoalPeriod,
  type UserGoal,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { useKitchenScore } from "@/lib/kitchenScore";
import { PageHeader } from "@/components/ui";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#5b8dee";
const GOOD = "#39e07f";
const BAD = "#ff5567";

const METRICS: GoalMetricType[] = ["waste_rate", "items_rescued", "freshness_at_use"];
const PERIODS: { key: GoalPeriod; label: string }[] = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
];

export default function Goals() {
  const { items } = useInventory();
  const { scope } = useScope();
  const { usageHistory } = useKitchenScore();

  const [goal, setGoal] = useState<UserGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getUserGoal()
      .then((g) => {
        setGoal(g);
        setTarget(String(g.targetValue));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  const progress = useMemo(
    () => (goal ? computeGoalProgress({ goal, items: scoped, usageHistory }) : null),
    [goal, scoped, usageHistory],
  );

  async function patch(data: Partial<UserGoal>) {
    if (!goal) return;
    setSaving(true);
    const prev = goal;
    setGoal({ ...goal, ...data });
    try {
      setGoal(await api.updateUserGoal(data));
    } catch (e) {
      setGoal(prev);
      Alert.alert("Error", describeError(e, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  const parsed = parseInt(target, 10);
  const targetValid =
    !isNaN(parsed) && parsed >= 1 && (goal?.metricType === "items_rescued" || parsed <= 100);
  const targetDirty = goal ? target !== String(goal.targetValue) : false;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Goal" subtitle="Give your kitchen score something to aim for" />
      {loading || !goal ? (
        <ActivityIndicator color={AMBER} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
          {/* progress */}
          <View style={card}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>
                {GOAL_METRIC_META[goal.metricType].label}
              </Text>
              {goal.isActive && progress?.currentValue != null && (
                <Text style={{ fontSize: 16, fontWeight: "800", color: progress.onTrack ? GOOD : BAD }}>
                  {progress.currentValue}
                  {GOAL_METRIC_META[goal.metricType].unit === "%" ? "%" : ""}{" "}
                  <Text style={{ fontSize: 11, fontWeight: "600", color: FAINT }}>
                    / {goal.targetValue}
                    {GOAL_METRIC_META[goal.metricType].unit === "%" ? "%" : ""}
                  </Text>
                </Text>
              )}
            </View>
            <Text style={{ fontSize: 12, lineHeight: 17, color: MUTED }}>
              {!goal.isActive
                ? "Goal tracking is off — turn it back on below whenever you're ready."
                : progress?.explanation}
            </Text>
            {goal.isActive && progress?.limitationNote && (
              <Text style={{ fontSize: 10.5, lineHeight: 15, color: FAINT, marginTop: 6 }}>
                {progress.limitationNote}
              </Text>
            )}
          </View>

          {/* active toggle */}
          <View style={[card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK, marginBottom: 2 }}>Track this goal</Text>
              <Text style={{ fontSize: 11.5, color: FAINT }}>Turn off anytime — your metric and target are kept</Text>
            </View>
            <Switch
              value={goal.isActive}
              onValueChange={(v) => patch({ isActive: v })}
              trackColor={{ true: AMBER, false: HAIRLINE }}
              thumbColor={INK}
            />
          </View>

          <Label>METRIC</Label>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden", marginBottom: 8 }}>
            {METRICS.map((key, i) => {
              const m = GOAL_METRIC_META[key];
              const active = goal.metricType === key;
              return (
                <Pressable
                  key={key}
                  onPress={() => !active && patch({ metricType: key })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    padding: 13,
                    borderBottomWidth: i < METRICS.length - 1 ? 1 : 0,
                    borderBottomColor: HAIRLINE,
                    backgroundColor: active ? SURFACE2 : "transparent",
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: "700", color: active ? BLUE : INK, marginBottom: 2 }}>
                      {m.label}
                    </Text>
                    <Text style={{ fontSize: 11.5, lineHeight: 16, color: FAINT }}>{m.description}</Text>
                  </View>
                  {active && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: BLUE }} />}
                </Pressable>
              );
            })}
          </View>

          <Label>TARGET</Label>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
            <TextInput
              value={target}
              onChangeText={setTarget}
              keyboardType="number-pad"
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: HAIRLINE,
                backgroundColor: SURFACE2,
                borderRadius: 6,
                paddingHorizontal: 14,
                paddingVertical: 12,
                fontSize: 13.5,
                color: INK,
              }}
            />
            <Pressable
              onPress={() => targetValid && targetDirty && patch({ targetValue: parsed })}
              style={{
                justifyContent: "center",
                paddingHorizontal: 18,
                borderRadius: 6,
                backgroundColor: targetValid && targetDirty ? AMBER : SURFACE2,
              }}
            >
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: targetValid && targetDirty ? "#0a0a0c" : FAINT }}>
                Save
              </Text>
            </Pressable>
          </View>
          {!targetValid && (
            <Text style={{ fontSize: 11, color: BAD, marginBottom: 8 }}>
              {goal.metricType === "items_rescued"
                ? "Enter a number of at least 1."
                : "Enter a number between 1 and 100."}
            </Text>
          )}

          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {PERIODS.map((p) => {
              const active = goal.period === p.key;
              return (
                <Pressable
                  key={p.key}
                  onPress={() => !active && patch({ period: p.key })}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 16,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: active ? "rgba(255,255,255,0.18)" : HAIRLINE,
                    backgroundColor: active ? SURFACE2 : SURFACE,
                  }}
                >
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? INK : MUTED }}>
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {saving && <ActivityIndicator color={AMBER} style={{ marginTop: 16 }} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const card = {
  backgroundColor: SURFACE,
  borderWidth: 1,
  borderColor: HAIRLINE,
  borderRadius: 8,
  padding: 14,
  marginBottom: 20,
} as const;

function Label({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
      {children}
    </Text>
  );
}
