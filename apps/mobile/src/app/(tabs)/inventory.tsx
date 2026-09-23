import { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
  LayoutAnimation,
  LayoutRectangle,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  addedAgoLabel,
  daysLabel,
  freshColor,
  freshnessBand,
  normalizeItemName,
  type Category,
  type FlatItem,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useCategories } from "@/lib/categories";
import { useScope, scopeItems } from "@/lib/scope";
import { PixelText } from "@/components/brand";
import { BottomSheet } from "@/components/bottom-sheet";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { CategoryTag, LocationTag } from "@/components/tags";
import { FoodIcon } from "@/components/food-icon";
import { SkeletonList } from "@/components/ui";
import { useTheme } from "@/lib/theme";

const UNCATEGORIZED = "__uncat__";

// Most urgent color band first, then soonest-to-expire within the same band.
const byExpiry = (a: FlatItem, b: FlatItem) => freshnessBand(a.freshness) - freshnessBand(b.freshness) || a.days - b.days;

type Sort = "category" | "expiry" | "days" | "name";
const SORT_OPTIONS: { key: Sort; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "expiry", label: "Expiry" },
  { key: "days", label: "Days Left" },
  { key: "name", label: "Name" },
];

export default function Inventory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, loading, error, refresh, removeManyItems } = useInventory();
  const { categories, assign } = useCategories();
  const { scope } = useScope();
  const {
    accent: ACCENT,
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    ink: INK,
    blue: BLUE,
    faint: FAINT,
    muted: MUTED,
    onAccent: CANVAS,
    canvas: PAGE_CANVAS,
    bad: BAD,
  } = useTheme().colors;

  const [sort, setSort] = useState<Sort>("expiry");
  const [sortMenu, setSortMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const selecting = selectMode || selected.size > 0;
  // Same-name items collapse into one row by default (see buildRowDescriptors) - this is
  // just which collapsed groups the user has opened back up, keyed by normalizeItemName.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // ── drag an item onto a category ──────────────────────────────────────────
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const lastHoverRef = useRef<string | null>(null);
  const dropBarOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dropBarRef = useRef<View>(null);
  const pillLayoutsRef = useRef<Record<string, LayoutRectangle>>({});
  const gx = useSharedValue(0);
  const gy = useSharedValue(0);

  const ghostStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: gx.value - 24 }, { translateY: gy.value - 58 }],
  }));

  const hoverAt = useCallback((absX: number, absY: number) => {
    const origin = dropBarOriginRef.current;
    let hit: string | null = null;
    if (origin) {
      const lx = absX - origin.x;
      const ly = absY - origin.y;
      for (const [id, r] of Object.entries(pillLayoutsRef.current)) {
        if (
          lx >= r.x &&
          lx <= r.x + r.width &&
          ly >= r.y &&
          ly <= r.y + r.height
        ) {
          hit = id;
          break;
        }
      }
    }
    if (hit !== lastHoverRef.current) {
      lastHoverRef.current = hit;
      dropTargetRef.current = hit;
      setDropTarget(hit);
      if (hit) void Haptics.selectionAsync();
    }
  }, []);

  const beginDrag = useCallback((id: string) => {
    dragIdRef.current = id;
    lastHoverRef.current = null;
    dropTargetRef.current = null;
    setDragId(id);
    setDropTarget(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dropBarRef.current?.measureInWindow((x, y) => {
      dropBarOriginRef.current = { x, y };
    });
  }, []);

  const endDrag = useCallback(() => {
    const id = dragIdRef.current;
    const target = dropTargetRef.current;
    dragIdRef.current = null;
    dropTargetRef.current = null;
    lastHoverRef.current = null;
    dropBarOriginRef.current = null;
    setDragId(null);
    setDropTarget(null);
    if (!id || target === null) return;
    const categoryId = target === UNCATEGORIZED ? null : target;
    assign([id], categoryId)
      .then(() =>
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
      )
      .catch(() => {});
  }, [assign]);

  const showFridgeTags = scope === "all";
  const allItems = useMemo(() => scopeItems(items, scope), [items, scope]);

  const hasUncat = useMemo(
    () => allItems.some((i) => !i.categoryId),
    [allItems],
  );

  // Same-name items the user can't tell apart ("which banana is the new one?").
  // Flag every row in a duplicate group, and mark the one to use first — soonest
  // to expire, ties broken by whichever was added earliest.
  const { dupKeys, useFirstIds } = useMemo(() => {
    const groups = new Map<string, FlatItem[]>();
    for (const it of allItems) {
      const k = normalizeItemName(it.name);
      const g = groups.get(k);
      if (g) g.push(it);
      else groups.set(k, [it]);
    }
    const keys = new Set<string>();
    const first = new Set<string>();
    for (const [k, g] of groups) {
      if (g.length < 2) continue;
      keys.add(k);
      const oldest = [...g].sort(
        (a, b) =>
          a.freshness - b.freshness ||
          (a.added ?? "").localeCompare(b.added ?? ""),
      )[0];
      if (oldest) first.add(oldest.id);
    }
    return { dupKeys: keys, useFirstIds: first };
  }, [allItems]);
  const chips = useMemo(
    () => [
      { id: "all", name: "All" },
      ...categories.map((c) => ({ id: c.id, name: c.name })),
      ...(hasUncat ? [{ id: UNCATEGORIZED, name: "Uncategorized" }] : []),
    ],
    [categories, hasUncat],
  );

  const filtered = useMemo(() => {
    if (categoryFilter === "all") return allItems;
    if (categoryFilter === UNCATEGORIZED)
      return allItems.filter((i) => !i.categoryId);
    return allItems.filter((i) => i.categoryId === categoryFilter);
  }, [allItems, categoryFilter]);

  const sorted = useMemo(() => {
    if (sort === "expiry")
      return [...filtered].sort(byExpiry);
    if (sort === "days")
      return [...filtered].sort((a, b) => a.days - b.days);
    if (sort === "name")
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    if (sort !== "category") return null;
    return [
      ...categories.map((c) => ({
        id: c.id,
        name: c.name,
        items: filtered.filter((i) => i.categoryId === c.id).sort(byExpiry),
      })),
      {
        id: UNCATEGORIZED,
        name: "Uncategorized",
        items: filtered.filter((i) => !i.categoryId).sort(byExpiry),
      },
    ].filter((g) => g.items.length > 0);
  }, [filtered, sort, categories]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  const dragItem = useMemo(
    () => (dragId ? (allItems.find((i) => i.id === dragId) ?? null) : null),
    [dragId, allItems],
  );

  const dropPills = useMemo(
    () => [
      ...categories.map((c) => ({ id: c.id, name: c.name })),
      { id: UNCATEGORIZED, name: "Uncategorized" },
    ],
    [categories],
  );

  const renderRow = (item: FlatItem, last: boolean) => (
    <ItemRow
      key={item.id}
      item={item}
      last={last}
      showFridge={showFridgeTags}
      duplicate={dupKeys.has(normalizeItemName(item.name))}
      useFirst={useFirstIds.has(item.id)}
      selecting={selecting}
      selected={selected.has(item.id)}
      dragging={dragId === item.id}
      dragDisabled={selecting}
      gx={gx}
      gy={gy}
      onDragStart={beginDrag}
      onDragMove={hoverAt}
      onDragEnd={endDrag}
      onPress={() =>
        selecting ? toggleSelect(item.id) : router.push(`/item/${item.id}`)
      }
    />
  );

  // Collapses same-name items (dupKeys) into one row, in whichever position the current
  // sort would have placed the first-encountered member - so an "Expiry" sort still shows
  // the group where its soonest-to-expire entry belongs, etc. Skipped entirely while
  // selecting: bulk actions (multi-select, drag-to-move) work per-item, and a collapsed
  // group doesn't have an unambiguous single item to select or drag.
  type Row = { type: "single"; item: FlatItem } | { type: "group"; key: string; items: FlatItem[] };
  const buildRowDescriptors = (list: FlatItem[]): Row[] => {
    if (selecting) return list.map((item) => ({ type: "single", item }));
    // Scoped to this specific list (a category's items, or the flat filtered list) rather
    // than dupKeys/allItems - a name that's duplicated globally but has only one entry in
    // this particular category (when sorted/grouped by category) should render as a plain
    // single row here, not an oddly-collapsed "group" of one.
    const byKey = new Map<string, FlatItem[]>();
    for (const it of list) {
      const key = normalizeItemName(it.name);
      const g = byKey.get(key);
      if (g) g.push(it);
      else byKey.set(key, [it]);
    }
    const emitted = new Set<string>();
    const out: Row[] = [];
    for (const item of list) {
      const key = normalizeItemName(item.name);
      const group = byKey.get(key)!;
      if (group.length < 2) {
        out.push({ type: "single", item });
        continue;
      }
      if (emitted.has(key)) continue;
      emitted.add(key);
      out.push({ type: "group", key, items: group });
    }
    return out;
  };

  const renderList = (list: FlatItem[]) =>
    buildRowDescriptors(list).map((row, i, arr) => {
      const last = i === arr.length - 1;
      return row.type === "single" ? (
        renderRow(row.item, last)
      ) : (
        <MergedItemGroup
          key={`group-${row.key}`}
          items={row.items}
          last={last}
          expanded={expandedGroups.has(row.key)}
          onToggle={() => toggleGroup(row.key)}
          renderChild={renderRow}
        />
      );
    });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const exitSelect = () => {
    setSelected(new Set());
    setSelectMode(false);
  };

  async function moveTo(categoryId: string | null) {
    const ids = [...selected];
    setMoveOpen(false);
    setSelected(new Set());
    setSelectMode(false);
    try {
      await assign(ids, categoryId);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* assign() rolls nothing back locally; refresh on next load */
    }
  }

  function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} item${ids.length === 1 ? "" : "s"}?`,
      "This removes them from your fridge. It can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSelected(new Set());
            setSelectMode(false);
            try {
              await removeManyItems(ids);
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              );
            } catch (e) {
              Alert.alert(
                "Error",
                e instanceof Error ? e.message : "Couldn't delete those items.",
              );
            }
          },
        },
      ],
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
        <ScrollView
          contentContainerClassName="px-5 pt-3 pb-40"
          scrollEnabled={!dragId}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8a8a90"
            />
          }
          onScrollBeginDrag={() => setSortMenu(false)}
        >
          {/* header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <PixelText style={{ fontSize: 16, letterSpacing: 0.5, color: INK }}>
              Inventory
            </PixelText>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeaderBtn icon="search" onPress={() => router.push("/search")} />
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <FridgeScopePicker small />
          </View>

          {error && (
            <Pressable
              onPress={refresh}
              style={{
                marginBottom: 14,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: BAD,
                backgroundColor: SURFACE,
                padding: 12,
              }}
            >
              <Text style={{ fontWeight: "600", color: BAD }}>
                {error}
              </Text>
              <Text style={{ marginTop: 2, fontSize: 12, color: MUTED }}>
                Tap to retry.
              </Text>
            </Pressable>
          )}

          {loading ? (
            <View style={{ marginTop: 12 }}>
              <SkeletonList rows={6} />
            </View>
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 12,
                  zIndex: 10,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: "700", color: INK }}>
                  {selecting
                    ? selected.size > 0
                      ? `${selected.size} selected`
                      : "Select items"
                    : "All items"}
                </Text>
                {selecting ? (
                  <Pressable onPress={exitSelect} hitSlop={8}>
                    <Text
                      style={{ fontSize: 12.5, fontWeight: "700", color: BLUE }}
                    >
                      Cancel
                    </Text>
                  </Pressable>
                ) : (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Pressable
                      onPress={() => {
                        setSortMenu(false);
                        setSelectMode(true);
                      }}
                      hitSlop={8}
                      style={{
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 6,
                        backgroundColor: SURFACE,
                        borderWidth: 1,
                        borderColor: HAIRLINE,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: "700",
                          color: INK,
                        }}
                      >
                        Select
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => setSortMenu((v) => !v)}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingVertical: 6,
                        paddingHorizontal: 10,
                        borderRadius: 6,
                        backgroundColor: SURFACE,
                        borderWidth: 1,
                        borderColor: HAIRLINE,
                      }}
                    >
                      <MaterialCommunityIcons
                        name="filter-variant"
                        size={13}
                        color={INK}
                      />
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: "700",
                          color: INK,
                        }}
                      >
                        {SORT_OPTIONS.find((o) => o.key === sort)?.label}
                      </Text>
                    </Pressable>
                    {sortMenu && (
                      <View
                        style={{
                          position: "absolute",
                          right: 0,
                          top: 38,
                          minWidth: 120,
                          backgroundColor: SURFACE,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: HAIRLINE,
                          padding: 6,
                        }}
                      >
                        {SORT_OPTIONS.map((opt) => (
                          <Pressable
                            key={opt.key}
                            onPress={() => {
                              setSort(opt.key);
                              setSortMenu(false);
                            }}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              borderRadius: 6,
                              backgroundColor:
                                sort === opt.key ? SURFACE2 : "transparent",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12.5,
                                fontWeight: "600",
                                color: sort === opt.key ? BLUE : INK,
                              }}
                            >
                              {opt.label}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* category chips */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -20, marginBottom: 14 }}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
              >
                {chips.map((cat) => {
                  const active = categoryFilter === cat.id;
                  return (
                    <Pressable
                      key={cat.id}
                      onPress={() => setCategoryFilter(cat.id)}
                      style={{
                        paddingVertical: 7,
                        paddingHorizontal: 14,
                        borderRadius: 6,
                        backgroundColor: active ? INK : SURFACE,
                        borderWidth: active ? 0 : 1,
                        borderColor: HAIRLINE,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12.5,
                          fontWeight: "700",
                          color: active ? PAGE_CANVAS : INK,
                        }}
                      >
                        {cat.name}
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  onPress={() => router.push("/categories")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    paddingVertical: 7,
                    paddingHorizontal: 12,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    borderStyle: "dashed",
                  }}
                >
                  <MaterialCommunityIcons
                    name="pencil-outline"
                    size={12}
                    color={MUTED}
                  />
                  <Text
                    style={{ fontSize: 12, fontWeight: "700", color: MUTED }}
                  >
                    Categories
                  </Text>
                </Pressable>
              </ScrollView>

              {filtered.length === 0 ? (
                <Text
                  style={{
                    marginTop: 40,
                    marginBottom: 20,
                    textAlign: "center",
                    fontSize: 13,
                    color: FAINT,
                  }}
                >
                  {items.length === 0
                    ? "Nothing in your fridge yet."
                    : "Nothing in this category."}
                </Text>
              ) : grouped ? (
                grouped.map((g) => (
                  <View key={g.id} style={{ marginBottom: 22 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        marginBottom: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "700",
                          color: g.id === UNCATEGORIZED ? MUTED : INK,
                        }}
                      >
                        {g.name}
                      </Text>
                      <Text style={{ fontSize: 12, color: FAINT }}>
                        {g.items.length} items
                      </Text>
                    </View>
                    <View
                      style={{
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: HAIRLINE,
                        backgroundColor: SURFACE,
                        overflow: "hidden",
                      }}
                    >
                      {renderList(g.items)}
                    </View>
                  </View>
                ))
              ) : (
                <View
                  style={{
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    backgroundColor: SURFACE,
                    overflow: "hidden",
                    marginBottom: 22,
                  }}
                >
                  {renderList(sorted)}
                </View>
              )}

              {!selecting && (
                <Pressable
                  onPress={() => router.push("/add")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 13,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: HAIRLINE,
                    borderStyle: "dashed",
                    marginBottom: 22,
                  }}
                >
                  <Ionicons name="add" size={16} color={ACCENT} />
                  <Text
                    style={{ fontSize: 13, fontWeight: "700", color: ACCENT }}
                  >
                    Add an item
                  </Text>
                </Pressable>
              )}
            </>
          )}
        </ScrollView>

        {/* selection action bar */}
        {selected.size > 0 && (
          <View
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: (insets.bottom || 10) + 78,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
              borderRadius: 14,
              padding: 10,
            }}
          >
            <Text
              style={{
                flex: 1,
                marginLeft: 4,
                fontSize: 13,
                fontWeight: "700",
                color: INK,
              }}
            >
              {selected.size} selected
            </Text>
            <Pressable
              onPress={deleteSelected}
              hitSlop={6}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: SURFACE2,
                borderWidth: 1,
                borderColor: `${BAD}66`,
                paddingVertical: 9,
                paddingHorizontal: 12,
                borderRadius: 8,
              }}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={15}
                color={BAD}
              />
              <Text
                style={{ fontSize: 12.5, fontWeight: "800", color: BAD }}
              >
                Delete
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMoveOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                backgroundColor: ACCENT,
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: 8,
              }}
            >
              <MaterialCommunityIcons
                name="folder-move-outline"
                size={15}
                color={CANVAS}
              />
              <Text
                style={{ fontSize: 12.5, fontWeight: "800", color: CANVAS }}
              >
                Move to…
              </Text>
            </Pressable>
          </View>
        )}

        <MoveToSheet
          visible={moveOpen}
          categories={categories}
          count={selected.size}
          onClose={() => setMoveOpen(false)}
          onPick={moveTo}
          onManage={() => {
            setMoveOpen(false);
            router.push("/categories");
          }}
        />

        {/* drag-to-categorise: drop bar + finger ghost */}
        {dragId && (
          <View
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: (insets.bottom || 10) + 78,
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: ACCENT,
              borderRadius: 14,
              padding: 10,
            }}
          >
            <Text
              style={{
                fontSize: 10.5,
                fontWeight: "800",
                letterSpacing: 0.4,
                color: FAINT,
                marginBottom: 8,
                textTransform: "uppercase",
              }}
            >
              Drop on a category
            </Text>
            <View
              ref={dropBarRef}
              onLayout={() =>
                dropBarRef.current?.measureInWindow((x, y) => {
                  dropBarOriginRef.current = { x, y };
                })
              }
              style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
            >
              {dropPills.map((c) => {
                const active = dropTarget === c.id;
                return (
                  <View
                    key={c.id}
                    onLayout={(e) => {
                      pillLayoutsRef.current[c.id] = e.nativeEvent.layout;
                    }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 8,
                      backgroundColor: active ? ACCENT : SURFACE2,
                      borderWidth: 1,
                      borderColor: active ? ACCENT : HAIRLINE,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: "700",
                        color: active
                          ? CANVAS
                          : c.id === UNCATEGORIZED
                            ? MUTED
                            : INK,
                      }}
                    >
                      {c.name}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {dragItem && (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", top: 0, left: 0, zIndex: 999 },
              ghostStyle,
            ]}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                maxWidth: 220,
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: SURFACE2,
                borderWidth: 1,
                borderColor: ACCENT,
              }}
            >
              <FoodIcon
                icon={dragItem.icon}
                iconUrl={dragItem.iconUrl}
                name={dragItem.name}
                size={22}
              />
              <Text
                style={{ fontSize: 13, fontWeight: "700", color: INK }}
                numberOfLines={1}
              >
                {dragItem.name}
              </Text>
            </View>
          </Animated.View>
        )}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

function MoveToSheet({
  visible,
  categories,
  count,
  onClose,
  onPick,
  onManage,
}: {
  visible: boolean;
  categories: Category[];
  count: number;
  onClose: () => void;
  onPick: (categoryId: string | null) => void;
  onManage: () => void;
}) {
  const {
    accent: ACCENT,
    hairline: HAIRLINE,
    ink: INK,
    faint: FAINT,
    muted: MUTED,
  } = useTheme().colors;
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: "700",
          color: FAINT,
          marginBottom: 10,
        }}
      >
        Move {count} item{count === 1 ? "" : "s"} to…
      </Text>
      <ScrollView style={{ maxHeight: 340 }}>
        {categories.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => onPick(c.id)}
            style={{
              paddingVertical: 13,
              paddingHorizontal: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "600", color: INK }}>
              {c.name}
            </Text>
          </Pressable>
        ))}
        <Pressable
          onPress={() => onPick(null)}
          style={{
            paddingVertical: 13,
            paddingHorizontal: 10,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 14, fontWeight: "600", color: MUTED }}>
            Uncategorized (clear)
          </Text>
        </Pressable>
        <Pressable
          onPress={onManage}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingVertical: 13,
            paddingHorizontal: 10,
            borderRadius: 8,
            borderTopWidth: 1,
            borderTopColor: HAIRLINE,
            marginTop: 4,
          }}
        >
          <MaterialCommunityIcons name="plus" size={15} color={ACCENT} />
          <Text style={{ fontSize: 13.5, fontWeight: "700", color: ACCENT }}>
            New / manage categories
          </Text>
        </Pressable>
      </ScrollView>
    </BottomSheet>
  );
}

function HeaderBtn({
  icon,
  accent,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  accent?: boolean;
  onPress: () => void;
}) {
  const { accent: ACCENT, surface: SURFACE, hairline: HAIRLINE, ink: INK, onAccent: CANVAS } = useTheme().colors;
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <View
        style={{
          height: 34,
          width: 34,
          borderRadius: 17,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: accent ? ACCENT : SURFACE,
          borderWidth: accent ? 0 : 1,
          borderColor: HAIRLINE,
        }}
      >
        <Ionicons
          name={icon}
          size={accent ? 20 : 16}
          color={accent ? CANVAS : INK}
        />
      </View>
    </Pressable>
  );
}

/**
 * Collapsed default view for 2+ items sharing a name ("which banana is the new one?") -
 * replaces the old approach of flagging every row individually with a "USE FIRST" badge
 * while still listing them as separate rows. Header shows the soonest-to-expire entry's
 * freshness/date (the one actually worth acting on) and the combined quantity; tapping it
 * expands to the exact same per-item rows as before (still with their own USE FIRST badge,
 * added-ago label, stepper, tap-to-open) via `renderChild`, so nothing about editing an
 * individual entry changed - only the resting/collapsed state did.
 */
function MergedItemGroup({
  items,
  last,
  expanded,
  onToggle,
  renderChild,
}: {
  items: FlatItem[];
  last: boolean;
  expanded: boolean;
  onToggle: () => void;
  renderChild: (item: FlatItem, last: boolean) => React.ReactNode;
}) {
  const { surface2: SURFACE2, hairline: HAIRLINE, ink: INK, faint: FAINT, blue: BLUE } = useTheme().colors;
  const ordered = useMemo(() => [...items].sort(byExpiry), [items]);
  const soonest = ordered[0];
  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const fresh = freshColor(soonest.freshness);

  return (
    <View>
      <Pressable
        onPress={onToggle}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderBottomWidth: !expanded && last ? 0 : 1,
          borderBottomColor: HAIRLINE,
        }}
      >
        <View style={{ width: 38, height: 38, borderRadius: 6, backgroundColor: SURFACE2, alignItems: "center", justifyContent: "center" }}>
          <FoodIcon icon={soonest.icon} iconUrl={soonest.iconUrl} name={soonest.name} size={30} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <Text style={{ flexShrink: 1, fontSize: 14, fontWeight: "600", color: INK }} numberOfLines={1}>
              {soonest.name}
            </Text>
            <View style={{ backgroundColor: `${BLUE}29`, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 }}>
              <Text style={{ fontSize: 8.5, fontWeight: "800", letterSpacing: 0.4, color: BLUE }}>
                {items.length}×
              </Text>
            </View>
          </View>
          <Text style={{ fontSize: 10.5, color: FAINT, marginBottom: 5 }} numberOfLines={1}>
            {expanded ? "Tap to collapse" : `${items.length} entries · tap to see all`}
          </Text>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: SURFACE2, overflow: "hidden" }}>
            <View style={{ height: "100%", borderRadius: 2, width: `${Math.max(3, soonest.freshness)}%`, backgroundColor: fresh }} />
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: fresh }}>{daysLabel(soonest.days)}</Text>
          <Text style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>{totalQty} total</Text>
        </View>
        <MaterialCommunityIcons name={expanded ? "chevron-up" : "chevron-down"} size={16} color={FAINT} />
      </Pressable>
      {expanded && (
        <View style={{ backgroundColor: `${SURFACE2}80` }}>
          {ordered.map((item, i) => renderChild(item, last && i === ordered.length - 1))}
        </View>
      )}
    </View>
  );
}

function ItemRow({
  item,
  last,
  showFridge,
  duplicate,
  useFirst,
  selecting,
  selected,
  dragging,
  dragDisabled,
  gx,
  gy,
  onDragStart,
  onDragMove,
  onDragEnd,
  onPress,
}: {
  item: FlatItem;
  last: boolean;
  showFridge: boolean;
  duplicate: boolean;
  useFirst: boolean;
  selecting: boolean;
  selected: boolean;
  dragging: boolean;
  dragDisabled: boolean;
  gx: SharedValue<number>;
  gy: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragMove: (absX: number, absY: number) => void;
  onDragEnd: () => void;
  onPress: () => void;
}) {
  const { setItemQty } = useInventory();
  const [editingQty, setEditingQty] = useState(false);
  const [qtyDraft, setQtyDraft] = useState(String(item.qty));
  const {
    accent: ACCENT,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    hairlineStrong: STRONG,
    ink: INK,
    blue: BLUE,
    faint: FAINT,
    warn: WARN,
    onAccent: CANVAS,
  } = useTheme().colors;
  const fresh = freshColor(item.freshness);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!dragDisabled)
        .activateAfterLongPress(260)
        .maxPointers(1)
        .onStart((e) => {
          "worklet";
          gx.value = e.absoluteX;
          gy.value = e.absoluteY;
          runOnJS(onDragStart)(item.id);
        })
        .onUpdate((e) => {
          "worklet";
          gx.value = e.absoluteX;
          gy.value = e.absoluteY;
          runOnJS(onDragMove)(e.absoluteX, e.absoluteY);
        })
        .onFinalize(() => {
          "worklet";
          runOnJS(onDragEnd)();
        }),
    [item.id, dragDisabled, gx, gy, onDragStart, onDragMove, onDragEnd],
  );

  return (
    <GestureDetector gesture={pan}>
      <Pressable
        onPress={onPress}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderBottomWidth: last ? 0 : 1,
          borderBottomColor: HAIRLINE,
          opacity: dragging ? 0.3 : 1,
          backgroundColor: selected ? `${ACCENT}1f` : "transparent",
        }}
      >
        {selecting ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 1.5,
              borderColor: selected ? ACCENT : STRONG,
              backgroundColor: selected ? ACCENT : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected && (
              <MaterialCommunityIcons name="check" size={13} color={CANVAS} />
            )}
          </View>
        ) : (
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              backgroundColor: SURFACE2,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <FoodIcon
              icon={item.icon}
              iconUrl={item.iconUrl}
              name={item.name}
              size={30}
            />
          </View>
        )}

        <View style={{ flex: 1, minWidth: 0 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginBottom: 4,
            }}
          >
            <Text
              style={{
                flexShrink: 1,
                fontSize: 14,
                fontWeight: "600",
                color: INK,
              }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {item.opened && (
              <MaterialCommunityIcons
                name="package-variant"
                size={12}
                color={BLUE}
              />
            )}
            {useFirst && (
              <View
                style={{
                  backgroundColor: `${WARN}29`,
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 8.5,
                    fontWeight: "800",
                    letterSpacing: 0.4,
                    color: WARN,
                  }}
                >
                  USE FIRST
                </Text>
              </View>
            )}
            <LocationTag location={item.location} />
            <CategoryTag category={item.nutritionCategory} />
          </View>
          {(() => {
            const sub = [
              showFridge ? item.fridgeName : null,
              duplicate ? addedAgoLabel(item.added) : null,
            ]
              .filter(Boolean)
              .join("  ·  ");
            return sub ? (
              <Text
                style={{ fontSize: 10.5, color: FAINT, marginBottom: 5 }}
                numberOfLines={1}
              >
                {sub}
              </Text>
            ) : null;
          })()}
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: SURFACE2,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                borderRadius: 2,
                width: `${Math.max(3, item.freshness)}%`,
                backgroundColor: fresh,
              }}
            />
          </View>
        </View>

        <View style={{ alignItems: "flex-end" }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: fresh }}>
            {daysLabel(item.days)}
          </Text>
          {!!item.note && (
            <Text
              style={{
                fontSize: 10.5,
                color: FAINT,
                marginTop: 2,
                maxWidth: 90,
              }}
              numberOfLines={1}
            >
              {item.note}
            </Text>
          )}
          {!selecting && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              <Stepper
                icon="minus"
                onPress={() => setItemQty(item.id, item.qty - 1)}
              />
              {editingQty ? (
                <TextInput
                  value={qtyDraft}
                  onChangeText={setQtyDraft}
                  onBlur={() => {
                    setEditingQty(false);
                    const n = parseInt(qtyDraft, 10);
                    if (Number.isFinite(n) && n >= 1 && n !== item.qty) {
                      setItemQty(item.id, n);
                    } else {
                      setQtyDraft(String(item.qty));
                    }
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  autoFocus
                  returnKeyType="done"
                  style={{
                    minWidth: 22,
                    textAlign: "center",
                    fontSize: 12,
                    fontWeight: "700",
                    color: INK,
                    padding: 0,
                  }}
                />
              ) : (
                // Tap the number itself to type an exact quantity - the +/- buttons alone
                // meant getting from 1 to 24 took 23 taps.
                <Pressable
                  onPress={() => {
                    setQtyDraft(String(item.qty));
                    setEditingQty(true);
                  }}
                  hitSlop={6}
                >
                  <Text
                    style={{
                      minWidth: 14,
                      textAlign: "center",
                      fontSize: 12,
                      fontWeight: "700",
                      color: INK,
                    }}
                  >
                    {item.qty}
                  </Text>
                </Pressable>
              )}
              <Stepper
                icon="plus"
                onPress={() => setItemQty(item.id, item.qty + 1)}
              />
            </View>
          )}
        </View>
      </Pressable>
    </GestureDetector>
  );
}

function Stepper({
  icon,
  onPress,
}: {
  icon: "minus" | "plus";
  onPress: () => void;
}) {
  const { surface2: SURFACE2, ink: INK } = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={{
        height: 20,
        width: 20,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: SURFACE2,
      }}
    >
      <MaterialCommunityIcons name={icon} size={11} color={INK} />
    </Pressable>
  );
}
