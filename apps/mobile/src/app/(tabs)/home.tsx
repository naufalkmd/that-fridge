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
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

import {
  daysLabel,
  expiringOwnedItems,
  freshColor,
  fridgeHeroViews,
  guardianItem,
  getOverallScore,
  kitchenScoreResults,
  lowStockItem,
  type FridgeStyleKey,
  type Recipe,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";
import { useNotifications } from "@/lib/notifications";
import { useScope, scopeItems } from "@/lib/scope";
import { useShopping } from "@/lib/shopping";
import { useKitchenScore } from "@/lib/kitchenScore";
import { useStaleCache } from "@/lib/useStaleCache";
import { useSocial } from "@/lib/social";
import { useCrewTip } from "@/lib/crewTips";
import { usePro } from "@/lib/pro";
import { useTheme } from "@/lib/theme";
import { PixelText } from "@/components/brand";
import { MarkdownText } from "@/components/markdown-text";
import { SectionHeader, Skeleton } from "@/components/ui";
import { FridgeScopePicker } from "@/components/fridge-scope";
import { GettingStarted } from "@/components/home/GettingStarted";
import { CrewDock } from "@/components/home/CrewDock";
import { tabBarBottom, TAB_BAR_HEIGHT, TAB_FAB_RISE } from "@/components/tab-bar";
import { FridgeNotes } from "@/components/home/FridgeNotes";
import { Shortcuts } from "@/components/home/Shortcuts";
import { SwipeRow } from "@/components/swipe-row";
import { NotificationCard, NotificationRow } from "@/components/notification-row";
import { NotificationUndoSnackbar } from "@/components/notification-undo-snackbar";

const PRO_PURPLE = "#a78bfa";

const FRIDGE_PHOTOS: Record<Exclude<FridgeStyleKey, "custom">, number> = {
  photo: require("../../../assets/images/thatfridge/fridge-hero.png"),
  classic: require("../../../assets/images/thatfridge/fridge-classic.png"),
  french: require("../../../assets/images/thatfridge/fridge-french.png"),
  retro: require("../../../assets/images/thatfridge/fridge-retro.png"),
  mini: require("../../../assets/images/thatfridge/fridge-mini.png"),
};

type CrewAgent = "Guardian" | "Shopkeeper" | "Chef";

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const { items, fridges, loading, refresh } = useInventory();
  const { events, prefs, requestRemove } = useNotifications();
  const { items: shoppingItems } = useShopping();
  const { scope, setScope } = useScope();
  const { usageHistory, organizerTally } = useKitchenScore();
  const { pendingCount } = useSocial();
  const { isPro } = usePro();
  const {
    blue: BLUE,
    good: GOOD,
    bad: BAD,
    surface: SURFACE,
    surface2: SURFACE2,
    hairline: HAIRLINE,
    hairlineStrong: STRONG,
    ink: INK,
    muted: MUTED,
    canvas: CANVAS,
  } = useTheme().colors;

  const [refreshing, setRefreshing] = useState(false);
  const [suggestions, setSuggestions] = useState<Recipe[] | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  // The crew dock floats above the tab bar: open at the top of Home, collapsed once scrolled.
  const insets = useSafeAreaInsets();
  const dockBottom = tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + TAB_FAB_RISE - 6;
  const [crewCollapsed, setCrewCollapsed] = useState(false);
  const crewCollapsedRef = useRef(false);
  const onHomeScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = e.nativeEvent.contentOffset.y > 40;
    if (next !== crewCollapsedRef.current) {
      crewCollapsedRef.current = next;
      setCrewCollapsed(next);
    }
  };

  const [heroWidth, setHeroWidth] = useState(0);
  const [heroSlide, setHeroSlide] = useState(0);
  const heroRef = useRef<ScrollView>(null);

  // Crew-tip interactions feed the Algorithm insights (server logs only with "Help improve" on).
  const dismissTip = (tip: "guardian" | "lowStock" | "chef") => {
    setDismissed((d) => ({ ...d, [tip]: true }));
    api.tipFeedback(tip, "dismissed").catch(() => {});
  };
  const openTip = (tip: "guardian" | "lowStock" | "chef", go: () => void) => {
    api.tipFeedback(tip, "opened").catch(() => {});
    go();
  };

  const openProfile = () => router.push("/profile");
  // Swipe right anywhere on Home to jump to Profile — a shortcut alongside the header
  // avatar button. Requires a clearly horizontal, rightward, fairly brisk drag so it
  // doesn't fight the page's vertical scroll or the hero carousel's own horizontal swipe.
  const swipeToProfile = Gesture.Pan()
    .activeOffsetX([-1000000, 32])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      "worklet";
      if (e.translationX > 70 && e.velocityX > 200) {
        runOnJS(openProfile)();
      }
    });

  // Last launch's Chef pick shows straight away; the fresh one replaces it. Waits for the fridge to load first
  // (asking while it is still empty just wastes a request and returns the wrong picks).
  const { markFresh: markSuggestionsFresh } = useStaleCache<Recipe[] | null>("homeSuggestions", suggestions, setSuggestions);
  useEffect(() => {
    if (loading) return;
    let alive = true;
    api
      .suggestRecipes({})
      .then((r) => {
        if (!alive) return;
        markSuggestionsFresh();
        setSuggestions([...r.exact, ...r.similar]);
      })
      .catch(() => alive && setSuggestions((prev) => prev ?? []));
    return () => {
      alive = false;
    };
  }, [items.length, loading, markSuggestionsFresh]);

  const scoped = useMemo(() => scopeItems(items, scope), [items, scope]);
  // A single-fridge view only shows that fridge's notifications; "All Fridges" shows everything.
  const scopedEvents = useMemo(
    () => (scope === "all" ? events : events.filter((e) => e.fridgeId === scope)),
    [events, scope],
  );

  const expiringCount = scoped.filter((i) => i.freshness < 50).length;
  const heroViews = useMemo(() => fridgeHeroViews(fridges), [fridges]);

  const guardian = useMemo(() => guardianItem(scoped), [scoped]);
  const lowStock = useMemo(
    () => lowStockItem(scoped, guardian?.id),
    [scoped, guardian],
  );
  const chefPick = suggestions?.[0] ?? null;
  // The Crew tip cards follow the same switches as the alerts (Notification settings); unknown yet = on.
  const showGuardian = !!guardian && !dismissed.guardian && (prefs?.expiryAlerts ?? true);
  const showLowStock = !!lowStock && !dismissed.lowStock && (prefs?.lowStock ?? true);
  const showChef = !dismissed.chef && (prefs?.recipeTips ?? true);

  const scoreInput = useMemo(
    () => ({
      items: scoped.map((i) => ({ days: i.days, freshness: i.freshness })),
      notificationEvents: scopedEvents.map((e) => ({ kind: e.kind, done: e.done })),
      shoppingList: shoppingItems.map((s) => ({ checked: s.checked })),
      usageHistory,
      organizerTally,
    }),
    [scoped, scopedEvents, shoppingItems, usageHistory, organizerTally],
  );

  const overallScore = useMemo(() => getOverallScore(kitchenScoreResults(scoreInput)), [scoreInput]);

  const pendingByKind = useMemo(() => {
    const acc = { expiring: 0, lowStock: 0, recipe: 0 };
    for (const e of scopedEvents) {
      if (!e.done && e.kind in acc) acc[e.kind as keyof typeof acc] += 1;
    }
    return acc;
  }, [scopedEvents]);

  const recentEvents = useMemo(() => scopedEvents.slice(0, 3), [scopedEvents]);

  async function onRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  function onHeroScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    if (!heroWidth) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / heroWidth);
    setHeroSlide(idx);
    // Swiping to a fridge makes it the active scope (the "add fridge" slide is last → no match).
    const fr = heroViews[idx];
    if (fr && fr.id !== scope) setScope(fr.id);
  }

  // Keep the carousel in sync when scope changes elsewhere (the picker) or on first layout.
  useEffect(() => {
    if (!heroWidth) return;
    const idx = heroViews.findIndex((f) => f.id === scope);
    if (idx >= 0 && idx !== heroSlide) {
      heroRef.current?.scrollTo({ x: idx * heroWidth, animated: true });
      setHeroSlide(idx);
    }
    // heroSlide intentionally omitted — it's the value we're reconciling, not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, heroWidth, heroViews]);

  const slideCount = heroViews.length + 1;

  return (
    <GestureDetector gesture={swipeToProfile}>
      <SafeAreaView className="flex-1 bg-canvas" edges={["top"]}>
        <ScrollView
          contentContainerClassName="px-6 pt-4"
          // Room for the collapsed crew dock under the last card.
          contentContainerStyle={{ gap: 22, paddingBottom: dockBottom + 80 }}
          onScroll={onHomeScroll}
          scrollEventThrottle={32}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8a8a90"
            />
          }
        >
          {/* header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Pressable
              onPress={() => router.push("/profile")}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Profile and settings"
            >
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
                <Text style={{ fontSize: 13, fontWeight: "700", color: INK }}>
                  {user?.name?.slice(0, 1).toUpperCase() ?? "?"}
                </Text>
              </View>
              {/* A tiny cog on the corner says this opens your profile and settings, not just a picture. */}
              <View
                style={{
                  position: "absolute",
                  right: -4,
                  bottom: -4,
                  height: 16,
                  width: 16,
                  borderRadius: 8,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: SURFACE,
                  borderWidth: 1.5,
                  borderColor: CANVAS,
                }}
              >
                <Ionicons name="settings-sharp" size={9} color={MUTED} />
              </View>
            </Pressable>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <PixelText style={{ fontSize: 20, letterSpacing: 0.5, color: INK }}>
                ThatFridge
              </PixelText>
              {isPro && (
                <View
                  style={{
                    backgroundColor: `${PRO_PURPLE}1f`,
                    borderCurve: "continuous", borderRadius: 8,
                    paddingHorizontal: 6,
                    paddingVertical: 4,
                  }}
                >
                  <Ionicons name="star" size={11} color={PRO_PURPLE} />
                </View>
              )}
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <HeaderIcon
                icon="person-add-outline"
                dot={pendingCount > 0}
                onPress={() => router.push("/find-friend")}
              />
              <HeaderIcon
                icon="notifications-outline"
                dot={scopedEvents.some((e) => !e.done)}
                onPress={() => router.navigate("/notifications")}
              />
            </View>
          </View>

          {/* fridge scope picker (Calendar moved into the shortcuts under the banner) */}
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <FridgeScopePicker />
          </View>

          {/* first-run checklist — hides itself once complete or dismissed */}
          <GettingStarted />

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

          {/* fridge hero carousel */}
          <View>
            <View
              onLayout={(e: LayoutChangeEvent) =>
                setHeroWidth(e.nativeEvent.layout.width)
              }
              style={{ borderCurve: "continuous", borderRadius: 16, overflow: "hidden" }}
            >
              {(heroWidth === 0 || (loading && fridges.length === 0)) && <Skeleton height={236} radius={16} />}
              {heroWidth > 0 && !(loading && fridges.length === 0) && (
                <ScrollView
                  ref={heroRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={onHeroScroll}
                >
                  {heroViews.map((fr) => (
                    <Pressable
                      key={fr.id}
                      onPress={() => {
                        setScope(fr.id);
                        router.navigate("/inventory");
                      }}
                      style={{ width: heroWidth, height: 236 }}
                    >
                      <Image
                        source={
                          fr.isCustom && fr.photoUrl
                            ? { uri: fr.photoUrl }
                            : (FRIDGE_PHOTOS[
                                (fr.style === "custom"
                                  ? "photo"
                                  : fr.style) as Exclude<FridgeStyleKey, "custom">
                              ] ?? FRIDGE_PHOTOS.photo)
                        }
                        style={{
                          position: "absolute",
                          inset: 0,
                          backgroundColor: fr.bg,
                        }}
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
                        <View style={heroBadge(SURFACE)}>
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "700",
                              color: INK,
                            }}
                          >
                            {fr.name}
                          </Text>
                        </View>
                        {fr.isShared && (
                          <View style={[heroBadge(SURFACE), { paddingHorizontal: 7 }]}>
                            <Ionicons name="people" size={13} color={INK} />
                          </View>
                        )}
                      </View>
                      <View
                        style={[
                          heroBadge(SURFACE),
                          { position: "absolute", top: 14, right: 14 },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 12,
                            fontWeight: "700",
                            color: fr.color,
                          }}
                        >
                          {fr.freshness}% fresh
                        </Text>
                      </View>
                      <View
                        style={{
                          position: "absolute",
                          bottom: 12,
                          left: 14,
                          backgroundColor: `${CANVAS}8c`,
                          paddingVertical: 5,
                          paddingHorizontal: 10,
                          borderCurve: "continuous", borderRadius: 16,
                        }}
                      >
                        <Text
                          style={{ fontSize: 11, fontWeight: "600", color: INK }}
                        >
                          {fr.itemCount} items tracked
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => router.push(`/fridge/${fr.id}`)}
                        style={{
                          position: "absolute",
                          bottom: 12,
                          right: 14,
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: `${SURFACE}d9`,
                        }}
                      >
                        <MaterialCommunityIcons
                          name="palette-outline"
                          size={16}
                          color={INK}
                        />
                      </Pressable>
                    </Pressable>
                  ))}

                  {/* add / manage fridges */}
                  <Pressable
                    onPress={() => router.push("/fridges")}
                    style={{ width: heroWidth, height: 236, padding: 4 }}
                  >
                    <View
                      style={{
                        flex: 1,
                        borderCurve: "continuous", borderRadius: 16,
                        borderWidth: 2,
                        borderStyle: "dashed",
                        borderColor: STRONG,
                        backgroundColor: `${SURFACE}80`,
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 12,
                      }}
                    >
                      <View
                        style={{
                          width: 46,
                          height: 46,
                          borderRadius: 23,
                          backgroundColor: SURFACE2,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Ionicons name="add" size={24} color={INK} />
                      </View>
                      <Text
                        style={{ fontSize: 14, fontWeight: "700", color: INK }}
                      >
                        Add or manage fridges
                      </Text>
                    </View>
                  </Pressable>
                </ScrollView>
              )}
            </View>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: 6,
                marginTop: 10,
              }}
            >
              {Array.from({ length: slideCount }).map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() =>
                    heroRef.current?.scrollTo({
                      x: i * heroWidth,
                      animated: true,
                    })
                  }
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

          {/* shortcuts to the places otherwise only reachable from Profile */}
          <Shortcuts />


          {/* One Notifications section, one card style: the server events (same
              NotificationsProvider state / swipe-delete row as the full /notifications screen)
              followed by the live crew tips (computed from the scoped fridge, dismissed locally). */}
          {(recentEvents.length > 0 || showGuardian || showLowStock || showChef) && (
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 11,
                }}
              >
                <SectionHeader>Notifications</SectionHeader>
                <Pressable onPress={() => router.push("/notifications")} hitSlop={8}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: BLUE }}>See all</Text>
                </Pressable>
              </View>
              {recentEvents.map((e) => (
                <SwipeRow key={e.id} onDelete={() => requestRemove(e.id)}>
                  <NotificationRow event={e} onClear={() => requestRemove(e.id)} />
                </SwipeRow>
              ))}
              {showGuardian && guardian && (
                <SwipeRow onDelete={() => dismissTip("guardian")}>
                  <CrewTip
                    meta="Guardian · Expiring soon"
                    agent="Guardian"
                    items={scoped}
                    onPress={() => openTip("guardian", () => router.push(`/item/${guardian.id}`))}
                    onDismiss={() => dismissTip("guardian")}
                    fallback={
                      <Text style={{ fontSize: 13, color: INK }}>
                        <Text style={{ fontWeight: "700" }}>{guardian.name}</Text>
                        <Text style={{ color: MUTED }}>
                          {" "}
                          {daysLabel(guardian.days).toLowerCase()}
                        </Text>
                      </Text>
                    }
                  />
                </SwipeRow>
              )}
              {showLowStock && lowStock && (
                <SwipeRow onDelete={() => dismissTip("lowStock")}>
                  <CrewTip
                    meta="Shopkeeper · Low stock"
                    agent="Shopkeeper"
                    items={scoped}
                    onPress={() => openTip("lowStock", () => router.push("/shopping"))}
                    onDismiss={() => dismissTip("lowStock")}
                    fallback={
                      <Text style={{ fontSize: 13, color: INK }}>
                        <Text style={{ fontWeight: "700" }}>{lowStock.name}</Text>
                        <Text style={{ color: MUTED }}>
                          {" "}
                          is running low — add it to the list
                        </Text>
                      </Text>
                    }
                  />
                </SwipeRow>
              )}
              {showChef && (
                <SwipeRow onDelete={() => dismissTip("chef")}>
                  <CrewTip
                    meta="Chef · Chef's pick"
                    agent="Chef"
                    items={scoped}
                    onPress={() => openTip("chef", () => router.navigate("/eat"))}
                    onDismiss={() => dismissTip("chef")}
                    fallback={
                      <Text style={{ fontSize: 13, color: INK }}>
                        {chefPick ? (
                          <>
                            <Text style={{ fontWeight: "700" }}>{chefPick.name}</Text>
                            <Text style={{ color: MUTED }}>
                              {" "}
                              — {chefPick.minutes} min with what you have
                            </Text>
                          </>
                        ) : (
                          <Text style={{ color: MUTED }}>
                            See what you can cook with what&apos;s fresh right now.
                          </Text>
                        )}
                      </Text>
                    }
                  />
                </SwipeRow>
              )}
            </View>
          )}

          {/* fridge notes — read-only squares; compose/edit lives on the Organizer tab */}
          <FridgeNotes variant="grid" />
        </ScrollView>
        <CrewDock
          pending={pendingByKind}
          score={overallScore}
          streak={user?.streak ?? 0}
          collapsed={crewCollapsed}
          bottom={dockBottom}
        />
        <NotificationUndoSnackbar bottom={dockBottom + 70} />
      </SafeAreaView>
    </GestureDetector>
  );
}

