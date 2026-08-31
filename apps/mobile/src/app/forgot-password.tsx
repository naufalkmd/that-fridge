import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PixelText } from "@/components/brand";

type Step = "email" | "code";

export default function ForgotPassword() {
  const router = useRouter();
  const { resetPassword } = useAuth();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function sendCode() {
    const e = email.trim();
    if (!e) {
      setError("Enter your email.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.forgotPassword(e);
      setStep("code");
    } catch (err) {
      setError(describeError(err, "Couldn't send a code — try again."));
    } finally {
      setBusy(false);
    }
  }

  async function submitReset() {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await resetPassword(email.trim(), code, password);
      router.replace("/home");
    } catch (err) {
      setError(describeError(err, "That code is invalid or has expired."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View className="flex-row items-center gap-2 px-5 pt-4">
          <Pressable
            onPress={() => (step === "code" ? setStep("email") : router.back())}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color="#eaeaec" />
          </Pressable>
          <PixelText style={{ fontSize: 14, color: "#eaeaec" }}>
            Reset password
          </PixelText>
        </View>

        <ScrollView
          contentContainerClassName="grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="rounded-2xl border border-hairline bg-surface p-5">
            {step === "email" ? (
              <>
                <Text className="mb-1 text-[15px] font-bold text-ink">
                  Forgot your password?
                </Text>
                <Text className="mb-5 text-[12.5px] leading-5 text-muted">
                  Enter your email and we&apos;ll send you a 6-digit code to set
                  a new one.
                </Text>
                <Field
                  label="EMAIL"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoFocus
                />
                <Submit label="Send code" busy={busy} onPress={sendCode} />
              </>
            ) : (
              <>
                <Text className="mb-1 text-[15px] font-bold text-ink">
                  Check your email
                </Text>
                <Text className="mb-5 text-[12.5px] leading-5 text-muted">
                  We sent a code to{" "}
                  <Text className="text-ink">{email.trim()}</Text>. Enter it
                  below with your new password.
                </Text>
                <View className="gap-3.5">
                  <Field
                    label="6-DIGIT CODE"
                    value={code}
                    onChangeText={(t) =>
                      setCode(t.replace(/[^0-9]/g, "").slice(0, 6))
                    }
                    placeholder="123456"
                    keyboardType="number-pad"
                    autoFocus
                  />
                  <Field
                    label="NEW PASSWORD"
                    value={password}
                    onChangeText={setPassword}
                    placeholder="••••••••"
                    secureTextEntry
                  />
                  <Field
                    label="CONFIRM PASSWORD"
                    value={confirm}
                    onChangeText={setConfirm}
                    placeholder="••••••••"
                    secureTextEntry
                  />
                </View>
                <Submit
                  label="Reset password"
                  busy={busy}
                  onPress={submitReset}
                />
                <Pressable
                  className="mt-3 items-center"
                  onPress={sendCode}
                  disabled={busy}
                >
                  <Text className="text-[12px] font-semibold text-accent">
                    Resend code
                  </Text>
                </Pressable>
              </>
            )}

            {error && (
              <Text className="mt-3 text-[12.5px] font-semibold text-bad">
                {error}
              </Text>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Submit({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      className="mt-4 items-center rounded-lg bg-accent py-3.5 active:opacity-80"
      style={busy ? { opacity: 0.7 } : undefined}
    >
      {busy ? (
        <ActivityIndicator color="#0a0a0c" />
      ) : (
        <Text className="text-[14px] font-bold uppercase tracking-wide text-[#0a0a0c]">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };

function Field({ label, ...input }: FieldProps) {
  return (
    <View>
      <Text className="mb-1.5 text-[12px] font-bold tracking-wide text-faint">
        {label}
      </Text>
      <TextInput
        {...input}
        placeholderTextColor="rgba(234,234,236,0.34)"
        className="rounded-lg bg-canvas px-4 py-3 text-[14px] text-ink"
      />
    </View>
  );
}
