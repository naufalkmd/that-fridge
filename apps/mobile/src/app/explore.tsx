import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { PixelText } from "@/components/brand";
import { FoodIcon } from "@/components/food-icon";
import { SkeletonList } from "@/components/ui";

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
  // "Find in Explore" on the recipe book opens straight onto recipes.
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const [type, setType] = useState<ExploreType | null>(() =>
    EXPLORE_TYPES.some((t) => t.key === typeParam) ? (typeParam as ExploreType) : null,
  );
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
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 48, gap: 22 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 14 }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </Pressable>
          <View style={{ gap: 4 }}>
            <PixelText style={{ fontSize: 16, color: colors.ink }}>Explore</PixelText>
            <Text style={{ fontSize: 12.5, color: colors.muted }}>Recipes, Machines, meal plans and food icons</Text>
          </View>

          <View
            style={{
              flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, height: 42, borderCurve: "continuous", borderRadius: 12,
              backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline,
            }}
          >
            <Ionicons name="search" size={15} color={colors.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search recipes, Machines, plans, icons"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Search Explore"
              autoCorrect={false}
              returnKeyType="search"
              style={{ flex: 1, fontSize: 13, color: colors.ink }}
            />
            {query !== "" && (
              <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={colors.faint} />
              </Pressable>
            )}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
            <Chip label="All" active={type === null} onPress={() => setType(null)} />
            {EXPLORE_TYPES.map((t) => (
              <Chip key={t.key} label={t.label} active={type === t.key} onPress={() => setType(t.key)} />
            ))}
          </ScrollView>
        </View>

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
          <View style={{ gap: 10 }}>
            <Heading>Featured</Heading>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {featured.map((item) => (
                <FeaturedCard key={item.id} item={item} wide={featured.length === 1} onPress={() => setOpen(item)} />
              ))}
            </ScrollView>
          </View>
        )}

        {q !== "" && items.length > 0 && (
          <Text style={{ fontSize: 12, color: colors.faint, marginBottom: -10 }}>
            {items.length} result{items.length === 1 ? "" : "s"}
          </Text>
        )}

        {(browsing ? sections : sectionsByType(items)).map((section) => {
          const meta = typeMeta(section.type);
          const shown = browsing ? section.items.slice(0, PREVIEW) : section.items;
          return (
            <View key={section.type} style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <Heading>{meta.label}</Heading>
                {browsing && section.items.length > PREVIEW && (
                  <Pressable onPress={() => setType(section.type)} hitSlop={8} accessibilityLabel={`See all ${meta.label}`}>
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.accent }}>See all</Text>
                  </Pressable>
                )}
              </View>
              {section.type === "icon" ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {shown.map((item) => (
                    <IconTile key={item.id} item={item} onPress={() => setOpen(item)} />
                  ))}
                </View>
              ) : section.type === "recipe" && browsing ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {shown.map((item) => (
                    <RecipeCard key={item.id} item={item} onPress={() => setOpen(item)} />
                  ))}
                </ScrollView>
              ) : section.type === "meal_plan" ? (
                <View style={{ gap: 8 }}>
                  {shown.map((item) => (
                    <MealPlanCard key={item.id} item={item} onPress={() => setOpen(item)} />
                  ))}
                </View>
              ) : (
                <View style={{ borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" }}>
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

/** Small uppercase section label (the text stays in its normal case; only the style upper-cases it). */
function Heading({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 1.2, textTransform: "uppercase", color: colors.muted }}>
      {children}
    </Text>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={{ height: 32, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, justifyContent: "center", backgroundColor: active ? colors.accent : colors.surface2 }}
    >
      <Text style={{ fontSize: 12, fontWeight: active ? "700" : "600", color: active ? colors.onAccent : colors.muted }}>{label}</Text>
    </Pressable>
  );
}

// Each library keeps one quiet colour: a tint behind its artwork, the glyph in the full colour.
const MACHINE_PURPLE = "#a855f7";
function typeColor(type: ExploreType, colors: ReturnType<typeof useTheme>["colors"]): string {
  if (type === "recipe") return colors.warn;
  if (type === "machine") return MACHINE_PURPLE;
  if (type === "meal_plan") return colors.blue;
  return colors.good;
}

/** An item's artwork on a tinted square: the recipe's food icon, the icon's picture, else the library's glyph. */
function Art({ item, size, radius }: { item: ExploreItem; size: number; radius: number }) {
  const { colors } = useTheme();
  const tint = typeColor(item.type, colors);
  const meta = typeMeta(item.type);
  return (
    <View style={{ width: size, height: size, borderCurve: "continuous", borderRadius: radius, alignItems: "center", justifyContent: "center", backgroundColor: `${tint}24` }}>
      {item.type === "recipe" ? (
        <FoodIcon icon={item.recipe?.icon} iconUrl={item.recipe?.iconUrl} name={item.title} size={Math.round(size * 0.78)} />
      ) : item.type === "icon" && item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={{ width: size * 0.62, height: size * 0.62 }} resizeMode="contain" />
      ) : (
        <Ionicons name={meta.icon as never} size={Math.round(size * 0.46)} color={tint} />
      )}
    </View>
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
      <Art item={item} size={36} radius={12} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }} numberOfLines={1}>{item.title}</Text>
        {facts(item) !== "" && <Text style={{ fontSize: 11.5, color: colors.muted }} numberOfLines={1}>{facts(item)}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.faint} />
    </Pressable>
  );
}

