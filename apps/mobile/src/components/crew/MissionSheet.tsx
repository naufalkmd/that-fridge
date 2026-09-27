import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, { FadeIn } from "react-native-reanimated";

import { describeError, type FlatItem } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { defaultFridgeId, draftToInput, newDraft, userSlots } from "@/lib/mealPlan";
import {
  FOOD_GROUPS,
  defaultChoice,
  frozenShelfLifeDays,
  isoDaysFromNow,
  locationWord,
  taskLine,
  type MissionAgent,
  type MissionTask,
} from "@/lib/missions";
import { useScope } from "@/lib/scope";
import { useShopping } from "@/lib/shopping";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { BottomSheet } from "@/components/bottom-sheet";
import { FoodIcon } from "@/components/food-icon";
import { MarkdownText } from "@/components/markdown-text";

/** What happened to a task; the summary tallies these. */
export type Outcome = "saved" | "cooking" | "frozen" | "tossed" | "planned" | "added" | "removed" | "sorted" | "moved" | "checked" | "skipped";

const OUTCOME_WORD: Record<Exclude<Outcome, "skipped">, string> = {
  saved: "used up",
  cooking: "to cook",
  frozen: "frozen",
  tossed: "cleared",
  planned: "planned",
  added: "added to your list",
  removed: "taken off your list",
  sorted: "sorted",
  moved: "moved",
  checked: "checked",
};

/** What each outcome reads as on a finished row. */
const DONE_LABEL: Record<Exclude<Outcome, "skipped">, string> = {
  saved: "Marked used",
  cooking: "Opened",
  frozen: "Frozen",
  tossed: "Cleared",
  planned: "Planned",
  added: "On your list",
  removed: "Off your list",
  sorted: "Sorted",
  moved: "Moved",
  checked: "Checked",
};

type Action = {
  key: string;
  label: string;
  /** Opens another screen, so it runs straight away instead of waiting for "Do it". */
  nav?: boolean;
  /** Runs it; resolves to the outcome (or null while it's still going, e.g. the storage check)
   *  and, when the change can be taken back, how. */
  run: () => Promise<{ outcome: Outcome | null; undo?: () => Promise<unknown> }>;
};

/**
 * "Activate {agent}": the crew member works out a plan - what it would do about each thing it
 * found - and the user approves it with one press. Each row shows the crew's decision (tap it to
 * choose something else) and a tick; anything destructive or paid starts unticked. Finished rows
 * keep an Undo. The crew card behind stays visible, and the score in the header moves as the plan
 * is carried out.
 */
