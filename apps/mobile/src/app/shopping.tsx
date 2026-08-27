import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { describeError } from "@thatfridge/core";
import { useShopping } from "@/lib/shopping";

export default function Shopping() {
  const { items, loading, error, refresh, add, toggle, remove, clearChecked } = useShopping();
  const [text, setText] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  async function submit() {
    if (!text.trim() || adding) return;
    setAdding(true);
    try {
      await add(text);
      setText("");
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't add that."));
    } finally {
      setAdding(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ActivityIndicator color="#4de1c1" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerClassName="px-5 pb-28 pt-3"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
            tintColor="#9fb0c0"
          />
        }
      >
        <View className="mb-4 flex-row gap-2">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            returnKeyType="done"
            placeholder="Add an item…"
            placeholderTextColor="#5f7285"
            className="flex-1 rounded-lg border border-hairline bg-surface px-4 py-3 text-[14px] text-ink"
          />
          <Pressable
            onPress={submit}
            className="items-center justify-center rounded-lg bg-warn px-4 active:opacity-80"
          >
            <Text className="text-[18px] font-bold text-[#0a0a0c]">+</Text>
          </Pressable>
        </View>

        {error && (
          <Pressable onPress={refresh} className="mb-4 rounded-xl border border-bad bg-surface p-3">
            <Text className="font-semibold text-bad">{error}</Text>
          </Pressable>
        )}

        {items.length === 0 && (
          <Text className="mt-10 text-center text-[13px] text-faint">
            Your shopping list is empty.
          </Text>
        )}

        {unchecked.length > 0 && (
          <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
            {unchecked.map((item, i) => (
              <Row
                key={item.id}
                name={item.name}
                checked={false}
                last={i === unchecked.length - 1}
                onToggle={() => toggle(item.id)}
                onRemove={() => remove(item.id)}
              />
            ))}
          </View>
        )}

        {checked.length > 0 && (
          <>
            <View className="mb-2 mt-6 flex-row items-center justify-between">
              <Text className="text-[12px] font-bold tracking-wide text-faint">
                IN THE CART ({checked.length})
              </Text>
              <Pressable onPress={clearChecked} hitSlop={8}>
                <Text className="text-[12px] font-semibold text-accent">Clear</Text>
              </Pressable>
            </View>
            <View className="overflow-hidden rounded-2xl border border-hairline bg-surface">
              {checked.map((item, i) => (
                <Row
                  key={item.id}
                  name={item.name}
                  checked
                  last={i === checked.length - 1}
                  onToggle={() => toggle(item.id)}
                  onRemove={() => remove(item.id)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Row({
  name,
  checked,
  last,
  onToggle,
  onRemove,
}: {
  name: string;
  checked: boolean;
  last: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  return (
    <View
      className={`flex-row items-center gap-3 px-4 py-3 ${
        last ? "" : "border-b border-hairline"
      }`}
    >
      <Pressable onPress={onToggle} hitSlop={8} className="flex-1 flex-row items-center gap-3">
        <View
          className={`h-5 w-5 items-center justify-center rounded-full border ${
            checked ? "border-good bg-good" : "border-faint"
          }`}
        >
          {checked && <Text className="text-[11px] font-bold text-canvas">✓</Text>}
        </View>
        <Text
          className={`text-[14px] ${checked ? "text-faint line-through" : "text-ink"}`}
        >
          {name}
        </Text>
      </Pressable>
      <Pressable onPress={onRemove} hitSlop={8}>
        <Text className="text-[16px] text-faint">×</Text>
      </Pressable>
    </View>
  );
}
