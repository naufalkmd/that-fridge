import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { PurchasesPackage } from "react-native-purchases";

import { usePro } from "@/lib/pro";

const BENEFITS = [
  "Unlimited AI chat with the crew",
  "Unlimited “what to eat” suggestions",
  "Receipt & photo scanning for bulk add",
  "Multiple and shared fridges",
  "Advanced notification tuning",
];

const TERMS_URL = "https://thatfridge.app/terms";
const PRIVACY_URL = "https://thatfridge.app/privacy";

function packageLabel(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case "ANNUAL":
      return "Yearly";
    case "MONTHLY":
      return "Monthly";
    default:
      return pkg.product.title || pkg.identifier;
  }
}

export default function Paywall() {
  const router = useRouter();
  const { available, ready, isPro, packages, presentPaywall, purchase, restore, openCustomerCenter } =
    usePro();
  const [mode, setMode] = useState<"deciding" | "custom">("deciding");
  const [busy, setBusy] = useState(false);
  const attempted = useRef(false);

  // Prefer the RevenueCat hosted paywall. Fall back to the custom UI below only when
  // no paywall is configured in the dashboard yet.
  useEffect(() => {
    if (attempted.current || !ready) return;
    attempted.current = true;
    if (isPro || !available) {
      setMode("custom");
      return;
    }
    presentPaywall().then((result) => {
      if (result === "entitled" || result === "dismissed") router.back();
      else setMode("custom");
    });
  }, [ready, isPro, available, presentPaywall, router]);

  async function buy(pkg: PurchasesPackage) {
    setBusy(true);
    try {
      await purchase(pkg);
      router.back();
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean; message?: string };
      if (!err.userCancelled) Alert.alert("Purchase failed", err.message ?? "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function doRestore() {
    setBusy(true);
    try {
      await restore();
      Alert.alert("Restored", "Your purchases have been restored.");
    } catch {
      Alert.alert("Nothing to restore", "No previous purchase was found for this account.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "deciding") {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#4de1c1" />
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["bottom"]}>
      <ScrollView contentContainerClassName="p-6 gap-6">
        <View className="gap-1">
          <Text className="text-[13px] font-bold uppercase tracking-widest text-accent">
            ThatFridge Pro
          </Text>
          <Text className="text-2xl font-extrabold text-ink">Get more out of your fridge</Text>
        </View>

        <View className="gap-2.5">
          {BENEFITS.map((b) => (
            <View key={b} className="flex-row items-start gap-2.5">
              <Text className="text-good">✓</Text>
              <Text className="flex-1 text-[14px] text-ink">{b}</Text>
            </View>
          ))}
        </View>

        {isPro ? (
          <View className="gap-3">
            <View className="rounded-2xl border border-good bg-surface p-4">
              <Text className="font-semibold text-good">You’re on Pro. Thanks!</Text>
            </View>
            {available && (
              <Pressable
                onPress={openCustomerCenter}
                className="items-center rounded-xl border border-hairline py-3 active:opacity-70"
              >
                <Text className="font-semibold text-ink">Manage subscription</Text>
              </Pressable>
            )}
          </View>
        ) : !available ? (
          <View className="rounded-2xl border border-hairline bg-surface p-4">
            <Text className="text-[13px] text-muted">
              In-app purchases need a development build with the RevenueCat key configured — not
              available in Expo Go.
            </Text>
          </View>
        ) : packages.length === 0 ? (
          <View className="rounded-2xl border border-hairline bg-surface p-4">
            <Text className="text-[13px] text-muted">
              No offering is configured in RevenueCat yet. Add the `monthly` and `yearly`
              packages to the current offering in the dashboard.
            </Text>
          </View>
        ) : (
          <View className="gap-3">
            {packages.map((pkg) => (
              <Pressable
                key={pkg.identifier}
                onPress={() => buy(pkg)}
                disabled={busy}
                className="flex-row items-center justify-between rounded-2xl border border-accent bg-surface p-4 active:opacity-80"
              >
                <View>
                  <Text className="text-[15px] font-bold text-ink">{packageLabel(pkg)}</Text>
                  <Text className="mt-0.5 text-[12px] text-muted">
                    {pkg.product.introPrice ? "7-day free trial, then " : ""}
                    {pkg.product.priceString}
                  </Text>
                </View>
                {busy ? (
                  <ActivityIndicator color="#4de1c1" />
                ) : (
                  <Text className="text-[13px] font-bold text-accent">Choose</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {available && (
          <Pressable onPress={doRestore} disabled={busy} className="items-center py-1">
            <Text className="text-[13px] font-semibold text-accent">Restore purchases</Text>
          </Pressable>
        )}

        <View className="flex-row justify-center gap-4">
          <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
            <Text className="text-[11px] text-faint">Terms</Text>
          </Pressable>
          <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
            <Text className="text-[11px] text-faint">Privacy</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.back()} className="items-center py-1">
          <Text className="text-[13px] text-muted">Not now</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
