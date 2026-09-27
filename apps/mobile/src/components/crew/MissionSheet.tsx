import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOutLeft,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { describeError, type FlatItem, type NutritionCategory } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { defaultFridgeId, draftToInput, newDraft, userSlots } from "@/lib/mealPlan";
import {
  FOOD_GROUPS,
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

/** What happened to a task; the finish screen tallies these. */
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

type Action = {
  key: string;
  label: string;
  /** Runs the action; resolves to the task's outcome, or null to leave it open (e.g. a cancelled prompt). */
  run: () => Promise<Outcome | null>;
  primary?: boolean;
  tone?: "bad";
};

/** The last thing the user did, with a way back. */
type Undo = { text: string; undo?: () => Promise<void> };

/**
 * A crew member's mission in a half-height sheet: one task card at a time with one-tap actions
 * (swipe right = the main action, left = skip), a list view for scanning everything at once, and
 * a finish screen. The crew card behind stays visible, and the score in the header moves as the
 * user works through it.
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
  /** The old one-sentence AI tip, now an optional extra. */
  onAskTip: () => void;
  /** The tip, once asked for. */
  tip: string | null;
  tipBusy: boolean;
}) {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { user } = useAuth();
  const { fridges, patchItem, removeItem, undoRemoval } = useInventory();
  const { scope } = useScope();
  const shopping = useShopping();
  const { surface, surface2, hairline, ink, muted, faint, good, onAccent, bad } = useTheme().colors;
  const [listView, setListView] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastUndo, setLastUndo] = useState<Undo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = tasks.filter((t) => !done[t.id]);
  const current = open[0] ?? null;
  const finished = tasks.length > 0 && open.length === 0;
  const delta = score !== null && startScore !== null ? score - startScore : 0;

  useEffect(() => {
    if (!visible) {
      setLastUndo(null);
      setError(null);
    }
  }, [visible]);

  /** Close the sheet first: a pushed screen would otherwise open underneath the modal. */
  function go(path: Parameters<typeof router.push>[0]) {
    onClose();
    setTimeout(() => router.push(path), 250);
  }

  async function removeAs(item: FlatItem, choice: "used" | "wasted"): Promise<Outcome> {
    const res = await removeItem(item.id);
    if (res.outcome !== choice) await api.correctItemOutcome(res.id, choice);
    setLastUndo({
      text: `${item.name} ${choice === "used" ? "marked used" : "cleared"}`,
      undo: () => undoRemoval(res.id),
    });
    return choice === "used" ? "saved" : "tossed";
  }

  function actionsFor(t: MissionTask): Action[] {
    switch (t.kind) {
      case "rescue": {
        const out: Action[] = [];
        if (t.recipe) {
          const r = t.recipe;
          out.push({ key: "cook", label: `Cook ${r.name}`, primary: true, run: async () => (go(`/recipe/${r.id}`), "cooking") });
        } else {
          out.push({
            key: "ask",
            label: "Ask Chef what to make",
            primary: true,
            run: async () => (go({ pathname: "/chat", params: { prefill: `What can I cook tonight with ${t.item.name.toLowerCase()}?` } }), "cooking"),
          });
        }
        if (t.canFreeze) {
          out.push({
            key: "freeze",
            label: "Freeze it",
            run: async () => {
              const days = frozenShelfLifeDays(t.item.nutritionCategory);
              const from = t.item.location ?? "fridge";
              await patchItem(t.item.id, { location: "freezer", shelf_life_days: days, expiry_date: isoDaysFromNow(days) });
              setLastUndo({
                text: `${t.item.name} moved to the freezer, good for about ${Math.round(days / 30)} months`,
                undo: () => patchItem(t.item.id, { location: from }),
              });
              return "frozen";
            },
          });
        }
        out.push({ key: "used", label: "Used it", run: () => removeAs(t.item, "used") });
        out.push({ key: "toss", label: "Tossed", tone: "bad", run: () => removeAs(t.item, "wasted") });
        return out;
      }
      case "expired":
        return [
          { key: "toss", label: "Clear it", primary: true, tone: "bad", run: () => removeAs(t.item, "wasted") },
          { key: "used", label: "I used it", run: () => removeAs(t.item, "used") },
          { key: "fine", label: "Still good? Fix the date", run: async () => (go(`/item/${t.item.id}`), "checked") },
        ];
      case "cook": {
        const r = t.recipe;
        const out: Action[] = [
          { key: "cook", label: "Cook it now", primary: true, run: async () => (go(`/recipe/${r.id}`), "cooking") },
          {
            key: "plan",
            label: "Plan for tomorrow",
            run: async () => {
              const draft = newDraft(isoDaysFromNow(1), userSlots(user), defaultFridgeId(fridges, scope), r);
              await api.createMealEntry(draftToInput({ ...draft, slot: draft.slot || "Dinner" }));
              setLastUndo({ text: `${r.name} planned for tomorrow` });
              return "planned";
            },
          },
        ];
        if (t.missing.length > 0) {
          out.push({
            key: "shop",
            label: `Add ${t.missing.length} missing to list`,
            run: async () => {
              for (const ing of t.missing) await shopping.add(ing.name);
              setLastUndo({ text: `${t.missing.map((m) => m.name).join(", ")} added to your list` });
              return "added";
            },
          });
        }
        return out;
      }
      case "ask-chef":
        return [
          {
            key: "ask",
            label: "Ask Chef for an idea",
            primary: true,
            run: async () => (go({ pathname: "/chat", params: { prefill: `What can I cook with ${t.items.map((i) => i.name.toLowerCase()).join(", ")}?` } }), "cooking"),
          },
        ];
      case "list-have":
        return [
          {
            key: "remove",
            label: "Take it off the list",
            primary: true,
            run: async () => {
              await shopping.remove(t.entry.id);
              setLastUndo({ text: `${t.entry.name} taken off your list`, undo: () => shopping.add(t.entry.name, t.entry.shopUrl) });
              return "removed";
            },
          },
        ];
      case "running-low":
        return [
          {
            key: "add",
            label: "Add to list",
            primary: true,
            run: async () => {
              await shopping.add(t.item.name);
              setLastUndo({ text: `${t.item.name} added to your list` });
              return "added";
            },
          },
        ];
      case "restock":
        return [
          {
            key: "add",
            label: "Add to list",
            primary: true,
            run: async () => {
              await shopping.add(t.rec.name);
              setLastUndo({ text: `${t.rec.name} added to your list` });
              return "added";
            },
          },
        ];
      case "sort-group":
        // The food group chips are drawn separately; no single main action.
        return [];
      case "check-storage":
        return [
          {
            key: "check",
            label: storage.checking ? "Checking…" : "Check storage spots",
            primary: true,
            run: async () => {
              storage.start();
              return null; // stays open until the check reports back
            },
          },
        ];
      case "move": {
        const m = t.move;
        return [
          {
            key: "move",
            label: `Move to ${locationWord[m.to]}`,
            primary: true,
            run: async () => {
              await storage.apply(m.id);
              setLastUndo({ text: `${m.name} moved to the ${locationWord[m.to]}`, undo: () => patchItem(m.id, { location: m.from }) });
              return "moved";
            },
          },
        ];
      }
    }
  }

  async function perform(t: MissionTask, a: Action) {
    if (busy) return;
    setBusy(`${t.id}:${a.key}`);
    setError(null);
    try {
      const outcome = await a.run();
      if (outcome) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onOutcome(t.id, outcome);
      }
    } catch (e) {
      setError(describeError(e, "That didn't go through. Try again."));
    } finally {
      setBusy(null);
    }
  }

  function skip(t: MissionTask) {
    void Haptics.selectionAsync();
    if (t.kind === "move") storage.dismiss(t.move.id);
    onOutcome(t.id, "skipped");
  }

  async function sortInto(t: Extract<MissionTask, { kind: "sort-group" }>, group: NutritionCategory) {
    await perform(t, {
      key: `group-${group}`,
      label: group,
      run: async () => {
        await patchItem(t.item.id, { nutrition_category: group });
        setLastUndo({ text: `${t.item.name} filed under ${FOOD_GROUPS.find((g) => g.key === group)?.label}` });
        return "sorted";
      },
    });
  }

  const tally = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of Object.values(done)) {
      if (o === "skipped") continue;
      counts.set(OUTCOME_WORD[o], (counts.get(OUTCOME_WORD[o]) ?? 0) + 1);
    }
    return [...counts.entries()].map(([w, c]) => `${c} ${w}`).join(" · ");
  }, [done]);

  return (
    <BottomSheet visible={visible} onClose={onClose} maxHeight={Math.round(height * 0.58)} dim={0.3}>
      {/* header: who, progress, live score */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Image source={gif} style={{ width: 40, height: 40 }} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 15, fontWeight: "700", color }}>{agent}&apos;s mission</Text>
          <View style={{ flexDirection: "row", gap: 4, marginTop: 5 }}>
            {tasks.map((t) => (
              <View
                key={t.id}
                style={{
                  width: 14,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: done[t.id] ? (done[t.id] === "skipped" ? faint : color) : t.id === current?.id ? `${color}88` : hairline,
                }}
              />
            ))}
          </View>
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

      {tip && !finished && (
        <Animated.View entering={FadeIn} style={{ borderLeftWidth: 3, borderLeftColor: color, paddingLeft: 10, marginBottom: 12 }}>
          <MarkdownText text={tip} size={12} />
        </Animated.View>
      )}

      {finished ? (
        <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: "center", paddingVertical: 12, gap: 8 }}>
          <Image source={gif} style={{ width: 84, height: 84 }} contentFit="contain" />
          <Text style={{ fontSize: 17, fontWeight: "700", color: ink }}>Mission complete</Text>
          <Text style={{ fontSize: 13, color: muted, textAlign: "center" }}>{tally || "Nothing needed doing this time."}</Text>
          <Pressable onPress={onClose} style={{ marginTop: 8, alignSelf: "stretch", alignItems: "center", paddingVertical: 13, borderRadius: RADIUS.sm, borderCurve: "continuous", backgroundColor: color }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: onAccent }}>Done</Text>
          </Pressable>
        </Animated.View>
      ) : tasks.length === 0 ? (
        <View style={{ alignItems: "center", paddingVertical: 20, gap: 8 }}>
          <MaterialCommunityIcons name="check-circle-outline" size={34} color={good} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: ink }}>All clear</Text>
          <Text style={{ fontSize: 12.5, color: muted, textAlign: "center" }}>{agent} has nothing for you right now.</Text>
        </View>
      ) : listView ? (
        <ScrollView style={{ maxHeight: height * 0.36 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
          {tasks.map((t) => {
            const a = actionsFor(t).find((x) => x.primary);
            const state = done[t.id];
            return (
              <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: RADIUS.md, borderCurve: "continuous", backgroundColor: surface2, opacity: state ? 0.5 : 1 }}>
                <TaskIcon t={t} size={30} />
                <Text numberOfLines={2} style={{ flex: 1, fontSize: 12.5, color: ink }}>{taskLine(t)}</Text>
                {state ? (
                  <Text style={{ fontSize: 11.5, fontWeight: "700", color: state === "skipped" ? faint : good }}>
                    {state === "skipped" ? "Skipped" : "Done"}
                  </Text>
                ) : a ? (
                  <Pressable onPress={() => perform(t, a)} disabled={!!busy} style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.sm, backgroundColor: color }}>
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: onAccent }}>{a.label}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      ) : current ? (
        <TaskCard
          key={current.id}
          task={current}
          color={color}
          actions={actionsFor(current)}
          busy={busy}
          checking={current.kind === "check-storage" && storage.checking}
          onAction={(a) => perform(current, a)}
          onSkip={() => skip(current)}
          onGroup={current.kind === "sort-group" ? (g) => sortInto(current, g) : undefined}
        />
      ) : null}

      {error && <Text style={{ fontSize: 12, color: bad, marginTop: 8 }}>{error}</Text>}

      {lastUndo && !finished && (
        <Animated.View entering={FadeIn} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, padding: 10, borderRadius: RADIUS.sm, backgroundColor: surface2 }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 12, color: muted }}>{lastUndo.text}</Text>
          {lastUndo.undo && (
            <Pressable
              onPress={async () => {
                const u = lastUndo;
                setLastUndo(null);
                try {
                  await u.undo?.();
                } catch {
                  setError("Couldn't undo that.");
                }
              }}
              hitSlop={8}
            >
              <Text style={{ fontSize: 12, fontWeight: "700", color }}>Undo</Text>
            </Pressable>
          )}
        </Animated.View>
      )}

      {/* footer: list view toggle, and the old AI tip as an optional extra */}
      {!finished && tasks.length > 0 && (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: hairline }}>
          <Pressable onPress={() => setListView((v) => !v)} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <MaterialCommunityIcons name={listView ? "card-outline" : "format-list-bulleted"} size={14} color={muted} />
            <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>{listView ? "One at a time" : `See all ${tasks.length}`}</Text>
          </Pressable>
          <Pressable onPress={onAskTip} disabled={tipBusy} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {tipBusy ? <ActivityIndicator size="small" color={muted} /> : <MaterialCommunityIcons name="auto-fix" size={13} color={muted} />}
            <Text style={{ fontSize: 12, fontWeight: "600", color: muted }}>Ask {agent} for a tip · 1 credit</Text>
          </Pressable>
        </View>
      )}
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
    case "expired":
    case "running-low":
    case "sort-group":
      return t.item.name;
    case "list-have":
      return t.entry.name;
    case "cook":
      return t.recipe.name;
    case "ask-chef":
      return "Rescue with a new recipe";
    case "restock":
      return t.rec.name;
    case "move":
      return t.move.name;
    case "check-storage":
      return "Storage check";
  }
}

