import "../global.css";

import { Fragment, useEffect, useRef } from "react";
import { Alert, Platform, View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { vars } from "nativewind";

import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider, useTheme, themeCssVars } from "@/lib/theme";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";
import { ProProvider } from "@/lib/pro";
import { CreditsProvider } from "@/lib/credits";
import { InventoryProvider, useInventory } from "@/lib/inventory";
import { ScopeProvider } from "@/lib/scope";
import { NotificationsProvider } from "@/lib/notifications";
import { ShoppingProvider } from "@/lib/shopping";
import { CategoriesProvider } from "@/lib/categories";
import { KitchenScoreProvider } from "@/lib/kitchenScore";
import { RecipesProvider } from "@/lib/recipes";
import { SocialProvider } from "@/lib/social";
import { NotesProvider } from "@/lib/notes";
import { ToastProvider } from "@/lib/toast";
import { ExpiryReminderSync } from "@/lib/ExpiryReminderSync";
import { initAnalytics, track } from "@/lib/analytics";
import { OfflineBanner } from "@/components/offline-banner";
import { SplashGate } from "@/components/splash-gate";

SplashScreen.preventAutoHideAsync().catch(() => {});

const SPLASH_SAFETY_MS = 8000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PixelMix: require("../../assets/fonts/PixelMix.ttf"),
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* Mounted unconditionally so its SecureStore read runs in parallel with font
            loading - AppShell waits on both before hiding the splash screen. */}
        <ThemeProvider>
          <AppShell fontsLoaded={fontsLoaded} fontError={fontError} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppShell({
  fontsLoaded,
  fontError,
}: {
  fontsLoaded: boolean;
  fontError: Error | null;
}) {
  const { ready: themeReady, scheme, colors } = useTheme();
  const appReady = (fontsLoaded || !!fontError) && themeReady;

  // The native splash now stays up until the app has something real to show (see SplashGate, which knows when the
  // session and the first data are ready). This is only the safety net so a hung provider can never strand it.
  useEffect(() => {
    if (!appReady) return;
    const t = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), SPLASH_SAFETY_MS);
    return () => clearTimeout(t);
  }, [appReady]);

  useEffect(() => {
    initAnalytics();
    track("app_open");
  }, []);

  if (!appReady) return null;

  return (
    <View style={[{ flex: 1 }, vars(themeCssVars(colors))]}>
    <ToastProvider>
      <AuthProvider>
            <OnboardingProvider>
              <ProProvider>
                {/* Remount every data provider (and the screens) when the account
                    changes, so a new sign-in can't inherit the previous user's
                    fridge / notes / recipes if a stale session lingered. */}
                <AccountBoundary>
                  <CreditsProvider>
                  <ScopeProvider>
                  <InventoryProvider>
                    <SocialProvider>
                      <NotificationsProvider>
                        <ShoppingProvider>
                          <CategoriesProvider>
                            <KitchenScoreProvider>
                              <RecipesProvider>
                                <NotesProvider>
                                  <SplashGate />
                                  <ExpiryReminderSync />
                                  <ImprovementNotice />
                                  <AuthGuard />
                                  <StatusBar style={scheme === "light" ? "dark" : "light"} />
                                  <Stack
                                    screenOptions={{
                                      headerStyle: { backgroundColor: colors.canvas },
                                      headerTintColor: colors.ink,
                                      headerShadowVisible: false,
                                      contentStyle: {
                                        backgroundColor: colors.canvas,
                                      },
                                    }}
                                  >
                                    <Stack.Screen
                                      name="index"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="welcome"
                                      options={{
                                        headerShown: false,
                                        gestureEnabled: false,
                                      }}
                                    />
                                    <Stack.Screen
                                      name="sign-in"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="forgot-password"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="(tabs)"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="item/[id]"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="shopping-item/[id]"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="add"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="icon-picker"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="recipe-icon-picker"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="credits"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="scan"
                                      options={{
                                        headerShown: false,
                                        presentation: "fullScreenModal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="notification-settings"
                                      options={{ title: "Notification settings" }}
                                    />
                                    <Stack.Screen
                                      name="privacy"
                                      options={{ title: "Privacy & data" }}
                                    />
                                    <Stack.Screen
                                      name="edit-profile"
                                      options={{ title: "Edit profile" }}
                                    />
                                    <Stack.Screen
                                      name="shopping"
                                      options={{ title: "Shopping list" }}
                                    />
                                    <Stack.Screen
                                      name="search"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="notifications"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="calendar"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="recipe/[id]"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="recipe/mark-made"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="recipe/attachment"
                                      options={{
                                        headerShown: false,
                                        presentation: "fullScreenModal",
                                        animation: "fade",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="recipe-form"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="badges"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="kitchen-lab"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="meal-plan"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="explore"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="insights"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="crew-score"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="chat-history"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="about"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="find-friend"
                                      options={{ headerShown: false }}
                                    />
                                    <Stack.Screen
                                      name="fridge/[id]"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="categories"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="fridges"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="profile"
                                      options={{ title: "Profile" }}
                                    />
                                    <Stack.Screen
                                      name="paywall"
                                      options={{
                                        headerShown: false,
                                        presentation: "modal",
                                      }}
                                    />
                                    <Stack.Screen
                                      name="onboarding"
                                      options={{
                                        headerShown: false,
                                        gestureEnabled: false,
                                      }}
                                    />
                                  </Stack>
                                  <OfflineBanner />
                                </NotesProvider>
                              </RecipesProvider>
                            </KitchenScoreProvider>
                          </CategoriesProvider>
                        </ShoppingProvider>
                      </NotificationsProvider>
                    </SocialProvider>
                  </InventoryProvider>
                  </ScopeProvider>
                  </CreditsProvider>
                </AccountBoundary>
              </ProProvider>
            </OnboardingProvider>
          </AuthProvider>
        </ToastProvider>
    </View>
  );
}

/**
 * Keys the data-provider subtree (and the screens) on the current account id, so a
 * sign-in as a different user tears down every provider and rebuilds it from scratch —
 * even if the previous session never cleanly transitioned through "signedOut".
 */
function AccountBoundary({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <Fragment key={user?.id ?? "signed-out"}>{children}</Fragment>;
}

function ImprovementNotice() {
  const { status, user, updateImprovementPreferences } = useAuth();
  const shownFor = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === "web" || status !== "signedIn" || !user ||
        user.preferences?.help_improve_notice_seen || shownFor.current === user.id) return;
    shownFor.current = user.id;
    Alert.alert(
      "Improving food suggestions",
      "ThatFridge shares structured corrections and outcomes by default to improve its suggestions. You can turn this off or delete past improvement data in Profile. We don't include notes, photos or chat text.",
      [{ text: "Got it", onPress: () => {
        void updateImprovementPreferences({ noticeSeen: true }).catch(() => {});
      } }],
    );
  }, [status, user, updateImprovementPreferences]);

  return null;
}

// Routes reachable while signed out. Every other route in this Stack renders account data
// (directly, or via the provider tree above) with no auth check of its own — each screen
// individually degrades gracefully today, but nothing stops a *future* screen from fetching
// by route param with no fallback. This is the one place that actually enforces it: whenever
// the session isn't signed in, bounce off anything outside this allowlist.
const PUBLIC_ROUTES = ["/", "/welcome", "/sign-in", "/forgot-password", "/onboarding"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function AuthGuard() {
  const { status } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "signedOut") return; // "loading" and "signedIn" both pass through
    if (!isPublicRoute(pathname)) router.replace("/sign-in");
  }, [status, pathname, router]);

  return null;
}
