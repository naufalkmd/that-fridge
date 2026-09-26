import { useMemo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { useKitchenScore } from "@/lib/kitchenScore";
import { SWEEP_BATCH, SWEEP_COST_PER_ITEM } from "@/lib/organizerSweep";
import { locationLabel, useOrganizerSweep } from "@/lib/useOrganizerSweep";
import { PageHeader } from "@/components/ui";
import { FoodIcon } from "@/components/food-icon";
import { useTheme } from "@/lib/theme";

const ORGANIZER_GIF = require("../../assets/images/thatfridge/organizer.gif");

const locLabel = locationLabel;

export default function Organizer() {
  const { items } = useInventory();
  const { scope } = useScope();
  const { organizerTally } = useKitchenScore();
  const {
    accent: AMBER,
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    agentOrganizer: BLUE,
    good: GOOD,
    onAccent: CANVAS,
  } = useTheme().colors;

  const { status, moves, checked, batchSize, start, apply, dismiss } = useOrganizerSweep();
  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  const sweep = () => start(scoped);

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Organizer" subtitle="Let the crew check where everything's stored" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 14,
            backgroundColor: SURFACE,
            borderWidth: 1,
            borderColor: HAIRLINE,
            borderRadius: 10,
            padding: 16,
            marginBottom: 18,
          }}
        >
          <Image source={ORGANIZER_GIF} style={{ width: 48, height: 48 }} contentFit="contain" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK, marginBottom: 2 }}>Tidiness</Text>
            <Text style={{ fontSize: 11.5, color: MUTED }}>
              {organizerTally && organizerTally.itemsCheckedTotal > 0
                ? `${organizerTally.itemsCorrectTotal}/${organizerTally.itemsCheckedTotal} items checked were in the right place`
                : "Run a sweep to start building your Tidiness score"}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={status === "checking" ? undefined : sweep}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            paddingVertical: 13,
            borderRadius: 8,
            backgroundColor: status === "checking" ? SURFACE2 : AMBER,
            marginBottom: 22,
          }}
        >
          {status === "checking" ? (
            <>
              <ActivityIndicator color={FAINT} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: FAINT }}>Checking {batchSize} items…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="broom" size={15} color={CANVAS} />
              <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: CANVAS }}>
                {status === "done" ? "Check again" : "Check my fridge"}
              </Text>
            </>
          )}
        </Pressable>
        <Text style={{ fontSize: 11.5, color: FAINT, textAlign: "center", marginTop: -14, marginBottom: 20 }}>
          Checks up to {SWEEP_BATCH} items at a time · {SWEEP_COST_PER_ITEM} credit each
        </Text>

        {status === "done" && (
          <>
            {moves.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 8 }}>
                <MaterialCommunityIcons name="check-circle-outline" size={28} color={GOOD} />
                <Text style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>
                  {checked === 0
                    ? "Nothing could be checked this time, so nothing was counted."
                    : `All ${checked} item${checked === 1 ? "" : "s"} checked look well placed. Nice.`}
                </Text>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 10 }}>
                  {moves.length} SUGGESTED MOVE{moves.length === 1 ? "" : "S"}
                </Text>
                <View style={{ gap: 8 }}>
                  {moves.map((m) => (
                    <View
                      key={m.id}
                      style={{
                        backgroundColor: SURFACE2,
                        borderRadius: 8,
                        borderLeftWidth: 3,
                        borderLeftColor: BLUE,
                        padding: 12,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <FoodIcon icon={m.icon} name={m.name} size={28} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>{m.name}</Text>
                          <Text style={{ fontSize: 11.5, color: MUTED }}>
                            {locLabel(m.from)} → <Text style={{ color: BLUE, fontWeight: "700" }}>{locLabel(m.to)}</Text>
                          </Text>
                        </View>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <Pressable
                          onPress={() => apply(m)}
                          style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 6, backgroundColor: BLUE }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Move it</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => dismiss(m.id)}
                          style={{ paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 6, borderWidth: 1, borderColor: HAIRLINE }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: "700", color: MUTED }}>Keep</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
