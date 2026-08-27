import "../global.css";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0b0f14" },
          headerTintColor: "#e8eef4",
          contentStyle: { backgroundColor: "#0b0f14" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "ThatFridge" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
