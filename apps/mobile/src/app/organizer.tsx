import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { STORAGE_LOCATIONS, type StorageLocation } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useToast } from "@/lib/toast";
import { PageHeader } from "@/components/ui";
import { FoodIcon } from "@/components/food-icon";

const ORGANIZER_GIF = require("../../assets/images/thatfridge/organizer.gif");

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const BLUE = "#3d6fe0";
const GOOD = "#39e07f";

type Move = { id: string; name: string; icon: string; from: StorageLocation; to: StorageLocation };

const locLabel = (k: StorageLocation) => STORAGE_LOCATIONS.find((l) => l.key === k)?.label ?? k;

export default function Organizer() {
  const { items, patchItem } = useInventory();
  const { scope } = useScope();
  const { organizerTally, refresh: refreshScore } = useKitchenScore();
  const toast = useToast();

  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [moves, setMoves] = useState<Move[]>([]);
  const [checked, setChecked] = useState(0);

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);

  async function sweep() {
    if (scoped.length === 0) return;
    setStatus("checking");
    setMoves([]);
    const results = await Promise.all(
      scoped.map(async (item) => {
        try {
          const s = await api.suggestItemDetails(item.name, item.icon);
          const from = item.location ?? "fridge";
          if (s.location && s.location !== from) {
            return { id: item.id, name: item.name, icon: item.icon, from, to: s.location };
          }
        } catch {
          /* skip this one */
        }
        return null;
      }),
    );
    const found = results.filter((m): m is Move => m !== null);
    setMoves(found);
    setChecked(scoped.length);
    setStatus("done");
    api
      .incrementOrganizerTally({ checked: scoped.length, correct: scoped.length - found.length })
      .then(() => refreshScore())
      .catch(() => {});
  }

  async function apply(m: Move) {
    setMoves((p) => p.filter((x) => x.id !== m.id));
    try {
      await patchItem(m.id, { location: m.to });
      toast.show(`Moved ${m.name} to ${locLabel(m.to)}`, {
        actionLabel: "Undo",
        onAction: () => patchItem(m.id, { location: m.from }),
      });
    } catch {
      setMoves((p) => [m, ...p]);
    }
  }

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
              <Text style={{ fontSize: 13, fontWeight: "700", color: FAINT }}>Checking {scoped.length} items…</Text>
            </>
          ) : (
            <>
              <MaterialCommunityIcons name="broom" size={15} color="#0a0a0c" />
              <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
                {status === "done" ? "Check again" : "Check my fridge"}
              </Text>
            </>
          )}
        </Pressable>

        {status === "done" && (
          <>
            {moves.length === 0 ? (
              <View style={{ alignItems: "center", paddingVertical: 30, gap: 8 }}>
                <MaterialCommunityIcons name="check-circle-outline" size={28} color={GOOD} />
                <Text style={{ fontSize: 13, color: MUTED, textAlign: "center" }}>
                  All {checked} item{checked === 1 ? "" : "s"} look well placed. Nice.
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
                          onPress={() => setMoves((p) => p.filter((x) => x.id !== m.id))}
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
