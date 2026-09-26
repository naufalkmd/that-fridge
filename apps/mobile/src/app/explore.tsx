import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";

import { ApiError, describeError, type ExploreItem, type ExploreType } from "@thatfridge/core";
import { api } from "@/lib/api";
import { draftWithTimezone, EXPLORE_TYPES, planDays, planStartOptions, planSummary, sectionsByType, todayISO, typeMeta } from "@/lib/explore";
import { kcalLabel } from "@/lib/mealPlan";
import { useRecipes } from "@/lib/recipes";
import { useScope } from "@/lib/scope";
import { useInventory } from "@/lib/inventory";
import { useTheme } from "@/lib/theme";
import { getDeviceTimezone } from "@/lib/timezone";
import { useToast } from "@/lib/toast";
import { BottomSheet } from "@/components/bottom-sheet";
import { PageHeader, SkeletonList } from "@/components/ui";

let lastBrowse: { featured: ExploreItem[]; items: ExploreItem[] } | null = null;

const SEARCH_DELAY_MS = 250;
const PREVIEW = 6;

/**
 * Explore: search everything the community catalogue holds - recipes, Kitchen Lab Machines, meal plans and
 * food icons - or browse it (featured first, then by library). Tap something for its detail, and take it as
 * your own: a recipe is copied into your book, a Machine opens in Kitchen Lab for review, a meal plan goes on
 * your plan. What's listed and in which order is curated from the admin panel.
 */