function HeaderIcon({
  icon,
  dot,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  dot: boolean;
  onPress: () => void;
}) {
  const { surface: SURFACE, hairline: HAIRLINE, ink: INK, bad: BAD } = useTheme().colors;
  return (
    <Pressable onPress={onPress} hitSlop={8}>
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
        <Ionicons name={icon} size={16} color={INK} />
        {dot && (
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
  );
}

// A translucent surface-tinted pill over the fridge hero photo - takes the current theme's
// surface color so it reads as a light pill in light mode instead of a fixed dark one.
const heroBadge = (surface: string) =>
  ({
    backgroundColor: `${surface}d9`,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderCurve: "continuous", borderRadius: 16,
  }) as const;

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
  const { surface: SURFACE, hairline: HAIRLINE, ink: INK, faint: FAINT } = useTheme().colors;
  return (
    <Pressable
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: SURFACE,
        borderWidth: 1,
        borderColor: HAIRLINE,
        borderCurve: "continuous", borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 8,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderCurve: "continuous", borderRadius: 8,
          backgroundColor: `${tint}1a`,
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 8,
        }}
      >
        <Ionicons name={icon} size={14} color={tint} />
      </View>
      <Text style={{ fontSize: 18, fontWeight: "700", color: INK }}>
        {value}
      </Text>
      <Text style={{ fontSize: 10, color: FAINT, marginTop: 2 }}>{label}</Text>
    </Pressable>
  );
}

const TIP_ICON: Record<CrewAgent, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Guardian: "timer-sand",
  Shopkeeper: "cart-outline",
  Chef: "chef-hat",
};

function CrewTip({
  meta,
  agent,
  items,
  onPress,
  onDismiss,
  fallback,
}: {
  meta: string;
  agent: CrewAgent;
  items: import("@thatfridge/core").FlatItem[];
  onPress: () => void;
  onDismiss: () => void;
  fallback: React.ReactNode;
}) {
  const { colors } = useTheme();
  const AGENT_COLOR: Record<CrewAgent, string> = {
    Guardian: colors.agentGuardian,
    Shopkeeper: colors.agentShopkeeper,
    Chef: colors.agentChef,
  };
  // The tip the user asked this crew member for on the Crew tab this session, if any; otherwise
  // the deterministic fallback (computed from real data, no AI call).
  const tip = useCrewTip(agent);
  return (
    <NotificationCard
      icon={TIP_ICON[agent]}
      color={AGENT_COLOR[agent]}
      meta={meta}
      onPress={onPress}
      onAction={onDismiss}
    >
      {tip ? <MarkdownText text={tip} size={13} /> : fallback}
    </NotificationCard>
  );
}
