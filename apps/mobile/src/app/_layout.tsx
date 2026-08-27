import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/lib/auth";
import { InventoryProvider } from "@/lib/inventory";
import { NotificationsProvider } from "@/lib/notifications";
import { ExpiryReminderSync } from "@/lib/ExpiryReminderSync";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <InventoryProvider>
          <NotificationsProvider>
            <ExpiryReminderSync />
            <StatusBar style="light" />
            <Stack
              screenOptions={{
                headerStyle: { backgroundColor: "#0b0f14" },
                headerTintColor: "#e8eef4",
                headerShadowVisible: false,
                contentStyle: { backgroundColor: "#0b0f14" },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="home" options={{ headerShown: false }} />
              <Stack.Screen name="inventory" options={{ title: "Inventory" }} />
              <Stack.Screen name="item/[id]" options={{ title: "", presentation: "modal" }} />
              <Stack.Screen name="add" options={{ title: "Add item", presentation: "modal" }} />
              <Stack.Screen
                name="scan"
                options={{ headerShown: false, presentation: "fullScreenModal" }}
              />
              <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
              <Stack.Screen
                name="notification-settings"
                options={{ title: "Notification settings" }}
              />
            </Stack>
          </NotificationsProvider>
        </InventoryProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
