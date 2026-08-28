import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  STORAGE_LOCATIONS,
  daysLabel,
  describeError,
  freshColor,
  type ChatAgentName,
  type FoodFocus,
  type MealType,
  type Recipe,
  type StorageLocation,
  type Vibe,
  type WhatToEatResult,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { useShopping } from "@/lib/shopping";
import { useRecipes } from "@/lib/recipes";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useToast } from "@/lib/toast";
import { useAgentInsight } from "@/lib/agentInsight";
import { PixelText } from "@/components/brand";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { FoodIcon } from "@/components/food-icon";
import { MarkdownText } from "@/components/markdown-text";

const GIFS = {
  chef: require("../../../assets/images/thatfridge/chef.gif"),
  guardian: require("../../../assets/images/thatfridge/guardian.gif"),
  organizer: require("../../../assets/images/thatfridge/organizer.gif"),
  shopkeeper: require("../../../assets/images/thatfridge/shopkeeper.gif"),
};

const AMBER = "#26c6da"; // brand accent (the theme's "amber" token)
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const STRONG = "rgba(255,255,255,0.18)";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";
const WARN = "#f5a623";
const BAD = "#ff5567";
const BLUE = "#5b8dee";

type Tab = "recipes" | "shopping" | "guardian" | "organizer";
const TABS: {
  key: Tab;
  label: string;
  agent: ChatAgentName;
  gif: number;
  color: string;
}[] = [
  { key: "recipes", label: "Recipes", agent: "Chef", gif: GIFS.chef, color: "#f5a623" },
  { key: "shopping", label: "Shopping", agent: "Shopkeeper", gif: GIFS.shopkeeper, color: "#39e07f" },
  { key: "guardian", label: "Guardian", agent: "Guardian", gif: GIFS.guardian, color: "#ff5f56" },
  { key: "organizer", label: "Organizer", agent: "Organizer", gif: GIFS.organizer, color: "#3d6fe0" },
];

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
  { key: "snack", label: "Snack" },
];
const VIBES: { key: Vibe; label: string }[] = [
  { key: "comfort", label: "Comfort" },
  { key: "light_fresh", label: "Light & Fresh" },
  { key: "quick_easy", label: "Quick & Easy" },
  { key: "something_new", label: "Something New" },
  { key: "use_it_up", label: "Use It Up" },
];
const FOOD_FOCUS: { key: FoodFocus; label: string }[] = [
  { key: "high_protein", label: "High Protein" },
  { key: "high_veg", label: "High Veg" },
  { key: "low_carb", label: "Low Carb" },
  { key: "balanced", label: "Balanced" },
];

