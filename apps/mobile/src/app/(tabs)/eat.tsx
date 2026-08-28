import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  STORAGE_LOCATIONS,
  daysLabel,
  freshColor,
  getShoppingRecommendations,
  type ChatAgentName,
  type FlatItem,
  type StorageLocation,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useScope, scopeItems } from "@/lib/scope";
import { useShopping } from "@/lib/shopping";
import { useRecipes } from "@/lib/recipes";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useAgentInsight } from "@/lib/agentInsight";
import { PixelText } from "@/components/brand";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { FoodIcon } from "@/components/food-icon";
import { MarkdownText } from "@/components/markdown-text";
import { FridgeNotes } from "@/components/home/FridgeNotes";

const GIFS = {
  chef: require("../../../assets/images/thatfridge/chef.gif"),
  guardian: require("../../../assets/images/thatfridge/guardian.gif"),
  organizer: require("../../../assets/images/thatfridge/organizer.gif"),
  shopkeeper: require("../../../assets/images/thatfridge/shopkeeper.gif"),
};

const AMBER = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";
const GOOD = "#39e07f";
const BLUE = "#5b8dee";

type Tab = "recipes" | "shopping" | "guardian" | "organizer";
const TABS: { key: Tab; label: string; agent: ChatAgentName; gif: number; color: string }[] = [
  { key: "recipes", label: "Recipes", agent: "Chef", gif: GIFS.chef, color: "#f5a623" },
  { key: "shopping", label: "Shopping", agent: "Shopkeeper", gif: GIFS.shopkeeper, color: "#39e07f" },
  { key: "guardian", label: "Guardian", agent: "Guardian", gif: GIFS.guardian, color: "#ff5f56" },
  { key: "organizer", label: "Organizer", agent: "Organizer", gif: GIFS.organizer, color: "#3d6fe0" },
];

const insightOverride = new Map<ChatAgentName, string>();

