import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  daysLabel,
  expiringOwnedItems,
  freshColor,
  fridgeHeroViews,
  guardianItem,
  kitchenScoreResults,
  lowStockItem,
  type FridgeStyleKey,
  type Recipe,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useNotifications } from "@/lib/notifications";
import { useShopping } from "@/lib/shopping";
import { PixelText } from "@/components/brand";
import { SectionHeader } from "@/components/ui";
import { KitchenScore } from "@/components/home/KitchenScore";
import { CrewScene } from "@/components/home/CrewScene";

const ACCENT = "#26c6da";
const BLUE = "#5b8dee";
const GOOD = "#39e07f";
const BAD = "#ff5567";
const SURFACE = "#131316";
const SURFACE2 = "#1a1a1f";
const HAIRLINE = "rgba(255,255,255,0.09)";
const STRONG = "rgba(255,255,255,0.18)";
const INK = "#eaeaec";
const MUTED = "rgba(234,234,236,0.58)";
const FAINT = "rgba(234,234,236,0.34)";

const FRIDGE_PHOTOS: Record<Exclude<FridgeStyleKey, "custom">, number> = {
  photo: require("../../../assets/images/thatfridge/fridge-hero.png"),
  classic: require("../../../assets/images/thatfridge/fridge-classic.png"),
  french: require("../../../assets/images/thatfridge/fridge-french.png"),
  retro: require("../../../assets/images/thatfridge/fridge-retro.png"),
  mini: require("../../../assets/images/thatfridge/fridge-mini.png"),
};

