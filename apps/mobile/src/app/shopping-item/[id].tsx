import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError, normalizeShopUrl } from "@thatfridge/core";
import { useShopping } from "@/lib/shopping";
import { useTheme } from "@/lib/theme";
import { SheetHeader } from "@/components/sheet";

export default function ShoppingItemDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { itemById, patch, toggle, remove } = useShopping();
  const {
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    ink: INK,
    muted: MUTED,
    faint: FAINT,
    blue: BLUE,
    good: GOOD,
    bad: BAD,
    accent: ACCENT,
    onAccent: CANVAS,
  } = useTheme().colors;

  const item = itemById(id);

  const [name, setName] = useState(item?.name ?? "");
  const [shopUrl, setShopUrl] = useState(item?.shopUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    borderWidth: 1,
    borderColor: HAIRLINE,
    backgroundColor: SURFACE2,
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13.5,
    color: INK,
  } as const;

  if (!item) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-6">
        <Text className="text-muted">This item is no longer on your list.</Text>
        <Pressable onPress={() => router.back()} className="mt-4">
          <Text className="font-semibold text-accent">Close</Text>
        </Pressable>
      </View>
    );
  }

  async function save() {
    if (!name.trim()) {
      Alert.alert("Name required", "Give the item a name.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patch(item!.id, { name: name.trim(), shopUrl: normalizeShopUrl(shopUrl) });
      router.back();
    } catch (e) {
      setSaving(false);
      setError(describeError(e, "Couldn't save your changes."));
    }
  }

  function confirmRemove() {
    Alert.alert("Remove item?", `Remove "${item!.name}" from your shopping list?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await remove(item!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <SheetHeader title="Shopping item" />
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 22, paddingTop: 6, paddingBottom: 40, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable
          onPress={() => toggle(item!.id)}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "flex-start" }}
        >
          <View
            style={{
              height: 22,
              width: 22,
              borderRadius: 11,
              borderWidth: 1,
              borderColor: item.checked ? GOOD : FAINT,
              backgroundColor: item.checked ? GOOD : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {item.checked && <Ionicons name="checkmark" size={13} color={CANVAS} />}
          </View>
          <Text style={{ fontSize: 13, fontWeight: "600", color: item.checked ? GOOD : MUTED }}>
            {item.checked ? "In the cart" : "Still to buy"}
          </Text>
        </Pressable>

        <Field label="NAME">
          <TextInput
            value={name}
            onChangeText={setName}
            placeholderTextColor={FAINT}
            style={inputStyle}
          />
        </Field>

        <Field label="SHOP LINK (OPTIONAL)">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TextInput
              value={shopUrl}
              onChangeText={setShopUrl}
              placeholder="https://…"
              placeholderTextColor={FAINT}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={[inputStyle, { flex: 1 }]}
            />
            {!!item.shopUrl && (
              <Pressable
                onPress={() => Linking.openURL(item.shopUrl!)}
                style={{
                  width: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  backgroundColor: SURFACE2,
                  borderWidth: 1,
                  borderColor: HAIRLINE,
                }}
              >
                <Ionicons name="open-outline" size={16} color={BLUE} />
              </Pressable>
            )}
          </View>
        </Field>

        {error && <Text style={{ fontSize: 12, color: BAD }}>{error}</Text>}

        <Pressable
          onPress={save}
          disabled={saving}
          style={{
            alignItems: "center",
            paddingVertical: 13,
            borderRadius: 6,
            backgroundColor: ACCENT,
            opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? (
            <ActivityIndicator color={CANVAS} />
          ) : (
            <Text
              style={{
                fontWeight: "700",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                color: CANVAS,
              }}
            >
              Save
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={confirmRemove}
          style={{
            alignItems: "center",
            paddingVertical: 13,
            borderRadius: 6,
            backgroundColor: SURFACE,
            borderWidth: 1,
            borderColor: `${BAD}66`,
          }}
        >
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: BAD }}>Remove from list</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { faint: FAINT } = useTheme().colors;
  return (
    <View>
      <Text style={{ marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT }}>
        {label}
      </Text>
      {children}
    </View>
  );
}
