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
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  describeError,
  timeAgo,
  type Machine,
  type MachineDraft,
  type MachineDryRunResult,
  type MachineRun,
  type MachineStep,
  type MachineTrigger,
  type MachineUpdateInput,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useTheme } from "@/lib/theme";
import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { MACHINE_TEMPLATES, type MachineTemplate } from "@/lib/machineTemplates";
import { getDeviceTimezone } from "@/lib/timezone";
import { findOverlappingMachine } from "@/lib/machineOverlap";
import { describeMachineError, setStepArg, type ArgPath } from "@/lib/machineEdit";
import { StepValuesEditor, TriggerValuesEditor } from "@/components/machine-editor";
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
  if (trigger.type === "recipe_made") {
    return "When you mark a recipe made";
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
  { label: "When you cook something", prompt: "When I mark any recipe as made, notify me" },
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
  mark_recipe_made: "Mark a recipe made",
  mark_items_used_matching: "Mark matching items as used",
};

/** Plain-English summary of a step's filter args - shared by sum_item_field and
 *  mark_items_used_matching, the two tools that take this filter shape. */
function describeFilter(args: MachineStep["args"]): string {
  if (typeof args.search === "string") return `matching "${args.search}"`;
  if (args.expired_only) return "already expired";
  if (typeof args.expiring_within_days === "number") return `expiring within ${args.expiring_within_days}d`;
  if (typeof args.location === "string") return `in the ${args.location}`;
  return "across items";
}

