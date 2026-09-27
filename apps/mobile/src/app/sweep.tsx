import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import Ionicons from "@expo/vector-icons/Ionicons";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, Line, LinearGradient, Rect as SvgRect, Stop } from "react-native-svg";

import {
  ApiError,
  describeError,
  guessFoodIcon,
  type FlatItem,
  type StorageLocation,
} from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useScope } from "@/lib/scope";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { PixelText } from "@/components/brand";
import { FoodIcon } from "@/components/food-icon";
import { blankDraft, stashDrafts, toCreatePayload, type Draft } from "@/components/draft-item";
import {
  CREDITS_PER_SHOT,
  LOW_CONFIDENCE,
  MAX_SHOTS,
  SPACES,
  boxToRect,
  buildSweepResults,
  cropStyle,
  fitFrame,
  flyStart,
  gridCells,
  padBox,
  sceneSpace,
  shotLabel,
  spaceLabel,
  spaceLocation,
  staggerStep,
  type Rect,
  type ResultRow,
  type Scene,
  type Space,
  type SweepDetection,
} from "@/lib/sweep";

// Scan your kitchen (plan: SCAN_PLAN.md). The user shoots any spaces - fridge, freezer, pantry,
// or a grocery haul - picking the space per shot. Every shot is an ordinary photo scan (POST
// items/photo/scan, 3 credits) sent as soon as it's taken. After Done, each photo's items lock on
// and fly into a grid; the results compare them with what the fridge already tracks (new /
// already tracked / not seen). The effects only ever play over real results.

const isExpoGo = Constants.appOwnership === "expo";
// The camera view is always dark whatever the app theme, so the HUD has fixed colours.
const HUD = "#26c6da";
const HUD_BAD = "#ff5567";
const HUD_WARN = "#f5a623";

type Shot = {
  id: string;
  uri: string;
  /** width / height of the photo as displayed. */
  aspect: number;
  space: Space;
  /** What the model thinks the photo shows. */
  scene: Scene | null;
  status: "scanning" | "done" | "failed";
  items: SweepDetection[];
};

/** Something the user typed in because the scan missed it. */
type Extra = { key: string; name: string; location: StorageLocation; space: Space };

type MissingChoice = "keep" | "used" | "wasted";

type Stage = "camera" | "reveal" | "grid";

