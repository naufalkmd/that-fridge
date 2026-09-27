import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants from "expo-constants";
import { Image } from "expo-image";
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

import { ApiError, describeError, guessFoodIcon, type StorageLocation } from "@thatfridge/core";
import { api } from "@/lib/api";
import { useInventory } from "@/lib/inventory";
import { useTheme } from "@/lib/theme";
import { RADIUS } from "@/lib/tokens";
import { PixelText } from "@/components/brand";
import { FoodIcon } from "@/components/food-icon";
import { blankDraft, stashDrafts, toCreatePayload } from "@/components/draft-item";
import {
  LOW_CONFIDENCE,
  MAX_SHOTS,
  boxToRect,
  cropStyle,
  fitFrame,
  flyStart,
  gridCells,
  padBox,
  shotLabel,
  staggerStep,
  type Box,
  type Rect,
} from "@/lib/sweep";

// Fridge sweep: shoot the fridge shelf by shelf, then watch each photo's items lock on and fly
// into a grid. Every shot is an ordinary photo scan (POST items/photo/scan, 3 credits) sent as
// soon as it's taken, so results are usually back by the time the user taps Done. The effects
// only ever play over real results - nothing is shown before the scan answers.

const isExpoGo = Constants.appOwnership === "expo";
const CREDITS_PER_SHOT = 3;
// The camera view is always dark whatever the app theme, so the HUD has fixed colours.
const HUD = "#26c6da";
const HUD_BAD = "#ff5567";

type SweepItem = {
  id: string;
  name: string;
  icon: string;
  box: Box | null;
  confidence: number;
  condition: "vibrant" | "wilting" | "past_best" | null;
};

type Shot = {
  id: string;
  uri: string;
  /** width / height of the photo as displayed. */
  aspect: number;
  label: string;
  status: "scanning" | "done" | "failed";
  items: SweepItem[];
};

type Stage = "camera" | "reveal" | "grid";

