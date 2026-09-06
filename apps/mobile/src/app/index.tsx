import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { useOnboarding } from "@/lib/onboarding";

export default function Index() {
  const { status } = useAuth();
  const onboarding = useOnboarding();

  // Wait for both the session restore and the local onboarding flags before routing —
  // `seen` decides welcome-vs-sign-in and home-vs-onboarding.
  if (status === "loading" || !onboarding.ready) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }

  if (status !== "signedIn") {
    return <Redirect href={onboarding.seen ? "/sign-in" : "/welcome"} />;
  }

  return <Redirect href={onboarding.seen ? "/home" : "/onboarding"} />;
}
