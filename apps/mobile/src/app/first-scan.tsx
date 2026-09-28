import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { track } from "@/lib/analytics";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { PixelText } from "@/components/brand";

// Onboarding's last step, straight after sign-in (FirstScanGate opens it once, for an empty
// fridge): the real first win is getting your own food in, so it goes to the scan camera.

const OPTIONS: {
  mode: "photo" | "receipt" | "barcode";
  title: string;
  body: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}[] = [
  { mode: "photo", title: "Photo of fridge", body: "Snap each shelf - the crew spots what's there", icon: "fridge-outline" },
  { mode: "receipt", title: "Scan a receipt", body: "Just been shopping? One photo adds it all", icon: "receipt" },
  { mode: "barcode", title: "Scan barcodes", body: "Free - point at packs one by one", icon: "barcode-scan" },
];

export default function FirstScan() {
  const router = useRouter();
  const { canvas, surface, hairline, ink, muted, faint, accent, onAccent } = useTheme().colors;

  function start(mode: (typeof OPTIONS)[number]["mode"]) {
    void Haptics.selectionAsync();
    track("onboarding_first_scan_started", { mode });
    router.replace({ pathname: "/sweep", params: { mode, onboarding: "1" } });
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ flex: 1, paddingHorizontal: 24, paddingTop: 24, gap: 14 }}>
        <Animated.View entering={FadeInDown.duration(400)} style={{ alignItems: "center", gap: 10 }}>
          <Image source={require("../../assets/images/thatfridge/guardian.gif")} style={{ width: 96, height: 96 }} contentFit="contain" />
          <PixelText style={{ fontSize: 16, color: ink, textAlign: "center" }}>LET&apos;S FILL YOUR FRIDGE</PixelText>
          <Text style={{ fontSize: 14, lineHeight: 20, color: muted, textAlign: "center" }}>
            Get what you have into ThatFridge and the crew takes it from there: reminders before things go off, and ideas for what to cook.
          </Text>
        </Animated.View>

        <View style={{ gap: 10, marginTop: 8 }}>
          {OPTIONS.map((o, i) => {
            const primary = i === 0;
            return (
              <Animated.View key={o.mode} entering={FadeInUp.delay(150 + i * 90).duration(350)}>
                <Pressable
                  onPress={() => start(o.mode)}
                  accessibilityRole="button"
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 14,
                    padding: 16,
                    borderRadius: RADIUS.md,
                    borderCurve: "continuous",
                    backgroundColor: primary ? accent : surface,
                    borderWidth: primary ? 0 : 1,
                    borderColor: hairline,
                  }}
                >
                  <MaterialCommunityIcons name={o.icon} size={24} color={primary ? onAccent : accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: "700", color: primary ? onAccent : ink }}>{o.title}</Text>
                    <Text style={{ fontSize: 12.5, marginTop: 2, color: primary ? onAccent : faint }}>{o.body}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={primary ? onAccent : faint} />
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={{ flex: 1 }} />
        <Pressable
          onPress={() => {
            track("onboarding_first_scan_skipped");
            router.back();
          }}
          hitSlop={10}
          style={{ alignItems: "center", paddingVertical: 14 }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: muted }}>I&apos;ll add things later</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