export default function Crew() {
  const router = useRouter();
  const { items } = useInventory();
  const { scope } = useScope();
  const [tab, setTab] = useState<Tab>("recipes");
  const meta = TABS.find((t) => t.key === tab)!;

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  const insight = useAgentInsight(meta.agent, scoped, false);
  const [activating, setActivating] = useState(false);

  async function activate() {
    // useAgentInsight's cache is per-launch; force a fresh call here.
    setActivating(true);
    try {
      const res = await api.sendChat(
        `In one short sentence, ${
          tab === "guardian"
            ? "what should I use first?"
            : tab === "shopping"
              ? "what am I low on?"
              : tab === "organizer"
                ? "one tip to keep my fridge tidier."
                : "suggest one thing to cook tonight."
        }`,
        meta.agent,
        { inventory: scoped.slice(0, 40).map((i) => `${i.name} (${daysLabel(i.days)})`).join(", ") },
      );
      insightOverride.set(meta.agent, res.agent_response);
      setActivating(false);
    } catch {
      setActivating(false);
    }
  }

  const shownInsight = insightOverride.get(meta.agent) ?? insight.text;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120 }}>
        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <PixelText style={{ fontSize: 16, color: INK }}>Crew</PixelText>
          <FridgeScopePicker small />
        </View>

        {/* agent hero */}
        <View style={{ flexDirection: "row", gap: 14, marginBottom: 14 }}>
          <Image source={meta.gif} style={{ width: 96, height: 96 }} contentFit="contain" />
          <View style={{ flex: 1, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 10, padding: 14, justifyContent: "center", gap: 8 }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: meta.color }}>{meta.agent}</Text>
            <Text style={{ fontSize: 11.5, lineHeight: 16, color: MUTED }}>
              {tab === "guardian"
                ? `${scoped.filter((i) => i.freshness < 50).length} item(s) need attention`
                : tab === "recipes"
                  ? "See what you can make right now"
                  : tab === "shopping"
                    ? "Keep the essentials stocked"
                    : "Check where everything's stored"}
            </Text>
            <Pressable
              onPress={activating ? undefined : activate}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                paddingVertical: 8,
                borderRadius: 6,
                backgroundColor: shownInsight ? `${meta.color}22` : meta.color,
              }}
            >
              <MaterialCommunityIcons
                name={shownInsight ? "refresh" : "auto-fix"}
                size={13}
                color={shownInsight ? meta.color : "#0a0a0c"}
              />
              <Text style={{ fontSize: 12, fontWeight: "700", color: shownInsight ? meta.color : "#0a0a0c" }}>
                {activating ? "Thinking…" : shownInsight ? "Refresh insight" : `Activate ${meta.agent}`}
              </Text>
            </Pressable>
          </View>
        </View>

        {shownInsight && (
          <View
            style={{
              backgroundColor: SURFACE2,
              borderWidth: 1,
              borderColor: HAIRLINE,
              borderLeftWidth: 3,
              borderLeftColor: meta.color,
              borderRadius: 6,
              padding: 12,
              marginBottom: 16,
            }}
          >
            <Text style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: FAINT, marginBottom: 6 }}>
              {`// ${meta.agent.toLowerCase()} says`}
            </Text>
            <MarkdownText text={shownInsight} size={12} />
          </View>
        )}

        {/* sub-tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20, marginBottom: 18 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 16,
                  borderRadius: 6,
                  backgroundColor: active ? t.color : SURFACE,
                  borderWidth: active ? 0 : 1,
                  borderColor: HAIRLINE,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === "recipes" && <RecipesPanel onOpenBook={() => router.push("/recipes")} onAskChef={() => router.push("/chat")} />}
        {tab === "shopping" && <ShoppingPanel />}
        {tab === "guardian" && <GuardianPanel items={scoped} onOpenItem={(id) => router.push(`/item/${id}`)} />}
        {tab === "organizer" && <OrganizerPanel items={scoped} />}
      </ScrollView>
    </SafeAreaView>
  );
}

// Per-tab fresh-insight cache, separate from useAgentInsight's per-launch one.
const insightOverride = new Map<ChatAgentName, string>();

// ---- Recipes panel — the "what should I eat?" flow ------------------------------

function RecipesPanel({ onOpenBook, onAskChef }: { onOpenBook: () => void; onAskChef: () => void }) {
  const { refresh: refreshInventory } = useInventory();
  const [meal, setMeal] = useState<MealType | null>(null);
  const [vibes, setVibes] = useState<Vibe[]>([]);
  const [focus, setFocus] = useState<FoodFocus[]>([]);
  const [result, setResult] = useState<WhatToEatResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exactPage, setExactPage] = useState(0);
  const [similarPage, setSimilarPage] = useState(0);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, key: T) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const run = async () => {
    setLoading(true);
    setError(null);
    setExactPage(0);
    setSimilarPage(0);
    try {
      setResult(await api.suggestRecipes({ mealType: meal, vibes, foodFocus: focus }));
    } catch (e) {
      setError(describeError(e, "Couldn't get suggestions."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exhausted = result?.exhausted && (result?.exact.length ?? 0) === 0;

  return (
    <View style={{ gap: 18 }}>
      <Pressable
        onPress={onOpenBook}
        style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}
      >
        <MaterialCommunityIcons name="book-open-variant" size={14} color={BLUE} />
        <Text style={{ fontSize: 12, fontWeight: "700", color: BLUE }}>Open recipe book</Text>
      </Pressable>

      <ChipGroup label="MEAL TYPE" scroll>
        {MEAL_TYPES.map((o) => (
          <Chip key={o.key} label={o.label} active={meal === o.key} onPress={() => setMeal(meal === o.key ? null : o.key)} />
        ))}
      </ChipGroup>
      <ChipGroup label="VIBES">
        {VIBES.map((o) => (
          <Chip key={o.key} label={o.label} active={vibes.includes(o.key)} onPress={() => toggle(vibes, setVibes, o.key)} />
        ))}
      </ChipGroup>
      <ChipGroup label="FOOD FOCUS">
        {FOOD_FOCUS.map((o) => (
          <Chip key={o.key} label={o.label} active={focus.includes(o.key)} onPress={() => toggle(focus, setFocus, o.key)} />
        ))}
      </ChipGroup>

      <Pressable
        onPress={loading ? undefined : run}
        style={{ alignItems: "center", paddingVertical: 13, borderRadius: 8, backgroundColor: loading ? SURFACE2 : AMBER }}
      >
        <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: loading ? FAINT : "#0a0a0c" }}>
          {loading ? "Finding meals…" : "Find meals"}
        </Text>
      </Pressable>

      {error && (
        <Pressable onPress={run} style={{ borderRadius: 12, borderWidth: 1, borderColor: BAD, backgroundColor: SURFACE, padding: 12 }}>
          <Text style={{ fontWeight: "600", color: BAD }}>{error}</Text>
        </Pressable>
      )}

      {result && !loading && (
        <View>
          {exhausted ? (
            <View style={{ alignItems: "center", paddingVertical: 18, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 12.5, color: MUTED, marginBottom: 12, textAlign: "center" }}>
                Nothing in your saved recipes matches that combination yet.
              </Text>
              <AskChef primary onPress={onAskChef} />
            </View>
          ) : (
            <>
              <ResultsTier label="EXACT MATCHES" results={result.exact} page={exactPage} onShuffle={() => setExactPage((p) => p + 1)} onMade={refreshInventory} />
              <ResultsTier label="SIMILAR MATCHES" results={result.similar} page={similarPage} onShuffle={() => setSimilarPage((p) => p + 1)} onMade={refreshInventory} />
              {result.exact.length > 0 || result.similar.length > 0 ? (
                <View style={{ alignItems: "center", paddingTop: 18, paddingBottom: 4 }}>
                  <Text style={{ fontSize: 11.5, color: FAINT, marginBottom: 10 }}>Still nothing to your liking?</Text>
                  <AskChef onPress={onAskChef} />
                </View>
              ) : (
                <Text style={{ marginTop: 6, textAlign: "center", fontSize: 13, color: FAINT }}>
                  Nothing matches right now. Try clearing the filters or adding items.
                </Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ---- Shopping panel -----------------------------------------------------------

function ShoppingPanel() {
  const { items, add, toggle, remove } = useShopping();
  const [text, setText] = useState("");
  const unchecked = items.filter((i) => !i.checked);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => {
            if (text.trim()) add(text);
            setText("");
          }}
          placeholder="Add an item…"
          placeholderTextColor={FAINT}
          style={{ flex: 1, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: INK }}
        />
        <Pressable
          onPress={() => {
            if (text.trim()) add(text);
            setText("");
          }}
          style={{ justifyContent: "center", paddingHorizontal: 14, borderRadius: 6, backgroundColor: AMBER }}
        >
          <Text style={{ fontSize: 18, fontWeight: "700", color: "#0a0a0c" }}>+</Text>
        </Pressable>
      </View>

      {unchecked.length === 0 ? (
        <Text style={{ fontSize: 13, color: FAINT, textAlign: "center", paddingVertical: 20 }}>
          Nothing on the list.
        </Text>
      ) : (
        <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
          {unchecked.map((it, i) => (
            <View
              key={it.id}
              style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === unchecked.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}
            >
              <Pressable onPress={() => toggle(it.id)} hitSlop={6}>
                <MaterialCommunityIcons name="checkbox-blank-circle-outline" size={20} color={FAINT} />
              </Pressable>
              <Text style={{ flex: 1, fontSize: 14, color: INK }}>{it.name}</Text>
              <Pressable onPress={() => remove(it.id)} hitSlop={6}>
                <MaterialCommunityIcons name="close" size={16} color={FAINT} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ---- Guardian panel — at-risk items -----------------------------------------

function GuardianPanel({
  items,
  onOpenItem,
}: {
  items: import("@thatfridge/core").FlatItem[];
  onOpenItem: (id: string) => void;
}) {
  const atRisk = useMemo(
    () => [...items].filter((i) => i.freshness < 60).sort((a, b) => a.freshness - b.freshness),
    [items],
  );

  if (items.length === 0) {
    return <Text style={{ fontSize: 13, color: FAINT, textAlign: "center", paddingVertical: 30 }}>Nothing in this fridge yet.</Text>;
  }
  if (atRisk.length === 0) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 30, gap: 8 }}>
        <MaterialCommunityIcons name="shield-check-outline" size={28} color={GOOD} />
        <Text style={{ fontSize: 13, color: MUTED }}>Everything&apos;s holding up well.</Text>
      </View>
    );
  }

  return (
    <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
      {atRisk.map((it, i) => {
        const c = freshColor(it.freshness);
        return (
          <Pressable
            key={it.id}
            onPress={() => onOpenItem(it.id)}
            style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === atRisk.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}
          >
            <FoodIcon icon={it.icon} iconUrl={it.iconUrl} name={it.name} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>{it.name}</Text>
              <Text style={{ fontSize: 11, color: FAINT }}>{it.sectionName}</Text>
            </View>
            <Text style={{ fontSize: 12, fontWeight: "700", color: c }}>{daysLabel(it.days)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---- Organizer panel — the sweep ------------------------------------------

type Move = { id: string; name: string; icon: string; from: StorageLocation; to: StorageLocation };
const locLabel = (k: StorageLocation) => STORAGE_LOCATIONS.find((l) => l.key === k)?.label ?? k;

function OrganizerPanel({ items }: { items: import("@thatfridge/core").FlatItem[] }) {
  const { patchItem } = useInventory();
  const { organizerTally, refresh: refreshScore } = useKitchenScore();
  const toast = useToast();
  const [status, setStatus] = useState<"idle" | "checking" | "done">("idle");
  const [moves, setMoves] = useState<Move[]>([]);
  const [checked, setChecked] = useState(0);

  async function sweep() {
    if (items.length === 0) return;
    setStatus("checking");
    setMoves([]);
    const results = await Promise.all(
      items.map(async (item) => {
        try {
          const s = await api.suggestItemDetails(item.name, item.icon);
          const from = item.location ?? "fridge";
          if (s.location && s.location !== from) {
            return { id: item.id, name: item.name, icon: item.icon, from, to: s.location };
          }
        } catch {
          /* skip */
        }
        return null;
      }),
    );
    const found = results.filter((m): m is Move => m !== null);
    setMoves(found);
    setChecked(items.length);
    setStatus("done");
    api
      .incrementOrganizerTally({ checked: items.length, correct: items.length - found.length })
      .then(() => refreshScore())
      .catch(() => {});
  }

  async function apply(m: Move) {
    setMoves((p) => p.filter((x) => x.id !== m.id));
    try {
      await patchItem(m.id, { location: m.to });
      toast.show(`Moved ${m.name} to ${locLabel(m.to)}`, { actionLabel: "Undo", onAction: () => patchItem(m.id, { location: m.from }) });
    } catch {
      setMoves((p) => [m, ...p]);
    }
  }

  return (
    <View style={{ gap: 14 }}>
      {organizerTally && organizerTally.itemsCheckedTotal > 0 && (
        <Text style={{ fontSize: 11.5, color: MUTED }}>
          {organizerTally.itemsCorrectTotal}/{organizerTally.itemsCheckedTotal} items checked were in the right place
        </Text>
      )}
      <Pressable
        onPress={status === "checking" ? undefined : sweep}
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 13, borderRadius: 8, backgroundColor: status === "checking" ? SURFACE2 : AMBER }}
      >
        {status === "checking" ? (
          <>
            <ActivityIndicator color={FAINT} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: FAINT }}>Checking {items.length} items…</Text>
          </>
        ) : (
          <>
            <MaterialCommunityIcons name="broom" size={15} color="#0a0a0c" />
            <Text style={{ fontSize: 13.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>
              {status === "done" ? "Check again" : "Check my fridge"}
            </Text>
          </>
        )}
      </Pressable>

      {status === "done" &&
        (moves.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
            <MaterialCommunityIcons name="check-circle-outline" size={26} color={GOOD} />
            <Text style={{ fontSize: 13, color: MUTED }}>All {checked} items look well placed.</Text>
          </View>
        ) : (
          <View style={{ gap: 8 }}>
            {moves.map((m) => (
              <View key={m.id} style={{ backgroundColor: SURFACE2, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: BLUE, padding: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <FoodIcon icon={m.icon} name={m.name} size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }}>{m.name}</Text>
                    <Text style={{ fontSize: 11.5, color: MUTED }}>
                      {locLabel(m.from)} → <Text style={{ color: BLUE, fontWeight: "700" }}>{locLabel(m.to)}</Text>
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable onPress={() => apply(m)} style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 6, backgroundColor: BLUE }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>Move it</Text>
                  </Pressable>
                  <Pressable onPress={() => setMoves((p) => p.filter((x) => x.id !== m.id))} style={{ paddingHorizontal: 16, justifyContent: "center", borderRadius: 6, borderWidth: 1, borderColor: HAIRLINE }}>
                    <Text style={{ fontSize: 12, fontWeight: "700", color: MUTED }}>Keep</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        ))}
    </View>
  );
}

