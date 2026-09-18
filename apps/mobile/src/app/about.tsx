import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Constants from "expo-constants";

import { PixelText } from "@/components/brand";
import { PageHeader } from "@/components/ui";
import { useTheme } from "@/lib/theme";

const APP_VERSION = String(Constants.expoConfig?.version ?? "dev");

const CREW = [
  {
    name: "Chef",
    agentColor: "agentChef" as const,
    gif: require("../../assets/images/thatfridge/chef.gif"),
    blurb: "Suggests meals from what you already have, prioritising items closest to expiry.",
  },
  {
    name: "Guardian",
    agentColor: "agentGuardian" as const,
    gif: require("../../assets/images/thatfridge/guardian.gif"),
    blurb: "Watches food safety and flags risky or uncertain items before they go bad.",
  },
  {
    name: "Organizer",
    agentColor: "agentOrganizer" as const,
    gif: require("../../assets/images/thatfridge/organizer.gif"),
    blurb: "Tells you where to store each item and keeps fridge, freezer and pantry tidy.",
  },
  {
    name: "Shopkeeper",
    agentColor: "agentShopkeeper" as const,
    gif: require("../../assets/images/thatfridge/shopkeeper.gif"),
    blurb: "Builds your next grocery list and tells you what not to rebuy.",
  },
];

const LEGAL_LINKS = [
  { label: "Terms of Service", url: "https://thatfridge.com/terms" },
  { label: "Privacy Policy", url: "https://thatfridge.com/privacy" },
];

export default function About() {
  const { colors } = useTheme();
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="About ThatFridge" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <PixelText style={{ fontSize: 22, color: colors.ink }}>ThatFridge</PixelText>
          <Text style={{ fontSize: 12, color: colors.faint, marginTop: 4 }}>v{APP_VERSION}</Text>
        </View>

        <Text style={{ fontSize: 13, lineHeight: 20, color: colors.muted, marginBottom: 24 }}>
          Know what&apos;s inside before you open the door. Track groceries and freshness, get
          pinged before things go bad, and see what you can cook with what you have — so less
          food ends up in the bin.
        </Text>

        <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: colors.faint, marginBottom: 10 }}>
          MEET THE CREW
        </Text>
        <View style={{ gap: 10 }}>
          {CREW.map((c) => (
            <View
              key={c.name}
              style={{
                flexDirection: "row",
                gap: 14,
                padding: 14,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.hairline,
                backgroundColor: colors.surface,
              }}
            >
              <Image source={c.gif} style={{ width: 44, height: 44 }} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 13.5,
                    fontWeight: "800",
                    color: colors[c.agentColor],
                    marginBottom: 3,
                  }}
                >
                  {c.name}
                </Text>
                <Text style={{ fontSize: 11.5, lineHeight: 16, color: colors.muted }}>{c.blurb}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text
          style={{
            fontSize: 12,
            fontWeight: "800",
            letterSpacing: 0.3,
            color: colors.faint,
            marginTop: 24,
            marginBottom: 10,
          }}
        >
          LEGAL
        </Text>
        <View
          style={{
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.hairline,
            backgroundColor: colors.surface,
            overflow: "hidden",
          }}
        >
          {LEGAL_LINKS.map((l, i) => (
            <Pressable
              key={l.label}
              onPress={() => Linking.openURL(l.url)}
              style={{
                paddingVertical: 14,
                paddingHorizontal: 14,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.hairline,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.ink }}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
