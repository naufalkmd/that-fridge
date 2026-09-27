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
import { PixelText } from "@/components/brand";

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
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 48, gap: 22 }} keyboardShouldPersistTaps="handled">
          <ScreenTitle title={editingId ? "Redraft Machine" : "New Machine"} onBack={() => setMode(draft ? "review" : "list")} />

          {!editingId && (
            <View style={{ gap: 8 }}>
              <SectionLabel right="Free">Start from a template</SectionLabel>
              <Card>
                {MACHINE_TEMPLATES.map((template, i) => (
                  <TemplateRow key={template.id} template={template} last={i === MACHINE_TEMPLATES.length - 1} onPress={() => openTemplate(template)} />
                ))}
              </Card>
            </View>
          )}

          <View style={{ gap: 8 }}>
            <SectionLabel>{editingId ? "Describe the change" : "Or describe it"}</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {PROMPT_EXAMPLES.map((example) => (
                <Pressable
                  key={example.label}
                  onPress={() => setPrompt(example.prompt)}
                  style={{ height: 30, paddingHorizontal: 10, borderCurve: "continuous", borderRadius: 8, justifyContent: "center", backgroundColor: colors.surface2 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: colors.muted }}>{example.label}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder='e.g. "Every Monday at 8am, tell me total calories expiring this week"'
              placeholderTextColor={colors.faint}
              multiline
              style={{
                minHeight: 110, padding: 14, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline,
                backgroundColor: colors.surface, fontSize: 14, lineHeight: 20, color: colors.ink, textAlignVertical: "top",
              }}
            />
            {draftMessage && <Text style={{ fontSize: 12.5, color: colors.bad }}>{draftMessage}</Text>}
            <PrimaryButton onPress={runDraft} disabled={drafting || !prompt.trim()} busy={drafting} icon="sparkles">
              Draft with AI · 2 credits
            </PrimaryButton>
            <Text style={{ fontSize: 11.5, color: colors.faint, textAlign: "center" }}>You review it before anything is saved.</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (mode === "review" && draft) {
    const canTest = !!editingId && !redrafted;
    return (
      <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
          <ScreenTitle title={editingId ? "Edit Machine" : "Review Machine"} onBack={() => setMode(enteredDirectly ? "list" : "prompt")} />

          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            maxLength={60}
            accessibilityLabel="Machine name"
            style={{ height: 48, paddingHorizontal: 14, borderCurve: "continuous", borderRadius: 16, backgroundColor: colors.surface2, fontSize: 15, fontWeight: "600", color: colors.ink }}
          />

          {/* When: the trigger in one line, editable in place. */}
          <View style={{ gap: 8 }}>
            <SectionLabel>When</SectionLabel>
            <Card padded>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <IconChip icon={TRIGGER_ICON[draft.trigger.type]} color={colors.accent} />
                <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.ink }}>{describeTrigger(draft.trigger)}</Text>
                {draft.trigger.type !== "recipe_made" && <EditPill open={editingTrigger} onPress={() => setEditingTrigger((v) => !v)} />}
              </View>
              {editingTrigger && <TriggerValuesEditor trigger={draft.trigger} onChange={editTrigger} />}
              {draft.trigger.type === "schedule" && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.hairline }}>
                  <Ionicons name="globe-outline" size={15} color={colors.faint} />
                  <TextInput
                    value={draft.trigger.config.timezone}
                    onChangeText={updateScheduleTimezone}
                    autoCapitalize="none"
                    autoCorrect={false}
                    accessibilityLabel="Timezone"
                    placeholder="e.g. Asia/Kuala_Lumpur"
                    placeholderTextColor={colors.faint}
                    style={{ flex: 1, fontSize: 13, color: colors.ink, paddingVertical: 4 }}
                  />
                  <Pressable onPress={() => updateScheduleTimezone(getDeviceTimezone())} hitSlop={6}>
                    <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.accent }}>Use device</Text>
                  </Pressable>
                </View>
              )}
            </Card>
          </View>

          {/* Then: numbered steps, each editable in place. */}
          <View style={{ gap: 8 }}>
            <SectionLabel>Then</SectionLabel>
            <Card>
              {draft.steps.map((step, i) => (
                <View key={i} style={{ padding: 14, borderBottomWidth: i < draft.steps.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <View style={{ width: 24, height: 24, borderCurve: "continuous", borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}24` }}>
                      <Text style={{ fontSize: 12, fontWeight: "700", color: colors.accent }}>{i + 1}</Text>
                    </View>
                    <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: colors.ink }}>{describeStep(step)}</Text>
                    {(Object.keys(step.args).length > 0 || step.condition) && (
                      <EditPill open={editingStepIndex === i} onPress={() => setEditingStepIndex((cur) => (cur === i ? null : i))} />
                    )}
                  </View>
                  {editingStepIndex === i && (
                    <StepValuesEditor step={step} index={i} steps={draft.steps} onSetArg={editStepArg} onChangeSteps={editSteps} />
                  )}
                </View>
              ))}
            </Card>
          </View>

          {fridges.length > 1 && (
            <View style={{ gap: 8 }}>
              <SectionLabel>Fridge</SectionLabel>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {fridges.map((f) => {
                  const active = fridgeId === f.id;
                  return (
                    <Pressable
                      key={f.id}
                      onPress={() => setFridgeId(f.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      style={{ height: 32, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, justifyContent: "center", backgroundColor: active ? colors.accent : colors.surface2 }}
                    >
                      <Text style={{ fontSize: 12.5, fontWeight: active ? "700" : "600", color: active ? colors.onAccent : colors.muted }}>{f.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {fridgeChanged && <Text style={{ fontSize: 11.5, color: colors.faint }}>Its runs will use this fridge&apos;s items once you save.</Text>}
            </View>
          )}

          {enteredDirectly && (
            <Pressable
              onPress={() => setMode("prompt")}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 44, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.surface2 }}
            >
              <Ionicons name="sparkles-outline" size={15} color={colors.accent} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>Redraft with AI · 2 credits</Text>
            </Pressable>
          )}

          {/* Test: run it for real or preview it, then what happened. Only for a saved, unchanged Machine. */}
          {editingId && (
            <View style={{ gap: 8 }}>
              <SectionLabel right={<Pressable onPress={() => router.push("/notifications")} hitSlop={8}><Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>Notifications</Text></Pressable>}>
                Test &amp; history
              </SectionLabel>
              {canTest && (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TestButton icon="play" label="Run now" busy={running} onPress={runNow} />
                  <TestButton icon="eye-outline" label="Dry run" busy={dryRunning} onPress={runDryRun} />
                </View>
              )}

              {dryRunResult && (
                <View style={{ borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderStyle: "dashed", borderColor: colors.accent, backgroundColor: colors.surface, overflow: "hidden" }}>
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingTop: 12 }}>
                    <Text style={{ flex: 1, fontSize: 11.5, color: colors.muted }}>Preview · nothing saved or sent</Text>
                    <Pressable onPress={() => setDryRunResult(null)} hitSlop={8} accessibilityLabel="Close preview">
                      <Ionicons name="close" size={16} color={colors.faint} />
                    </Pressable>
                  </View>
                  {dryRunResult.steps.map((step, i) => (
                    <StepResult key={i} step={step} last={i === dryRunResult.steps.length - 1} />
                  ))}
                  {dryRunResult.status === "failed" && dryRunResult.error && (
                    <Text style={{ fontSize: 11.5, color: colors.bad, paddingHorizontal: 14, paddingBottom: 12 }}>{dryRunResult.error}</Text>
                  )}
                </View>
              )}

              {runs === null ? (
                <ActivityIndicator color={colors.accent} style={{ marginTop: 8 }} />
              ) : runs.length === 0 ? (
                <Text style={{ fontSize: 12, color: colors.faint }}>No runs yet.</Text>
              ) : (
                <Card>
                  {runs.map((run, i) => (
                    <View key={run.id} style={{ padding: 14, gap: 6, borderBottomWidth: i < runs.length - 1 ? 1 : 0, borderBottomColor: colors.hairline }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Ionicons name={run.status === "failed" ? "close-circle" : "checkmark-circle"} size={15} color={run.status === "failed" ? colors.bad : colors.good} />
                        <Text style={{ fontSize: 12.5, fontWeight: "600", color: colors.ink }}>{run.status === "failed" ? "Failed" : "Ran successfully"}</Text>
                        <Text style={{ flex: 1, fontSize: 11, color: colors.faint }}>{timeAgo(new Date(run.startedAt).getTime())}</Text>
                        {run.undoable ? (
                          <Pressable onPress={() => confirmUndoRun(run)} disabled={undoingRunId === run.id} hitSlop={8}>
                            {undoingRunId === run.id ? (
                              <ActivityIndicator size="small" color={colors.bad} />
                            ) : (
                              <Text style={{ fontSize: 11.5, fontWeight: "600", color: colors.bad }}>Undo</Text>
                            )}
                          </Pressable>
                        ) : (
                          run.undoneAt && <Text style={{ fontSize: 11, color: colors.faint }}>Undone</Text>
                        )}
                      </View>
                      {run.error && <Text style={{ fontSize: 11.5, color: colors.bad }} numberOfLines={2}>{run.error}</Text>}
                      {run.steps.map((step, si) => (
                        <Text key={si} style={{ fontSize: 11.5, color: step.skipped ? colors.faint : step.ok ? colors.muted : colors.bad }} numberOfLines={2}>
                          {step.skipped ? "○" : step.ok ? "✓" : "✕"} {TOOL_LABELS[step.tool] ?? step.tool}
                          {step.content ? ` — ${step.content}` : ""}
                        </Text>
                      ))}
                    </View>
                  ))}
                </Card>
              )}
            </View>
          )}
        </ScrollView>

        {/* Save stays in reach at the bottom, whatever is open above. */}
        <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, borderTopWidth: 1, borderTopColor: colors.hairline, backgroundColor: colors.canvas, gap: 6 }}>
          <PrimaryButton onPress={saveMachine} disabled={saving || !fridgeId} busy={saving}>
            {editingId ? "Save Changes" : "Save Machine"}
          </PrimaryButton>
          {!editingId && <Text style={{ fontSize: 11, color: colors.faint, textAlign: "center" }}>Saved off. Switch it on from the list.</Text>}
        </View>
      </SafeAreaView>
    );
  }

  const onCount = machines?.filter((m) => m.enabled).length ?? 0;
  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: 48, gap: 20, flexGrow: 1 }}>
        <View style={{ gap: 14 }}>
          <RoundButton icon="chevron-back" label="Back" onPress={() => router.back()} />
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
            <View style={{ flex: 1, gap: 4 }}>
              <PixelText style={{ fontSize: 16, color: colors.ink }}>Kitchen Lab</PixelText>
              <Text style={{ fontSize: 12.5, color: colors.muted }}>
                {machines && machines.length > 0 ? `${onCount} of ${machines.length} on` : "Automations that run on their own"}
              </Text>
            </View>
            {machines && machines.length > 0 && (
              <Pressable
                onPress={openCompose}
                accessibilityRole="button"
                accessibilityLabel="New Machine"
                style={{ flexDirection: "row", alignItems: "center", gap: 4, height: 34, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.accent }}
              >
                <Ionicons name="add" size={16} color={colors.onAccent} />
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.onAccent }}>New</Text>
              </Pressable>
            )}
          </View>
        </View>

        {machines === null ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : machines.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 24, paddingBottom: 60 }}>
            <IconChip icon="flask-outline" color={colors.accent} size={56} />
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }}>No Machines yet</Text>
            <Text style={{ fontSize: 12.5, lineHeight: 18, color: colors.muted, textAlign: "center" }}>Automate reminders and checks. Start from a template or describe one.</Text>
            <View style={{ marginTop: 4, alignSelf: "stretch" }}>
              <PrimaryButton onPress={openCompose} icon="add">Create a Machine</PrimaryButton>
            </View>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {machines.map((machine) => {
              const failed = machine.lastRunStatus === "failed";
              return (
                <Pressable
                  key={machine.id}
                  onPress={() => openEdit(machine)}
                  style={{ borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, padding: 14, gap: 12 }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                    <IconChip icon={TRIGGER_ICON[machine.trigger.type]} color={machine.enabled ? colors.accent : colors.faint} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontSize: 14, fontWeight: "600", color: colors.ink }} numberOfLines={1}>{machine.name}</Text>
                      <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>{describeTrigger(machine.trigger)}</Text>
                    </View>
                    <Switch
                      value={machine.enabled}
                      onValueChange={() => toggleEnabled(machine)}
                      disabled={busyId === machine.id}
                      trackColor={{ true: colors.accent, false: colors.hairline }}
                      thumbColor={colors.ink}
                    />
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 1.5, backgroundColor: failed ? colors.bad : machine.lastRunAt ? colors.good : colors.hairlineStrong }} />
                    <Text style={{ flex: 1, fontSize: 11.5, color: failed ? colors.bad : colors.faint }} numberOfLines={1}>
                      {machine.lastRunAt
                        ? `${failed ? "Last run failed" : "Last run ok"} · ${machine.runCount} run${machine.runCount === 1 ? "" : "s"}`
                        : "Never run yet"}
                    </Text>
                    <Pressable onPress={() => openDuplicate(machine)} hitSlop={10} disabled={busyId === machine.id} accessibilityRole="button" accessibilityLabel={`Duplicate ${machine.name}`}>
                      <Ionicons name="copy-outline" size={16} color={colors.faint} />
                    </Pressable>
                    <Pressable onPress={() => confirmDelete(machine)} hitSlop={10} disabled={busyId === machine.id} accessibilityRole="button" accessibilityLabel={`Delete ${machine.name}`} style={{ marginLeft: 12 }}>
                      <Ionicons name="trash-outline" size={16} color={colors.faint} />
                    </Pressable>
                  </View>
                  {failed && machine.lastRunError && (
                    <Text style={{ fontSize: 11, color: colors.bad, marginTop: -6 }} numberOfLines={1}>{machine.lastRunError.slice(0, 140)}</Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

/** One glyph per trigger type, so a Machine reads at a glance before its sentence. */
const TRIGGER_ICON: Record<MachineTrigger["type"], IconName> = {
  schedule: "clock-outline",
  item_added: "plus-box-outline",
  threshold: "chart-line-variant",
  recipe_made: "chef-hat",
};

function ScreenTitle({ title, onBack }: { title: string; onBack: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 14 }}>
      <RoundButton icon="chevron-back" label="Back" onPress={onBack} />
      <PixelText style={{ fontSize: 16, color: colors.ink }}>{title}</PixelText>
    </View>
  );
}

function RoundButton({ icon, label, onPress }: { icon: "chevron-back"; label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}
    >
      <Ionicons name={icon} size={18} color={colors.ink} />
    </Pressable>
  );
}

/** A small uppercase label over a section, with an optional short note or link on the right. */
function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted }}>{children}</Text>
      {typeof right === "string" ? <Text style={{ fontSize: 11.5, color: colors.faint }}>{right}</Text> : right}
    </View>
  );
}

function Card({ children, padded }: { children: React.ReactNode; padded?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden", padding: padded ? 14 : 0 }}>
      {children}
    </View>
  );
}

function IconChip({ icon, color, size = 38 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderCurve: "continuous", borderRadius: size >= 48 ? 16 : 12, alignItems: "center", justifyContent: "center", backgroundColor: `${color}1f` }}>
      <MaterialCommunityIcons name={icon} size={Math.round(size * 0.47)} color={color} />
    </View>
  );
}

function EditPill({ open, onPress }: { open: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{ height: 28, paddingHorizontal: 10, borderCurve: "continuous", borderRadius: 8, justifyContent: "center", backgroundColor: open ? colors.accent : colors.surface2 }}
    >
      <Text style={{ fontSize: 12, fontWeight: "600", color: open ? colors.onAccent : colors.ink }}>{open ? "Done" : "Edit"}</Text>
    </Pressable>
  );
}

function PrimaryButton({
  children,
  onPress,
  disabled,
  busy,
  icon,
}: {
  children: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: "sparkles" | "add";
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderCurve: "continuous", borderRadius: 16, backgroundColor: colors.accent, opacity: disabled ? 0.5 : 1 }}
    >
      {busy ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={16} color={colors.onAccent} />}
          <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onAccent }}>{children}</Text>
        </>
      )}
    </Pressable>
  );
}

function TestButton({ icon, label, busy, onPress }: { icon: "play" | "eye-outline"; label: string; busy: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 42, borderCurve: "continuous", borderRadius: 12, backgroundColor: colors.surface2, opacity: busy ? 0.6 : 1 }}
    >
      {busy ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <Ionicons name={icon} size={14} color={colors.accent} />
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.ink }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function StepResult({ step, last }: { step: MachineDryRunResult["steps"][number]; last: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}>
      <Text style={{ fontSize: 12, color: step.skipped ? colors.faint : step.ok ? colors.ink : colors.bad }} numberOfLines={3}>
        {step.skipped ? "○" : step.ok ? "✓" : "✕"} {TOOL_LABELS[step.tool] ?? step.tool}
        {step.content ? ` — ${step.content}` : ""}
      </Text>
    </View>
  );
}

function TemplateRow({ template, last, onPress }: { template: MachineTemplate; last: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const color = template.color(colors);
  return (
    <Pressable
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}
    >
      <IconChip icon={template.icon} color={color} size={36} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "600", color: colors.ink }}>{template.label}</Text>
        <Text style={{ fontSize: 11.5, color: colors.muted }} numberOfLines={1}>{template.description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.faint} />
    </Pressable>
  );
}