function describeStep(step: MachineStep): string {
  const base = (() => {
    if (step.tool === "sum_item_field" && typeof step.args.field === "string") {
      const label = step.args.field === "custom" && typeof step.args.custom_field_label === "string"
        ? step.args.custom_field_label
        : step.args.field;
      return `Add up ${label} ${describeFilter(step.args)}`;
    }
    if (step.tool === "mark_items_used_matching") {
      return `Mark items ${describeFilter(step.args)} as used`;
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
  const { fridges, refresh: refreshInventory } = useInventory();
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
  const [runs, setRuns] = useState<MachineRun[] | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<MachineDryRunResult | null>(null);
  const [undoingRunId, setUndoingRunId] = useState<string | null>(null);
  const [editingTrigger, setEditingTrigger] = useState(false);
  const [editingStepIndex, setEditingStepIndex] = useState<number | null>(null);
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

  // Opened from the calendar's "+ New automation": go straight to composing one.
  const params = useLocalSearchParams<{ new?: string; draft?: string }>();
  useEffect(() => {
    if (params.new === "1") openCompose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.new]);

  // Opened from Explore's "Use this Machine": review the draft it handed over (JSON in `draft`).
  useEffect(() => {
    if (!params.draft) return;
    try {
      const parsed = JSON.parse(params.draft) as MachineDraft;
      if (parsed && typeof parsed.name === "string" && parsed.trigger && Array.isArray(parsed.steps)) openDraft(parsed);
    } catch {
      // A garbled draft just leaves the list showing.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.draft]);

  // Collapse the value editors whenever a different Machine/draft (or screen) is opened.
  useEffect(() => {
    setEditingTrigger(false);
    setEditingStepIndex(null);
  }, [mode, editingId]);

  useEffect(() => {
    if (mode === "prompt" && fridgeId === null) {
      setFridgeId(scope !== "all" ? scope : (fridges[0]?.id ?? null));
    }
  }, [mode, scope, fridges, fridgeId]);

  /** Fetches a Machine's execution history for the review screen. Only meaningful for an
   *  already-saved Machine (editingId set) - a fresh/duplicated/template draft has no runs
   *  yet, so those paths just clear it instead of fetching. */
  function loadRuns(machineId: string) {
    setRuns(null);
    api
      .listMachineRuns(machineId)
      .then(setRuns)
      .catch(() => setRuns([]));
  }

  function openCompose() {
    setPrompt("");
    setDraftMessage(null);
    setDraft(null);
    setEditingId(null);
    setRuns(null);
    setDryRunResult(null);
    setRedrafted(false);
    setEnteredDirectly(false);
    setMode("prompt");
  }

  /** Tapping an existing Machine - rename, redraft its trigger/steps with AI, or move it to
   *  another fridge (fridgeId is seeded with its current one and offered as a picker). */
  function openEdit(machine: Machine) {
    setEditingId(machine.id);
    setRedrafted(false);
    setEnteredDirectly(true);
    setDraft({ name: machine.name, trigger: machine.trigger, steps: machine.steps });
    setDraftName(machine.name);
    setFridgeId(machine.fridgeId);
    setPrompt(machine.prompt ?? "");
    setDraftMessage(null);
    setDryRunResult(null);
    setMode("review");
    loadRuns(machine.id);
  }

  /** Copies an existing Machine's trigger/steps into a new unsaved draft - no AI call, Save
   *  creates a separate Machine rather than editing this one. */
  function openDuplicate(machine: Machine) {
    setEditingId(null);
    setRuns(null);
    setDryRunResult(null);
    setRedrafted(false);
    setEnteredDirectly(true);
    setDraft({ name: machine.name, trigger: machine.trigger, steps: machine.steps });
    setDraftName(`${machine.name} copy`.slice(0, 60));
    setFridgeId(machine.fridgeId);
    setPrompt(machine.prompt ?? "");
    setDraftMessage(null);
    setMode("review");
  }

  /** Jumps a curated template straight to review - no draftMachine() call, so no credit
   *  spent, same as edit/duplicate above. Redrafting with AI is still offered from review.
   *  Goes straight to "review", skipping the "prompt" step whose effect normally seeds
   *  fridgeId - seed it here the same way so a single-fridge user isn't left with Save
   *  disabled by a still-null fridgeId. */
  function openTemplate(template: MachineTemplate) {
    openDraft(template.build());
  }

  /** Review a ready-made draft (a curated template, or one taken from Explore) - see openTemplate. */
  function openDraft(built: MachineDraft) {
    setEditingId(null);
    setRuns(null);
    setDryRunResult(null);
    setRedrafted(false);
    setEnteredDirectly(true);
    setDraft(built);
    setDraftName(built.name);
    setFridgeId(scope !== "all" ? scope : (fridges[0]?.id ?? null));
    setPrompt("");
    setDraftMessage(null);
    setMode("review");
  }

  /** A hand-edit to a saved Machine's trigger/steps is saved the same way a redraft is (see
   *  commitSaveMachine) and, like one, means "Run now"/"Dry run" would test the old saved
   *  version rather than what's on screen - so it flips the same flag and drops any preview. */
  function markStructureEdited() {
    if (editingId) setRedrafted(true);
    setDryRunResult(null);
  }

  function editTrigger(trigger: MachineTrigger) {
    setDraft((d) => (d ? { ...d, trigger } : d));
    markStructureEdited();
  }

  function editSteps(steps: MachineStep[]) {
    setDraft((d) => (d ? { ...d, steps } : d));
    markStructureEdited();
  }

  function editStepArg(stepIndex: number, path: ArgPath, value: unknown) {
    setDraft((d) => (d ? { ...d, steps: setStepArg(d.steps, stepIndex, path, value) } : d));
    markStructureEdited();
  }

  /** Confirms/edits a schedule trigger's timezone in place - the only field on the review
   *  screen that isn't already covered by name/trigger-description/steps editing. */
  function updateScheduleTimezone(timezone: string) {
    setDraft((d) => {
      if (!d || d.trigger.type !== "schedule") return d;
      return { ...d, trigger: { ...d.trigger, config: { ...d.trigger.config, timezone } } };
    });
  }

  /** The AI drafter has no notion of the user's actual timezone, so a fresh schedule draft
   *  lands with whatever the server defaulted to (UTC) - swap that placeholder for the
   *  device's own zone as a convenient starting point, still editable before saving. Never
   *  overrides a zone someone has already deliberately confirmed. */
  function withDeviceTimezoneDefault(d: MachineDraft): MachineDraft {
    if (d.trigger.type !== "schedule") return d;
    const tz = d.trigger.config.timezone;
    if (tz && tz !== "UTC") return d;
    return { ...d, trigger: { ...d.trigger, config: { ...d.trigger.config, timezone: getDeviceTimezone() } } };
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
      const normalizedDraft = withDeviceTimezoneDefault(result.draft);
      setDraft(normalizedDraft);
      setDraftName(normalizedDraft.name);
      if (editingId) {
        setRedrafted(true);
        // The saved Machine's steps haven't changed yet, but a stale preview of them next to
        // a freshly-redrafted (different, unsaved) set of steps would be confusing either way.
        setDryRunResult(null);
      }
      setMode("review");
    } catch (e) {
      setDraftMessage(describeError(e, "Couldn't draft a Machine right now."));
    } finally {
      setDrafting(false);
    }
  }

  /** A saved Machine's enabled state never changes here (see MachineController::update -
   *  `enabled` is a separate, opt-in field this screen never sends), so the only moment a
   *  save could newly create a live duplicate is redrafting an already-*enabled* Machine's
   *  trigger. Same reviewable Cancel / Save anyway treatment as toggleEnabled. */
  const fridgeChanged = !!editingId && fridgeId !== null && fridgeId !== machines?.find((m) => m.id === editingId)?.fridgeId;

  function saveMachine() {
    if (!draft || !fridgeId) return;
    if (editingId && (redrafted || fridgeChanged)) {
      const original = machines?.find((m) => m.id === editingId);
      if (original?.enabled) {
        const overlap = findOverlappingMachine(machines ?? [], draft.trigger, fridgeId, editingId);
        if (overlap) {
          Alert.alert(
            "Possible duplicate",
            `"${overlap.name}" already runs on the same trigger — ${describeTrigger(overlap.trigger)}. Since this Machine is on too, that could send duplicate notifications.`,
            [
              { text: "Cancel", style: "cancel" },
              { text: "Save anyway", onPress: () => commitSaveMachine() },
            ],
          );
          return;
        }
      }
    }
    commitSaveMachine();
  }

  async function commitSaveMachine() {
    if (!draft || !fridgeId) return;
    setSaving(true);
    try {
      if (editingId) {
        const original = machines?.find((m) => m.id === editingId);
        const trimmedName = draftName.trim() || draft.name;
        const payload: MachineUpdateInput = {};
        if (!original || trimmedName !== original.name) payload.name = trimmedName;
        if (original && fridgeId !== original.fridgeId) payload.fridge_id = fridgeId;
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
      Alert.alert("Couldn't save", describeMachineError(e, "Try again in a moment."));
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
      loadRuns(editingId);
    } catch (e) {
      Alert.alert("Couldn't run", describeError(e, "Try again in a moment."));
    } finally {
      setRunning(false);
    }
  }

  /** No-write test mode - shows what the *saved* Machine's steps would do without doing any
   *  of it (see AgentToolbox::preview / MachineRunner::dryRun). Only offered alongside "Run
   *  now" for the same reason: it tests what's actually saved, not an unsaved redraft. */
  async function runDryRun() {
    if (!editingId) return;
    setDryRunning(true);
    setDryRunResult(null);
    try {
      setDryRunResult(await api.dryRunMachine(editingId));
    } catch (e) {
      Alert.alert("Couldn't preview", describeError(e, "Try again in a moment."));
    } finally {
      setDryRunning(false);
    }
  }

  /** Reverses one run's undoable steps (added items/notes/shopping entries, restored items a
   *  mark_items_used_matching step deleted) - see AgentToolbox::undoStep for exactly what's
   *  covered. Explicit confirm first since this touches real inventory data, same treatment
   *  as confirmDelete below. */
  function confirmUndoRun(run: MachineRun) {
    Alert.alert(
      "Undo this run?",
      "This reverses what it added or restores what it marked used. It can't be undone twice.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Undo", style: "destructive", onPress: () => undoRun(run) },
      ],
    );
  }

  async function undoRun(run: MachineRun) {
    if (!editingId) return;
    setUndoingRunId(run.id);
    try {
      const { summaries } = await api.undoMachineRun(editingId, run.id);
      Alert.alert("Undone", summaries.join("\n"));
      loadRuns(editingId);
      refreshInventory();
    } catch (e) {
      Alert.alert("Couldn't undo", describeError(e, "Try again in a moment."));
    } finally {
      setUndoingRunId(null);
    }
  }

  async function applyToggleEnabled(machine: Machine, next: boolean) {
    setBusyId(machine.id);
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

  /** Detects an overlapping already-enabled Machine before turning this one on too -
   *  reviewable (Cancel / Enable anyway), never silently blocked, merged, or deleted. */
  function toggleEnabled(machine: Machine) {
    const next = !machine.enabled;
    if (next) {
      const overlap = findOverlappingMachine(machines ?? [], machine.trigger, machine.fridgeId, machine.id);
      if (overlap) {
        Alert.alert(
          "Possible duplicate",
          `"${overlap.name}" already runs on the same trigger — ${describeTrigger(overlap.trigger)}. Turning both on could send duplicate notifications.`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Enable anyway", onPress: () => applyToggleEnabled(machine, next) },
          ],
        );
        return;
      }
    }
    applyToggleEnabled(machine, next);
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
          {!editingId && (
            <View className="gap-2">
              <Eyebrow color={colors.faint}>Start from a template · no credits</Eyebrow>
              {MACHINE_TEMPLATES.map((template) => (
                <TemplateCard key={template.id} template={template} onPress={() => openTemplate(template)} />
              ))}
            </View>
          )}
          <Text className="text-[13px] leading-5 text-muted">
            Or describe what you want automated. The crew drafts a trigger and steps for you to
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
              <View className="flex-row items-center justify-between gap-3">
                <Text className="flex-1 text-[14px] text-ink">{describeTrigger(draft.trigger)}</Text>
                {draft.trigger.type !== "recipe_made" && (
                  <Pressable onPress={() => setEditingTrigger((v) => !v)} hitSlop={8}>
                    <Text className="text-[12px] font-bold text-accent">{editingTrigger ? "Done" : "Edit"}</Text>
                  </Pressable>
                )}
              </View>
              {editingTrigger && <TriggerValuesEditor trigger={draft.trigger} onChange={editTrigger} />}
            </View>
          </View>

          {draft.trigger.type === "schedule" && (
            <View className="gap-1.5">
              <Eyebrow color={colors.faint}>Timezone</Eyebrow>
              <View className="flex-row items-center gap-2 rounded-lg border border-hairline bg-surface px-3.5 py-1">
                <TextInput
                  value={draft.trigger.config.timezone}
                  onChangeText={updateScheduleTimezone}
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholder="e.g. Asia/Kuala_Lumpur"
                  placeholderTextColor={colors.faint}
                  className="flex-1 py-2 text-[13.5px] text-ink"
                />
                <Pressable onPress={() => updateScheduleTimezone(getDeviceTimezone())} hitSlop={6}>
                  <Text className="text-[11.5px] font-bold text-accent">Use device</Text>
                </Pressable>
              </View>
              <Text className="text-[11px] text-faint">
                This schedule runs in this timezone - confirm it's right before saving.
              </Text>
            </View>
          )}

          <View className="gap-1.5">
            <Eyebrow color={colors.faint}>Steps</Eyebrow>
            <View className="overflow-hidden rounded-lg border border-hairline bg-surface">
              {draft.steps.map((step, i) => (
                <View
                  key={i}
                  className={`px-3.5 py-3 ${i < draft.steps.length - 1 ? "border-b border-hairline" : ""}`}
                >
                  <View className="flex-row gap-2.5">
                    <Text className="text-[13px] font-bold text-accent">{i + 1}</Text>
                    <Text className="flex-1 text-[13.5px] text-ink">{describeStep(step)}</Text>
                    {(Object.keys(step.args).length > 0 || step.condition) && (
                      <Pressable onPress={() => setEditingStepIndex((cur) => (cur === i ? null : i))} hitSlop={8}>
                        <Text className="text-[12px] font-bold text-accent">
                          {editingStepIndex === i ? "Done" : "Edit"}
                        </Text>
                      </Pressable>
                    )}
                  </View>
                  {editingStepIndex === i && (
                    <StepValuesEditor
                      step={step}
                      index={i}
                      steps={draft.steps}
                      onSetArg={editStepArg}
                      onChangeSteps={editSteps}
                    />
                  )}
                </View>
              ))}
            </View>
          </View>

          {editingId && !redrafted && (
            <View className="flex-row gap-2.5">
              <Pressable
                onPress={runNow}
                disabled={running}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-hairline py-3 active:opacity-70 disabled:opacity-50"
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
              <Pressable
                onPress={runDryRun}
                disabled={dryRunning}
                className="flex-1 flex-row items-center justify-center gap-2 rounded-lg border border-hairline py-3 active:opacity-70 disabled:opacity-50"
              >
                {dryRunning ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <>
                    <Ionicons name="eye-outline" size={14} color={colors.accent} />
                    <Text className="text-[13px] font-semibold text-ink">Dry run</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {dryRunResult && (
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Eyebrow color={colors.faint}>Dry run preview</Eyebrow>
                <Pressable onPress={() => setDryRunResult(null)} hitSlop={8}>
                  <Ionicons name="close" size={16} color={colors.faint} />
                </Pressable>
              </View>
              <Text className="text-[11px] text-faint">
                A preview only - nothing was saved and no notification was sent.
              </Text>
              <View
                className="overflow-hidden rounded-lg border border-dashed bg-surface"
                style={{ borderColor: colors.accent }}
              >
                {dryRunResult.steps.map((step, i) => (
                  <View
                    key={i}
                    className={`gap-1 px-3.5 py-3 ${i < dryRunResult.steps.length - 1 ? "border-b border-hairline" : ""}`}
                  >
                    <Text
                      className="text-[12px]"
                      style={{ color: step.skipped ? colors.faint : step.ok ? colors.ink : colors.bad }}
                      numberOfLines={3}
                    >
                      {step.skipped ? "○" : step.ok ? "✓" : "✕"} {TOOL_LABELS[step.tool] ?? step.tool}
                      {step.content ? ` — ${step.content}` : ""}
                    </Text>
                  </View>
                ))}
              </View>
              {dryRunResult.status === "failed" && dryRunResult.error && (
                <Text className="text-[11.5px] text-bad">{dryRunResult.error}</Text>
              )}
            </View>
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

          {editingId && (
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Eyebrow color={colors.faint}>Execution history</Eyebrow>
                <Pressable onPress={() => router.push("/notifications")} hitSlop={8}>
                  <Text className="text-[11.5px] font-bold text-accent">View notifications</Text>
                </Pressable>
              </View>
              {runs === null ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
              ) : runs.length === 0 ? (
                <Text className="text-[12.5px] text-faint">
                  No runs yet - enable this Machine or tap Run now to see history here.
                </Text>
              ) : (
                <View className="overflow-hidden rounded-lg border border-hairline bg-surface">
                  {runs.map((run, i) => (
                    <View
                      key={run.id}
                      className={`gap-1.5 px-3.5 py-3 ${i < runs.length - 1 ? "border-b border-hairline" : ""}`}
                    >
                      <View className="flex-row items-center justify-between gap-2">
                        <View className="flex-row items-center gap-2">
                          <Ionicons
                            name={run.status === "failed" ? "close-circle" : "checkmark-circle"}
                            size={14}
                            color={run.status === "failed" ? colors.bad : colors.good}
                          />
                          <Text className="text-[12.5px] font-bold text-ink">
                            {run.status === "failed" ? "Failed" : "Ran successfully"}
                          </Text>
                          <Text className="text-[11px] text-faint">{timeAgo(new Date(run.startedAt).getTime())}</Text>
                        </View>
                        {run.undoable ? (
                          <Pressable
                            onPress={() => confirmUndoRun(run)}
                            disabled={undoingRunId === run.id}
                            hitSlop={8}
                          >
                            {undoingRunId === run.id ? (
                              <ActivityIndicator size="small" color={colors.bad} />
                            ) : (
                              <Text className="text-[11px] font-bold text-bad">Undo</Text>
                            )}
                          </Pressable>
                        ) : (
                          run.undoneAt && <Text className="text-[11px] text-faint">Undone</Text>
                        )}
                      </View>
                      {run.error && (
                        <Text className="text-[11.5px] text-bad" numberOfLines={2}>
                          {run.error}
                        </Text>
                      )}
                      {run.steps.map((step, si) => (
                        <Text
                          key={si}
                          className="text-[11.5px]"
                          style={{ color: step.skipped ? colors.faint : step.ok ? colors.muted : colors.bad }}
                          numberOfLines={2}
                        >
                          {step.skipped ? "○" : step.ok ? "✓" : "✕"} {TOOL_LABELS[step.tool] ?? step.tool}
                          {step.content ? ` — ${step.content}` : ""}
                        </Text>
                      ))}
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {fridges.length > 1 && (
            <View className="gap-1.5">
              <Eyebrow color={colors.faint}>Fridge</Eyebrow>
              <View className="flex-row flex-wrap gap-2">
                {fridges.map((f) => {
                  const active = fridgeId === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setFridgeId(f.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
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
              {fridgeChanged && (
                <Text className="text-[11.5px] text-faint">
                  Its runs will use this fridge&apos;s items once you save.
                </Text>
              )}
            </View>
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
            No Machines yet. Pick a template or describe an automation in plain English and the
            crew builds it — you just switch it on.
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

function TemplateCard({ template, onPress }: { template: MachineTemplate; onPress: () => void }) {
  const { colors } = useTheme();
  const color = template.color(colors);
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-lg border border-hairline bg-surface p-3.5 active:opacity-80"
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-md"
        style={{ backgroundColor: `${color}1a` }}
      >
        <MaterialCommunityIcons name={template.icon} size={17} color={color} />
      </View>
      <View className="flex-1">
        <Text className="text-[13.5px] font-bold text-ink">{template.label}</Text>
        <Text className="text-[11.5px] text-faint">{template.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={15} color={colors.faint} />
    </Pressable>
  );
}
