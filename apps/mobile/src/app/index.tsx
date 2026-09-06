import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

import { useAuth } from "@/lib/auth";
import { useOnboarding } from "@/lib/onboarding";

export default function Index() {
  const { status } = useAuth();
  const onboarding = useOnboarding();

  const waiting =
    status === "loading" || (status === "signedIn" && !onboarding.ready);

  if (waiting) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#26c6da" />
      </View>
    );
  }

  if (status !== "signedIn") return <Redirect href="/sign-in" />;

  return <Redirect href={onboarding.seen ? "/home" : "/onboarding"} />;
}
