import { useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import RevenueCatUI from "react-native-purchases-ui";
import type { PurchasesPackage } from "react-native-purchases";

import { usePro } from "@/lib/pro";
import { SheetHeader } from "@/components/sheet";

const BENEFITS = [
  "Unlimited AI chat with the crew",
  "Unlimited “what to eat” suggestions",
  "Receipt & photo scanning for bulk add",
  "Multiple and shared fridges",
  "Advanced notification tuning",
];

const TERMS_URL = "https://thatfridge.com/terms/";
const PRIVACY_URL = "https://thatfridge.com/privacy/";

function packageLabel(pkg: PurchasesPackage): string {
  if (pkg.packageType === "ANNUAL") return "Yearly";
  if (pkg.packageType === "MONTHLY") return "Monthly";
  return pkg.product.title || pkg.identifier;
}

export default function Paywall() {
  const router = useRouter();
  const { available, ready, isPro, packages, purchase, restore, refresh, openCustomerCenter } =
    usePro();
  const [busy, setBusy] = useState(false);

  const close = () => router.back();

  // Preferred path: once RevenueCat has an offering with packages, render its native
  // Paywall component (docs-recommended embedded pattern for a dedicated screen — uses the
  // paywall designed in the dashboard, or a default template). The custom UI below is the
  // fallback for pre-dashboard-config and Expo Go.
  if (available && ready && !isPro && packages.length > 0) {
    return (
      <RevenueCatUI.Paywall
        options={{ displayCloseButton: true }}
        onPurchaseCompleted={async () => {
          await refresh();
          close();
        }}
        onRestoreCompleted={async () => {
          await refresh();
          close();
        }}
        onDismiss={close}
      />
    );
  }

  async function buy(pkg: PurchasesPackage) {
    setBusy(true);
    try {
      await purchase(pkg);
      close();
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

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["bottom"]}>
      <SheetHeader title="ThatFridge Pro" />
      <ScrollView contentContainerClassName="px-6 pb-8 pt-2 gap-6">
        <Text className="text-2xl font-extrabold text-ink">Get more out of your fridge</Text>

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
        ) : !ready ? (
          <ActivityIndicator color="#26c6da" />
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
                  <ActivityIndicator color="#26c6da" />
                ) : (
                  <Text className="text-[13px] font-bold text-accent">Choose</Text>
                )}
              </Pressable>
            ))}
          </View>
        )}

        {available && !isPro && (
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

        <Pressable onPress={close} className="items-center py-1">
          <Text className="text-[13px] text-muted">Not now</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
