import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
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
import { openStoreReviewPage } from "@/lib/rate";
import { PixelText } from "@/components/brand";
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
    await signOut();
    router.replace("/sign-in");
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
          <Text className="text-lg font-bold text-ink">
            {user?.name?.slice(0, 1).toUpperCase() ?? "?"}
          </Text>
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
            ? "ThatFridge Pro — demo account"
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
        ) : isPro && available ? (
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

      <View>
        <SectionHeader>Settings</SectionHeader>
        <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <LinkRow icon="restaurant-outline" label="Recipe book" onPress={() => router.push("/recipes")} />
          <LinkRow icon="ribbon-outline" label="Badges" onPress={() => router.push("/badges")} />
          <LinkRow icon="sync-outline" label="Organizer" onPress={() => router.push("/organizer")} />
          <LinkRow
            icon="flask-outline"
            label="Kitchen Lab"
            badge="BETA"
            onPress={() => router.push("/kitchen-lab")}
          />
          <LinkRow icon="sparkles-outline" label="AI Data & Memory" onPress={() => router.push("/ai-data")} />
          <LinkRow
            icon="notifications-outline"
            label="Notification settings"
            onPress={() => router.push("/notification-settings")}
          />
          <LinkRow icon="cart-outline" label="Shopping list" onPress={() => router.push("/shopping")} />
          <LinkRow
            icon="contrast-outline"
            label="Appearance"
            value={THEME_LABELS[mode]}
            onPress={() =>
              Alert.alert("Appearance", "Choose how ThatFridge looks.", [
                { text: "Light", onPress: () => setMode("light") },
                { text: "Dark", onPress: () => setMode("dark") },
                { text: "System", onPress: () => setMode("system") },
                { text: "Cancel", style: "cancel" },
              ])
            }
          />
          <LinkRow
            icon="refresh-outline"
            label="Replay intro & tips"
            onPress={replayIntro}
          />
          <LinkRow
            icon="star-outline"
            label="Rate ThatFridge"
            onPress={openStoreReviewPage}
          />
          <LinkRow
            icon="chatbubble-ellipses-outline"
            label="Send feedback"
            onPress={() => router.push("/feedback")}
          />
          <LinkRow
            icon="information-circle-outline"
            label="About ThatFridge"
            onPress={() => router.push("/about")}
            last
          />
        </View>
      </View>

      <View className="rounded-[10px] border border-hairline bg-surface p-4">
        <View className="mb-1.5 flex-row items-center gap-2">
          <PixelText style={{ fontSize: 12, color: colors.ink }}>ThatFridge</PixelText>
        </View>
        <Text className="text-[12.5px] leading-5 text-muted">
          Know what&apos;s inside before you open the door. Track groceries and freshness,
          get pinged before things go bad, and see what you can cook with what you have —
          so less food ends up in the bin.
        </Text>
      </View>

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

const THEME_LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function LinkRow({
  icon,
  label,
  value,
  badge,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  /** A short uppercase tag next to the label, e.g. "BETA" - for a feature that's live but
   *  still being finished. */
  badge?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-canvas ${
        last ? "" : "border-b border-hairline"
      }`}
    >
      <Ionicons name={icon} size={18} color={colors.muted} />
      <View className="flex-1 flex-row items-center gap-2">
        <Text className="text-[14px] text-ink">{label}</Text>
        {badge && (
          <View
            className="rounded-full px-1.5 py-0.5"
            style={{ backgroundColor: `${colors.accent}26` }}
          >
            <Text
              className="text-[9.5px] font-extrabold tracking-wide"
              style={{ color: colors.accent }}
            >
              {badge}
            </Text>
          </View>
        )}
      </View>
      {value && <Text className="text-[13px] text-faint">{value}</Text>}
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}
