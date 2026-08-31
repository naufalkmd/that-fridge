import { useCallback, useMemo, useRef, useState } from "react";
import {
  LayoutRectangle,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
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
  daysLabel,
  freshColor,
  type Category,
  type FlatItem,
} from "@thatfridge/core";
import { useInventory } from "@/lib/inventory";
import { useCategories } from "@/lib/categories";
import { useScope, scopeItems } from "@/lib/scope";
import { PixelText } from "@/components/brand";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { CategoryTag, LocationTag } from "@/components/tags";
import { FoodIcon } from "@/components/food-icon";
import { SkeletonList } from "@/components/ui";

const ACCENT = "#26c6da";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const INK = "#eaeaec";
const BLUE = "#5b8dee";
const FAINT = "rgba(234,234,236,0.34)";
const MUTED = "rgba(234,234,236,0.58)";

const UNCATEGORIZED = "__uncat__";

type Sort = "category" | "expiry" | "name";
const SORT_OPTIONS: { key: Sort; label: string }[] = [
  { key: "category", label: "Category" },
  { key: "expiry", label: "Expiry" },
  { key: "name", label: "Name" },
];

export default function Inventory() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, loading, error, refresh } = useInventory();
  const { categories, assign } = useCategories();
  const { scope } = useScope();

  const [sort, setSort] = useState<Sort>("expiry");
  const [sortMenu, setSortMenu] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const selecting = selectMode || selected.size > 0;

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
      return [...filtered].sort((a, b) => a.freshness - b.freshness);
    if (sort === "name")
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered;
  }, [filtered, sort]);

  const grouped = useMemo(() => {
    if (sort !== "category") return null;
    const byExpiry = (a: FlatItem, b: FlatItem) => a.freshness - b.freshness;
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
              <HeaderBtn
                icon="add"
                accent
                onPress={() => router.push("/add")}
              />
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
                borderColor: "#ff5567",
                backgroundColor: SURFACE,
                padding: 12,
              }}
            >
              <Text style={{ fontWeight: "600", color: "#ff5567" }}>
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
                          color: active ? "#0a0a0c" : INK,
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
                      {g.items.map((item, i) =>
                        renderRow(item, i === g.items.length - 1),
                      )}
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
                  {sorted.map((item, i) =>
                    renderRow(item, i === sorted.length - 1),
                  )}
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
                color="#0a0a0c"
              />
              <Text
                style={{ fontSize: 12.5, fontWeight: "800", color: "#0a0a0c" }}
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
                          ? "#0a0a0c"
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
  return (
    <Modal
      transparent
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: "rgba(0,0,0,0.55)",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: SURFACE,
            borderTopLeftRadius: 18,
            borderTopRightRadius: 18,
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 34,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: HAIRLINE,
              marginBottom: 12,
            }}
          />
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
              <Text
                style={{ fontSize: 13.5, fontWeight: "700", color: ACCENT }}
              >
                New / manage categories
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
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
          color={accent ? "#0a0a0c" : INK}
        />
      </View>
    </Pressable>
  );
}

function ItemRow({
  item,
  last,
  showFridge,
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
          backgroundColor: selected ? "rgba(38,198,218,0.12)" : "transparent",
        }}
      >
        {selecting ? (
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              borderWidth: 1.5,
              borderColor: selected ? ACCENT : "rgba(255,255,255,0.25)",
              backgroundColor: selected ? ACCENT : "transparent",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {selected && (
              <MaterialCommunityIcons name="check" size={13} color="#0a0a0c" />
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
            <LocationTag location={item.location} />
            <CategoryTag category={item.nutritionCategory} />
          </View>
          {showFridge && (
            <Text
              style={{ fontSize: 10.5, color: FAINT, marginBottom: 5 }}
              numberOfLines={1}
            >
              {item.fridgeName}
            </Text>
          )}
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
