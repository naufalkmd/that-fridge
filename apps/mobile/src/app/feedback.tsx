import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";

import { ApiError, describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { PageHeader } from "@/components/ui";

export default function Feedback() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors } = useTheme();

  const [email, setEmail] = useState(user?.email ?? "");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; message?: string }>({});

  const canSend = email.trim().length > 0 && message.trim().length > 0 && !working;

  async function send() {
    if (!canSend) return;
    setWorking(true);
    setErrors({});
    try {
      await api.sendFeedback(email.trim(), message.trim());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Thanks!", "Your feedback has been sent.", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (e) {
      setWorking(false);
      if (e instanceof ApiError && e.errors) {
        setErrors({
          email: e.errors.email?.[0],
          message: e.errors.message?.[0],
        });
        return;
      }
      Alert.alert("Couldn't send", describeError(e, "Please try again."));
    }
  }

  return (
    <KeyboardAvoidingView className="flex-1 bg-canvas" behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <PageHeader title="Feedback" subtitle="Bugs, ideas, anything on your mind — the crew reads every one." />
      <ScrollView contentContainerClassName="px-6 pb-8 gap-7" keyboardShouldPersistTaps="handled">
        <Field
          label="Your email"
          value={email}
          onChangeText={setEmail}
          editable={!working}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          placeholder="you@example.com"
          error={errors.email}
          hint="So we can reply — doesn't have to be your account email."
        />

        <Field
          label="What's on your mind"
          value={message}
          onChangeText={setMessage}
          editable={!working}
          placeholder="Tell us what's working, what's not, or what you'd like to see…"
          multiline
          numberOfLines={6}
          maxLength={4000}
          error={errors.message}
          style={{ minHeight: 140, textAlignVertical: "top" }}
        />

        {working ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Pressable
            onPress={send}
            disabled={!canSend}
            className="items-center rounded-lg bg-accent py-3 active:opacity-80"
            style={{ opacity: canSend ? 1 : 0.4 }}
          >
            <Text className="font-bold uppercase tracking-wide text-on-accent">Send feedback</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  label: string;
  hint?: string;
  error?: string;
};

function Field({ label, hint, error, style, ...input }: FieldProps) {
  const { colors } = useTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-[12px] font-bold tracking-wide text-faint">{label}</Text>
      <View
        className="rounded-lg border bg-surface px-4"
        style={{ borderColor: error ? colors.bad : colors.hairline }}
      >
        <TextInput
          {...input}
          placeholderTextColor={colors.faint}
          className="py-3 text-[14px] text-ink"
          style={style}
        />
      </View>
      {error ? (
        <Text className="text-[11.5px] leading-4 text-bad">{error}</Text>
      ) : hint ? (
        <Text className="text-[11.5px] leading-4 text-faint">{hint}</Text>
      ) : null}
    </View>
  );
}
