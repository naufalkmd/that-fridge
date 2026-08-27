import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";

import { describeError } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";

export default function Profile() {
  const router = useRouter();
  const { user, signOut, deleteAccount } = useAuth();
  const [working, setWorking] = useState(false);

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
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-6 gap-6">
      <View className="gap-1">
        <Text className="text-2xl font-extrabold text-ink">{user?.name ?? "—"}</Text>
        <Text className="text-[13px] text-muted">@{user?.username}</Text>
        <Text className="text-[13px] text-faint">{user?.email}</Text>
      </View>

      <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
        <LinkRow label="Notification settings" onPress={() => router.push("/notification-settings")} />
        <LinkRow label="Shopping list" onPress={() => router.push("/shopping")} last />
      </View>

      <View className="rounded-2xl border border-hairline bg-surface p-4">
        <Text className="text-[13px] font-bold text-ink">About ThatFridge</Text>
        <Text className="mt-1 text-[12.5px] leading-5 text-muted">
          Know what&apos;s inside before you open the door. Track groceries and freshness,
          get pinged before things go bad, and see what you can cook with what you have —
          so less food ends up in the bin.
        </Text>
      </View>

      {working ? (
        <ActivityIndicator color="#4de1c1" />
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
  label,
  onPress,
  last,
}: {
  label: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center justify-between px-4 py-3.5 active:bg-canvas ${
        last ? "" : "border-b border-hairline"
      }`}
    >
      <Text className="text-[14px] text-ink">{label}</Text>
      <Text className="text-muted">›</Text>
    </Pressable>
  );
}
