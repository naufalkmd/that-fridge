import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  describeError,
  type Machine,
  type MachineDraft,
  type MachineStep,
  type MachineTrigger,
  type MachineUpdateInput,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { PageHeader, Eyebrow } from "@/components/ui";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

const OP_LABELS = { lt: "drops below", lte: "drops to or below", gt: "goes above", gte: "goes to or above" } as const;

function describeTrigger(trigger: MachineTrigger): string {
  if (trigger.type === "schedule") {
    const { frequency, time, weekday } = trigger.config;
    return frequency === "weekly" && weekday !== null
      ? `Every ${WEEKDAY_NAMES[weekday]} at ${formatTime(time)}`
      : `Every day at ${formatTime(time)}`;
  }
  if (trigger.type === "item_added") {
    const { search, location } = trigger.config;
    if (search && location) return `When "${search}" is added to the ${location}`;
    if (search) return `When "${search}" is added`;
    if (location) return `When an item is added to the ${location}`;
    return "When an item is added";
  }
  const { field, op, value, unit, custom_field_label } = trigger.config;
  const label = field === "custom" ? (custom_field_label ?? "custom field") : field;
  const suffix = unit ? ` ${unit}` : field === "calories" ? " kcal" : "";
  return `When total ${label} ${OP_LABELS[op]} ${value}${suffix}`;
}

const PROMPT_EXAMPLES = [
  { label: "On a schedule", prompt: "Every day at 8am, tell me total calories expiring this week" },
  { label: "When an item's added", prompt: "When milk is added, notify me" },
  { label: "When stock runs low", prompt: "Notify me when stock drops below 2" },
];

const TOOL_LABELS: Record<string, string> = {
  list_items: "List matching items",
  list_shopping: "List the shopping list",
  get_kitchen_score: "Check the kitchen score",
  sum_item_field: "Add up a field across items",
  notify_user: "Send a notification",
  add_to_shopping: "Add to the shopping list",
  add_note: "Leave a note",
  add_item: "Add an item",
  bulk_add_items: "Add several items",
};

function describeStep(step: MachineStep): string {
  const base = (() => {
    if (step.tool === "sum_item_field" && typeof step.args.field === "string") {
      const label = step.args.field === "custom" && typeof step.args.custom_field_label === "string"
        ? step.args.custom_field_label
        : step.args.field;
      return `Add up ${label} across items`;
    }
    if (step.tool === "notify_user" && typeof step.args.message === "string") {
      return `Notify: "${step.args.message}"`;
    }
    return TOOL_LABELS[step.tool] ?? step.tool;
  })();

  if (!step.condition) return base;
  const { step: refStep, op, value } = step.condition;
  return `If step ${refStep}'s total ${OP_LABELS[op]} ${value}: ${base}`;
}

type Mode = "list" | "prompt" | "review";