export default function Crew() {
  const router = useRouter();
  const { items } = useInventory();
  const { scope } = useScope();
  const [tab, setTab] = useState<Tab>("recipes");
  const meta = TABS.find((t) => t.key === tab)!;

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  const insight = useAgentInsight(meta.agent, scoped, false);
  const [activating, setActivating] = useState(false);
  const shownInsight = insightOverride.get(meta.agent) ?? insight.text;

  async function activate() {
    setActivating(true);
    try {
      const res = await api.sendChat(
        tab === "guardian"
          ? "In one short sentence, what should I use up first?"
          : tab === "shopping"
            ? "In one short sentence, what essential am I running low on?"
            : tab === "organizer"
              ? "In one short sentence, one quick tip to keep my fridge tidier."
              : "In one short sentence, suggest one thing to cook tonight.",
        meta.agent,
        { inventory: scoped.slice(0, 40).map((i) => `${i.name} (${daysLabel(i.days)})`).join(", ") },
      );
      insightOverride.set(meta.agent, res.agent_response);
    } catch {
      /* ignore */
    } finally {
      setActivating(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 120 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <PixelText style={{ fontSize: 16, color: INK }}>Crew</PixelText>
          <FridgeScopePicker small />
        </View>

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
                    : "Sort everything into place"}
            </Text>
            <Pressable
              onPress={activating ? undefined : activate}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 6, backgroundColor: shownInsight ? `${meta.color}22` : meta.color }}
            >
              <MaterialCommunityIcons name={shownInsight ? "refresh" : "auto-fix"} size={13} color={shownInsight ? meta.color : "#0a0a0c"} />
              <Text style={{ fontSize: 12, fontWeight: "700", color: shownInsight ? meta.color : "#0a0a0c" }}>
                {activating ? "Thinking…" : shownInsight ? "Refresh insight" : `Activate ${meta.agent}`}
              </Text>
            </Pressable>
          </View>
        </View>

        {shownInsight && (
          <View style={{ backgroundColor: SURFACE2, borderWidth: 1, borderColor: HAIRLINE, borderLeftWidth: 3, borderLeftColor: meta.color, borderRadius: 6, padding: 12, marginBottom: 16 }}>
            <Text style={{ fontSize: 10, letterSpacing: 2, textTransform: "uppercase", color: FAINT, marginBottom: 6 }}>
              {`// ${meta.agent.toLowerCase()} says`}
            </Text>
            <MarkdownText text={shownInsight} size={12} />
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 18 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 6, backgroundColor: active ? t.color : SURFACE, borderWidth: active ? 0 : 1, borderColor: HAIRLINE }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK }}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {tab === "recipes" && <RecipesPanel />}
        {tab === "shopping" && <ShoppingPanel scoped={scoped} />}
        {tab === "guardian" && <GuardianPanel items={scoped} onOpenItem={(id) => router.push(`/item/${id}`)} />}
        {tab === "organizer" && <OrganizerPanel items={scoped} />}
      </ScrollView>

      {tab === "recipes" && (
        <Pressable
          onPress={() => router.push("/what-to-eat")}
          style={{
            position: "absolute",
            right: 20,
            bottom: 100,
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: AMBER,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.18)",
          }}
        >
          <MaterialCommunityIcons name="chef-hat" size={22} color="#0a0a0c" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

// ---- Recipes — the library ---------------------------------------------------

const RECIPE_FILTERS = ["all", "favorites", "breakfast", "lunch", "dinner", "dessert", "snack", "quick"] as const;

function RecipesPanel() {
  const router = useRouter();
  const { recipes } = useRecipes();
  const { items } = useInventory();
  const [filter, setFilter] = useState<(typeof RECIPE_FILTERS)[number]>("all");

  const view = useMemo(
    () =>
      recipes.map((r) => {
        const have = r.ingredients.filter((ing) =>
          items.some((i) => i.icon === ing.icon || i.name.toLowerCase() === ing.name.toLowerCase()),
        ).length;
        const total = r.ingredients.length;
        return { r, have, total, ready: total > 0 && have === total };
      }),
    [recipes, items],
  );
  const filtered = useMemo(() => {
    if (filter === "all") return view;
    if (filter === "favorites") return view.filter((v) => v.r.isFavorite);
    return view.filter((v) => v.r.category === filter);
  }, [view, filter]);
  const tonight = useMemo(
    () => (view.length ? [...view].sort((a, b) => b.have / b.total - a.have / a.total)[0] : null),
    [view],
  );

  return (
    <View>
      {tonight && (
        <Pressable
          onPress={() => router.push(`/recipe/${tonight.r.id}`)}
          style={{ backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 10, padding: 14, marginBottom: 18 }}
        >
          <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: INK, marginBottom: 8 }}>TONIGHT&apos;S PICK</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <FoodIcon icon={tonight.r.ingredients[0]?.icon ?? "leftovers"} name={tonight.r.name} size={46} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: INK, marginBottom: 3 }}>{tonight.r.name}</Text>
              <Text style={{ fontSize: 12, color: FAINT }}>
                {tonight.r.minutes} min · {tonight.have}/{tonight.total} ready
              </Text>
            </View>
          </View>
        </Pressable>
      )}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT }}>ALL RECIPES</Text>
        <Pressable onPress={() => router.push("/recipe-form")} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <MaterialCommunityIcons name="plus" size={14} color={BLUE} />
          <Text style={{ fontSize: 12.5, fontWeight: "700", color: BLUE }}>Add recipe</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginBottom: 14 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
        {RECIPE_FILTERS.map((f) => {
          const active = filter === f;
          return (
            <Pressable key={f} onPress={() => setFilter(f)} style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: 6, backgroundColor: active ? AMBER : SURFACE2 }}>
              <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? "#0a0a0c" : INK, textTransform: "capitalize" }}>
                {f === "all" ? "All" : f === "favorites" ? "Favorites" : f}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
        {filtered.length === 0 ? (
          <Text style={{ padding: 24, textAlign: "center", fontSize: 12.5, color: FAINT }}>No recipes here yet.</Text>
        ) : (
          filtered.map(({ r, have, total, ready }, i) => (
            <Pressable
              key={r.id}
              onPress={() => router.push(`/recipe/${r.id}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === filtered.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}
            >
              <FoodIcon icon={r.ingredients[0]?.icon ?? "leftovers"} name={r.name} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: INK }} numberOfLines={1}>
                    {r.name}
                  </Text>
                  {r.isFavorite && <MaterialCommunityIcons name="heart" size={11} color="#ff5567" />}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                  <Text style={{ fontSize: 11.5, color: FAINT }}>{r.minutes} min</Text>
                  {r.category && (
                    <View style={{ backgroundColor: `${BLUE}1a`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
                      <Text style={{ fontSize: 9.5, fontWeight: "800", letterSpacing: 0.3, color: BLUE }}>{r.category.toUpperCase()}</Text>
                    </View>
                  )}
                  {!r.isMine && r.isCustom && r.ownerUsername && (
                    <Text style={{ fontSize: 11, color: FAINT }}>by @{r.ownerUsername}</Text>
                  )}
                </View>
              </View>
              <View style={{ backgroundColor: ready ? "rgba(57,224,127,0.14)" : SURFACE2, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 }}>
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: ready ? GOOD : MUTED }}>{have}/{total} ready</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

// ---- Shopping ---------------------------------------------------------------

const REC_META = {
  recipe: { label: "Recipe", color: "#26c6da" },
  habit: { label: "Habit", color: "#5b8dee" },
} as const;

function ShoppingPanel({ scoped }: { scoped: FlatItem[] }) {
  const { items, add, toggle, remove } = useShopping();
  const { recipes } = useRecipes();
  const { usageHistory } = useKitchenScore();
  const [text, setText] = useState("");

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);
  const dontRebuy = useMemo(
    () => [...scoped].filter((i) => i.freshness < 50).sort((a, b) => a.freshness - b.freshness).slice(0, 5),
    [scoped],
  );
  const recs = getShoppingRecommendations({ items: scoped, recipes, shoppingList: items, usageHistory });

  const submit = () => {
    if (text.trim()) add(text);
    setText("");
  };

  return (
    <View style={{ gap: 22 }}>
      {dontRebuy.length > 0 && (
        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT }}>ALREADY HAVE — DON&apos;T REBUY</Text>
          <Text style={{ fontSize: 11, color: FAINT, marginBottom: 8, marginTop: 2 }}>Use these up before buying more</Text>
          <View style={{ borderRadius: 6, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
            {dontRebuy.map((it, i) => (
              <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, paddingHorizontal: 14, borderBottomWidth: i === dontRebuy.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}>
                <FoodIcon icon={it.icon} iconUrl={it.iconUrl} name={it.name} size={22} />
                <Text style={{ flex: 1, fontSize: 12.5, fontWeight: "600", color: INK }}>{it.name}</Text>
                <Text style={{ fontSize: 11, fontWeight: "700", color: freshColor(it.freshness) }}>{daysLabel(it.days)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View>
        <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>SHOPPING LIST</Text>
        <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={submit}
            placeholder="Add an item…"
            placeholderTextColor={FAINT}
            style={{ flex: 1, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: INK }}
          />
          <Pressable onPress={submit} style={{ justifyContent: "center", paddingHorizontal: 14, borderRadius: 6, backgroundColor: AMBER }}>
            <Text style={{ fontSize: 18, fontWeight: "700", color: "#0a0a0c" }}>+</Text>
          </Pressable>
        </View>
        {unchecked.length === 0 && checked.length === 0 ? (
          <Text style={{ fontSize: 13, color: FAINT, textAlign: "center", paddingVertical: 14 }}>Nothing on the list.</Text>
        ) : (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
            {[...unchecked, ...checked].map((it, i, arr) => (
              <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}>
                <Pressable onPress={() => toggle(it.id)} hitSlop={6}>
                  <MaterialCommunityIcons name={it.checked ? "checkbox-marked-circle" : "checkbox-blank-circle-outline"} size={20} color={it.checked ? GOOD : FAINT} />
                </Pressable>
                <Text style={{ flex: 1, fontSize: 14, color: it.checked ? FAINT : INK, textDecorationLine: it.checked ? "line-through" : "none" }}>{it.name}</Text>
                <Pressable onPress={() => remove(it.id)} hitSlop={6}>
                  <MaterialCommunityIcons name="close" size={16} color={FAINT} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {recs.length > 0 && (
        <View>
          <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.3, color: FAINT, marginBottom: 8 }}>RECOMMENDED FOR YOU</Text>
          <View style={{ gap: 8 }}>
            {recs.map((rec) => {
              const m = REC_META[rec.source];
              return (
                <View key={rec.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: SURFACE, borderWidth: 1, borderColor: HAIRLINE, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 14 }}>
                  <FoodIcon icon={rec.icon} name={rec.name} size={26} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: "600", color: INK }}>{rec.name}</Text>
                      <View style={{ backgroundColor: `${m.color}1a`, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 }}>
                        <Text style={{ fontSize: 9, fontWeight: "800", letterSpacing: 0.2, color: m.color }}>{m.label.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: FAINT, marginTop: 1 }}>{rec.reason}</Text>
                  </View>
                  <Pressable onPress={() => add(rec.name)} style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: AMBER, alignItems: "center", justifyContent: "center" }}>
                    <MaterialCommunityIcons name="plus" size={16} color="#0a0a0c" />
                  </Pressable>
                </View>
              );
            })}
          </View>
        </View>
      )}
    </View>
  );
}

// ---- Guardian — risk-banded at-risk items ---------------------------------

const RISK_BUCKETS: { key: string; label: string; test: (f: number) => boolean; hint: string }[] = [
  { key: "risk", label: "Act now", test: (f) => f < 30, hint: "Going bad soon — use or lose it" },
  { key: "watch", label: "Use soon", test: (f) => f >= 30 && f < 60, hint: "Plan to use within a few days" },
  { key: "fresh", label: "Fresh", test: (f) => f >= 60, hint: "Holding up well" },
];

function RingTimer({ freshness }: { freshness: number }) {
  const size = 40;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = freshColor(freshness);
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={HAIRLINE} strokeWidth={stroke} />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={`${c}`}
        strokeDashoffset={c - (Math.max(0, Math.min(100, freshness)) / 100) * c}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <SvgText x={size / 2} y={size / 2 + 4} textAnchor="middle" fontSize={11} fontWeight="800" fill={color}>
        {freshness}
      </SvgText>
    </Svg>
  );
}

function GuardianPanel({ items, onOpenItem }: { items: FlatItem[]; onOpenItem: (id: string) => void }) {
  const groups = useMemo(
    () =>
      RISK_BUCKETS.map((b) => ({
        ...b,
        items: [...items].sort((a, z) => a.freshness - z.freshness).filter((i) => b.test(i.freshness)),
      })).filter((g) => g.items.length > 0),
    [items],
  );

  if (items.length === 0) {
    return (
      <Text style={{ textAlign: "center", color: FAINT, fontSize: 13, marginTop: 40 }}>
        Nothing in this fridge yet — add items to have Guardian watch over them.
      </Text>
    );
  }

  return (
    <View style={{ gap: 20 }}>
      {groups.map((g) => (
        <View key={g.key}>
          <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: MUTED }}>
              {g.label.toUpperCase()} ({g.items.length})
            </Text>
            <Text style={{ fontSize: 11, color: FAINT }}>{g.hint}</Text>
          </View>
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
            {g.items.map((it, i) => (
              <Pressable
                key={it.id}
                onPress={() => onOpenItem(it.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === g.items.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}
              >
                <RingTimer freshness={it.freshness} />
                <FoodIcon icon={it.icon} iconUrl={it.iconUrl} name={it.name} size={28} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>{it.name}</Text>
                  <Text style={{ fontSize: 11.5, color: FAINT }} numberOfLines={1}>
                    {it.sectionName}
                    {it.note ? ` · ${it.note}` : ""}
                  </Text>
                </View>
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: freshColor(it.freshness) }}>{daysLabel(it.days)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---- Organizer — items grouped by location, inline move ------------------

const LOC_BLURB: Record<StorageLocation, string> = {
  fridge: "Everyday chilled items",
  freezer: "Long-term frozen items",
  pantry: "Shelf-stable, room temp",
};

function OrganizerPanel({ items }: { items: FlatItem[] }) {
  const { patchItem } = useInventory();

  return (
    <View>
      <FridgeNotes />
      <View style={{ height: 22 }} />
      {items.length === 0 ? (
        <Text style={{ textAlign: "center", color: FAINT, fontSize: 13, marginTop: 20 }}>
          Nothing to organize yet — add items to sort them into place.
        </Text>
      ) : (
        <View style={{ gap: 20 }}>
          {STORAGE_LOCATIONS.map((loc) => {
            const locItems = items.filter((i) => (i.location ?? "fridge") === loc.key);
            return (
              <View key={loc.key}>
                <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
                  <Text style={{ fontSize: 12, fontWeight: "800", letterSpacing: 0.3, color: loc.color }}>
                    {loc.label.toUpperCase()} ({locItems.length})
                  </Text>
                  <Text style={{ fontSize: 11, color: FAINT }}>{LOC_BLURB[loc.key]}</Text>
                </View>
                <View style={{ borderRadius: 8, borderWidth: 1, borderColor: HAIRLINE, backgroundColor: SURFACE, overflow: "hidden" }}>
                  {locItems.length === 0 ? (
                    <Text style={{ padding: 14, fontSize: 12.5, color: FAINT, textAlign: "center" }}>Nothing here yet</Text>
                  ) : (
                    locItems.map((it, i) => {
                      const current = it.location ?? "fridge";
                      return (
                        <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: i === locItems.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}>
                          <FoodIcon icon={it.icon} iconUrl={it.iconUrl} name={it.name} size={26} />
                          <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "600", color: INK }} numberOfLines={1}>
                            {it.name}
                          </Text>
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            {STORAGE_LOCATIONS.map((opt) => {
                              const active = opt.key === current;
                              return (
                                <Pressable
                                  key={opt.key}
                                  onPress={() => !active && patchItem(it.id, { location: opt.key })}
                                  style={{ width: 26, height: 26, borderRadius: 6, backgroundColor: active ? opt.color : SURFACE2, alignItems: "center", justifyContent: "center" }}
                                >
                                  <MaterialCommunityIcons
                                    name={opt.key === "fridge" ? "fridge-outline" : opt.key === "freezer" ? "snowflake" : "archive-outline"}
                                    size={13}
                                    color={active ? "#fff" : FAINT}
                                  />
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}