export function MissionSheet({
  visible,
  onClose,
  agent,
  color,
  gif,
  scoreLabel,
  score,
  startScore,
  tasks,
  done,
  onOutcome,
  storage,
  onAskTip,
  tip,
  tipBusy,
}: {
  visible: boolean;
  onClose: () => void;
  agent: MissionAgent;
  color: string;
  gif: number;
  scoreLabel: string;
  score: number | null;
  startScore: number | null;
  tasks: MissionTask[];
  done: Record<string, Outcome>;
  onOutcome: (taskId: string, outcome: Outcome) => void;
  /** Organizer's storage check, run by the Crew tab's useOrganizerSweep. */
  storage: {
    checking: boolean;
    start: () => void;
    apply: (moveId: string) => Promise<void>;
    dismiss: (moveId: string) => void;
  };
  /** The one-sentence AI tip, an optional extra. */
  onAskTip: () => void;
  tip: string | null;
  tipBusy: boolean;
}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { user } = useAuth();
  const { fridges, patchItem, removeItem, undoRemoval } = useInventory();
  const { scope } = useScope();
  const shopping = useShopping();
  const { surface2, hairline, ink, muted, faint, good, onAccent, bad, warn } = useTheme().colors;
  // Per task: the chosen action (overrides the crew's default) and the tick.
  const [choice, setChoice] = useState<Record<string, string | null>>({});
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [undos, setUndos] = useState<Record<string, () => Promise<unknown>>>({});
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!visible) setFailed({});
  }, [visible]);

  // The crew's default for each task. `index` counts tasks of the same kind (Chef's best dish is
  // its first cook task).
  const defaults = useMemo(() => {
    const out: Record<string, ReturnType<typeof defaultChoice>> = {};
    const seen: Record<string, number> = {};
    for (const t of tasks) {
      out[t.id] = defaultChoice(t, seen[t.kind] ?? 0);
      seen[t.kind] = (seen[t.kind] ?? 0) + 1;
    }
    return out;
  }, [tasks]);

  const chosen = (t: MissionTask) => (t.id in choice ? choice[t.id] : defaults[t.id].action);
  const isTicked = (t: MissionTask) => (t.id in ticked ? ticked[t.id] : defaults[t.id].ticked) && chosen(t) !== null;
  const open = tasks.filter((t) => !done[t.id]);
  const queued = open.filter((t) => isTicked(t) && !running[t.id]);
  const handled = tasks.filter((t) => done[t.id] && done[t.id] !== "skipped").length;
  const delta = score !== null && startScore !== null ? score - startScore : 0;

  /** Close the sheet first: a pushed screen would otherwise open underneath the modal. */
  function go(path: Parameters<typeof router.push>[0]) {
    onClose();
    setTimeout(() => router.push(path), 250);
  }

  async function removeAs(item: FlatItem, as: "used" | "wasted") {
    const res = await removeItem(item.id);
    if (res.outcome !== as) await api.correctItemOutcome(res.id, as);
    return { outcome: (as === "used" ? "saved" : "tossed") as Outcome, undo: () => undoRemoval(res.id) };
  }

  async function planMeal(date: string, title: string, recipe: { id: string; name: string } | null) {
    const draft = newDraft(date, userSlots(user), defaultFridgeId(fridges, scope), recipe);
    const saved = await api.createMealEntry(draftToInput({ ...draft, title, slot: draft.slot || "Dinner" }));
    return { outcome: "planned" as Outcome, undo: () => api.deleteMealEntry(saved.id) };
  }

  async function addMissing(names: string[]) {
    for (const n of names) await shopping.add(n);
  }

  function actionsFor(t: MissionTask): Action[] {
    switch (t.kind) {
      case "rescue": {
        const item = t.item;
        const out: Action[] = [];
        if (t.canFreeze) {
          out.push({
            key: "freeze",
            label: "Freeze it",
            run: async () => {
              const days = frozenShelfLifeDays(item.nutritionCategory);
              const from = item.location ?? "fridge";
              await patchItem(item.id, { location: "freezer", shelf_life_days: days, expiry_date: isoDaysFromNow(days) });
              return {
                outcome: "frozen",
                undo: () => patchItem(item.id, { location: from, expiry_date: isoDaysFromNow(Math.max(0, item.days)) }),
              };
            },
          });
        }
        if (t.recipe) {
          const r = t.recipe;
          out.push({ key: "plan-tonight", label: `Plan ${r.name} tonight`, run: () => planMeal(isoDaysFromNow(0), r.name, r) });
        }
        out.push({ key: "plan-use-up", label: `Put "use up ${item.name.toLowerCase()}" on tonight's plan`, run: () => planMeal(isoDaysFromNow(0), `Use up ${item.name}`, null) });
        out.push({ key: "used", label: "Mark it used", run: () => removeAs(item, "used") });
        out.push({ key: "toss", label: "Clear it (tossed)", run: () => removeAs(item, "wasted") });
        if (t.recipe) {
          const r = t.recipe;
          out.push({ key: "cook-now", label: `Cook ${r.name} now`, nav: true, run: async () => (go(`/recipe/${r.id}`), { outcome: "cooking" }) });
        }
        out.push({
          key: "ask",
          label: "Ask Chef what to make",
          nav: true,
          run: async () => (go({ pathname: "/chat", params: { prefill: `What can I cook tonight with ${item.name.toLowerCase()}?` } }), { outcome: "cooking" }),
        });
        return out;
      }
      case "expired":
        return [
          { key: "toss", label: "Clear it (tossed)", run: () => removeAs(t.item, "wasted") },
          { key: "used", label: "I used it", run: () => removeAs(t.item, "used") },
          { key: "fix-date", label: "Still good? Fix the date", nav: true, run: async () => (go(`/item/${t.item.id}`), { outcome: "checked" }) },
        ];
      case "cook": {
        const r = t.recipe;
        const names = t.missing.map((m) => m.name);
        const out: Action[] = [];
        if (names.length) {
          out.push({
            key: "plan-tonight-shop",
            label: `Plan tonight, add ${names.length} missing to list`,
            run: async () => {
              const res = await planMeal(isoDaysFromNow(0), r.name, r);
              await addMissing(names);
              return res;
            },
          });
        }
        out.push({ key: "plan-tonight", label: "Plan it for tonight", run: () => planMeal(isoDaysFromNow(0), r.name, r) });
        out.push({ key: "plan-tomorrow", label: "Plan it for tomorrow", run: () => planMeal(isoDaysFromNow(1), r.name, r) });
        if (names.length) {
          out.push({ key: "shop", label: `Add ${names.length} missing to list`, run: async () => (await addMissing(names), { outcome: "added" }) });
        }
        out.push({ key: "cook-now", label: "Cook it now", nav: true, run: async () => (go(`/recipe/${r.id}`), { outcome: "cooking" }) });
        return out;
      }
      case "ask-chef":
        return [
          {
            key: "ask",
            label: "Ask Chef for an idea",
            nav: true,
            run: async () => (go({ pathname: "/chat", params: { prefill: `What can I cook with ${t.items.map((i) => i.name.toLowerCase()).join(", ")}?` } }), { outcome: "cooking" }),
          },
        ];
      case "list-have":
        return [
          {
            key: "remove",
            label: "Take it off the list",
            run: async () => (await shopping.remove(t.entry.id), { outcome: "removed", undo: () => shopping.add(t.entry.name, t.entry.shopUrl) }),
          },
        ];
      case "running-low":
        return [{ key: "add", label: "Add it to the list", run: async () => (await shopping.add(t.item.name), { outcome: "added" }) }];
      case "restock":
        return [{ key: "add", label: "Add it to the list", run: async () => (await shopping.add(t.rec.name), { outcome: "added" }) }];
      case "sort-group":
        return FOOD_GROUPS.map((g) => ({
          key: `group:${g.key}`,
          label: `File under ${g.label}`,
          run: async () => (await patchItem(t.item.id, { nutrition_category: g.key }), { outcome: "sorted", undo: () => patchItem(t.item.id, { nutrition_category: null }) }),
        }));
      case "check-storage":
        return [
          {
            key: "check",
            label: `Check where they're stored · up to ${Math.min(t.count, 15)} credits`,
            // Asks for the credits first; the Crew tab marks it done when the check reports back.
            run: async () => (storage.start(), { outcome: null }),
          },
        ];
      case "move": {
        const m = t.move;
        return [
          {
            key: "move",
            label: `Move it to the ${locationWord[m.to]}`,
            run: async () => (await storage.apply(m.id), { outcome: "moved", undo: () => patchItem(m.id, { location: m.from }) }),
          },
        ];
      }
    }
  }

  async function runOne(t: MissionTask, a: Action) {
    setRunning((r) => ({ ...r, [t.id]: true }));
    setFailed((f) => {
      const { [t.id]: _, ...rest } = f;
      return rest;
    });
    try {
      const res = await a.run();
      if (res.outcome) onOutcome(t.id, res.outcome);
      if (res.undo) setUndos((u) => ({ ...u, [t.id]: res.undo! }));
      return true;
    } catch (e) {
      setFailed((f) => ({ ...f, [t.id]: describeError(e, "Didn't go through") }));
      return false;
    } finally {
      setRunning((r) => ({ ...r, [t.id]: false }));
    }
  }

  async function doIt() {
    if (applying || queued.length === 0) return;
    setApplying(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    let ok = 0;
    // One at a time: they touch the same inventory and lists, and it reads as the crew working.
    for (const t of queued) {
      const a = actionsFor(t).find((x) => x.key === chosen(t));
      if (a && !a.nav && (await runOne(t, a))) ok += 1;
    }
    setApplying(false);
    void Haptics.notificationAsync(ok === queued.length ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning);
  }

  function pickFor(t: MissionTask) {
    const options = actionsFor(t);
    Alert.alert(taskTitle(t), taskLine(t), [
      ...options.map((a) => ({
        text: a.label,
        onPress: () => {
          void Haptics.selectionAsync();
          if (a.nav) {
            void runOne(t, a);
            return;
          }
          setChoice((c) => ({ ...c, [t.id]: a.key }));
          setTicked((k) => ({ ...k, [t.id]: true }));
        },
      })),
      {
        text: "Leave it for now",
        onPress: () => setTicked((k) => ({ ...k, [t.id]: false })),
      },
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  async function undo(t: MissionTask) {
    const fn = undos[t.id];
    if (!fn) return;
    try {
      await fn();
      setUndos(({ [t.id]: _, ...rest }) => rest);
      onOutcome(t.id, "skipped");
      setTicked((k) => ({ ...k, [t.id]: false }));
    } catch {
      setFailed((f) => ({ ...f, [t.id]: "Couldn't undo that" }));
    }
  }

  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of Object.values(done)) {
      if (o === "skipped") continue;
      counts.set(OUTCOME_WORD[o], (counts.get(OUTCOME_WORD[o]) ?? 0) + 1);
    }
    return [...counts.entries()].map(([w, c]) => `${c} ${w}`).join(" · ");
  }, [done]);

  const subtitle =
    tasks.length === 0
      ? `${agent} has nothing to do right now.`
      : applying
        ? `On it…`
        : handled > 0 && queued.length === 0
          ? tally || "All done."
          : "Here's my plan. Untick anything you'd rather keep, or tap a line to change it.";

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={Math.round(height * 0.64)} dim={0.3}>
      {/* header: who, what they're doing, live score */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Image source={gif} style={{ width: 44, height: 44 }} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color }}>{agent}</Text>
          <Text style={{ fontSize: 12, lineHeight: 16, color: muted, marginTop: 2 }}>{subtitle}</Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 10.5, fontWeight: "600", color: faint }}>{scoreLabel}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Text style={{ fontSize: 17, fontWeight: "700", color: ink }}>{score ?? "–"}</Text>
            {delta > 0 && (
              <Animated.Text entering={FadeIn} style={{ fontSize: 12, fontWeight: "800", color: good }}>
                +{delta}
              </Animated.Text>
            )}
          </View>
        </View>
      </View>

      {tip && (
        <Animated.View entering={FadeIn} style={{ borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 10, marginBottom: 10 }}>
          <MarkdownText text={tip} size={12} />
        </Animated.View>
      )}

      {tasks.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
          <MaterialCommunityIcons name="check-circle-outline" size={34} color={good} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: ink }}>All clear</Text>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: height * 0.4 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {tasks.map((t) => {
            const state = done[t.id];
            const action = actionsFor(t).find((a) => a.key === chosen(t));
            const on = isTicked(t);
            const busy = running[t.id] || (t.kind === "check-storage" && storage.checking);
            return (
              <View
                key={t.id}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  borderRadius: RADIUS.md,
                  borderCurve: "continuous",
                  backgroundColor: surface2,
                  borderWidth: 1,
                  borderColor: failed[t.id] ? bad : "transparent",
                  opacity: state === "skipped" ? 0.5 : 1,
                }}
              >
                {/* tick / status */}
                {state && state !== "skipped" ? (
                  <Ionicons name="checkmark-circle" size={22} color={good} />
                ) : busy ? (
                  <ActivityIndicator size="small" color={color} style={{ width: 22 }} />
                ) : (
                  <Pressable
                    onPress={() => {
                      if (chosen(t) === null) return pickFor(t);
                      void Haptics.selectionAsync();
                      setTicked((k) => ({ ...k, [t.id]: !on }));
                    }}
                    disabled={applying || state === "skipped"}
                    hitSlop={8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={taskTitle(t)}
                  >
                    <Ionicons name={on ? "checkbox" : "square-outline"} size={22} color={on ? color : faint} />
                  </Pressable>
                )}
                <TaskIcon t={t} size={30} />
                <Pressable onPress={() => !state && !applying && pickFor(t)} disabled={!!state || applying} style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: "700", color: ink }}>{taskTitle(t)}</Text>
                  {state && state !== "skipped" ? (
                    <Text style={{ fontSize: 12, fontWeight: "600", color: good, marginTop: 1 }}>{DONE_LABEL[state]}</Text>
                  ) : failed[t.id] ? (
                    <Text style={{ fontSize: 12, color: bad, marginTop: 1 }}>{failed[t.id]} · tap to try again</Text>
                  ) : (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 }}>
                      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12, fontWeight: "600", color: action ? (on ? color : muted) : warn }}>
                        {action ? action.label : "Choose what to do"}
                      </Text>
                      <Ionicons name="chevron-down" size={11} color={faint} />
                    </View>
                  )}
                </Pressable>
                {state && state !== "skipped" && undos[t.id] && (
                  <Pressable onPress={() => void undo(t)} hitSlop={8}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color }}>Undo</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* the one button */}
      <Pressable
        onPress={queued.length ? doIt : onClose}
        disabled={applying}
        accessibilityRole="button"
        style={{
          marginTop: 12,
          alignItems: "center",
          paddingVertical: 14,
          borderRadius: RADIUS.sm,
          borderCurve: "continuous",
          backgroundColor: queued.length ? color : surface2,
          opacity: applying ? 0.7 : 1,
        }}
      >
        {applying ? (
          <ActivityIndicator color={onAccent} />
        ) : (
          <Text style={{ fontSize: 14, fontWeight: "700", color: queued.length ? onAccent : ink }}>
            {queued.length ? `Do it · ${queued.length} thing${queued.length === 1 ? "" : "s"}` : "Done"}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={onAskTip} disabled={tipBusy} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, marginTop: 10, borderTopWidth: 1, borderTopColor: hairline, paddingTop: 10 }}>
        {tipBusy ? <ActivityIndicator size="small" color={muted} /> : <MaterialCommunityIcons name="auto-fix" size={13} color={muted} />}
        <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>Ask {agent} for a tip · 1 credit</Text>
      </Pressable>
    </BottomSheet>
  );
}