export default function Explore() {
  const router = useRouter();
  const { colors } = useTheme();
  const toast = useToast();
  const { refresh: refreshRecipes } = useRecipes();
  const { fridges } = useInventory();
  const { scope } = useScope();

  const [query, setQuery] = useState("");
  const [type, setType] = useState<ExploreType | null>(null);
  // The last unfiltered browse is kept for the session, so coming back to Explore is instant while it refreshes.
  const [featured, setFeatured] = useState<ExploreItem[]>(lastBrowse?.featured ?? []);
  const [items, setItems] = useState<ExploreItem[]>(lastBrowse?.items ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<ExploreItem | null>(null);
  const [working, setWorking] = useState(false);

  const q = query.trim();

  // Search as you type, a beat after the last keystroke; stale answers are ignored.
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const timer = setTimeout(
      () => {
        api
          .getExplore({ q: q || undefined, type: type ?? undefined })
          .then((res) => {
            if (!alive) return;
            setFeatured(res.featured);
            setItems(res.items);
            if (!q && !type) lastBrowse = res;
          })
          .catch((e) => alive && setError(describeError(e, "Couldn't load Explore.")))
          .finally(() => alive && setLoading(false));
      },
      q ? SEARCH_DELAY_MS : 0,
    );
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, type, reload]);

  const sections = useMemo(() => sectionsByType(items), [items]);
  const browsing = q === "" && type === null;

  const fridgeId = scope !== "all" ? scope : (fridges.find((f) => f.role === "owner")?.id ?? fridges[0]?.id ?? null);

  const take = useCallback(
    async (item: ExploreItem, body?: { start?: string }) => {
      setWorking(true);
      try {
        const res = await api.useExploreItem(item.id, item.type === "meal_plan" ? { ...body, fridge_id: fridgeId } : undefined);
        if (res.type === "recipe") {
          void refreshRecipes();
          setOpen(null);
          toast.show(`Added "${res.recipe.name}" to your recipes`, {
            actionLabel: "Open",
            onAction: () => router.push(`/recipe/${res.recipe.id}`),
          });
        } else if (res.type === "machine") {
          setOpen(null);
          router.push({ pathname: "/kitchen-lab", params: { draft: JSON.stringify(draftWithTimezone(res.draft, getDeviceTimezone())) } });
        } else if (res.type === "meal_plan") {
          setOpen(null);
          const n = res.created.length;
          toast.show(
            n === 0 ? "Those slots are already planned" : `Added ${n} meal${n === 1 ? "" : "s"} to your plan${res.skipped > 0 ? ` · ${res.skipped} slot${res.skipped === 1 ? "" : "s"} already taken` : ""}`,
            { actionLabel: "View", onAction: () => router.push("/meal-plan") },
          );
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) {
          setOpen(null);
          setReload((n) => n + 1); // it was removed while you were looking
          Alert.alert("No longer available", "That item was removed from Explore.");
        } else {
          Alert.alert("Couldn't add that", describeError(e, "Please try again."));
        }
      } finally {
        setWorking(false);
      }
    },
    [fridgeId, refreshRecipes, router, toast],
  );

  function chooseMealPlanStart(item: ExploreItem) {
    const options = planStartOptions(todayISO());
    Alert.alert("When should it start?", "Meals go into slots that are still empty; anything you already planned stays.", [
      ...options.map((o) => ({ text: o.label, onPress: () => void take(item, { start: o.date }) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <PageHeader title="Explore" subtitle="Recipes, Machines, meal plans and food icons" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 48, gap: 14 }} keyboardShouldPersistTaps="handled">
        <View
          style={{
            flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 44, borderRadius: 10,
            backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
          }}
        >
          <Ionicons name="search" size={18} color={colors.faint} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search recipes, Machines, plans, icons"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Search Explore"
            autoCorrect={false}
            returnKeyType="search"
            style={{ flex: 1, fontSize: 14.5, color: colors.ink }}
          />
          {query !== "" && (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={18} color={colors.faint} />
            </Pressable>
          )}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={type === null} onPress={() => setType(null)} />
          {EXPLORE_TYPES.map((t) => (
            <Chip key={t.key} label={t.label} active={type === t.key} onPress={() => setType(t.key)} />
          ))}
        </ScrollView>

        {error && (
          <Pressable onPress={() => setReload((n) => n + 1)}>
            <Text style={{ fontSize: 12.5, color: colors.bad, textAlign: "center" }}>{error} Tap to retry.</Text>
          </Pressable>
        )}
        {loading && items.length === 0 && <SkeletonList rows={6} />}

        {!loading && !error && items.length === 0 && featured.length === 0 && (
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", marginTop: 24, lineHeight: 19 }}>
            {q ? `Nothing found for "${q}". Try a shorter or different word.` : "Nothing here yet."}
          </Text>
        )}

        {browsing && featured.length > 0 && (
          <View>
            <Heading>Featured</Heading>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
              {featured.map((item) => (
                <FeaturedCard key={item.id} item={item} onPress={() => setOpen(item)} />
              ))}
            </ScrollView>
          </View>
        )}

        {q !== "" && items.length > 0 && (
          <Text style={{ fontSize: 12, color: colors.faint }}>
            {items.length} result{items.length === 1 ? "" : "s"}
          </Text>
        )}

        {(browsing ? sections : sectionsByType(items)).map((section) => {
          const meta = typeMeta(section.type);
          const shown = browsing ? section.items.slice(0, PREVIEW) : section.items;
          return (
            <View key={section.type}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Heading>{meta.label}</Heading>
                {browsing && section.items.length > PREVIEW && (
                  <Pressable onPress={() => setType(section.type)} hitSlop={8} accessibilityLabel={`See all ${meta.label}`}>
                    <Text style={{ fontSize: 12.5, fontWeight: "700", color: colors.accent }}>See all ›</Text>
                  </Pressable>
                )}
              </View>
              {section.type === "icon" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {shown.map((item) => (
                    <IconTile key={item.id} item={item} onPress={() => setOpen(item)} />
                  ))}
                </View>
              ) : (
                <View style={{ borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" }}>
                  {shown.map((item, i) => (
                    <ItemRow key={item.id} item={item} last={i === shown.length - 1} onPress={() => setOpen(item)} />
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      <BottomSheet visible={open !== null} onClose={() => setOpen(null)}>
        {open && (
          <Detail
            item={open}
            working={working}
            onTake={() => (open.type === "meal_plan" ? chooseMealPlanStart(open) : void take(open))}
          />
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function Heading({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontSize: 14, fontWeight: "800", color: colors.ink, marginBottom: 8 }}>{children}</Text>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1,
        backgroundColor: active ? `${colors.accent}26` : colors.surface2, borderColor: active ? colors.accent : colors.hairline,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: active ? colors.accent : colors.muted }}>{label}</Text>
    </Pressable>
  );
}

/** The one-line facts under an item's title. */
function facts(item: ExploreItem): string {
  if (item.type === "recipe") {
    const r = item.recipe;
    return [r?.minutes ? `${r.minutes} min` : null, r?.calories ? kcalLabel(r.calories) : null, r?.mealType].filter(Boolean).join(" · ") || (item.blurb ?? "");
  }
  if (item.type === "meal_plan") return item.blurb ? `${planSummary(item)} · ${item.blurb}` : planSummary(item);
  return item.blurb ?? "";
}

function ItemRow({ item, last, onPress }: { item: ExploreItem; last: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const meta = typeMeta(item.type);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${meta.singular}: ${item.title}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.hairline }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: `${colors.accent}1f` }}>
        <Ionicons name={meta.icon as never} size={18} color={colors.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.ink }} numberOfLines={1}>{item.title}</Text>
        {facts(item) !== "" && <Text style={{ fontSize: 12, color: colors.faint, marginTop: 1 }} numberOfLines={1}>{facts(item)}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.faint} />
    </Pressable>
  );
}

function IconTile({ item, onPress }: { item: ExploreItem; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Food icon: ${item.title}`}
      style={{ width: 92, alignItems: "center", gap: 6, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}
    >
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={{ width: 56, height: 56 }} resizeMode="contain" /> : <View style={{ width: 56, height: 56 }} />}
      <Text style={{ fontSize: 11.5, color: colors.muted }} numberOfLines={1}>{item.title}</Text>
    </Pressable>
  );
}

function FeaturedCard({ item, onPress }: { item: ExploreItem; onPress: () => void }) {
  const { colors } = useTheme();
  const meta = typeMeta(item.type);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured ${meta.singular}: ${item.title}`}
      style={{ width: 200, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, gap: 6 }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Ionicons name={meta.icon as never} size={14} color={colors.accent} />
        <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: colors.accent }}>{meta.singular.toUpperCase()}</Text>
      </View>
      <Text style={{ fontSize: 15, fontWeight: "800", color: colors.ink }} numberOfLines={2}>{item.title}</Text>
      <Text style={{ fontSize: 12, color: colors.faint }} numberOfLines={2}>{facts(item)}</Text>
    </Pressable>
  );
}

const TAKE_LABEL: Record<ExploreType, string> = {
  recipe: "Add to my recipes",
  machine: "Use this Machine",
  meal_plan: "Add to my plan",
  icon: "",
};

function Detail({ item, working, onTake }: { item: ExploreItem; working: boolean; onTake: () => void }) {
  const { colors } = useTheme();
  const meta = typeMeta(item.type);
  const steps = item.type === "machine" ? ((item.payload as { steps?: { tool: string }[] } | null)?.steps ?? []).length : 0;
  return (
    <View style={{ padding: 20, gap: 12 }}>
      <Text style={{ fontSize: 11, fontWeight: "800", letterSpacing: 0.4, color: colors.accent }}>{meta.singular.toUpperCase()}</Text>
      <Text style={{ fontSize: 20, fontWeight: "800", color: colors.ink }}>{item.title}</Text>
      {item.blurb ? <Text style={{ fontSize: 13.5, lineHeight: 20, color: colors.muted }}>{item.blurb}</Text> : null}

      {item.type === "icon" && item.imageUrl && (
        <View style={{ alignItems: "center", padding: 16, borderRadius: 10, backgroundColor: colors.surface2 }}>
          <Image source={{ uri: item.imageUrl }} style={{ width: 120, height: 120 }} resizeMode="contain" />
        </View>
      )}
      {item.type === "recipe" && item.recipe && (
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {[item.recipe.minutes ? `${item.recipe.minutes} min` : null, `${item.recipe.ingredients} ingredient${item.recipe.ingredients === 1 ? "" : "s"}`, item.recipe.calories ? kcalLabel(item.recipe.calories) + " per serving" : null].filter(Boolean).join(" · ")}
        </Text>
      )}
      {item.type === "machine" && (
        <Text style={{ fontSize: 13, color: colors.muted }}>
          Opens in Kitchen Lab for you to review and save. {steps} step{steps === 1 ? "" : "s"}. Nothing runs until you turn it on.
        </Text>
      )}
      {item.type === "meal_plan" && (
        <View style={{ gap: 4 }}>
          <Text style={{ fontSize: 13, color: colors.muted }}>{planSummary(item)}</Text>
          {planDays(item).slice(0, 8).map((d, i) => (
            <Text key={i} style={{ fontSize: 12.5, color: colors.faint }}>
              Day {d.day + 1} · {d.slot} · {d.title}
            </Text>
          ))}
        </View>
      )}
      {item.tags.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {item.tags.slice(0, 8).map((t) => (
            <View key={t} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.surface2 }}>
              <Text style={{ fontSize: 11, color: colors.muted }}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {item.type === "icon" ? (
        <Text style={{ fontSize: 12.5, color: colors.faint, lineHeight: 18 }}>
          Shared icons are in the icon picker whenever you add or edit an item.
        </Text>
      ) : (
        <Pressable
          onPress={onTake}
          disabled={working}
          accessibilityRole="button"
          style={{ height: 48, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, opacity: working ? 0.6 : 1, marginTop: 4 }}
        >
          {working ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ fontSize: 15, fontWeight: "800", color: colors.onAccent }}>{TAKE_LABEL[item.type]}</Text>}
        </Pressable>
      )}
    </View>
  );
}