export default function Sweep() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const { fridges, items: inventory, ensureSectionId, addManyItems, refresh } = useInventory();
  const { scope, setScope } = useScope();
  const reduceMotion = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>("camera");
  const [space, setSpace] = useState<Space>("fridge");
  const [fridgeId, setFridgeId] = useState<string | null>(() =>
    scope !== "all" && fridges.some((f) => f.id === scope) ? scope : (fridges[0]?.id ?? null),
  );
  const [shots, setShots] = useState<Shot[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  // Row key -> ticked. Unset rows default to ticked when new, unticked when already tracked.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [missingChoice, setMissingChoice] = useState<Record<string, MissingChoice>>({});
  const [saving, setSaving] = useState(false);
  const outOfCreditsShown = useRef(false);

  const tracked = useMemo(
    () => (fridgeId ? inventory.filter((i) => i.fridgeId === fridgeId) : []),
    [inventory, fridgeId],
  );
  const results = useMemo(() => buildSweepResults<FlatItem>(shots, tracked), [shots, tracked]);
  const isTicked = (r: ResultRow<FlatItem>) => ticks[r.key] ?? r.match === null;
  const toAdd = results.rows.filter(isTicked);
  const toClear = results.missing.filter((m) => (missingChoice[m.id] ?? "keep") !== "keep");

  function updateShot(id: string, patch: Partial<Shot>) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function upload(shot: Shot) {
    try {
      const sectionId = await ensureSectionId();
      // Expo's FormData needs a real Blob for a file part (see add.tsx's runScan).
      const blob = await (await fetch(shot.uri)).blob();
      const scan = await api.scanFridgePhoto(sectionId, blob);
      updateShot(shot.id, {
        status: "done",
        scene: scan.scene ?? null,
        items: scan.detected_items.map((d, i) => ({
          id: `${shot.id}-${i}`,
          name: d.parsed_name,
          icon: d.icon || guessFoodIcon(d.parsed_name) || "generic",
          box: d.box ?? null,
          confidence: typeof d.confidence === "number" ? d.confidence : 0.5,
          condition: d.condition ?? null,
          storage: d.storage ?? null,
        })),
      });
    } catch (e) {
      updateShot(shot.id, { status: "failed" });
      if (e instanceof ApiError && e.status === 402) {
        if (outOfCreditsShown.current) return;
        outOfCreditsShown.current = true;
        Alert.alert("Out of credits", `Each shot uses ${CREDITS_PER_SHOT} credits. Top up to keep scanning.`, [
          { text: "Not now", style: "cancel" },
          { text: "Get credits", onPress: () => router.push("/credits") },
        ]);
        return;
      }
      Alert.alert("Shot failed", describeError(e, "Couldn't read that shot. Try it again."));
    }
  }

  function onCaptured(uri: string, width: number, height: number) {
    const shot: Shot = {
      id: `s${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
      uri,
      aspect: width > 0 && height > 0 ? width / height : 3 / 4,
      space,
      scene: null,
      status: "scanning",
      items: [],
    };
    setShots((prev) => [...prev, shot]);
    void upload(shot);
  }

  function pickFridge() {
    if (fridges.length < 2) return;
    Alert.alert("Which fridge is this for?", undefined, [
      ...fridges.slice(0, 6).map((f) => ({ text: f.name, onPress: () => setFridgeId(f.id) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function discardAndClose() {
    const nothing = results.rows.length === 0 && extras.length === 0 && shots.every((s) => s.status !== "scanning");
    if (nothing) {
      router.back();
      return;
    }
    Alert.alert("Discard this scan?", "Nothing has been saved yet.", [
      { text: "Keep going", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  function toDrafts(): Draft[] {
    return [
      ...toAdd.map((r) =>
        blankDraft({
          name: r.name,
          parsedName: r.name,
          icon: r.icon,
          qty: r.qty,
          condition: r.condition,
          location: r.location,
          categoryId: categoryId ?? null,
          source: "photo",
        }),
      ),
      ...extras.map((x) =>
        blankDraft({
          name: x.name,
          icon: guessFoodIcon(x.name) ?? "generic",
          location: x.location,
          categoryId: categoryId ?? null,
        }),
      ),
    ];
  }

  async function targetSectionId(): Promise<string> {
    const fridge = fridges.find((f) => f.id === fridgeId);
    if (!fridge) return ensureSectionId();
    if (fridge.sections[0]) return fridge.sections[0].id;
    return (await api.createSection(fridge.id, "General")).id;
  }

  /** Remove the items the user marked used / tossed, correcting the app's guess where it differs. */
  async function clearMarked(): Promise<{ used: number; wasted: number }> {
    const done = { used: 0, wasted: 0 };
    await Promise.allSettled(
      toClear.map(async (item) => {
        const choice = missingChoice[item.id] as "used" | "wasted";
        const res = await api.deleteItem(item.id);
        if (res.outcome !== choice) await api.correctItemOutcome(res.id, choice);
        done[choice] += 1;
      }),
    );
    return done;
  }

  async function save() {
    const drafts = toDrafts();
    if (!drafts.length && !toClear.length) return;
    setSaving(true);
    try {
      const sectionId = drafts.length ? await targetSectionId() : null;
      const added = drafts.length
        ? await addManyItems(drafts.map((d) => ({ ...toCreatePayload(d), sectionId: sectionId! })))
        : 0;
      const cleared = await clearMarked();
      if (cleared.used + cleared.wasted > 0) await refresh();
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canDismiss()) router.dismissAll();
      else router.back();
      const parts = [
        added ? `${added} item${added === 1 ? "" : "s"} added` : null,
        cleared.used ? `${cleared.used} marked used` : null,
        cleared.wasted ? `${cleared.wasted} marked tossed` : null,
      ].filter(Boolean);
      setTimeout(() => Alert.alert("Kitchen updated", `${parts.join(", ")}.`), 300);
    } catch (e) {
      setSaving(false);
      Alert.alert("Error", describeError(e, "Couldn't save the scan."));
    }
  }

  async function editDetails() {
    setSaving(true);
    try {
      // The add screen files new items under the scoped fridge, so point it at this scan's fridge.
      if (fridgeId && scope !== fridgeId && fridges.length > 1) setScope(fridgeId);
      const cleared = await clearMarked();
      if (cleared.used + cleared.wasted > 0) await refresh();
    } finally {
      setSaving(false);
    }
    stashDrafts(toDrafts());
    router.replace("/add?method=barcode-batch");
  }

  if (isExpoGo) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <Text className="text-center text-ink">
          Scanning needs a development build — the camera isn&apos;t available in Expo Go.
        </Text>
        <Pressable onPress={() => router.back()}>
          <Text className="text-muted">Close</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (stage === "camera") {
    if (!permission) return <View className="flex-1 bg-black" />;
    if (!permission.granted) {
      return (
        <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
          <Text className="text-center text-ink">
            ThatFridge needs camera access to scan your kitchen.
          </Text>
          <Pressable
            onPress={requestPermission}
            className="rounded-lg bg-accent px-5 py-3 active:opacity-80"
          >
            <Text className="font-bold uppercase text-on-accent">Grant access</Text>
          </Pressable>
          <Pressable onPress={() => router.back()}>
            <Text className="text-muted">Not now</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return (
      <CameraStage
        shots={shots}
        space={space}
        onSpace={setSpace}
        fridgeName={fridges.length > 1 ? fridges.find((f) => f.id === fridgeId)?.name ?? null : null}
        onPickFridge={pickFridge}
        onCaptured={onCaptured}
        onClose={discardAndClose}
        onDone={() => setStage(reduceMotion ? "grid" : "reveal")}
      />
    );
  }

  if (stage === "reveal") {
    return <RevealStage shots={shots} onFinish={() => setStage("grid")} />;
  }

  return (
    <ResultsStage
      shots={shots}
      rows={results.rows}
      missing={results.missing}
      emptyShots={results.emptyShots}
      extras={extras}
      isTicked={isTicked}
      onToggle={(r) => setTicks((prev) => ({ ...prev, [r.key]: !isTicked(r) }))}
      missingChoice={missingChoice}
      onMissingChoice={(id, c) => setMissingChoice((prev) => ({ ...prev, [id]: c }))}
      onShotSpace={(id, s) => updateShot(id, { space: s })}
      onAddExtra={(name) =>
        setExtras((prev) => {
          const last = shots[shots.length - 1]?.space ?? space;
          return [...prev, { key: `x${Date.now()}`, name, space: last, location: spaceLocation(last, null) }];
        })
      }
      onRemoveExtra={(key) => setExtras((prev) => prev.filter((x) => x.key !== key))}
      addCount={toAdd.length + extras.length}
      clearCount={toClear.length}
      saving={saving}
      canShootMore={shots.length < MAX_SHOTS}
      onShootMore={() => setStage("camera")}
      onSave={save}
      onEdit={editDetails}
      onClose={discardAndClose}
    />
  );
}

// ---- stage 1: camera with the HUD ------------------------------------------

function CameraStage({
  shots,
  space,
  onSpace,
  fridgeName,
  onPickFridge,
  onCaptured,
  onClose,
  onDone,
}: {
  shots: Shot[];
  space: Space;
  onSpace: (s: Space) => void;
  /** Shown (and tappable) only when the account has more than one fridge. */
  fridgeName: string | null;
  onPickFridge: () => void;
  onCaptured: (uri: string, width: number, height: number) => void;
  onClose: () => void;
  onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const flash = useSharedValue(0);
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const full = shots.length >= MAX_SHOTS;
  const inSpace = shots.filter((s) => s.space === space).length;
  const hint = SPACES.find((s) => s.key === space)?.hint ?? "";
  // The aiming frame: the camera area between the top readout and the bottom controls.
  const frame: Rect = {
    x: 20,
    y: insets.top + 78,
    w: width - 40,
    h: height - insets.top - 78 - (insets.bottom + 236),
  };

  async function shoot() {
    if (!ready || capturing || full || !camera.current) return;
    setCapturing(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    flash.value = withSequence(withTiming(0.85, { duration: 60 }), withTiming(0, { duration: 320 }));
    try {
      const pic = await camera.current.takePictureAsync({ quality: 0.6 });
      if (pic?.uri) onCaptured(pic.uri, pic.width, pic.height);
    } catch {
      Alert.alert("Camera", "Couldn't take that shot. Try again.");
    } finally {
      setCapturing(false);
    }
  }

  // Photos already on the phone go through the same scan and reveal as fresh shots.
  async function pickFromLibrary() {
    const room = MAX_SHOTS - shots.length;
    if (room <= 0 || capturing) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      allowsMultipleSelection: true,
      selectionLimit: room,
      // Converts HEIC/PNG to a compressed JPEG, as add.tsx does for its uploads.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (res.canceled) return;
    for (const a of res.assets.slice(0, room)) onCaptured(a.uri, a.width, a.height);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <CameraView ref={camera} style={{ flex: 1 }} facing="back" onCameraReady={() => setReady(true)} />

      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <HudGrid rect={frame} />
        <HudCorners rect={frame} />
        {!full && <ScanLine rect={frame} />}
      </View>

      {/* top readout */}
      <View
        style={{
          position: "absolute",
          top: insets.top + 12,
          left: 16,
          right: 16,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
        }}
      >
        <Pressable onPress={onClose} hitSlop={10} style={hudButton}>
          <Ionicons name="close" size={20} color="white" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <PixelText style={{ color: HUD, fontSize: 11 }}>KITCHEN SCAN</PixelText>
          <Text style={{ color: "white", fontSize: 13, fontWeight: "600", marginTop: 3 }} numberOfLines={1}>
            {full ? "That's the most for one scan — tap Done" : shotLabel(space, inSpace)}
          </Text>
          {!full && (
            <Text style={{ color: "rgba(255,255,255,0.65)", fontSize: 11.5, marginTop: 1 }} numberOfLines={1}>
              {hint}
            </Text>
          )}
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {fridgeName && (
            <Pressable onPress={onPickFridge} hitSlop={6} style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(0,0,0,0.45)", paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.sm }}>
              <Text style={{ color: "white", fontSize: 11.5, fontWeight: "700", maxWidth: 110 }} numberOfLines={1}>
                {fridgeName}
              </Text>
              <Ionicons name="chevron-down" size={12} color="white" />
            </Pressable>
          )}
          <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" }}>
            {shots.length ? `${shots.length * CREDITS_PER_SHOT} credits used` : `${CREDITS_PER_SHOT} credits / shot`}
          </Text>
        </View>
      </View>

      {/* bottom: space chips, captured shots, shutter, done */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 16, gap: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          {SPACES.map((s) => {
            const on = s.key === space;
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onSpace(s.key);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1.5,
                  borderColor: on ? HUD : "rgba(255,255,255,0.35)",
                  backgroundColor: on ? "rgba(38,198,218,0.22)" : "rgba(0,0,0,0.45)",
                }}
              >
                <Text style={{ color: on ? HUD : "white", fontSize: 12.5, fontWeight: "700" }}>{s.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 20, minHeight: 56 }}
        >
          {shots.map((s) => (
            <ShotThumb key={s.id} shot={s} />
          ))}
        </ScrollView>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 28 }}>
          <Pressable
            onPress={pickFromLibrary}
            disabled={full || capturing}
            accessibilityLabel="Upload photos"
            style={{ width: 72, alignItems: "center", gap: 4, opacity: full ? 0.4 : 1 }}
          >
            <View style={{ width: 44, height: 44, borderRadius: RADIUS.sm, borderCurve: "continuous", backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
              <MaterialCommunityIcons name="image-multiple-outline" size={20} color="white" />
            </View>
            <Text style={{ color: "white", fontSize: 11, fontWeight: "600" }}>Upload</Text>
          </Pressable>
          <Pressable
            onPress={shoot}
            disabled={!ready || capturing || full}
            accessibilityLabel="Take shot"
            style={{
              width: 76,
              height: 76,
              borderRadius: 38,
              borderWidth: 4,
              borderColor: full ? "rgba(255,255,255,0.3)" : HUD,
              alignItems: "center",
              justifyContent: "center",
              opacity: !ready || capturing ? 0.6 : 1,
            }}
          >
            <View style={{ width: 58, height: 58, borderRadius: 29, backgroundColor: full ? "rgba(255,255,255,0.3)" : "white" }} />
          </Pressable>
          <Pressable
            onPress={onDone}
            disabled={shots.length === 0}
            style={{
              width: 72,
              alignItems: "center",
              paddingVertical: 10,
              borderRadius: RADIUS.sm,
              borderCurve: "continuous",
              backgroundColor: shots.length ? HUD : "rgba(255,255,255,0.15)",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: shots.length ? "#0a0a0c" : "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
              Done
            </Text>
          </Pressable>
        </View>
      </View>

      <Animated.View
        pointerEvents="none"
        style={[{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "white" }, flashStyle]}
      />
    </View>
  );
}

const hudButton = {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: "rgba(0,0,0,0.45)",
  alignItems: "center",
  justifyContent: "center",
} as const;

function ShotThumb({ shot, size = 52 }: { shot: Shot; size?: number }) {
  const empty = shot.status === "done" && shot.items.length === 0;
  const border = shot.status === "failed" ? HUD_BAD : empty ? HUD_WARN : HUD;
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ width: size, height: size, borderRadius: RADIUS.sm, borderCurve: "continuous", overflow: "hidden", borderWidth: 1.5, borderColor: border }}
    >
      <Image source={{ uri: shot.uri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          right: 0,
          bottom: 0,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: shot.status === "done" ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.5)",
        }}
      >
        {shot.status === "scanning" ? (
          <ActivityIndicator color={HUD} size="small" />
        ) : shot.status === "failed" ? (
          <Ionicons name="alert" size={18} color={HUD_BAD} />
        ) : (
          <PixelText style={{ color: empty ? HUD_WARN : "white", fontSize: 13 }}>{shot.items.length}</PixelText>
        )}
      </View>
    </Animated.View>
  );
}

// ---- HUD pieces --------------------------------------------------------------

function HudCorners({ rect, color = HUD, size = 24, thickness = 3 }: { rect: Rect; color?: string; size?: number; thickness?: number }) {
  const common = { position: "absolute" as const, width: size, height: size, borderColor: color };
  return (
    <>
      <View style={{ ...common, left: rect.x, top: rect.y, borderLeftWidth: thickness, borderTopWidth: thickness }} />
      <View style={{ ...common, left: rect.x + rect.w - size, top: rect.y, borderRightWidth: thickness, borderTopWidth: thickness }} />
      <View style={{ ...common, left: rect.x, top: rect.y + rect.h - size, borderLeftWidth: thickness, borderBottomWidth: thickness }} />
      <View style={{ ...common, left: rect.x + rect.w - size, top: rect.y + rect.h - size, borderRightWidth: thickness, borderBottomWidth: thickness }} />
    </>
  );
}

function HudGrid({ rect, step = 44 }: { rect: Rect; step?: number }) {
  const cols = Math.floor(rect.w / step);
  const rows = Math.floor(rect.h / step);
  return (
    <Svg style={{ position: "absolute", left: rect.x, top: rect.y }} width={rect.w} height={rect.h}>
      {Array.from({ length: cols }, (_, i) => (
        <Line key={`c${i}`} x1={(i + 1) * step} y1={0} x2={(i + 1) * step} y2={rect.h} stroke={HUD} strokeOpacity={0.12} strokeWidth={1} />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <Line key={`r${i}`} x1={0} y1={(i + 1) * step} x2={rect.w} y2={(i + 1) * step} stroke={HUD} strokeOpacity={0.12} strokeWidth={1} />
      ))}
    </Svg>
  );
}

/** A glowing bar sweeping up and down the rect in pixel-like steps. */
function ScanLine({ rect, duration = 2200, band = 70 }: { rect: Rect; duration?: number; band?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration, easing: Easing.steps(36) }), -1, true);
  }, [t, duration]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: t.value * (rect.h - band) }],
  }));
  return (
    <View style={{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h, overflow: "hidden" }}>
      <Animated.View style={[{ width: rect.w, height: band }, style]}>
        <Svg width={rect.w} height={band}>
          <Defs>
            <LinearGradient id="scan" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={HUD} stopOpacity={0} />
              <Stop offset="0.5" stopColor={HUD} stopOpacity={0.28} />
              <Stop offset="1" stopColor={HUD} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <SvgRect x={0} y={0} width={rect.w} height={band} fill="url(#scan)" />
          <SvgRect x={0} y={band / 2 - 1} width={rect.w} height={2} fill={HUD} fillOpacity={0.9} />
        </Svg>
      </Animated.View>
    </View>
  );
}

// ---- stage 2: the reveal -----------------------------------------------------

const LOCK_MS = 380;
const HOLD_MS = 420;
const FLY_MS = 650;
const REST_MS = 450;

function RevealStage({ shots, onFinish }: { shots: Shot[]; onFinish: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [found, setFound] = useState(0);
  const shot = shots[index];

  // Walk the shots in order. A shot still scanning keeps its "identifying" loop until the
  // answer arrives; a failed or empty one is skipped.
  useEffect(() => {
    if (!shot) {
      onFinish();
      return;
    }
    if (shot.status === "scanning") return;
    const n = shot.status === "done" ? shot.items.length : 0;
    if (n === 0) {
      setIndex((i) => i + 1);
      return;
    }
    const step = staggerStep(n);
    const total = (n - 1) * step + LOCK_MS + HOLD_MS + (n - 1) * step + FLY_MS + REST_MS;
    const timer = setTimeout(() => {
      setFound((f) => f + n);
      setIndex((i) => i + 1);
    }, total);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shot?.id, shot?.status]);

  const header = insets.top + 64;
  const footer = insets.bottom + 72;
  const body = height - header - footer;
  const photoArea: Rect = { x: 20, y: header, w: width - 40, h: body * 0.58 };
  const frame = fitFrame(shot?.aspect ?? 3 / 4, photoArea);
  const gridArea: Rect = { x: 20, y: frame.y + frame.h + 20, w: width - 40, h: header + body - (frame.y + frame.h + 20) };

  return (
    <View style={{ flex: 1, backgroundColor: "#0a0a0c" }}>
      <View style={{ position: "absolute", top: insets.top + 14, left: 20, right: 20 }}>
        <PixelText style={{ color: HUD, fontSize: 11 }}>
          {shot ? `ANALYZING ${index + 1}/${shots.length}` : "COMPLETE"}
        </PixelText>
        <Text style={{ color: "white", fontSize: 15, fontWeight: "700", marginTop: 4 }}>
          {shot ? shotLabel(shot.space, shots.slice(0, index).filter((s) => s.space === shot.space).length) : ""}
        </Text>
      </View>

      {shot && (
        <RevealShot key={shot.id} shot={shot} frame={frame} gridArea={gridArea} />
      )}

      <View
        style={{
          position: "absolute",
          left: 20,
          right: 20,
          bottom: insets.bottom + 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <PixelText style={{ color: "white", fontSize: 22 }}>{found}</PixelText>
          <PixelText style={{ color: HUD, fontSize: 10 }}>FOUND</PixelText>
        </View>
        <Pressable onPress={onFinish} hitSlop={10} style={{ paddingVertical: 10, paddingHorizontal: 16 }}>
          <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>
            Skip
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function RevealShot({ shot, frame, gridArea }: { shot: Shot; frame: Rect; gridArea: Rect }) {
  const playing = shot.status === "done";
  const n = shot.items.length;
  const step = staggerStep(n);
  const cells = useMemo(() => gridCells(n, gridArea, 5, 8, 64), [n, gridArea]);
  const flyAt = (n - 1) * step + LOCK_MS + HOLD_MS;

  // One light tick per lock-on, capped so a big shelf doesn't buzz for seconds.
  useEffect(() => {
    if (!playing) return;
    const timers = shot.items
      .slice(0, 12)
      .map((_, i) => setTimeout(() => void Haptics.selectionAsync(), i * step));
    return () => timers.forEach(clearTimeout);
  }, [playing, shot.items, step]);

  return (
    <>
      <Animated.View entering={FadeIn.duration(250)} style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
        <Image source={{ uri: shot.uri }} style={{ width: "100%", height: "100%", borderRadius: RADIUS.sm }} contentFit="fill" />
        <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, backgroundColor: "rgba(10,10,12,0.25)", borderRadius: RADIUS.sm }} />
      </Animated.View>
      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
        <HudGrid rect={frame} step={36} />
        <HudCorners rect={{ x: frame.x - 6, y: frame.y - 6, w: frame.w + 12, h: frame.h + 12 }} size={20} />
        {!playing && <ScanLine rect={frame} duration={1100} />}
        {!playing && (
          <View style={{ position: "absolute", left: frame.x, top: frame.y + frame.h + 16, width: frame.w, alignItems: "center" }}>
            <PixelText style={{ color: HUD, fontSize: 11 }}>IDENTIFYING…</PixelText>
          </View>
        )}
        {playing &&
          shot.items.map((it, i) =>
            it.box ? (
              <LockOn
                key={`lock-${it.id}`}
                rect={boxToRect(it.box, frame)}
                name={it.name}
                unsure={it.confidence < LOW_CONFIDENCE}
                delay={i * step}
                hideAt={flyAt + i * step}
              />
            ) : null,
          )}
        {playing &&
          shot.items.map((it, i) => (
            <FlyTile
              key={`fly-${it.id}`}
              item={it}
              shot={shot}
              from={it.box ? boxToRect(padBox(it.box), frame) : null}
              to={cells[i]}
              delay={flyAt + i * step}
            />
          ))}
      </View>
    </>
  );
}

/** Brackets that snap onto an item, with its name above. */
function LockOn({ rect, name, unsure, delay, hideAt }: { rect: Rect; name: string; unsure: boolean; delay: number; hideAt: number }) {
  const lock = useSharedValue(0);
  const gone = useSharedValue(0);
  useEffect(() => {
    lock.value = withDelay(delay, withSpring(1, { damping: 14, stiffness: 200 }));
    gone.value = withDelay(hideAt, withTiming(1, { duration: 180 }));
  }, [lock, gone, delay, hideAt]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, lock.value) * (1 - gone.value),
    transform: [{ scale: 1.6 - 0.6 * lock.value }],
  }));
  const color = unsure ? "#f5a623" : HUD;
  const size = Math.max(6, Math.min(16, Math.min(rect.w, rect.h) * 0.3));
  return (
    <Animated.View style={[{ position: "absolute", left: rect.x, top: rect.y, width: rect.w, height: rect.h }, style]}>
      <HudCorners rect={{ x: 0, y: 0, w: rect.w, h: rect.h }} color={color} size={size} thickness={2} />
      <View style={{ position: "absolute", left: 0, bottom: rect.h + 3, flexDirection: "row" }}>
        <View style={{ backgroundColor: color, paddingHorizontal: 4, paddingVertical: 2, borderRadius: 2 }}>
          <Text numberOfLines={1} style={{ color: "#0a0a0c", fontSize: 9, fontWeight: "800", maxWidth: 120 }}>
            {name.toUpperCase()}
            {unsure ? " ?" : ""}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

/** The item's crop lifting off the photo and landing in its grid cell. */
function FlyTile({ item, shot, from, to, delay }: { item: SweepDetection; shot: Shot; from: Rect | null; to: Rect | undefined; delay: number }) {
  const p = useSharedValue(0);
  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withDelay(delay, withTiming(1, { duration: from ? 1 : 250 }));
    p.value = withDelay(delay, withSpring(1, { damping: 17, stiffness: 150 }));
  }, [p, shown, delay, from]);

  const tile = to?.w ?? 56;
  const start = from ? flyStart(from, tile) : { x: to?.x ?? 0, y: to?.y ?? 0, scale: 0.5 };
  const end = { x: to?.x ?? start.x, y: to?.y ?? start.y };
  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [
      { translateX: start.x + (end.x - start.x) * p.value },
      { translateY: start.y + (end.y - start.y) * p.value },
      { scale: start.scale + (1 - start.scale) * p.value },
    ],
  }));
  if (!to) return null;
  return (
    <Animated.View style={[{ position: "absolute", left: 0, top: 0, width: tile, height: tile }, style]}>
      <TileFace item={item} shot={shot} size={tile} borderColor={item.confidence < LOW_CONFIDENCE ? "#f5a623" : HUD} />
    </Animated.View>
  );
}

/** The item's crop from its photo, or its pixel icon when the scan couldn't place it. */
function TileFace({
  item,
  shot,
  size,
  borderColor,
  background = "#131316",
}: {
  item: Pick<SweepDetection, "box" | "icon" | "name">;
  /** The photo to crop from; null for items typed in by hand. */
  shot: Pick<Shot, "uri" | "aspect"> | null;
  size: number;
  borderColor: string;
  background?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: RADIUS.sm,
        borderCurve: "continuous",
        overflow: "hidden",
        borderWidth: 1.5,
        borderColor,
        backgroundColor: background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {item.box && shot ? (
        <Image source={{ uri: shot.uri }} style={{ position: "absolute", ...cropStyle(padBox(item.box), shot.aspect, size - 3) }} contentFit="fill" />
      ) : (
        <FoodIcon icon={item.icon} name={item.name} size={size * 0.7} />
      )}
    </View>
  );
}


// ---- stage 3: results --------------------------------------------------------

const LOCATION_LABEL: Record<StorageLocation, string> = { fridge: "Fridge", freezer: "Freezer", pantry: "Pantry" };

function ResultsStage({
  shots,
  rows,
  missing,
  emptyShots,
  extras,
  isTicked,
  onToggle,
  missingChoice,
  onMissingChoice,
  onShotSpace,
  onAddExtra,
  onRemoveExtra,
  addCount,
  clearCount,
  saving,
  canShootMore,
  onShootMore,
  onSave,
  onEdit,
  onClose,
}: {
  shots: Shot[];
  rows: ResultRow<FlatItem>[];
  missing: FlatItem[];
  emptyShots: string[];
  extras: Extra[];
  isTicked: (r: ResultRow<FlatItem>) => boolean;
  onToggle: (r: ResultRow<FlatItem>) => void;
  missingChoice: Record<string, MissingChoice>;
  onMissingChoice: (id: string, c: MissingChoice) => void;
  onShotSpace: (id: string, s: Space) => void;
  onAddExtra: (name: string) => void;
  onRemoveExtra: (key: string) => void;
  addCount: number;
  clearCount: number;
  saving: boolean;
  canShootMore: boolean;
  onShootMore: () => void;
  onSave: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { canvas, surface, surface2, hairline, ink, muted, faint, accent, onAccent, warn } = useTheme().colors;
  const [missed, setMissed] = useState("");
  const cols = 3;
  const gap = 10;
  const tile = Math.floor((width - 40 - gap * (cols - 1)) / cols);
  const pending = shots.filter((s) => s.status === "scanning").length;
  const shotById = useMemo(() => new Map(shots.map((s) => [s.id, s])), [shots]);
  const fresh = rows.filter((r) => r.match === null);
  const known = rows.filter((r) => r.match !== null);
  const unsure = rows.filter((r) => r.confidence < LOW_CONFIDENCE).length;
  const nothingAtAll = rows.length === 0 && extras.length === 0 && missing.length === 0 && pending === 0;

  const label = (() => {
    if (addCount && clearCount) return `Add ${addCount} · update ${clearCount}`;
    if (addCount) return `Add ${addCount} item${addCount === 1 ? "" : "s"}`;
    if (clearCount) return `Update ${clearCount} item${clearCount === 1 ? "" : "s"}`;
    return "Nothing to save";
  })();

  function nextSpace(s: Space): Space {
    const i = SPACES.findIndex((x) => x.key === s);
    return SPACES[(i + 1) % SPACES.length].key;
  }

  function addMissed() {
    const name = missed.trim();
    if (!name) return;
    void Haptics.selectionAsync();
    onAddExtra(name);
    setMissed("");
  }

  const sectionLabel = { fontSize: 11, fontWeight: "600" as const, letterSpacing: 1.2, textTransform: "uppercase" as const, color: muted };

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PixelText style={{ color: accent, fontSize: 11 }}>SCAN COMPLETE</PixelText>
          <Text style={{ color: ink, fontSize: 18, fontWeight: "700", marginTop: 4 }}>
            {fresh.length + extras.length} new
            {known.length ? ` · ${known.length} already here` : ""}
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: surface2, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="close" size={20} color={ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        {/* shots, with the space each was of - tap to change */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
            Tap a shot&apos;s label if it was of something else.
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {shots.map((s) => {
              const suggested = sceneSpace(s.scene);
              const mismatch = s.status === "done" && suggested !== null && suggested !== s.space;
              return (
                <View key={s.id} style={{ alignItems: "center", gap: 6 }}>
                  <ShotThumb shot={s} size={56} />
                  <Pressable
                    onPress={() => {
                      void Haptics.selectionAsync();
                      onShotSpace(s.id, mismatch ? suggested! : nextSpace(s.space));
                    }}
                    hitSlop={4}
                    accessibilityLabel={mismatch ? `Looks like ${spaceLabel(suggested!)}, tap to switch` : `${spaceLabel(s.space)}, tap to change`}
                    style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: mismatch ? warn : hairline, backgroundColor: mismatch ? `${warn}22` : surface }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: "700", color: mismatch ? warn : ink }}>
                      {mismatch ? `${spaceLabel(suggested!)}?` : spaceLabel(s.space)}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          {shots.some((s) => s.status === "done" && sceneSpace(s.scene) !== null && sceneSpace(s.scene) !== s.space) && (
            <Text style={{ color: warn, fontSize: 12 }}>A label with ? is what that photo looks like to the crew. Tap it to switch.</Text>
          )}
        </View>

        {pending > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <ActivityIndicator color={accent} size="small" />
            <Text style={{ color: muted, fontSize: 12.5 }}>
              Still identifying {pending} shot{pending === 1 ? "" : "s"}…
            </Text>
          </View>
        )}

        {emptyShots.length > 0 && (
          <View style={{ flexDirection: "row", gap: 8, padding: 12, borderRadius: RADIUS.md, borderCurve: "continuous", backgroundColor: `${warn}1a` }}>
            <Ionicons name="alert-circle-outline" size={17} color={warn} />
            <Text style={{ flex: 1, color: ink, fontSize: 12.5, lineHeight: 18 }}>
              {emptyShots.length} shot{emptyShots.length === 1 ? "" : "s"} found nothing. Too dark or too far? Shoot{" "}
              {emptyShots.length === 1 ? "it" : "them"} again closer, with the light on.
            </Text>
          </View>
        )}

        {nothingAtAll && (
          <View style={{ alignItems: "center", paddingVertical: 24, gap: 10 }}>
            <MaterialCommunityIcons name="fridge-outline" size={40} color={faint} />
            <Text style={{ color: muted, fontSize: 13, textAlign: "center" }}>
              Nothing recognised. Try closer shots with the light on, or type what&apos;s there below.
            </Text>
          </View>
        )}

        {(fresh.length > 0 || extras.length > 0) && (
          <View style={{ gap: 10 }}>
            <Text style={sectionLabel}>New</Text>
            {unsure > 0 && (
              <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
                Tap anything the scan got wrong to leave it out. {unsure} marked ? {unsure === 1 ? "is" : "are"} worth a second look.
              </Text>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
              {fresh.map((r, i) => (
                <RowTile key={r.key} r={r} i={i} on={isTicked(r)} tile={tile} shot={shotById.get(r.shotId) ?? null} onToggle={onToggle} />
              ))}
              {extras.map((x) => (
                <Pressable key={x.key} onPress={() => onRemoveExtra(x.key)} accessibilityLabel={`Remove ${x.name}`} style={{ width: tile }}>
                  <TileFace item={{ name: x.name, icon: guessFoodIcon(x.name) ?? "generic", box: null }} shot={null} size={tile} borderColor={accent} background={surface} />
                  <View style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: surface2, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="close" size={13} color={ink} />
                  </View>
                  <Text numberOfLines={1} style={{ color: ink, fontSize: 12.5, fontWeight: "600", marginTop: 6 }}>{x.name}</Text>
                  <Text numberOfLines={1} style={{ color: faint, fontSize: 11, marginTop: 1 }}>Added by you</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {known.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={sectionLabel}>Already tracked</Text>
            <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
              These are in your inventory already, so they won&apos;t be added again. Tap one if it&apos;s a new batch.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
              {known.map((r, i) => (
                <RowTile key={r.key} r={r} i={i} on={isTicked(r)} tile={tile} shot={shotById.get(r.shotId) ?? null} onToggle={onToggle} />
              ))}
            </View>
          </View>
        )}

        {missing.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={sectionLabel}>Not seen in this scan</Text>
            <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
              Tracked here but not in any photo. Just out of frame? Leave it. Finished it? Mark it.
            </Text>
            {missing.map((m) => {
              const choice = missingChoice[m.id] ?? "keep";
              return (
                <View key={m.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: RADIUS.md, borderCurve: "continuous", backgroundColor: surface, borderWidth: 1, borderColor: hairline }}>
                  <FoodIcon icon={m.icon} iconUrl={m.iconUrl} name={m.name} size={32} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: ink, fontSize: 13.5, fontWeight: "600" }}>{m.name}</Text>
                    <Text style={{ color: faint, fontSize: 11 }}>{LOCATION_LABEL[m.location ?? "fridge"]}</Text>
                  </View>
                  <View style={{ flexDirection: "row", borderRadius: RADIUS.sm, borderCurve: "continuous", overflow: "hidden", borderWidth: 1, borderColor: hairline }}>
                    {(
                      [
                        ["keep", "Still there"],
                        ["used", "Used"],
                        ["wasted", "Tossed"],
                      ] as const
                    ).map(([key, text]) => {
                      const on = choice === key;
                      const tint = key === "wasted" ? warn : accent;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => {
                            void Haptics.selectionAsync();
                            onMissingChoice(m.id, key);
                          }}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={{ paddingHorizontal: 8, paddingVertical: 6, backgroundColor: on ? (key === "keep" ? surface2 : tint) : "transparent" }}
                        >
                          <Text style={{ fontSize: 11.5, fontWeight: "700", color: on && key !== "keep" ? onAccent : on ? ink : faint }}>{text}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* anything the camera couldn't see */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <TextInput
            value={missed}
            onChangeText={setMissed}
            onSubmitEditing={addMissed}
            placeholder="Add something the scan missed"
            placeholderTextColor={faint}
            returnKeyType="done"
            style={{ flex: 1, color: ink, fontSize: 14, paddingHorizontal: 12, paddingVertical: 11, borderRadius: RADIUS.md, borderCurve: "continuous", borderWidth: 1, borderColor: hairline, backgroundColor: surface }}
          />
          <Pressable onPress={addMissed} disabled={!missed.trim()} accessibilityLabel="Add" style={{ width: 44, height: 44, borderRadius: RADIUS.md, borderCurve: "continuous", backgroundColor: accent, alignItems: "center", justifyContent: "center", opacity: missed.trim() ? 1 : 0.4 }}>
            <Ionicons name="add" size={22} color={onAccent} />
          </Pressable>
        </View>

        {canShootMore && (
          <Pressable onPress={onShootMore} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 14, borderRadius: RADIUS.sm, borderCurve: "continuous", borderWidth: 1.5, borderStyle: "dashed", borderColor: hairline }}>
            <MaterialCommunityIcons name="camera-plus-outline" size={16} color={accent} />
            <Text style={{ color: accent, fontSize: 13, fontWeight: "700" }}>Scan another spot</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: hairline, backgroundColor: surface, gap: 10 }}>
        <Pressable
          onPress={onSave}
          disabled={saving || (addCount === 0 && clearCount === 0)}
          style={{ alignItems: "center", paddingVertical: 15, borderRadius: RADIUS.sm, borderCurve: "continuous", backgroundColor: accent, opacity: saving || (addCount === 0 && clearCount === 0) ? 0.5 : 1 }}
        >
          {saving ? (
            <ActivityIndicator color={onAccent} />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: onAccent }}>{label}</Text>
          )}
        </Pressable>
        <Pressable onPress={onEdit} disabled={saving || addCount === 0} hitSlop={6} style={{ alignItems: "center", paddingVertical: 4, opacity: addCount === 0 ? 0.5 : 1 }}>
          <Text style={{ color: muted, fontSize: 12.5, fontWeight: "600" }}>Edit details before adding</Text>
        </Pressable>
      </View>
    </View>
  );
}

function RowTile({
  r,
  i,
  on,
  tile,
  shot,
  onToggle,
}: {
  r: ResultRow<FlatItem>;
  i: number;
  on: boolean;
  tile: number;
  shot: Shot | null;
  onToggle: (r: ResultRow<FlatItem>) => void;
}) {
  const { surface, surface2, hairline, ink, faint, accent, onAccent, warn } = useTheme().colors;
  const doubt = r.confidence < LOW_CONFIDENCE;
  const note =
    r.space === "groceries"
      ? `→ ${LOCATION_LABEL[r.location]}`
      : r.match
        ? `In ${LOCATION_LABEL[r.location].toLowerCase()}`
        : r.seenIn > 1
          ? `Seen in ${r.seenIn} shots`
          : null;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(i, 24) * 30).duration(260)}>
      <Pressable
        onPress={() => {
          void Haptics.selectionAsync();
          onToggle(r);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        accessibilityLabel={r.name}
        style={{ width: tile, opacity: on ? 1 : 0.45 }}
      >
        <TileFace item={r.detection} shot={shot} size={tile} borderColor={!on ? hairline : doubt ? warn : accent} background={surface} />
        <View style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: on ? accent : surface2, alignItems: "center", justifyContent: "center" }}>
          {on && <Ionicons name="checkmark" size={14} color={onAccent} />}
        </View>
        {doubt && on && (
          <View style={{ position: "absolute", top: 6, left: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: warn }}>
            <Text style={{ fontSize: 10, fontWeight: "800", color: onAccent }}>?</Text>
          </View>
        )}
        {r.qty > 1 && (
          <View style={{ position: "absolute", top: tile - 26, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.6)" }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "white" }}>×{r.qty}</Text>
          </View>
        )}
        <Text numberOfLines={1} style={{ color: on ? ink : faint, fontSize: 12.5, fontWeight: "600", marginTop: 6 }}>
          {r.name}
        </Text>
        {note && (
          <Text numberOfLines={1} style={{ color: faint, fontSize: 11, marginTop: 1 }}>
            {note}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
