import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import * as AppleAuthentication from "expo-apple-authentication";
import Ionicons from "@expo/vector-icons/Ionicons";

import { describeError } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";
import { googleAuthAvailable } from "@/lib/google-auth";
import { Logo, PixelText } from "@/components/brand";

type Mode = "login" | "signup";

const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

export default function SignIn() {
  const router = useRouter();
  const { signIn, signUp, signInWithApple, signInWithGoogle } = useAuth();

  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync()
      .then(setAppleAvailable)
      .catch(() => setAppleAvailable(false));
  }, []);

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isLogin = mode === "login";

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  function validate(): string | null {
    const e = email.trim();
    if (!e || !password) return "Enter your email and password.";
    if (isLogin) return null;
    if (!name.trim()) return "Enter your name.";
    const u = username.trim();
    if (!u) return "Enter a username.";
    if (!USERNAME_RE.test(u)) return "Usernames can only use letters, numbers, - and _.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    if (password !== confirm) return "Passwords don't match.";
    return null;
  }

  async function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      if (isLogin) {
        await signIn(email.trim(), password);
      } else {
        await signUp(name.trim(), username.trim(), email.trim(), password);
      }
      router.replace("/home");
    } catch (err) {
      setError(
        describeError(err, isLogin ? "Couldn't log you in." : "Couldn't create your account."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function social(run: () => Promise<void>) {
    setError(null);
    setBusy(true);
    try {
      await run();
      router.replace("/home");
    } catch (err) {
      const e = err as { code?: string; message?: string };
      // Apple + Google both throw a "cancelled" variant when the user backs out.
      if (e?.code === "ERR_REQUEST_CANCELED" || e?.code === "SIGN_IN_CANCELLED") return;
      setError(describeError(err, "That sign-in didn't go through."));
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
        <ScrollView
          contentContainerClassName="grow justify-center px-6 py-10"
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center gap-3">
            <Logo size={52} />
            <PixelText style={{ fontSize: 20, color: "#eaeaec" }}>ThatFridge</PixelText>
            <Text className="text-center text-[13px] text-muted">
              Know what&apos;s inside before you open the door.
            </Text>
          </View>

          <View className="rounded-2xl border border-hairline bg-surface p-5">
            {/* mode tabs */}
            <View className="mb-5 flex-row self-start rounded-lg bg-canvas p-1">
              {(["login", "signup"] as const).map((m) => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => switchMode(m)}
                    className={`rounded-md px-5 py-2 ${active ? "bg-surface" : ""}`}
                  >
                    <Text
                      className={`text-[13px] font-bold ${active ? "text-ink" : "text-muted"}`}
                    >
                      {m === "login" ? "Log in" : "Sign up"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View className="gap-3.5">
              {!isLogin && (
                <Field
                  label="NAME"
                  value={name}
                  onChangeText={setName}
                  placeholder="Jordan Diaz"
                  autoCapitalize="words"
                />
              )}
              {!isLogin && (
                <Field
                  label="USERNAME"
                  value={username}
                  onChangeText={setUsername}
                  placeholder="jordan_diaz"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
              <Field
                label="EMAIL"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Field
                label="PASSWORD"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
              />
              {!isLogin && (
                <Field
                  label="CONFIRM PASSWORD"
                  value={confirm}
                  onChangeText={setConfirm}
                  placeholder="••••••••"
                  secureTextEntry
                />
              )}

              {error && (
                <Text className="text-[12.5px] font-semibold text-bad">{error}</Text>
              )}

              {!isLogin && (
                <Text className="text-[11.5px] leading-4 text-faint">
                  You must be at least 14 years old to use ThatFridge. By creating an
                  account, you agree to our{" "}
                  <Text
                    className="font-semibold text-muted"
                    onPress={() => Linking.openURL("https://thatfridge.com/terms")}
                  >
                    Terms
                  </Text>{" "}
                  and{" "}
                  <Text
                    className="font-semibold text-muted"
                    onPress={() => Linking.openURL("https://thatfridge.com/privacy")}
                  >
                    Privacy Policy
                  </Text>
                  .
                </Text>
              )}

              <Pressable
                onPress={submit}
                disabled={busy}
                className="mt-1 items-center rounded-lg bg-accent py-3.5 active:opacity-80"
                style={busy ? { opacity: 0.7 } : undefined}
              >
                {busy ? (
                  <ActivityIndicator color="#0a0a0c" />
                ) : (
                  <Text className="text-[14px] font-bold uppercase tracking-wide text-[#0a0a0c]">
                    {isLogin ? "Log in" : "Create account"}
                  </Text>
                )}
              </Pressable>

              {isLogin && (
                <Pressable
                  className="items-center"
                  onPress={() => router.push("/forgot-password")}
                >
                  <Text className="text-[12px] font-semibold text-muted">
                    Forgot password?
                  </Text>
                </Pressable>
              )}
            </View>
          </View>

          {(appleAvailable || !!googleAuthAvailable) && (
            <View className="mt-5 gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-px flex-1 bg-hairline" />
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-faint">
                  or
                </Text>
                <View className="h-px flex-1 bg-hairline" />
              </View>

              {appleAvailable && (
                <AppleAuthentication.AppleAuthenticationButton
                  buttonType={
                    AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
                  }
                  buttonStyle={
                    AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  }
                  cornerRadius={10}
                  style={{ height: 48, width: "100%" }}
                  onPress={() => social(signInWithApple)}
                />
              )}

              {!!googleAuthAvailable && (
                <Pressable
                  onPress={() => social(signInWithGoogle)}
                  disabled={busy}
                  className="flex-row items-center justify-center gap-2.5 rounded-[10px] bg-ink py-3.5 active:opacity-80"
                >
                  <Ionicons name="logo-google" size={16} color="#0a0a0c" />
                  <Text className="text-[14px] font-bold text-[#0a0a0c]">
                    Continue with Google
                  </Text>
                </Pressable>
              )}
            </View>
          )}

          <Pressable className="mt-5" onPress={() => switchMode(isLogin ? "signup" : "login")}>
            <Text className="text-center text-[12.5px] text-muted">
              {isLogin ? "New here? " : "Already have an account? "}
              <Text className="font-bold text-accent">
                {isLogin ? "Create an account" : "Log in"}
              </Text>
            </Text>
          </Pressable>

          {__DEV__ && (
            <Pressable
              className="mt-6 items-center"
              onPress={() => {
                setMode("login");
                setEmail("keira@thatfridge.test");
                setPassword("password123");
                setError(null);
              }}
            >
              <Text className="text-[11px] text-faint">dev · fill demo account</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & { label: string };

function Field({ label, ...input }: FieldProps) {
  return (
    <View>
      <Text className="mb-1.5 text-[12px] font-bold tracking-wide text-faint">{label}</Text>
      <TextInput
        {...input}
        placeholderTextColor="rgba(234,234,236,0.34)"
        className="rounded-lg bg-canvas px-4 py-3 text-[14px] text-ink"
      />
    </View>
  );
}