// ---- shared bits (unchanged) -------------------------------------------------

function AskChef({ onPress, primary }: { onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingVertical: primary ? 11 : 10,
        paddingHorizontal: primary ? 20 : 18,
        borderRadius: 8,
        backgroundColor: primary ? AMBER : "transparent",
        borderWidth: primary ? 0 : 1,
        borderColor: STRONG,
      }}
    >
      <Text
        style={{
          fontSize: primary ? 13 : 12.5,
          fontWeight: "700",
          textTransform: primary ? "uppercase" : "none",
          letterSpacing: primary ? 0.5 : 0,
          color: primary ? "#0a0a0c" : INK,
        }}
      >
        Ask Chef instead
      </Text>
    </Pressable>
  );
}

function ResultsTier({
  label,
  results,
  page,
  onShuffle,
  onMade,
}: {
  label: string;
  results: Recipe[];
  page: number;
  onShuffle: () => void;
  onMade: () => void;
}) {
  const visible = useMemo(() => {
    if (results.length <= 3) return results;
    const start = (page * 3) % results.length;
    return [...results.slice(start), ...results.slice(0, start)].slice(0, 3);
  }, [results, page]);

  if (results.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>{label}</Text>
      <View style={{ gap: 8, marginBottom: results.length > 3 ? 10 : 0 }}>
        {visible.map((r) => (
          <RecipeCard key={r.id} recipe={r} onMade={onMade} />
        ))}
      </View>
      {results.length > 3 && (
        <Pressable
          onPress={onShuffle}
          style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: STRONG }}
        >
          <MaterialCommunityIcons name="shuffle-variant" size={14} color={INK} />
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: INK }}>Not feeling these? Shuffle</Text>
        </Pressable>
      )}
    </View>
  );
}