const AGENT_COLOR = {
  Guardian: "#ff5f56",
  Shopkeeper: "#39e07f",
  Chef: "#f5a623",
} as const;

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, fridges, loading, refresh } = useInventory();
  const { events, unread } = useNotifications();
  const { items: shoppingItems } = useShopping();

  const [refreshing, setRefreshing] = useState(false);
  const [scope, setScope] = useState<"all" | string>("all");
  const [scopeMenu, setScopeMenu] = useState(false);
  const [suggestions, setSuggestions] = useState<Recipe[] | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [heroWidth, setHeroWidth] = useState(0);
  const [heroSlide, setHeroSlide] = useState(0);
  const [newFridge, setNewFridge] = useState("");
  const heroRef = useRef<ScrollView>(null);

  useEffect(() => {
    let alive = true;
    api
      .suggestRecipes({})
      .then((r) => alive && setSuggestions([...r.exact, ...r.similar]))
      .catch(() => alive && setSuggestions([]));
    return () => {
      alive = false;
    };
  }, [items.length]);

  const scoped = useMemo(
    () => (scope === "all" ? items : items.filter((i) => i.fridgeId === scope)),
    [items, scope],
  );
  const scopeLabel =
    scope === "all" ? "All Fridges" : fridges.find((f) => f.id === scope)?.name ?? "This Fridge";

  const expiringCount = scoped.filter((i) => i.freshness < 50).length;
  const heroViews = useMemo(() => fridgeHeroViews(fridges), [fridges]);

  const guardian = useMemo(() => guardianItem(scoped), [scoped]);
  const lowStock = useMemo(() => lowStockItem(scoped, guardian?.id), [scoped, guardian]);
  const chefPick = suggestions?.[0] ?? null;

  const scoreInput = useMemo(
    () => ({
      items: scoped.map((i) => ({ days: i.days, freshness: i.freshness })),
      notificationEvents: events.map((e) => ({ kind: e.kind, done: e.done })),
      shoppingList: shoppingItems.map((s) => ({ checked: s.checked })),
    }),
    [scoped, events, shoppingItems],
  );

  const scoreByKey = useMemo(() => {
    const r = kitchenScoreResults(scoreInput);
    return {
      waste: r.find((x) => x.key === "waste")!.score,
      balance: r.find((x) => x.key === "balance")!.score,
      organizer: r.find((x) => x.key === "organizer")!.score,
      shopkeeper: r.find((x) => x.key === "shopkeeper")!.score,
    };
  }, [scoreInput]);

  const pendingByKind = useMemo(() => {
    const acc = { expiring: 0, lowStock: 0, recipe: 0 };
    for (const e of events) if (!e.done) acc[e.kind] += 1;
    return acc;
  }, [events]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function addFridge() {
    const name = newFridge.trim();
    if (!name) return;
    setNewFridge("");
    try {
      await api.createFridge(name);
      await refresh();
    } catch {
      /* ignore — surfaced on next load */
    }
  }

  function onHeroScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!heroWidth) return;
    setHeroSlide(Math.round(e.nativeEvent.contentOffset.x / heroWidth));
  }

  const slideCount = heroViews.length + 1;

  return (
    <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
      <ScrollView
        contentContainerClassName="px-6 pt-4 pb-16"
        contentContainerStyle={{ gap: 22 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#8a8a90" />
        }
      >
        {/* header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Pressable onPress={() => router.push("/profile")} hitSlop={8}>
            <View
              style={{
                height: 34,
                width: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SURFACE2,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "800", color: INK }}>
                {user?.name?.slice(0, 1).toUpperCase() ?? "?"}
              </Text>
            </View>
          </Pressable>
          <PixelText style={{ fontSize: 20, letterSpacing: 0.5, color: INK }}>ThatFridge</PixelText>
          <Pressable onPress={() => router.navigate("/notifications")} hitSlop={8}>
            <View
              style={{
                height: 34,
                width: 34,
                borderRadius: 17,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SURFACE,
                borderWidth: 1,
                borderColor: HAIRLINE,
              }}
            >
              <Ionicons name="notifications-outline" size={16} color={INK} />
              {unread > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: 5,
                    right: 6,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: BAD,
                    borderWidth: 1.5,
                    borderColor: SURFACE,
                  }}
                />
              )}
            </View>
          </Pressable>
        </View>

        {/* fridge scope picker */}
        <View style={{ zIndex: 10 }}>
          <Pressable
            onPress={() => setScopeMenu((v) => !v)}
            style={{
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 6,
              backgroundColor: SURFACE,
              borderWidth: 1,
              borderColor: HAIRLINE,
            }}
          >
            <MaterialCommunityIcons name="fridge-outline" size={14} color={INK} />
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: INK }}>{scopeLabel}</Text>
            <MaterialCommunityIcons name="chevron-down" size={14} color={INK} />
          </Pressable>
          {scopeMenu && (
            <View
              style={{
                position: "absolute",
                top: 42,
                left: 0,
                minWidth: 170,
                backgroundColor: SURFACE,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: HAIRLINE,
                padding: 6,
              }}
            >
              {[{ id: "all", name: "All Fridges" }, ...fridges].map((opt) => {
                const active = opt.id === scope;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => {
                      setScope(opt.id);
                      setScopeMenu(false);
                    }}
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      backgroundColor: active ? SURFACE2 : "transparent",
                    }}
                  >
                    <Text style={{ fontSize: 12.5, fontWeight: "600", color: active ? BLUE : INK }}>
                      {opt.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>

        {/* overview */}
        <View>
          <SectionHeader>Overview</SectionHeader>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <StatCard
              icon="cube-outline"
              tint={BLUE}
              value={loading ? "…" : String(scoped.length)}
              label="Items"
              onPress={() => router.navigate("/inventory")}
            />
            <StatCard
              icon="warning-outline"
              tint={BAD}
              value={loading ? "…" : String(expiringCount)}
              label="Expiring soon"
              onPress={() => router.navigate("/inventory")}
            />
            <StatCard
              icon="sparkles-outline"
              tint={GOOD}
              value={suggestions ? String(suggestions.length) : "…"}
              label="Suggestions"
              onPress={() => router.navigate("/eat")}
            />
          </View>
        </View>

        {/* your kitchen this week */}
        <KitchenScore input={scoreInput} />

        {/* fridge hero carousel */}
        <View>
          <View
            onLayout={(e: LayoutChangeEvent) => setHeroWidth(e.nativeEvent.layout.width)}
            style={{ borderRadius: 14, overflow: "hidden" }}
          >
            {heroWidth > 0 && (
              <ScrollView
                ref={heroRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onHeroScroll}
              >
                {heroViews.map((fr) => (
                  <View key={fr.id} style={{ width: heroWidth, height: 236 }}>
                    <Image
                      source={
                        fr.isCustom && fr.photoUrl
                          ? { uri: fr.photoUrl }
                          : FRIDGE_PHOTOS[(fr.style === "custom" ? "photo" : fr.style) as Exclude<
                              FridgeStyleKey,
                              "custom"
                            >] ?? FRIDGE_PHOTOS.photo
                      }
                      style={{ position: "absolute", inset: 0, backgroundColor: fr.bg }}
                      contentFit="cover"
                      contentPosition="center"
                    />
                    <View
                      style={{
                        position: "absolute",
                        top: 14,
                        left: 14,
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <View style={heroBadge}>
                        <Text style={{ fontSize: 12, fontWeight: "800", color: INK }}>{fr.name}</Text>
                      </View>
                      {fr.isShared && (
                        <View style={[heroBadge, { paddingHorizontal: 7 }]}>
                          <Ionicons name="people" size={13} color={INK} />
                        </View>
                      )}
                    </View>
                    <View style={[heroBadge, { position: "absolute", top: 14, right: 14 }]}>
                      <Text style={{ fontSize: 12, fontWeight: "800", color: fr.color }}>
                        {fr.freshness}% fresh
                      </Text>
                    </View>
                    <View
                      style={{
                        position: "absolute",
                        bottom: 12,
                        left: 14,
                        backgroundColor: "rgba(10,10,12,0.55)",
                        paddingVertical: 5,
                        paddingHorizontal: 10,
                        borderRadius: 20,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "600", color: INK }}>
                        {fr.itemCount} items tracked
                      </Text>
                    </View>
                  </View>
                ))}

                {/* add another fridge */}
                <View style={{ width: heroWidth, height: 236, padding: 4 }}>
                  <View
                    style={{
                      flex: 1,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderStyle: "dashed",
                      borderColor: STRONG,
                      backgroundColor: "rgba(19,19,22,0.5)",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      paddingHorizontal: 30,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: "700", color: INK }}>
                      Add another fridge
                    </Text>
                    <TextInput
                      value={newFridge}
                      onChangeText={setNewFridge}
                      placeholder="e.g. Garage, Office…"
                      placeholderTextColor={FAINT}
                      style={{
                        alignSelf: "stretch",
                        backgroundColor: SURFACE2,
                        borderRadius: 6,
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        fontSize: 13,
                        color: INK,
                      }}
                    />
                    <Pressable
                      onPress={addFridge}
                      style={{
                        backgroundColor: ACCENT,
                        paddingVertical: 9,
                        paddingHorizontal: 18,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: "700",
                          letterSpacing: 0.5,
                          textTransform: "uppercase",
                          color: "#0a0a0c",
                        }}
                      >
                        Add fridge
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </ScrollView>
            )}
          </View>
          <View
            style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 10 }}
          >
            {Array.from({ length: slideCount }).map((_, i) => (
              <Pressable
                key={i}
                onPress={() => heroRef.current?.scrollTo({ x: i * heroWidth, animated: true })}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: i === heroSlide ? INK : STRONG,
                }}
              />
            ))}
          </View>
        </View>

        {/* meet your crew */}
        <View>
          <SectionHeader>Your crew</SectionHeader>
          <CrewScene pendingByKind={pendingByKind} scoreByKey={scoreByKey} />
        </View>

        {/* crew tips */}
        {guardian && !dismissed.guardian && (
          <TipCard
            eyebrow="Expiring soon"
            agent="Guardian"
            onPress={() => router.push(`/item/${guardian.id}`)}
            onDismiss={() => setDismissed((d) => ({ ...d, guardian: true }))}
          >
            <Text style={{ fontSize: 13.5, color: INK }}>
              <Text style={{ fontWeight: "700" }}>{guardian.name}</Text>
              <Text style={{ color: MUTED }}> {daysLabel(guardian.days).toLowerCase()}</Text>
            </Text>
          </TipCard>
        )}
        {lowStock && !dismissed.lowStock && (
          <TipCard
            eyebrow="Low stock"
            agent="Shopkeeper"
            onPress={() => router.push("/shopping")}
            onDismiss={() => setDismissed((d) => ({ ...d, lowStock: true }))}
          >
            <Text style={{ fontSize: 13.5, color: INK }}>
              <Text style={{ fontWeight: "700" }}>{lowStock.name}</Text>
              <Text style={{ color: MUTED }}> is running low — add it to the list</Text>
            </Text>
          </TipCard>
        )}
        {!dismissed.chef && (
          <TipCard
            eyebrow="Chef's pick"
            agent="Chef"
            onPress={() => router.navigate("/eat")}
            onDismiss={() => setDismissed((d) => ({ ...d, chef: true }))}
          >
            <Text style={{ fontSize: 13.5, color: INK }}>
              {chefPick ? (
                <>
                  <Text style={{ fontWeight: "700" }}>{chefPick.name}</Text>
                  <Text style={{ color: MUTED }}> — {chefPick.minutes} min with what you have</Text>
                </>
              ) : (
                <Text style={{ color: MUTED }}>
                  See what you can cook with what&apos;s fresh right now.
                </Text>
              )}
            </Text>
          </TipCard>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const heroBadge = {
  backgroundColor: "rgba(19,19,22,0.85)",
  paddingVertical: 6,
  paddingHorizontal: 11,
  borderRadius: 14,
} as const;

function StatCard({
  icon,
  tint,
  value,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  value: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          backgroundColor: `${tint}1a`,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "800", color: INK }}>{value}</Text>
      <Text style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
}

function TipCard({
  eyebrow,
  agent,
  onPress,
  onDismiss,
  children,
}: {
  eyebrow: string;
  agent: keyof typeof AGENT_COLOR;
  onPress: () => void;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const color = AGENT_COLOR[agent];
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderRadius: 10,
        paddingVertical: 14,
        paddingHorizontal: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Text
          style={{
            fontSize: 11,
            fontWeight: "800",
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: INK,
          }}
        >
          {eyebrow}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{ backgroundColor: `${color}1a`, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 }}
          >
            <Text
              style={{
                fontSize: 9.5,
                fontWeight: "800",
                letterSpacing: 0.3,
                textTransform: "uppercase",
                color,
              }}
            >
              {agent}
            </Text>
          </View>
          <Pressable onPress={onDismiss} hitSlop={10}>
            <Ionicons name="close" size={15} color={FAINT} />
          </Pressable>
        </View>
      </View>
      {children}
    </Pressable>
  );
}
