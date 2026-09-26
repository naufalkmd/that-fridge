import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { getScoreSeries, kitchenScoreResults } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useKitchenScoreInput } from "@/lib/useKitchenScoreInput";
import { useTheme } from "@/lib/theme";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { KitchenScore } from "@/components/home/KitchenScore";
import { PageHeader } from "@/components/ui";

/**
 * The Crew score on its own screen: the same gauge as Home with every agent's card open, plus the
 * weekly trend of Waste Saver and Food Balance from the server's snapshots.
 */
export default function CrewScore() {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { scoreSnapshots } = useKitchenScore();
  const input = useKitchenScoreInput();

  const trends = useMemo(() => {
    const results = kitchenScoreResults(input);
    const now = (key: "waste" | "balance") => results.find((r) => r.key === key)?.score ?? null;
    return [
      { key: "waste" as const, label: "Guardian · Waste Saver", color: colors.agentGuardian, series: getScoreSeries(scoreSnapshots, "waste", now("waste")) },
      { key: "balance" as const, label: "Chef · Food Balance", color: colors.agentChef, series: getScoreSeries(scoreSnapshots, "balance", now("balance")) },
    ];
  }, [input, scoreSnapshots, colors]);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Crew score" subtitle="How your kitchen is doing, agent by agent" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 16 }}>
        <FridgeScopePicker />
        <KitchenScore input={input} snapshots={scoreSnapshots} streak={user?.streak ?? 0} defaultExpanded />

        <View style={{ padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, gap: 14 }}>
          <Text style={{ fontSize: 13.5, fontWeight: "800", color: colors.ink }}>Week by week</Text>
          {trends.map((t) =>
            t.series.length < 2 ? (
              <View key={t.key}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted }}>{t.label}</Text>
                <Text style={{ fontSize: 11.5, color: colors.faint, marginTop: 3 }}>
                  The trend shows up after your first weekly snapshot.
                </Text>
              </View>
            ) : (
              <View key={t.key}>
                <Text style={{ fontSize: 12, fontWeight: "700", color: colors.muted, marginBottom: 8 }}>{t.label}</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 70 }}>
                  {t.series.map((p, i) => (
                    <View key={`${p.weekOf}-${i}`} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <Text style={{ fontSize: 10, color: colors.faint, marginBottom: 2 }}>{p.score}</Text>
                      <View
                        style={{
                          width: "100%", height: `${Math.max(4, p.score * 0.6)}%`, borderRadius: 4,
                          backgroundColor: t.color, opacity: p.weekOf === "now" ? 1 : 0.55,
                        }}
                      />
                    </View>
                  ))}
                </View>
                <Text style={{ fontSize: 10.5, color: colors.faint, marginTop: 4 }}>Oldest to now</Text>
              </View>
            ),
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