export default function KitchenLab() {
  const router = useRouter();
  const { colors } = useTheme();
  const { fridges } = useInventory();
  const { scope } = useScope();

  const [mode, setMode] = useState<Mode>("list");
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  const [draft, setDraft] = useState<MachineDraft | null>(null);
  const [draftName, setDraftName] = useState("");
  const [fridgeId, setFridgeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [redrafted, setRedrafted] = useState(false);
  const [running, setRunning] = useState(false);
  // True for edit/duplicate (review opened directly from a card tap, no prompt step this
  // session) - controls review's back destination and whether the fridge is a read-only
  // label vs a picker. False for a fresh create, where review's back returns to prompt.
  const [enteredDirectly, setEnteredDirectly] = useState(false);

  const load = useCallback(() => {
    api
      .listMachines()
      .then(setMachines)
      .catch(() => setMachines([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (mode === "prompt" && fridgeId === null) {
      setFridgeId(scope !== "all" ? scope : (fridges[0]?.id ?? null));
    }
  }, [mode, scope, fridges, fridgeId]);

  function openCompose() {
    setPrompt("");
    setDraftMessage(null);
    setDraft(null);
    setEditingId(null);
    setRedrafted(false);
    setEnteredDirectly(false);
    setMode("prompt");
  }

  /** Tapping an existing Machine - rename and/or redraft its trigger/steps with AI. Its
   *  fridge can't change post-creation (see MachineController::update), so fridgeId is seeded
   *  but never offered as a picker while editingId is set. */
  function openEdit(machine: Machine) {
    setEditingId(machine.id);
    setRedrafted(false);
    setEnteredDirectly(true);
    setDraft({ name: machine.name, trigger: machine.trigger, steps: machine.steps });
    setDraftName(machine.name);
    setFridgeId(machine.fridgeId);
    setPrompt(machine.prompt ?? "");
    setDraftMessage(null);
    setMode("review");
  }

  /** Copies an existing Machine's trigger/steps into a new unsaved draft - no AI call, Save
   *  creates a separate Machine rather than editing this one. */
  function openDuplicate(machine: Machine) {
    setEditingId(null);
    setRedrafted(false);
    setEnteredDirectly(true);
    setDraft({ name: machine.name, trigger: machine.trigger, steps: machine.steps });
    setDraftName(`${machine.name} copy`.slice(0, 60));
    setFridgeId(machine.fridgeId);
    setPrompt(machine.prompt ?? "");
    setDraftMessage(null);
    setMode("review");
  }

  async function runDraft() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setDrafting(true);
    setDraftMessage(null);
    try {
      const result = await api.draftMachine(trimmed);
      if (!result.ok || !result.draft) {
        setDraftMessage(result.message ?? "Couldn't draft a Machine from that - try describing it differently.");
        return;
      }
      setDraft(result.draft);
      setDraftName(result.draft.name);
      if (editingId) setRedrafted(true);
      setMode("review");
    } catch (e) {
      setDraftMessage(describeError(e, "Couldn't draft a Machine right now."));
    } finally {
      setDrafting(false);
    }
  }

  async function saveMachine() {
    if (!draft || !fridgeId) return;
    setSaving(true);
    try {
      if (editingId) {
        const original = machines?.find((m) => m.id === editingId);
        const trimmedName = draftName.trim() || draft.name;
        const payload: MachineUpdateInput = {};
        if (!original || trimmedName !== original.name) payload.name = trimmedName;
        if (redrafted) {
          payload.trigger = draft.trigger;
          payload.steps = draft.steps;
          payload.prompt = prompt;
        }
        if (Object.keys(payload).length > 0) {
          await api.updateMachine(editingId, payload);
        }
      } else {
        await api.createMachine({
          name: draftName.trim() || draft.name,
          prompt,
          fridge_id: fridgeId,
          trigger: draft.trigger,
          steps: draft.steps,
        });
      }
      setMode("list");
      setDraft(null);
      setEditingId(null);
      setRedrafted(false);
      setEnteredDirectly(false);
      load();
    } catch (e) {
      Alert.alert("Couldn't save", describeError(e, "Try again in a moment."));
    } finally {
      setSaving(false);
    }
  }

  /** Tests the *saved* Machine immediately, regardless of its trigger or enabled state - only
   *  offered when there's no unsaved redraft in progress, since running would otherwise test
   *  the old saved steps while the screen shows different ones. */
  async function runNow() {
    if (!editingId) return;
    setRunning(true);
    try {
      const updated = await api.runMachine(editingId);
      Alert.alert(
        updated.lastRunStatus === "failed" ? "Run failed" : "Ran successfully",
        updated.lastRunStatus === "failed" ? (updated.lastRunError ?? "No error details.") : "Check Notifications for the result.",
      );
      load();
    } catch (e) {
      Alert.alert("Couldn't run", describeError(e, "Try again in a moment."));
    } finally {
      setRunning(false);
    }
  }

  async function toggleEnabled(machine: Machine) {
    setBusyId(machine.id);
    const next = !machine.enabled;
    setMachines((prev) => prev?.map((m) => (m.id === machine.id ? { ...m, enabled: next } : m)) ?? null);
    try {
      await api.updateMachine(machine.id, { enabled: next });
    } catch (e) {
      setMachines((prev) => prev?.map((m) => (m.id === machine.id ? { ...m, enabled: !next } : m)) ?? null);
      Alert.alert("Couldn't update", describeError(e, "Try again in a moment."));
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(machine: Machine) {
    Alert.alert(machine.name, "Delete this Machine? This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusyId(machine.id);
          try {
            await api.deleteMachine(machine.id);
            setMachines((prev) => prev?.filter((m) => m.id !== machine.id) ?? null);
          } catch (e) {
            Alert.alert("Couldn't delete", describeError(e, "Try again in a moment."));
          } finally {
            setBusyId(null);
          }
        },
      },
    ]);
  }

  if (mode === "prompt") {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
        <ComposeHeader
          title={editingId ? "Redraft Machine" : "New Machine"}
          onBack={() => setMode(draft ? "review" : "list")}
        />
        <ScrollView contentContainerClassName="p-5 gap-4" keyboardShouldPersistTaps="handled">
          <Text className="text-[13px] leading-5 text-muted">
            Describe what you want automated. The crew drafts a trigger and steps for you to
            review before anything is saved.
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {PROMPT_EXAMPLES.map((example) => (
              <Pressable
                key={example.label}
                onPress={() => setPrompt(example.prompt)}
                className="rounded-lg px-3 py-2"
                style={{ backgroundColor: colors.surface2 }}
              >
                <Text className="text-[12px] font-semibold text-ink">{example.label}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder='e.g. "Every Monday at 8am, tell me total calories expiring this week"'
            placeholderTextColor={colors.faint}
            multiline
            className="min-h-[110px] rounded-xl border border-hairline bg-surface p-4 text-[14px] text-ink"
            style={{ textAlignVertical: "top" }}
          />
          {draftMessage && (
            <Text className="text-[12.5px] text-bad">{draftMessage}</Text>
          )}
          <Pressable
            onPress={runDraft}
            disabled={drafting || !prompt.trim()}
            className="items-center rounded-lg bg-accent py-3 active:opacity-80 disabled:opacity-50"
          >
            {drafting ? (
              <ActivityIndicator color={colors.canvas} />
            ) : (
              <Text className="font-bold uppercase tracking-wide text-on-accent">
                Draft with AI · 2 credits
              </Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === "review" && draft) {
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
        <ComposeHeader
          title={editingId ? "Edit Machine" : "Review Machine"}
          onBack={() => setMode(enteredDirectly ? "list" : "prompt")}
        />
        <ScrollView contentContainerClassName="p-5 gap-5">
          <View className="gap-1.5">
            <Eyebrow color={colors.faint}>Name</Eyebrow>
            <TextInput
              value={draftName}
              onChangeText={setDraftName}
              maxLength={60}
              className="rounded-lg border border-hairline bg-surface px-3.5 py-3 text-[15px] font-semibold text-ink"
            />
          </View>

          <View className="gap-1.5">
            <Eyebrow color={colors.faint}>Trigger</Eyebrow>
            <View className="rounded-lg border border-hairline bg-surface px-3.5 py-3">
              <Text className="text-[14px] text-ink">{describeTrigger(draft.trigger)}</Text>
            </View>
          </View>

          <View className="gap-1.5">
            <Eyebrow color={colors.faint}>Steps</Eyebrow>
            <View className="overflow-hidden rounded-lg border border-hairline bg-surface">
              {draft.steps.map((step, i) => (
                <View
                  key={i}
                  className={`flex-row gap-2.5 px-3.5 py-3 ${
                    i < draft.steps.length - 1 ? "border-b border-hairline" : ""
                  }`}
                >
                  <Text className="text-[13px] font-bold text-accent">{i + 1}</Text>
                  <Text className="flex-1 text-[13.5px] text-ink">{describeStep(step)}</Text>
                </View>
              ))}
            </View>
          </View>

          {editingId && !redrafted && (
            <Pressable
              onPress={runNow}
              disabled={running}
              className="flex-row items-center justify-center gap-2 rounded-lg border border-hairline py-3 active:opacity-70 disabled:opacity-50"
            >
              {running ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Ionicons name="play" size={14} color={colors.accent} />
                  <Text className="text-[13px] font-semibold text-ink">Run now</Text>
                </>
              )}
            </Pressable>
          )}

          {enteredDirectly && (
            <Pressable
              onPress={() => setMode("prompt")}
              className="items-center rounded-lg border border-hairline py-3 active:opacity-70"
            >
              <Text className="text-[13px] font-semibold text-ink">
                Redraft trigger &amp; steps with AI · 2 credits
              </Text>
            </Pressable>
          )}

          {editingId ? (
            <View className="gap-1.5">
              <Eyebrow color={colors.faint}>Fridge</Eyebrow>
              <View className="rounded-lg border border-hairline bg-surface px-3.5 py-3">
                <Text className="text-[14px] text-ink">
                  {fridges.find((f) => f.id === fridgeId)?.name ?? "—"}
                </Text>
              </View>
            </View>
          ) : (
            fridges.length > 1 && (
              <View className="gap-1.5">
                <Eyebrow color={colors.faint}>Fridge</Eyebrow>
                <View className="flex-row flex-wrap gap-2">
                  {fridges.map((f) => {
                    const active = fridgeId === f.id;
                    return (
                      <Pressable
                        key={f.id}
                        onPress={() => setFridgeId(f.id)}
                        className="rounded-lg px-3.5 py-2"
                        style={{ backgroundColor: active ? colors.accent : colors.surface2 }}
                      >
                        <Text
                          className="text-[12.5px] font-bold"
                          style={{ color: active ? colors.canvas : colors.ink }}
                        >
                          {f.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )
          )}

          <Pressable
            onPress={saveMachine}
            disabled={saving || !fridgeId}
            className="items-center rounded-lg bg-accent py-3 active:opacity-80 disabled:opacity-50"
          >
            {saving ? (
              <ActivityIndicator color={colors.canvas} />
            ) : (
              <Text className="font-bold uppercase tracking-wide text-on-accent">
                {editingId ? "Save Changes" : "Save Machine"}
              </Text>
            )}
          </Pressable>
          {!editingId && (
            <Text className="text-center text-[11.5px] text-faint">
              Saved off, ready to switch on from the list. Nothing runs until you enable it.
            </Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <View className="flex-row items-start justify-between">
        <PageHeader title="Kitchen Lab" subtitle="Automations that run on their own — beta" />
        <Pressable onPress={openCompose} hitSlop={10} className="mr-4 mt-4 active:opacity-70">
          <Ionicons name="add-circle" size={28} color={colors.accent} />
        </Pressable>
      </View>

      {machines === null ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
      ) : machines.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-10">
          <Ionicons name="flask-outline" size={40} color={colors.faint} />
          <Text className="text-center text-[13.5px] leading-5 text-muted">
            No Machines yet. Describe an automation in plain English and the crew builds it —
            you just switch it on.
          </Text>
          <Pressable
            onPress={openCompose}
            className="mt-2 items-center rounded-lg bg-accent px-5 py-3 active:opacity-80"
          >
            <Text className="font-bold uppercase tracking-wide text-on-accent">Create a Machine</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerClassName="gap-3 p-5">
          {machines.map((machine) => (
            <Pressable
              key={machine.id}
              onPress={() => openEdit(machine)}
              className="rounded-xl border border-hairline bg-surface p-4 active:opacity-80"
            >
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1 gap-1">
                  <Text className="text-[15px] font-bold text-ink">{machine.name}</Text>
                  <Text className="text-[12.5px] text-faint">{describeTrigger(machine.trigger)}</Text>
                </View>
                <Switch
                  value={machine.enabled}
                  onValueChange={() => toggleEnabled(machine)}
                  disabled={busyId === machine.id}
                  trackColor={{ true: colors.accent, false: colors.hairline }}
                  thumbColor={colors.ink}
                />
              </View>
              <View className="mt-3 border-t border-hairline pt-3">
                <View className="flex-row items-center justify-between">
                  <Text className="text-[11.5px] text-faint">
                    {machine.lastRunAt
                      ? `Last ran ${machine.lastRunStatus === "failed" ? "and failed" : "ok"} · ${machine.runCount} run${machine.runCount === 1 ? "" : "s"}`
                      : "Never run yet"}
                  </Text>
                  <View className="flex-row items-center gap-4">
                    <Pressable onPress={() => openDuplicate(machine)} hitSlop={8} disabled={busyId === machine.id}>
                      <Ionicons name="copy-outline" size={16} color={colors.faint} />
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(machine)} hitSlop={8} disabled={busyId === machine.id}>
                      <Ionicons name="trash-outline" size={16} color={colors.faint} />
                    </Pressable>
                  </View>
                </View>
                {machine.lastRunStatus === "failed" && machine.lastRunError && (
                  <Text className="mt-1.5 text-[11px] text-bad" numberOfLines={2}>
                    {machine.lastRunError.slice(0, 140)}
                  </Text>
                )}
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function ComposeHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-3 px-4 pb-3 pt-4">
      <Pressable onPress={onBack} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={colors.muted} />
      </Pressable>
      <Text className="text-[15px] font-bold text-ink">{title}</Text>
    </View>
  );
}