function TaskIcon({ t, size }: { t: MissionTask; size: number }) {
  switch (t.kind) {
    case "rescue":
    case "expired":
    case "running-low":
    case "sort-group":
      return <FoodIcon icon={t.item.icon} iconUrl={t.item.iconUrl} name={t.item.name} size={size} />;
    case "list-have":
      return <FoodIcon icon={t.item.icon} iconUrl={t.item.iconUrl} name={t.entry.name} size={size} />;
    case "cook":
      return <FoodIcon icon={t.recipe.icon ?? t.recipe.ingredients[0]?.icon ?? "leftovers"} iconUrl={t.recipe.iconUrl} name={t.recipe.name} size={size} />;
    case "ask-chef":
      return <FoodIcon icon={t.items[0]?.icon} name={t.items[0]?.name ?? "food"} size={size} />;
    case "restock":
      return <FoodIcon icon={t.rec.icon} name={t.rec.name} size={size} />;
    case "move":
      return <FoodIcon icon={t.move.icon} name={t.move.name} size={size} />;
    case "check-storage":
      return <MaterialCommunityIcons name="fridge-outline" size={size * 0.8} color="#3d6fe0" />;
  }
}

function taskTitle(t: MissionTask): string {
  switch (t.kind) {
    case "rescue":
      return `${t.item.name} · ${t.item.days <= 0 ? "today" : t.item.days === 1 ? "1 day left" : `${t.item.days} days left`}`;
    case "expired":
      return `${t.item.name} · past its date`;
    case "running-low":
      return `${t.item.name} · last one`;
    case "sort-group":
      return `${t.item.name} · no food group`;
    case "list-have":
      return `${t.entry.name} · already at home`;
    case "cook":
      return t.rescues.length ? `${t.recipe.name} · saves ${t.rescues[0].name.toLowerCase()}` : t.recipe.name;
    case "ask-chef":
      return "Nothing in your book fits";
    case "restock":
      return t.rec.name;
    case "move":
      return `${t.move.name} · in the ${locationWord[t.move.from]}`;
    case "check-storage":
      return "Storage check";
  }
}
