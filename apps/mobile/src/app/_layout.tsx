import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/lib/auth";
import { ProProvider } from "@/lib/pro";
import { InventoryProvider } from "@/lib/inventory";
import { NotificationsProvider } from "@/lib/notifications";
import { ShoppingProvider } from "@/lib/shopping";
import { ExpiryReminderSync } from "@/lib/ExpiryReminderSync";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
       <ProProvider>
        <InventoryProvider>
          <NotificationsProvider>
           <ShoppingProvider>
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
              <Stack.Screen name="shopping" options={{ title: "Shopping list" }} />
              <Stack.Screen name="eat" options={{ title: "What to eat" }} />
              <Stack.Screen name="chat" options={{ title: "Ask the crew" }} />
              <Stack.Screen name="profile" options={{ title: "Profile" }} />
              <Stack.Screen
                name="paywall"
                options={{ title: "ThatFridge Pro", presentation: "modal" }}
              />
            </Stack>
           </ShoppingProvider>
          </NotificationsProvider>
        </InventoryProvider>
       </ProProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