function RecipeCard({ recipe, onMade }: { recipe: Recipe; onMade: () => void }) {
  const { items } = useInventory();
  const { items: shoppingItems, add: addToShopping } = useShopping();
  const [open, setOpen] = useState(false);
  const [marking, setMarking] = useState(false);

  const ingredients = recipe.ingredients.map((ing) => ({
    ...ing,
    have: items.some((i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase()),
    onList: shoppingItems.some((s) => !s.checked && s.name.toLowerCase() === ing.name.toLowerCase()),
  }));
  const haveCount = ingredients.filter((i) => i.have).length;

  async function markMade() {
    setMarking(true);
    try {
      await api.markRecipeMade(recipe.id);
      onMade();
      Alert.alert("Nice", `"${recipe.name}" logged. Inventory updated.`);
    } catch (e) {
      Alert.alert("Error", describeError(e, "Couldn't mark that made."));
    } finally {
      setMarking(false);
    }
  }

  return (
    <View style={{ borderRadius: 8, backgroundColor: SURFACE2, overflow: "hidden" }}>
      <Pressable onPress={() => setOpen((v) => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
        <FoodIcon icon={recipe.ingredients[0]?.icon ?? "leftovers"} name={recipe.name} size={32} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: INK }} numberOfLines={1}>
            {recipe.name}
          </Text>
          <Text style={{ fontSize: 11, color: FAINT }}>
            {recipe.minutes} min · {haveCount}/{ingredients.length} ready
          </Text>
        </View>
        <MaterialCommunityIcons name={open ? "chevron-up" : "chevron-down"} size={18} color={FAINT} />
      </Pressable>

      {open && (
        <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: HAIRLINE, padding: 14 }}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>INGREDIENTS</Text>
            <View style={{ borderRadius: 8, backgroundColor: SURFACE, overflow: "hidden" }}>
              {ingredients.map((ing, i) => {
                const done = ing.have || ing.onList;
                const tint = ing.have ? GOOD : ing.onList ? BLUE : FAINT;
                return (
                  <Pressable
                    key={i}
                    onPress={done ? undefined : () => addToShopping(ing.name)}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: i === ingredients.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}
                  >
                    <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: `${tint}${done ? "" : "1a"}` }}>
                      <MaterialCommunityIcons name={done ? "check" : "plus"} size={12} color={done ? "#0a0a0c" : tint} />
                    </View>
                    <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: INK }}>{ing.name}</Text>
                    <Text style={{ fontSize: 11.5, fontWeight: "700", color: tint }}>
                      {ing.have ? "Have it" : ing.onList ? "On list" : "Need it"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View>
            <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>STEPS</Text>
            <View style={{ gap: 10 }}>
              {recipe.steps.map((step, i) => (
                <View key={i} style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: SURFACE }}>
                    <Text style={{ fontSize: 11.5, fontWeight: "800", color: BLUE }}>{i + 1}</Text>
                  </View>
                  <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 20, color: INK }}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
          <Pressable
            onPress={markMade}
            disabled={marking}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 8, backgroundColor: AMBER }}
          >
            {marking ? (
              <ActivityIndicator color="#0a0a0c" />
            ) : (
              <>
                <MaterialCommunityIcons name="chef-hat" size={15} color="#0a0a0c" />
                <Text style={{ fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: "#0a0a0c" }}>Mark as made</Text>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function ChipGroup({ label, scroll, children }: { label: string; scroll?: boolean; children: React.ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.3, color: FAINT }}>{label}</Text>
      {scroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 6, backgroundColor: active ? AMBER : SURFACE2 }}>
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>{label}</Text>
    </Pressable>
  );
}
