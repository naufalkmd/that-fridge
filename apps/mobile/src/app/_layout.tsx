import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "@/lib/auth";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: "#0b0f14" },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="sign-in" />
          <Stack.Screen name="home" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
