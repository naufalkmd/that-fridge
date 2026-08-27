import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError } from "@thatfridge/core";
import { API_BASE_URL, api } from "@/lib/api";

type Check =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok"; detail: string }
  | { state: "fail"; detail: string };

export default function Index() {
  const [check, setCheck] = useState<Check>({ state: "idle" });

  async function pingApi() {
    setCheck({ state: "checking" });
    try {
      // No health route on the API — an empty login should come back 422 (reachable).
      await api.post("/login", {});
      setCheck({ state: "ok", detail: "Unexpected 2xx from empty /login" });
    } catch (err) {
      if (err instanceof ApiError) {
        setCheck({
          state: err.status === 422 ? "ok" : "fail",
          detail: `HTTP ${err.status} — ${err.message}`,
        });
      } else {
        setCheck({
          state: "fail",
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["bottom"]}>
      <ScrollView contentContainerClassName="p-6 gap-6">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-ink">ThatFridge</Text>
          <Text className="text-muted">Expo scaffold · iOS-first</Text>
        </View>

        <View className="rounded-xl border border-hairline bg-surface p-4 gap-2">
          <Text className="text-faint text-xs uppercase tracking-widest">API base URL</Text>
          <Text className="text-ink" selectable>
            {API_BASE_URL}
          </Text>
        </View>

        <Pressable
          onPress={pingApi}
          className="rounded-xl bg-accent px-4 py-3 active:opacity-80"
        >
          <Text className="text-center font-semibold text-canvas">
            {check.state === "checking" ? "Checking…" : "Check API connection"}
          </Text>
        </Pressable>

        {check.state !== "idle" && check.state !== "checking" && (
          <View
            className={`rounded-xl border p-4 ${
              check.state === "ok"
                ? "border-good bg-surface"
                : "border-bad bg-surface"
            }`}
          >
            <Text
              className={check.state === "ok" ? "text-good font-semibold" : "text-bad font-semibold"}
            >
              {check.state === "ok" ? "Reachable" : "Not reachable"}
            </Text>
            <Text className="text-muted mt-1">{check.detail}</Text>
          </View>
        )}

        <Text className="text-faint text-xs leading-5">
          Next: port AuthScreen from apps/web. See APP_STORE_LAUNCH_PLAN.md §6 for screen order.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}