/** Browse view: a recipe as a small card in a sideways row. */
function RecipeCard({ item, onPress }: { item: ExploreItem; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Recipe: ${item.title}`}
      style={{ width: 140, padding: 12, gap: 10, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}
    >
      <Art item={item} size={44} radius={12} />
      <View style={{ gap: 3 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }} numberOfLines={2}>{item.title}</Text>
        {facts(item) !== "" && <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>{facts(item)}</Text>}
      </View>
    </Pressable>
  );
}

/** A meal plan with its first few days, so you can see what's in it before opening. */
function MealPlanCard({ item, onPress }: { item: ExploreItem; onPress: () => void }) {
  const { colors } = useTheme();
  const days = planDays(item);
  const preview = days.slice(0, 3);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Meal plan: ${item.title}`}
      style={{ padding: 14, gap: 12, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Art item={item} size={36} radius={12} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.ink }} numberOfLines={1}>{item.title}</Text>
          <Text style={{ fontSize: 11.5, color: colors.muted }} numberOfLines={1}>{facts(item)}</Text>
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.faint} />
      </View>
      {preview.length > 0 && (
        <View style={{ gap: 6 }}>
          {preview.map((d, i) => (
            <View key={i} style={{ flexDirection: "row", gap: 10 }}>
              <Text style={{ width: 44, fontSize: 12, color: colors.faint }}>Day {d.day + 1}</Text>
              <Text style={{ flex: 1, fontSize: 12, color: colors.ink }} numberOfLines={1}>{d.slot} · {d.title}</Text>
            </View>
          ))}
          {days.length > preview.length && (
            <Text style={{ fontSize: 11.5, color: colors.faint }}>+ {days.length - preview.length} more</Text>
          )}
        </View>
      )}
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
      style={{ width: 50, height: 50, borderCurve: "continuous", borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface }}
    >
      {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={{ width: 30, height: 30 }} resizeMode="contain" /> : null}
    </Pressable>
  );
}

function FeaturedCard({ item, wide, onPress }: { item: ExploreItem; wide: boolean; onPress: () => void }) {
  const { colors, width } = useFeaturedWidth(wide);
  const meta = typeMeta(item.type);
  const tint = typeColor(item.type, colors);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Featured ${meta.singular}: ${item.title}`}
      style={{ width, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderCurve: "continuous", borderRadius: 16, borderWidth: 1, borderColor: `${tint}40`, backgroundColor: colors.surface, overflow: "hidden" }}
    >
      <View style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "55%", backgroundColor: `${tint}10` }} />
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 1.2, color: tint }}>FEATURED {meta.singular.toUpperCase()}</Text>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.ink }} numberOfLines={2}>{item.title}</Text>
        {facts(item) !== "" && <Text style={{ fontSize: 12, color: colors.muted }} numberOfLines={2}>{facts(item)}</Text>}
        <View style={{ alignSelf: "flex-start", marginTop: 4, height: 30, paddingHorizontal: 12, borderCurve: "continuous", borderRadius: 12, justifyContent: "center", backgroundColor: colors.accent }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: colors.onAccent }}>View</Text>
        </View>
      </View>
      <Art item={item} size={72} radius={16} />
    </Pressable>
  );
}

/** One featured item fills the row; several share it as a sideways scroll with the next one peeking in. */
function useFeaturedWidth(wide: boolean) {
  const { colors } = useTheme();
  const { width: screen } = useWindowDimensions();
  return { colors, width: wide ? screen - 32 : Math.min(300, screen - 64) };
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {item.type !== "icon" && <Art item={item} size={48} radius={12} />}
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ fontSize: 11, fontWeight: "600", letterSpacing: 1.2, color: typeColor(item.type, colors) }}>{meta.singular.toUpperCase()}</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: colors.ink }}>{item.title}</Text>
        </View>
      </View>
      {item.blurb ? <Text style={{ fontSize: 13, lineHeight: 19, color: colors.muted }}>{item.blurb}</Text> : null}

      {item.type === "icon" && item.imageUrl && (
        <View style={{ alignItems: "center", padding: 16, borderCurve: "continuous", borderRadius: 16, backgroundColor: colors.surface2 }}>
          <Image source={{ uri: item.imageUrl }} style={{ width: 96, height: 96 }} resizeMode="contain" />
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
            <View key={t} style={{ paddingHorizontal: 8, paddingVertical: 3, borderCurve: "continuous", borderRadius: 8, backgroundColor: colors.surface2 }}>
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
          style={{ height: 46, borderCurve: "continuous", borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent, opacity: working ? 0.6 : 1, marginTop: 4 }}
        >
          {working ? <ActivityIndicator color={colors.onAccent} /> : <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onAccent }}>{TAKE_LABEL[item.type]}</Text>}
        </Pressable>
      )}
    </View>
  );
}
