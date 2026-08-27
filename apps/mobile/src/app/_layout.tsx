import "../global.css";

import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/lib/auth";
import { ProProvider } from "@/lib/pro";
import { InventoryProvider } from "@/lib/inventory";
import { NotificationsProvider } from "@/lib/notifications";
import { ShoppingProvider } from "@/lib/shopping";
import { ExpiryReminderSync } from "@/lib/ExpiryReminderSync";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PixelMix: require("../../assets/fonts/PixelMix.ttf"),
    "PixelMix-Bold": require("../../assets/fonts/PixelMix-Bold.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

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
                headerStyle: { backgroundColor: "#0a0a0c" },
                headerTintColor: "#eaeaec",
                headerShadowVisible: false,
                contentStyle: { backgroundColor: "#0a0a0c" },
              }}
            >
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" options={{ headerShown: false }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="item/[id]" options={{ title: "", presentation: "modal" }} />
              <Stack.Screen name="add" options={{ title: "Add item", presentation: "modal" }} />
              <Stack.Screen
                name="scan"
                options={{ headerShown: false, presentation: "fullScreenModal" }}
              />
              <Stack.Screen
                name="notification-settings"
                options={{ title: "Notification settings" }}
              />
              <Stack.Screen name="shopping" options={{ title: "Shopping list" }} />
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