export default function Sweep() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const { ensureSectionId, addManyItems } = useInventory();
  const reduceMotion = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>("camera");
  const [shots, setShots] = useState<Shot[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const outOfCreditsShown = useRef(false);

  const items = useMemo(
    () => shots.flatMap((s) => (s.status === "done" ? s.items.map((it) => ({ it, shot: s })) : [])),
    [shots],
  );
  const kept = items.filter(({ it }) => !excluded.has(it.id));

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
        items: scan.detected_items.map((d, i) => ({
          id: `${shot.id}-${i}`,
          name: d.parsed_name,
          icon: d.icon || guessFoodIcon(d.parsed_name) || "generic",
          box: d.box ?? null,
          confidence: typeof d.confidence === "number" ? d.confidence : 0.5,
          condition: d.condition ?? null,
        })),
      });
    } catch (e) {
      updateShot(shot.id, { status: "failed" });
      if (e instanceof ApiError && e.status === 402) {
        if (outOfCreditsShown.current) return;
        outOfCreditsShown.current = true;
        Alert.alert("Out of credits", "Each shot uses 3 credits. Top up to keep sweeping.", [
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
      id: `s${Date.now()}`,
      uri,
      aspect: width > 0 && height > 0 ? width / height : 3 / 4,
      label: shotLabel(shots.length),
      status: "scanning",
      items: [],
    };
    setShots((prev) => [...prev, shot]);
    void upload(shot);
  }

  function discardAndClose() {
    if (items.length === 0 && shots.every((s) => s.status !== "scanning")) {
      router.back();
      return;
    }
    Alert.alert("Discard this sweep?", "Nothing has been added to your fridge yet.", [
      { text: "Keep going", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  function toDrafts() {
    return kept.map(({ it, shot }) =>
      blankDraft({
        name: it.name,
        parsedName: it.name,
        icon: it.icon,
        condition: it.condition,
        location: (shot.label === "Freezer" ? "freezer" : "fridge") as StorageLocation,
        categoryId: categoryId ?? null,
        source: "photo",
      }),
    );
  }

  async function addAll() {
    const drafts = toDrafts();
    if (!drafts.length) return;
    setSaving(true);
    try {
      const n = await addManyItems(drafts.map(toCreatePayload));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (router.canDismiss()) router.dismissAll();
      else router.back();
      setTimeout(() => Alert.alert("Added", `${n} item${n === 1 ? "" : "s"} added to your fridge.`), 300);
    } catch (e) {
      setSaving(false);
      Alert.alert("Error", describeError(e, "Couldn't add those items."));
    }
  }

  function editDetails() {
    stashDrafts(toDrafts());
    router.replace("/add?method=barcode-batch");
  }

  if (isExpoGo) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center gap-4 bg-canvas p-6">
        <Text className="text-center text-ink">
          The fridge sweep needs a development build — the camera isn&apos;t available in Expo Go.
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
            ThatFridge needs camera access to sweep your fridge.
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
      items={items}
      excluded={excluded}
      onToggle={(id) =>
        setExcluded((prev) => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      saving={saving}
      canShootMore={shots.length < MAX_SHOTS}
      onShootMore={() => setStage("camera")}
      onAdd={addAll}
      onEdit={editDetails}
      onClose={discardAndClose}
    />
  );
}

// ---- stage 1: camera with the HUD ------------------------------------------

function CameraStage({
  shots,
  onCaptured,
  onClose,
  onDone,
}: {
  shots: Shot[];
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
  // The aiming frame: the camera area between the top readout and the bottom controls.
  const frame: Rect = {
    x: 20,
    y: insets.top + 70,
    w: width - 40,
    h: height - insets.top - 70 - (insets.bottom + 190),
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
          <PixelText style={{ color: HUD, fontSize: 11 }}>FRIDGE SWEEP</PixelText>
          <Text style={{ color: "white", fontSize: 13, fontWeight: "600", marginTop: 3 }}>
            {full
              ? "That's the most for one sweep — tap Done"
              : `Shot ${shots.length + 1} of ${MAX_SHOTS} · ${shotLabel(shots.length)}`}
          </Text>
        </View>
        <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" }}>
          {CREDITS_PER_SHOT} credits / shot
        </Text>
      </View>

      {/* bottom: captured shots, shutter, done */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 16, gap: 16 }}>
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
          <View style={{ width: 72 }} />
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

function ShotThumb({ shot }: { shot: Shot }) {
  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={{ width: 52, height: 52, borderRadius: RADIUS.sm, borderCurve: "continuous", overflow: "hidden", borderWidth: 1.5, borderColor: shot.status === "failed" ? HUD_BAD : HUD }}
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
          <PixelText style={{ color: "white", fontSize: 13 }}>{shot.items.length}</PixelText>
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
          {shot?.label ?? ""}
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
function FlyTile({ item, shot, from, to, delay }: { item: SweepItem; shot: Shot; from: Rect | null; to: Rect | undefined; delay: number }) {
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
function TileFace({ item, shot, size, borderColor, background = "#131316" }: { item: SweepItem; shot: Shot; size: number; borderColor: string; background?: string }) {
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
      {item.box ? (
        <Image source={{ uri: shot.uri }} style={{ position: "absolute", ...cropStyle(padBox(item.box), shot.aspect, size - 3) }} contentFit="fill" />
      ) : (
        <FoodIcon icon={item.icon} name={item.name} size={size * 0.7} />
      )}
    </View>
  );
}

// ---- stage 3: results grid ---------------------------------------------------

function ResultsStage({
  shots,
  items,
  excluded,
  onToggle,
  saving,
  canShootMore,
  onShootMore,
  onAdd,
  onEdit,
  onClose,
}: {
  shots: Shot[];
  items: { it: SweepItem; shot: Shot }[];
  excluded: Set<string>;
  onToggle: (id: string) => void;
  saving: boolean;
  canShootMore: boolean;
  onShootMore: () => void;
  onAdd: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { canvas, surface, surface2, hairline, ink, muted, faint, accent, onAccent, warn } = useTheme().colors;
  const cols = 3;
  const gap = 10;
  const tile = Math.floor((width - 40 - gap * (cols - 1)) / cols);
  const pending = shots.filter((s) => s.status === "scanning").length;
  const count = items.filter(({ it }) => !excluded.has(it.id)).length;
  const unsure = items.filter(({ it }) => it.confidence < LOW_CONFIDENCE).length;

  return (
    <View style={{ flex: 1, backgroundColor: canvas }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <PixelText style={{ color: accent, fontSize: 11 }}>SWEEP COMPLETE</PixelText>
          <Text style={{ color: ink, fontSize: 18, fontWeight: "700", marginTop: 4 }}>
            {items.length} item{items.length === 1 ? "" : "s"} found
          </Text>
        </View>
        <Pressable onPress={onClose} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: surface2, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="close" size={20} color={ink} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18, marginBottom: 14 }}>
          Tap anything the sweep got wrong to leave it out.
          {unsure ? ` ${unsure} marked ? ${unsure === 1 ? "is" : "are"} worth a second look.` : ""}
        </Text>

        {pending > 0 && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <ActivityIndicator color={accent} size="small" />
            <Text style={{ color: muted, fontSize: 12.5 }}>
              Still identifying {pending} shot{pending === 1 ? "" : "s"}…
            </Text>
          </View>
        )}

        {items.length === 0 && pending === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40, gap: 10 }}>
            <MaterialCommunityIcons name="fridge-outline" size={40} color={faint} />
            <Text style={{ color: muted, fontSize: 13, textAlign: "center" }}>
              Nothing recognised. Try closer shots with the light on.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
            {items.map(({ it, shot }, i) => {
              const off = excluded.has(it.id);
              const doubt = it.confidence < LOW_CONFIDENCE;
              return (
                <Animated.View key={it.id} entering={FadeInDown.delay(Math.min(i, 24) * 30).duration(260)}>
                  <Pressable
                    onPress={() => {
                      void Haptics.selectionAsync();
                      onToggle(it.id);
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: !off }}
                    accessibilityLabel={it.name}
                    style={{ width: tile, opacity: off ? 0.4 : 1 }}
                  >
                    <TileFace item={it} shot={shot} size={tile} borderColor={off ? hairline : doubt ? warn : accent} background={surface} />
                    <View style={{ position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: off ? surface2 : accent, alignItems: "center", justifyContent: "center" }}>
                      {!off && <Ionicons name="checkmark" size={14} color={onAccent} />}
                    </View>
                    {doubt && !off && (
                      <View style={{ position: "absolute", top: 6, left: 6, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: warn }}>
                        <Text style={{ fontSize: 10, fontWeight: "800", color: onAccent }}>?</Text>
                      </View>
                    )}
                    <Text numberOfLines={1} style={{ color: off ? faint : ink, fontSize: 12.5, fontWeight: "600", marginTop: 6, textDecorationLine: off ? "line-through" : "none" }}>
                      {it.name}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </View>
        )}

        {canShootMore && (
          <Pressable onPress={onShootMore} style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 20, padding: 14, borderRadius: RADIUS.sm, borderCurve: "continuous", borderWidth: 1.5, borderStyle: "dashed", borderColor: hairline }}>
            <MaterialCommunityIcons name="camera-plus-outline" size={16} color={accent} />
            <Text style={{ color: accent, fontSize: 13, fontWeight: "700" }}>Shoot another shelf</Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: hairline, backgroundColor: surface, gap: 10 }}>
        <Pressable
          onPress={onAdd}
          disabled={saving || count === 0}
          style={{ alignItems: "center", paddingVertical: 15, borderRadius: RADIUS.sm, borderCurve: "continuous", backgroundColor: accent, opacity: saving || count === 0 ? 0.5 : 1 }}
        >
          {saving ? (
            <ActivityIndicator color={onAccent} />
          ) : (
            <Text style={{ fontSize: 14, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, color: onAccent }}>
              Add {count} item{count === 1 ? "" : "s"}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={onEdit} disabled={saving || count === 0} hitSlop={6} style={{ alignItems: "center", paddingVertical: 4, opacity: count === 0 ? 0.5 : 1 }}>
          <Text style={{ color: muted, fontSize: 12.5, fontWeight: "600" }}>Edit details before adding</Text>
        </Pressable>
      </View>
    </View>
  );
}
