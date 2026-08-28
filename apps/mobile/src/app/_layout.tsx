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
import { ScopeProvider } from "@/lib/scope";
import { NotificationsProvider } from "@/lib/notifications";
import { ShoppingProvider } from "@/lib/shopping";
import { KitchenScoreProvider } from "@/lib/kitchenScore";
import { RecipesProvider } from "@/lib/recipes";
import { SocialProvider } from "@/lib/social";
import { NotesProvider } from "@/lib/notes";
import { ToastProvider } from "@/lib/toast";
import { ExpiryReminderSync } from "@/lib/ExpiryReminderSync";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PixelMix: require("../../assets/fonts/PixelMix.ttf"),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
     <ToastProvider>
      <AuthProvider>
       <ProProvider>
        <InventoryProvider>
         <ScopeProvider>
          <SocialProvider>
          <NotificationsProvider>
           <ShoppingProvider>
            <KitchenScoreProvider>
            <RecipesProvider>
            <NotesProvider>
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
              <Stack.Screen
                name="item/[id]"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen
                name="add"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen
                name="icon-picker"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen
                name="scan"
                options={{ headerShown: false, presentation: "fullScreenModal" }}
              />
              <Stack.Screen
                name="notification-settings"
                options={{ title: "Notification settings" }}
              />
              <Stack.Screen name="shopping" options={{ title: "Shopping list" }} />
              <Stack.Screen
                name="search"
                options={{ headerShown: false, presentation: "modal" }}
              />
              <Stack.Screen name="notifications" options={{ headerShown: false }} />
              <Stack.Screen name="recipes" options={{ headerShown: false }} />
              <Stack.Screen name="recipe/[id]" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="recipe/mark-made" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="recipe/attachment" options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade" }} />
              <Stack.Screen name="recipe-form" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="goals" options={{ headerShown: false }} />
              <Stack.Screen name="badges" options={{ headerShown: false }} />
              <Stack.Screen name="organizer" options={{ headerShown: false }} />
              <Stack.Screen name="what-to-eat" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="ai-data" options={{ headerShown: false }} />
              <Stack.Screen name="chat-history" options={{ headerShown: false }} />
              <Stack.Screen name="about" options={{ headerShown: false }} />
              <Stack.Screen name="find-friend" options={{ headerShown: false }} />
              <Stack.Screen name="fridge/[id]" options={{ headerShown: false, presentation: "modal" }} />
              <Stack.Screen name="profile" options={{ title: "Profile" }} />
              <Stack.Screen
                name="paywall"
                options={{ headerShown: false, presentation: "modal" }}
              />
            </Stack>
            </NotesProvider>
            </RecipesProvider>
            </KitchenScoreProvider>
           </ShoppingProvider>
          </NotificationsProvider>
          </SocialProvider>
         </ScopeProvider>
        </InventoryProvider>
       </ProProvider>
      </AuthProvider>
     </ToastProvider>
    </SafeAreaProvider>
  );
}
