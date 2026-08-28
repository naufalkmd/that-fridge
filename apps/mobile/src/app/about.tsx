import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";

import { PixelText } from "@/components/brand";
import { PageHeader } from "@/components/ui";

const SURFACE = "#131316";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";

const APP_VERSION = "1.0.0";

const CREW = [
  {
    name: "Chef",
    color: "#f5a623",
    gif: require("../../assets/images/thatfridge/chef.gif"),
    blurb: "Suggests meals from what you already have, prioritising items closest to expiry.",
  },
  {
    name: "Guardian",
    color: "#ff5f56",
    gif: require("../../assets/images/thatfridge/guardian.gif"),
    blurb: "Watches food safety and flags risky or uncertain items before they go bad.",
  },
  {
    name: "Organizer",
    color: "#3d6fe0",
    gif: require("../../assets/images/thatfridge/organizer.gif"),
    blurb: "Tells you where to store each item and keeps fridge, freezer and pantry tidy.",
  },
  {
    name: "Shopkeeper",
    color: "#39e07f",
    gif: require("../../assets/images/thatfridge/shopkeeper.gif"),
    blurb: "Builds your next grocery list and tells you what not to rebuy.",
  },
];

export default function About() {
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="About ThatFridge" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 60 }}>
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <PixelText style={{ fontSize: 22, color: INK }}>ThatFridge</PixelText>
          <Text style={{ fontSize: 12, color: FAINT, marginTop: 4 }}>v{APP_VERSION}</Text>
        </View>

        <Text style={{ fontSize: 13, lineHeight: 20, color: MUTED, marginBottom: 24 }}>
          Know what&apos;s inside before you open the door. Track groceries and freshness, get
          pinged before things go bad, and see what you can cook with what you have — so less
          food ends up in the bin.
        </Text>

        <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 10 }}>
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
                borderColor: HAIRLINE,
                backgroundColor: SURFACE,
              }}
            >
              <Image source={c.gif} style={{ width: 44, height: 44 }} contentFit="contain" />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13.5, fontWeight: "800", color: c.color, marginBottom: 3 }}>
                  {c.name}
                </Text>
                <Text style={{ fontSize: 11.5, lineHeight: 16, color: MUTED }}>{c.blurb}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
