import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";

// Placeholder authed hub. Real HomeScreen + tab bar come later (plan §6).
export default function Home() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { items, loading } = useInventory();

  const expiringSoon = items.filter((i) => i.days >= 0 && i.days <= 3).length;

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <View className="flex-1 gap-6 p-6">
        <View className="gap-1">
          <Text className="text-2xl font-bold text-ink">
            Hi {user?.name?.split(" ")[0] ?? "there"}
          </Text>
          <Text className="text-faint text-[13px]">{user?.email}</Text>
        </View>

        <Pressable
          onPress={() => router.push("/inventory")}
          className="rounded-2xl border border-hairline bg-surface p-4 active:opacity-80"
        >
          <Text className="text-[13px] font-bold uppercase tracking-widest text-faint">
            Inventory
          </Text>
          <Text className="mt-1 text-lg font-semibold text-ink">
            {loading ? "…" : `${items.length} items`}
          </Text>
          {!loading && expiringSoon > 0 && (
            <Text className="mt-0.5 text-[13px] text-warn">
              {expiringSoon} expiring within 3 days
            </Text>
          )}
        </Pressable>

        <View className="rounded-xl border border-hairline bg-surface p-4">
          <Text className="text-muted text-[13px] leading-5">
            Done: auth + session + inventory list/detail/qty/delete. Next: Add item +
            barcode scan, then Home + notifications. See APP_STORE_LAUNCH_PLAN.md §6.
          </Text>
        </View>

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace("/sign-in");
          }}
          className="mt-auto items-center rounded-lg border border-hairline py-3 active:opacity-70"
        >
          <Text className="font-semibold text-bad">Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
