import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";

// Placeholder authed screen. Real HomeScreen port comes later (plan §6).
export default function Home() {
  const router = useRouter();
  const { user, signOut } = useAuth();

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 gap-6 p-6">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-ink">Signed in</Text>
          <Text className="text-muted">
            {user ? `${user.name} · @${user.username}` : "—"}
          </Text>
          <Text className="text-faint text-[13px]">{user?.email}</Text>
        </View>

        <View className="rounded-xl border border-hairline bg-surface p-4">
          <Text className="text-muted text-[13px] leading-5">
            Auth + session restore + secure token storage are wired. Next screens:
            Inventory, Add / barcode scan, Home. See APP_STORE_LAUNCH_PLAN.md §6.
          </Text>
        </View>

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/sign-in");
          }}
          className="items-center rounded-lg border border-hairline py-3 active:opacity-70"
        >
          <Text className="font-semibold text-bad">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
