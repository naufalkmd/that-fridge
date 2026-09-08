import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import { describeError } from "@thatfridge/core";
import { usePro } from "@/lib/pro";
import { useCredits } from "@/lib/credits";
import { SheetHeader } from "@/components/sheet";

const AMBER = "#26c6da";
const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";
const BAD = "#ff5567";

const REASON_LABEL: Record<string, string> = {
  chat: "Quick Chat",
  chat_tools: "Quick Chat (tools)",
  chat_refund: "Chat refund",
  icon: "Icon generation",
  icon_refund: "Icon refund",
  expiry_scan: "Expiry scan",
  receipt_scan: "Receipt scan",
  photo_scan: "Fridge photo scan",
  autofill: "Auto-fill",
  monthly_free: "Monthly free credits",
  pro_grant: "Pro monthly credits",
  pack_purchase: "Credit pack",
};

export default function Credits() {
  const router = useRouter();
  const { available, isPro } = usePro();
  const { balance, ledger, refresh } = useCredits();
  const [packs, setPacks] = useState<PurchasesPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    void refresh();
    (async () => {
      try {
        if (available) {
          const offerings = await Purchases.getOfferings();
          setPacks(offerings.all["credits"]?.availablePackages ?? []);
        }
      } catch {
        // no packs offering configured yet — the screen shows the Pro fallback
      } finally {
        setLoading(false);
      }
    })();
  }, [available, refresh]);

  const buy = useCallback(
    async (pkg: PurchasesPackage) => {
      setBuying(pkg.identifier);
      try {
        await Purchases.purchasePackage(pkg);
        // The credits land server-side via the RevenueCat webhook; give it a moment.
        for (let i = 0; i < 4; i++) {
          await new Promise((r) => setTimeout(r, 1200));
          await refresh();
        }
        Alert.alert("Credits added", "Your balance has been topped up.");
      } catch (e: unknown) {
        const err = e as { userCancelled?: boolean };
        if (!err?.userCancelled) {
          Alert.alert("Purchase failed", describeError(e, "Please try again."));
        }
      } finally {
        setBuying(null);
      }
    },
    [refresh],
  );

  return (
    <View className="flex-1 bg-canvas">
      <SheetHeader title="AI credits" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 40, gap: 18 }}>
        <View style={{ alignItems: "center", paddingVertical: 18 }}>
          <Text style={{ fontSize: 44, fontWeight: "800", color: balance !== null && balance < 3 ? BAD : INK }}>
            {balance ?? "—"}
          </Text>
          <Text style={{ fontSize: 12.5, color: MUTED }}>credits left</Text>
        </View>

        <Text style={{ fontSize: 11.5, lineHeight: 16, color: FAINT }}>
          Every AI action spends credits — chat with the crew (1, or 3 when it acts on your
          fridge), generate an icon (3), scan a receipt or expiry date (2–3). {isPro ? "Pro" : "The free plan"} tops
          up {isPro ? "400" : "50"} credits each month.
        </Text>

        {loading ? (
          <ActivityIndicator color={AMBER} style={{ marginTop: 12 }} />
        ) : packs.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Label>TOP UP</Label>
            {packs.map((p) => (
              <Pressable
                key={p.identifier}
                onPress={() => !buying && buy(p)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                  backgroundColor: SURFACE,
                  borderRadius: 10,
                  padding: 16,
                  opacity: buying && buying !== p.identifier ? 0.4 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: INK }}>
                  {p.product.title}
                </Text>
                {buying === p.identifier ? (
                  <ActivityIndicator color={AMBER} />
                ) : (
                  <Text style={{ fontSize: 14, fontWeight: "800", color: AMBER }}>
                    {p.product.priceString}
                  </Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          !isPro && (
            <Pressable
              onPress={() => router.push("/paywall")}
              style={{
                borderWidth: 1,
                borderColor: `${AMBER}66`,
                backgroundColor: `${AMBER}12`,
                borderRadius: 10,
                padding: 16,
                gap: 4,
              }}
            >
              <Text style={{ fontSize: 13.5, fontWeight: "800", color: INK }}>Go Pro</Text>
              <Text style={{ fontSize: 11.5, lineHeight: 16, color: MUTED }}>
                400 AI credits every month, plus shared fridges — from $2.99/mo with a 7-day
                free trial.
              </Text>
            </Pressable>
          )
        )}

        {ledger.length > 0 && (
          <View>
            <Label>RECENT</Label>
            <View style={{ borderRadius: 10, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
              {ledger.slice(0, 15).map((row, i) => (
                <View
                  key={i}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 12,
                    borderBottomWidth: i === Math.min(ledger.length, 15) - 1 ? 0 : 1,
                    borderBottomColor: HAIRLINE,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialCommunityIcons
                      name={row.delta > 0 ? "arrow-up" : "arrow-down"}
                      size={13}
                      color={row.delta > 0 ? GOOD : FAINT}
                    />
                    <Text style={{ fontSize: 12.5, color: INK }}>
                      {REASON_LABEL[row.reason] ?? row.reason}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: row.delta > 0 ? GOOD : MUTED }}>
                    {row.delta > 0 ? "+" : ""}
                    {row.delta}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Label({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>
      {children}
    </Text>
  );
}
