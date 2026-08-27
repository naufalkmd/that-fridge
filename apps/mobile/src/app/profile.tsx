import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { usePro } from "@/lib/pro";
import { PixelText } from "@/components/brand";
import { Eyebrow, SectionHeader } from "@/components/ui";

export default function Profile() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const { isPro, available, restore, openCustomerCenter } = usePro();
  const { fridges } = useInventory();
  const { scope, setScope } = useScope();
  const [working, setWorking] = useState(false);

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
      <View className="flex-row items-center gap-3.5">
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
      </View>

      <View className="rounded-[10px] border border-hairline bg-surface p-4">
        <Eyebrow color="rgba(234,234,236,0.34)">Subscription</Eyebrow>
        <Text className="mt-1.5 text-[15px] font-semibold text-ink">
          {isPro ? "ThatFridge Pro — active" : "Free plan"}
        </Text>
        {isPro && available ? (
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
            <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">Go Pro</Text>
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
                <Pressable
                  key={f.id}
                  onPress={() => {
                    setScope(f.id);
                    router.navigate("/inventory");
                  }}
                  className={`flex-row items-center justify-between px-4 py-3.5 active:bg-canvas ${
                    i === fridges.length - 1 ? "" : "border-b border-hairline"
                  }`}
                >
                  <Text
                    className="text-[14px] font-semibold"
                    style={{ color: active ? "#5b8dee" : "#eaeaec" }}
                  >
                    {f.name}
                  </Text>
                  <Text className="text-[11.5px] text-faint">{count} items</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View>
        <SectionHeader>Settings</SectionHeader>
        <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <LinkRow
            icon="notifications-outline"
            label="Notification settings"
            onPress={() => router.push("/notification-settings")}
          />
          <LinkRow
            icon="cart-outline"
            label="Shopping list"
            onPress={() => router.push("/shopping")}
            last
          />
        </View>
      </View>

      <View className="rounded-[10px] border border-hairline bg-surface p-4">
        <View className="mb-1.5 flex-row items-center gap-2">
          <PixelText style={{ fontSize: 12, color: "#eaeaec" }}>ThatFridge</PixelText>
        </View>
        <Text className="text-[12.5px] leading-5 text-muted">
          Know what&apos;s inside before you open the door. Track groceries and freshness,
          get pinged before things go bad, and see what you can cook with what you have —
          so less food ends up in the bin.
        </Text>
      </View>

      {working ? (
        <ActivityIndicator color="#26c6da" />
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
    </ScrollView>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
  last,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-canvas ${
        last ? "" : "border-b border-hairline"
      }`}
    >
      <Ionicons name={icon} size={18} color="rgba(234,234,236,0.58)" />
      <Text className="flex-1 text-[14px] text-ink">{label}</Text>
      <Ionicons name="chevron-forward" size={16} color="rgba(234,234,236,0.34)" />
    </Pressable>
  );
}
