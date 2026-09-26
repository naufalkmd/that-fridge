import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";
import { useTheme, type ThemeMode } from "@/lib/theme";
import { useInventory } from "@/lib/inventory";
import { useOnboarding } from "@/lib/onboarding";
import { useScope } from "@/lib/scope";
import { usePro } from "@/lib/pro";
import { useCredits } from "@/lib/credits";
import { api } from "@/lib/api";
import { openStoreReviewPage } from "@/lib/rate";
import { LinkRow } from "@/components/link-row";
import { Eyebrow, SectionHeader } from "@/components/ui";

export default function Profile() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const { mode, setMode, colors } = useTheme();
  const { isPro, available, restore, openCustomerCenter } = usePro();
  const { balance: credits } = useCredits();
  const { fridges } = useInventory();
  const { replayOnboarding } = useOnboarding();
  const { scope, setScope } = useScope();
  const [working, setWorking] = useState(false);
  async function replayIntro() {
    // Bring back the Home spotlight / tour / checklist, then walk the full pre-sign-in
    // intro in preview (non-destructive — no auth, no draft, no re-signup).
    await replayOnboarding();
    router.push("/welcome?preview=1");
  }

  async function doRestore() {
    setWorking(true);
    try {
      await restore();
    } catch {
      // restore surfaces its own result; ignore
    } finally {
      setWorking(false);
    }
  }

  async function doSignOut() {
    setWorking(true);
    try {
      await signOut();
      router.replace("/sign-in");
    } catch (e) {
      setWorking(false);
      Alert.alert("Couldn't sign out", describeError(e, "Please try again."));
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This permanently removes your account, your fridges, items, shopping list, recipes and chat history. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete account",
          style: "destructive",
          onPress: () =>
            Alert.alert("Are you sure?", "Last chance — this is permanent.", [
              { text: "Keep my account", style: "cancel" },
              {
                text: "Delete forever",
                style: "destructive",
                onPress: async () => {
                  setWorking(true);
                  try {
                    await deleteAccount();
                    await Haptics.notificationAsync(
                      Haptics.NotificationFeedbackType.Success,
                    );
                    router.replace("/sign-in");
                  } catch (e) {
                    setWorking(false);
                    Alert.alert("Error", describeError(e, "Couldn't delete your account."));
                  }
                },
              },
            ]),
        },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-6 gap-7">
      <Pressable
        onPress={() => router.push("/edit-profile")}
        className="flex-row items-center gap-3.5 active:opacity-70"
      >
        <View className="h-14 w-14 items-center justify-center rounded-full border border-hairline bg-surface">
          <Ionicons name="person" size={26} color={colors.muted} />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-xl font-extrabold text-ink">{user?.name ?? "—"}</Text>
          <Text className="text-[13px] text-muted">@{user?.username}</Text>
          <Text className="text-[12px] text-faint">{user?.email}</Text>
        </View>
        <Ionicons name="pencil-outline" size={16} color={colors.faint} />
      </Pressable>

      <Pressable
        onPress={() => router.push("/credits")}
        className="flex-row items-center justify-between rounded-[10px] border border-hairline bg-surface p-4 active:opacity-70"
      >
        <View>
          <Eyebrow color={colors.faint}>AI credits</Eyebrow>
          <Text className="mt-1.5 text-[15px] font-semibold text-ink">
            {credits ?? "—"} left
          </Text>
        </View>
        <Text className="text-[12.5px] font-semibold text-accent">Get more</Text>
      </Pressable>

      <View className="rounded-[10px] border border-hairline bg-surface p-4">
        <Eyebrow color={colors.faint}>Subscription</Eyebrow>
        <Text className="mt-1.5 text-[15px] font-semibold text-ink">
          {user?.isDemo
            ? `${isPro ? "ThatFridge Pro" : "Free plan"} — demo account`
            : user?.proGranted
              ? "ThatFridge Pro — granted"
              : isPro
                ? "ThatFridge Pro — active"
                : "Free plan"}
        </Text>
        {user?.isDemo ? (
          <Pressable
            onPress={() => router.push({ pathname: "/paywall", params: { force: "1" } })}
            className="mt-3 items-center rounded-lg border border-hairline py-2.5 active:opacity-70"
          >
            <Text className="font-semibold text-ink">View plans</Text>
          </Pressable>
        ) : isPro && available && !user?.proGranted ? (
          <Pressable
            onPress={openCustomerCenter}
            className="mt-3 items-center rounded-lg border border-hairline py-2.5 active:opacity-70"
          >
            <Text className="font-semibold text-ink">Manage subscription</Text>
          </Pressable>
        ) : !isPro ? (
          <Pressable
            onPress={() => router.push("/paywall")}
            className="mt-3 items-center rounded-lg bg-accent py-2.5 active:opacity-80"
          >
            <Text className="font-bold uppercase tracking-wide text-on-accent">Go Pro</Text>
          </Pressable>
        ) : null}
        {available && !isPro && (
          <Pressable onPress={doRestore} className="mt-2 items-center py-1">
            <Text className="text-[12.5px] font-semibold text-accent">Restore purchases</Text>
          </Pressable>
        )}
      </View>

      {fridges.length > 0 && (
        <View>
          <SectionHeader>Your fridges</SectionHeader>
          <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
            {fridges.map((f, i) => {
              const count = f.sections.reduce((n, s) => n + s.items.length, 0);
              const active = scope === f.id;
              return (
                <View
                  key={f.id}
                  className={`flex-row items-center px-4 py-3.5 ${
                    i === fridges.length - 1 ? "" : "border-b border-hairline"
                  }`}
                >
                  <Pressable
                    onPress={() => {
                      setScope(f.id);
                      router.navigate("/inventory");
                    }}
                    className="flex-1 flex-row items-center justify-between"
                  >
                    <Text
                      className="text-[14px] font-semibold"
                      style={{ color: active ? colors.blue : colors.ink }}
                    >
                      {f.name}
                    </Text>
                    <Text className="mr-3 text-[11.5px] text-faint">{count} items</Text>
                  </Pressable>
                  <Pressable onPress={() => router.push(`/fridge/${f.id}`)} hitSlop={8}>
                    <Ionicons name="settings-outline" size={15} color={colors.faint} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <SettingsGroup title="Plan & discover">
        <LinkRow icon="calendar-number-outline" label="Calendar" badge="NEW" onPress={() => router.push("/calendar")} />
        <LinkRow icon="calendar-outline" label="Meal plan" onPress={() => router.push("/meal-plan")} />
        <LinkRow icon="compass-outline" label="Explore" badge="NEW" onPress={() => router.push("/explore")} last />
      </SettingsGroup>

      <SettingsGroup title="Your progress">
        <LinkRow icon="speedometer-outline" label="Crew score" onPress={() => router.push("/crew-score")} />
        <LinkRow icon="stats-chart-outline" label="Insights" badge="NEW" onPress={() => router.push("/insights")} />
        <LinkRow icon="ribbon-outline" label="Badges" onPress={() => router.push("/badges")} last />
      </SettingsGroup>

      <SettingsGroup title="Tools & data">
        <LinkRow icon="flask-outline" label="Kitchen Lab" badge="NEW" onPress={() => router.push("/kitchen-lab")} />
        <LinkRow icon="notifications-outline" label="Notification settings" onPress={() => router.push("/notification-settings")} />
        <LinkRow icon="shield-checkmark-outline" label="Privacy & data" onPress={() => router.push("/privacy")} last />
      </SettingsGroup>

      <SettingsGroup title="App">
        <LinkRow
          icon="contrast-outline"
          label="Appearance"
          value={THEME_LABELS[mode]}
          onPress={() =>
            Alert.alert(
              "Appearance",
              "Choose how ThatFridge looks.",
              [
                { text: "Light", onPress: () => setMode("light") },
                { text: "Dark", onPress: () => setMode("dark") },
                { text: "System", onPress: () => setMode("system") },
                // Android shows at most three buttons (it dismisses on outside tap instead); iOS keeps Cancel.
                ...(Platform.OS === "ios" ? [{ text: "Cancel", style: "cancel" as const }] : []),
              ],
              { cancelable: true },
            )
          }
        />
        <LinkRow icon="refresh-outline" label="Replay intro & tips" onPress={replayIntro} />
        <LinkRow icon="star-outline" label="Rate ThatFridge" onPress={openStoreReviewPage} />
        <LinkRow icon="chatbubble-ellipses-outline" label="Send feedback" onPress={() => router.push("/feedback")} />
        <LinkRow icon="information-circle-outline" label="About ThatFridge" onPress={() => router.push("/about")} last />
      </SettingsGroup>

      <View>
        <SectionHeader>Account</SectionHeader>
        {working ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <View className="gap-3">
            <Pressable
              onPress={doSignOut}
              className="items-center rounded-lg border border-hairline py-3 active:opacity-70"
            >
              <Text className="font-semibold text-ink">Sign out</Text>
            </Pressable>
            <Pressable
              onPress={confirmDelete}
              className="items-center rounded-lg border border-bad py-3 active:opacity-70"
            >
              <Text className="font-semibold text-bad">Delete account</Text>
            </Pressable>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

/** A titled, bordered list of settings rows: the profile's Settings, split into short groups so it reads in chunks. */
function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <SectionHeader>{title}</SectionHeader>
      <View className="overflow-hidden rounded-xl border border-hairline bg-surface">{children}</View>
    </View>
  );
}

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};
