import { useMemo, useState } from "react";
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

import { ApiError, describeError, type ProfileFields } from "@thatfridge/core";
import { useAuth } from "@/lib/auth";

/** "in 12 days" / "on 3 Oct" style — enough for the user to know when the field frees up. */
function whenFree(iso: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "soon";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function EditProfile() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [working, setWorking] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; username?: string }>({});

  const limits = user?.profileChanges ?? null;
  const nameLocked = limits ? limits.name.remaining < 1 : false;
  const usernameLocked = limits ? limits.username.remaining < 1 : false;
  const managed = user != null && limits == null;

  const changed = useMemo<ProfileFields>(() => {
    const out: ProfileFields = {};
    if (user && name.trim() !== user.name) out.name = name.trim();
    if (user && username !== user.username) out.username = username;
    return out;
  }, [user, name, username]);

  const hasChanges = Object.keys(changed).length > 0;
  // Don't let them spend a slot on a field that's already locked.
  const blocked =
    (changed.name !== undefined && nameLocked) ||
    (changed.username !== undefined && usernameLocked);

  async function save() {
    if (!hasChanges || blocked || managed) return;
    setWorking(true);
    setErrors({});
    try {
      await updateProfile(changed);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      setWorking(false);
      if (e instanceof ApiError && e.errors) {
        setErrors({
          name: e.errors.name?.[0],
          username: e.errors.username?.[0],
        });
        return;
      }
      Alert.alert("Couldn't save", describeError(e, "Please try again."));
    }
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-canvas"
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerClassName="p-6 gap-7" keyboardShouldPersistTaps="handled">
        {managed && (
          <Text className="text-[12.5px] leading-5 text-faint">
            This is a managed demo account — its name and username are fixed.
          </Text>
        )}

        <Field
          label="Display name"
          value={name}
          onChangeText={setName}
          editable={!working && !nameLocked && !managed}
          autoCapitalize="words"
          maxLength={255}
          error={errors.name}
          hint={
            nameLocked
              ? `Locked until ${whenFree(limits?.name.nextAllowedAt ?? null)}.`
              : limits
                ? `${limits.name.remaining} of ${limits.name.limit} changes left this month.`
                : undefined
          }
        />

        <Field
          label="Username"
          value={username}
          onChangeText={(t) => setUsername(t.replace(/[^a-zA-Z0-9_-]/g, ""))}
          editable={!working && !usernameLocked && !managed}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={255}
          prefix="@"
          error={errors.username}
          hint={
            usernameLocked
              ? `Locked until ${whenFree(limits?.username.nextAllowedAt ?? null)}.`
              : limits
                ? `${limits.username.remaining} of ${limits.username.limit} change${
                    limits.username.limit === 1 ? "" : "s"
                  } left this month. Letters, numbers, dashes and underscores only.`
                : undefined
          }
        />

        <Text className="text-[11.5px] leading-4 text-faint">
          Changing your username updates how friends find you. Old links to your profile
          stop working.
        </Text>

        {working ? (
          <ActivityIndicator color="#26c6da" />
        ) : (
          <Pressable
            onPress={save}
            disabled={!hasChanges || blocked || managed}
            className="items-center rounded-lg bg-accent py-3 active:opacity-80"
            style={{ opacity: !hasChanges || blocked || managed ? 0.4 : 1 }}
          >
            <Text className="font-bold uppercase tracking-wide text-[#0a0a0c]">
              Save changes
            </Text>
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
  prefix?: string;
};

function Field({ label, hint, error, prefix, ...input }: FieldProps) {
  return (
    <View className="gap-1.5">
      <Text className="text-[12px] font-bold tracking-wide text-faint">{label}</Text>
      <View
        className="flex-row items-center rounded-lg border bg-surface px-4"
        style={{ borderColor: error ? "#ff5f56" : "rgba(255,255,255,0.09)" }}
      >
        {prefix ? <Text className="text-[14px] text-faint">{prefix}</Text> : null}
        <TextInput
          {...input}
          placeholderTextColor="rgba(234,234,236,0.34)"
          className="flex-1 py-3 text-[14px] text-ink"
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