const SWIPE = 90;

/** One task: the crew's line, the main action, secondary actions, skip. Swipe right = main action, left = skip. */
function TaskCard({
  task,
  color,
  actions,
  busy,
  checking,
  onAction,
  onSkip,
  onGroup,
}: {
  task: MissionTask;
  color: string;
  actions: Action[];
  busy: string | null;
  checking: boolean;
  onAction: (a: Action) => void;
  onSkip: () => void;
  onGroup?: (g: NutritionCategory) => void;
}) {
  const { surface2, hairline, ink, muted, faint, onAccent, bad } = useTheme().colors;
  const primary = actions.find((a) => a.primary);
  const secondary = actions.filter((a) => !a.primary);
  const x = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      x.value = e.translationX;
    })
    .onEnd((e) => {
      if (e.translationX > SWIPE && primary) runOnJS(onAction)(primary);
      else if (e.translationX < -SWIPE) runOnJS(onSkip)();
      x.value = withSpring(0);
    });
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { rotate: `${x.value / 40}deg` }],
  }));

  return (
    <Animated.View entering={FadeInRight.duration(220)} exiting={FadeOutLeft.duration(180)}>
      <GestureDetector gesture={pan}>
        <Animated.View style={[{ padding: 14, borderRadius: RADIUS.lg, borderCurve: "continuous", backgroundColor: surface2, borderWidth: 1, borderColor: hairline }, style]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <TaskIcon t={task} size={44} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: "700", color: ink }}>{taskTitle(task)}</Text>
              <Text style={{ fontSize: 12.5, lineHeight: 17, color: muted, marginTop: 2 }}>{taskLine(task)}</Text>
            </View>
          </View>

          {onGroup && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {FOOD_GROUPS.map((g) => (
                <Pressable key={g.key} onPress={() => onGroup(g.key)} disabled={!!busy} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: color }}>
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color }}>{g.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {primary && (
            <Pressable
              onPress={() => onAction(primary)}
              disabled={!!busy || checking}
              style={{ alignItems: "center", paddingVertical: 12, borderRadius: RADIUS.sm, borderCurve: "continuous", backgroundColor: primary.tone === "bad" ? bad : color, opacity: busy || checking ? 0.6 : 1 }}
            >
              {busy === `${task.id}:${primary.key}` || checking ? (
                <ActivityIndicator color={onAccent} />
              ) : (
                <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: "700", color: onAccent }}>{primary.label}</Text>
              )}
            </Pressable>
          )}

          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: 16, rowGap: 6, marginTop: 10 }}>
            {secondary.map((a) => (
              <Pressable key={a.key} onPress={() => onAction(a)} disabled={!!busy} hitSlop={6}>
                {busy === `${task.id}:${a.key}` ? (
                  <ActivityIndicator size="small" color={muted} />
                ) : (
                  <Text style={{ fontSize: 12.5, fontWeight: "700", color: a.tone === "bad" ? bad : color }}>{a.label}</Text>
                )}
              </Pressable>
            ))}
            <Pressable onPress={onSkip} disabled={!!busy} hitSlop={6}>
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: faint }}>{task.kind === "cook" ? "Another idea" : "Skip"}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}
