import { useState } from "react";
import { Alert, Linking, ScrollView, Switch, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { LinkRow as Row } from "@/components/link-row";
import { MemoryData } from "@/components/memory-data";
import { SectionHeader } from "@/components/ui";

const SHARED = [
  "Which suggestions you accept, correct or ignore, and what happens to items (used, thrown out).",
  "Structured facts only: categories, dates, counts, quantities.",
];
const NEVER = ["Notes, photos, or chat text.", "Names of your items, recipes or meals."];

/**
 * Settings → Privacy & data, in one place: the improvement-sharing switch, the policy link and deleting what's
 * been shared, a plain-language summary of what's collected, and what the crew remembers (past chats, memory,
 * usage history) with the controls to delete it.
 */
export default function Privacy() {
  const { colors } = useTheme();
  const { user, updateImprovementPreferences } = useAuth();
  const [working, setWorking] = useState(false);

  async function setSharing(value: boolean) {
    setWorking(true);
    try {
      await updateImprovementPreferences({ helpImprove: value });
    } catch (e) {
      Alert.alert("Couldn't save preference", describeError(e, "Please try again."));
    } finally {
      setWorking(false);
    }
  }

  function confirmDelete() {
    Alert.alert(
      "Delete improvement data?",
      "This deletes the feedback records linked to your account. Anonymous combined statistics may remain.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete data",
          style: "destructive",
          onPress: async () => {
            setWorking(true);
            try {
              await api.deleteImprovementData();
              Alert.alert("Deleted", "Your improvement data has been deleted.");
            } catch (e) {
              Alert.alert("Couldn't delete data", describeError(e, "Please try again."));
            } finally {
              setWorking(false);
            }
          },
        },
      ],
    );
  }

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 20 }}>
      <View>
        <SectionHeader>Your choices</SectionHeader>
        <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <Row
            icon="analytics-outline"
            label="Help improve suggestions"
            subtitle="Share structured corrections and outcomes. No notes, photos or chat text."
            right={
              <Switch
                accessibilityLabel="Help improve ThatFridge's suggestions"
                value={user?.preferences?.help_improve !== false}
                onValueChange={setSharing}
                disabled={working}
              />
            }
          />
          <Row
            icon="trash-outline"
            label="Delete my improvement data"
            destructive
            hideChevron
            disabled={working}
            onPress={confirmDelete}
          />
          <Row
            icon="document-text-outline"
            label="Privacy policy"
            onPress={() => Linking.openURL("https://thatfridge.com/privacy")}
            last
          />
        </View>
      </View>

      <View>
        <SectionHeader>What&apos;s shared, and what isn&apos;t</SectionHeader>
        <View className="gap-3 rounded-xl border border-hairline bg-surface p-4">
          <Detail title="When sharing is on" items={SHARED} icon="checkmark-circle-outline" tint={colors.accent} />
          <Detail title="Never shared" items={NEVER} icon="close-circle-outline" tint={colors.bad} />
          <Text className="text-[12.5px] leading-5 text-muted">
            Feedback records are kept for 180 days, then removed. Turning sharing off stops new records; you can
            delete the existing ones at any time.
          </Text>
        </View>
      </View>

      <View>
        <SectionHeader>What the crew remembers</SectionHeader>
        <MemoryData />
      </View>
    </ScrollView>
  );
}

function Detail({
  title,
  items,
  icon,
  tint,
}: {
  title: string;
  items: string[];
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
}) {
  return (
    <View className="gap-1.5">
      <Text className="text-[13px] font-bold text-ink">{title}</Text>
      {items.map((line) => (
        <View key={line} className="flex-row items-start gap-2">
          <Ionicons name={icon} size={16} color={tint} style={{ marginTop: 1 }} />
          <Text className="flex-1 text-[12.5px] leading-5 text-muted">{line}</Text>
        </View>
      ))}
    </View>
  );
}
