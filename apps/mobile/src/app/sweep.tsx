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
import { ItemCard, blankDraft, isoInDays, suggestDraftDetails, toCreatePayload, useDraftItems, type Draft } from "@/components/draft-item";
import { AUTOFILL_BATCH, describeBulkAutofill, runBulkAutofill } from "@/lib/bulkAutofill";
import { useCredits } from "@/lib/credits";
import { BottomSheet } from "@/components/bottom-sheet";
import {
  CREDITS_PER_SHOT,
  LOW_CONFIDENCE,
  MAX_SHOTS,
  MODES,
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
  type CaptureMode,
  type Rect,
  type ResultRow,
  type Scene,
  type Space,
  type SweepDetection,
} from "@/lib/sweep";

// Scan your kitchen (plan: SCAN_PLAN.md). One camera with three modes the user can switch between
// mid-session: Photo (shots of any space - fridge, freezer, pantry or a grocery haul - each an
// ordinary photo scan, POST items/photo/scan, 3 credits), Receipt (POST items/receipt/scan, 3
// credits; its items are a grocery haul) and Barcode (live, free, looked up as it's seen). Scans
// are sent as soon as they're taken. After Done, each photo's items lock on
// and fly into a grid; the results compare them with what the fridge already tracks (new /
// already tracked / not seen). The effects only ever play over real results.

const isExpoGo = Constants.appOwnership === "expo";
// The camera view is always dark whatever the app theme, so the HUD has fixed colours.
const HUD = "#26c6da";
const HUD_BAD = "#ff5567";
const HUD_WARN = "#f5a623";

type Shot = {
  id: string;
  /** A shelf photo, or a receipt (whose items are always a grocery haul). */
  kind: "photo" | "receipt";
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

/** A barcode the product database didn't know; saved only once the user names it. */
type Unnamed = { key: string; code: string; name: string };

const BARCODE_TYPES = ["ean13", "ean8", "upc_a", "upc_e", "code128"] as const;
/** A barcode stays in view for many frames; ignore the same code again within this window. */
const BARCODE_REPEAT_MS = 2500;

type MissingChoice = "keep" | "used" | "wasted";

type Stage = "camera" | "reveal" | "grid";

export default function Sweep() {
  const router = useRouter();
  const { categoryId, mode: modeParam } = useLocalSearchParams<{ categoryId?: string; mode?: string }>();
  const { fridges, items: inventory, ensureSectionId, addManyItems, refresh, lookupBarcode } = useInventory();
  const { scope } = useScope();
  const reduceMotion = useReducedMotion();
  const [permission, requestPermission] = useCameraPermissions();
  const [stage, setStage] = useState<Stage>("camera");
  const [mode, setMode] = useState<CaptureMode>(() =>
    MODES.some((m) => m.key === modeParam) ? (modeParam as CaptureMode) : "photo",
  );
  const [space, setSpace] = useState<Space>("fridge");
  const [barcodes, setBarcodes] = useState<SweepDetection[]>([]);
  const [unnamed, setUnnamed] = useState<Unnamed[]>([]);
  const [barcodeNote, setBarcodeNote] = useState<{ text: string; ok: boolean } | null>(null);
  const lastCode = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const lookingUp = useRef(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fridgeId, setFridgeId] = useState<string | null>(() =>
    scope !== "all" && fridges.some((f) => f.id === scope) ? scope : (fridges[0]?.id ?? null),
  );
  const [shots, setShots] = useState<Shot[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  // Row key -> ticked. Unset rows default to ticked when new, unticked when already tracked.
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [missingChoice, setMissingChoice] = useState<Record<string, MissingChoice>>({});
  // Row key -> the user's edited version of that item (from the edit sheet over the results).
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  // Rows the crew filled in with "Autofill all" (their drafts live in `edits` too).
  const [filled, setFilled] = useState<Set<string>>(() => new Set());
  const [filling, setFilling] = useState<{ done: number; total: number } | null>(null);
  const { balance: credits, refresh: refreshCredits } = useCredits();
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const outOfCreditsShown = useRef(false);

  const tracked = useMemo(
    () => (fridgeId ? inventory.filter((i) => i.fridgeId === fridgeId) : []),
    [inventory, fridgeId],
  );
  // Barcode scans join the results as one more grocery "shot".
  const resultShots = useMemo(
    () => [
      ...shots.map((s) => ({ ...s, source: s.kind })),
      ...(barcodes.length
        ? [{ id: "barcodes", source: "barcode" as const, space: "groceries" as const, status: "done" as const, items: barcodes }]
        : []),
    ],
    [shots, barcodes],
  );
  const results = useMemo(() => buildSweepResults<FlatItem>(resultShots, tracked), [resultShots, tracked]);
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
      const scan =
        shot.kind === "receipt" ? await api.scanReceipt(sectionId, blob) : await api.scanFridgePhoto(sectionId, blob);
      updateShot(shot.id, {
        status: "done",
        scene: shot.kind === "receipt" ? "counter" : (scan.scene ?? null),
        items: scan.detected_items.map((d, i) => ({
          id: `${shot.id}-${i}`,
          name: d.parsed_name,
          icon: d.icon || guessFoodIcon(d.parsed_name) || "generic",
          box: d.box ?? null,
          // A printed receipt line is read, not guessed from a photo.
          confidence: typeof d.confidence === "number" ? d.confidence : shot.kind === "receipt" ? 0.9 : 0.5,
          condition: d.condition ?? null,
          storage: d.storage ?? null,
          qty: d.parsed_quantity ?? 1,
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
    const receipt = mode === "receipt";
    const shot: Shot = {
      id: `s${Date.now()}${Math.random().toString(36).slice(2, 5)}`,
      kind: receipt ? "receipt" : "photo",
      uri,
      aspect: width > 0 && height > 0 ? width / height : 3 / 4,
      space: receipt ? "groceries" : space,
      scene: null,
      status: "scanning",
      items: [],
    };
    setShots((prev) => [...prev, shot]);
    void upload(shot);
  }

  function note(text: string, ok: boolean) {
    setBarcodeNote({ text, ok });
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setBarcodeNote(null), 2200);
  }

  async function onBarcode(code: string) {
    const now = Date.now();
    if (lookingUp.current) return;
    if (lastCode.current.code === code && now - lastCode.current.at < BARCODE_REPEAT_MS) return;
    lastCode.current = { code, at: now };
    lookingUp.current = true;
    try {
      const p = await lookupBarcode(code);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setBarcodes((prev) => [
        ...prev,
        {
          id: `b${now}`,
          name: p.name,
          icon: guessFoodIcon(p.name) ?? "generic",
          box: null,
          confidence: 1,
          condition: null,
          storage: p.location ?? null,
          category: (p.category as SweepDetection["category"]) ?? null,
          shelfLifeDays: p.default_shelf_life_days || null,
        },
      ]);
      note(`Added ${p.name}`, true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setUnnamed((prev) => (prev.some((u) => u.code === code) ? prev : [...prev, { key: `u${now}`, code, name: "" }]));
        note("Unknown product. You can name it at the end", false);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        note("Couldn't look that up. Try again", false);
      }
    } finally {
      lookingUp.current = false;
    }
  }

  function pickFridge() {
    if (fridges.length < 2) return;
    Alert.alert("Which fridge is this for?", undefined, [
      ...fridges.slice(0, 6).map((f) => ({ text: f.name, onPress: () => setFridgeId(f.id) })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  }

  function discardAndClose() {
    const nothing =
      results.rows.length === 0 && extras.length === 0 && unnamed.length === 0 && shots.every((s) => s.status !== "scanning");
    if (nothing) {
      router.back();
      return;
    }
    Alert.alert("Discard this scan?", "Nothing has been saved yet.", [
      { text: "Keep going", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  }

  /** What a result row would be saved as - or the user's edited version of it. */
  function rowDraft(r: ResultRow<FlatItem>): Draft {
    return (
      edits[r.key] ??
      blankDraft({
        name: r.name,
        // parsed_name measures edits to what a scan proposed; a barcode product isn't a guess.
        parsedName: r.source === "barcode" ? null : r.name,
        icon: r.icon,
        qty: r.qty,
        condition: r.condition,
        location: r.location,
        category: r.category,
        expiryDate: r.shelfLifeDays ? isoInDays(r.shelfLifeDays) : null,
        categoryId: categoryId ?? null,
        source: r.source,
      })
    );
  }

  function toDrafts(): Draft[] {
    return [
      ...toAdd.map(rowDraft).filter((d) => d.name.trim()),
      ...unnamed
        .filter((u) => u.name.trim())
        .map((u) =>
          blankDraft({
            name: u.name.trim(),
            icon: guessFoodIcon(u.name) ?? "generic",
            barcodeMiss: u.code,
            categoryId: categoryId ?? null,
            source: "barcode",
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

  // Ticked rows still missing a date or food group (barcode products usually arrive complete).
  const needFill = results.rows.filter((r) => {
    if (!isTicked(r)) return false;
    const d = rowDraft(r);
    return !d.expiryDate || !d.category;
  });

  /** Fill in storage spot, date and food group for every ticked item that's missing them, after asking. */
  function autofillAll() {
    if (filling) return;
    const todo = needFill.slice(0, AUTOFILL_BATCH);
    if (todo.length === 0) return;
    const more = needFill.length > todo.length ? ` That's the first ${todo.length}; run it again for the rest.` : "";
    Alert.alert(
      `Autofill ${todo.length} item${todo.length === 1 ? "" : "s"}?`,
      `The crew fills in the storage spot, date and food group. Up to ${todo.length} credit${todo.length === 1 ? "" : "s"}${credits !== null ? ` (you have ${credits})` : ""}.${more}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Autofill",
          onPress: async () => {
            const byKey = new Map(todo.map((r) => [r.key, r]));
            setFilling({ done: 0, total: todo.length });
            const result = await runBulkAutofill(
              todo.map((r) => r.key),
              async (key) => ({ fields: await suggestDraftDetails(rowDraft(byKey.get(key)!)) }),
              (key, fields) => {
                setEdits((prev) => ({ ...prev, [key]: { ...(prev[key] ?? rowDraft(byKey.get(key)!)), ...fields } }));
                setFilled((prev) => new Set(prev).add(key));
              },
              (done) => setFilling({ done, total: todo.length }),
            );
            setFilling(null);
            void refreshCredits();
            void Haptics.notificationAsync(
              result.stopped || result.failed ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
            );
            if (result.stopped === "credits") {
              Alert.alert("Out of credits", describeBulkAutofill(result), [
                { text: "OK", style: "cancel" },
                { text: "Get credits", onPress: () => router.push("/credits") },
              ]);
            } else if (result.stopped || result.failed) {
              Alert.alert("Autofill", describeBulkAutofill(result));
            }
          },
        },
      ],
    );
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
        mode={mode}
        onMode={setMode}
        onBarcode={(code) => void onBarcode(code)}
        barcodeCount={barcodes.length + unnamed.length}
        barcodeNote={barcodeNote}
        space={space}
        onSpace={setSpace}
        fridgeName={fridges.length > 1 ? fridges.find((f) => f.id === fridgeId)?.name ?? null : null}
        onPickFridge={pickFridge}
        onCaptured={onCaptured}
        onClose={discardAndClose}
        // The reveal plays over photos; a barcode-only session goes straight to the results.
        onDone={() => setStage(reduceMotion || shots.length === 0 ? "grid" : "reveal")}
      />
    );
  }

  if (stage === "reveal") {
    return <RevealStage shots={shots} onFinish={() => setStage("grid")} />;
  }

  const editingRow = editing ? results.rows.find((r) => r.key === editing) : undefined;

  return (
    <>
    <ResultsStage
      shots={shots}
      rows={results.rows}
      unnamed={unnamed}
      onNameUnnamed={(key, name) => setUnnamed((prev) => prev.map((u) => (u.key === key ? { ...u, name } : u)))}
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
      addCount={toAdd.length + extras.length + unnamed.filter((u) => u.name.trim()).length}
      clearCount={toClear.length}
      saving={saving}
      canShootMore={shots.length < MAX_SHOTS}
      onShootMore={() => setStage("camera")}
      onSave={save}
      onEditRow={(key) => setEditing(key)}
      edits={edits}
      filled={filled}
      onAutofillAll={autofillAll}
      autofillCount={Math.min(needFill.length, AUTOFILL_BATCH)}
      filling={filling}
      onClose={discardAndClose}
    />
    {editingRow && (
      <EditRowSheet
        key={editingRow.key}
        draft={rowDraft(editingRow)}
        onDone={(d) => {
          setEdits((prev) => ({ ...prev, [editingRow.key]: d }));
          setFilled((prev) => {
            const next = new Set(prev);
            next.delete(editingRow.key);
            return next;
          });
          // Editing something means you want it: tick it (an already-tracked row becomes a new batch).
          setTicks((prev) => ({ ...prev, [editingRow.key]: true }));
          setEditing(null);
        }}
        onRemove={() => {
          setTicks((prev) => ({ ...prev, [editingRow.key]: false }));
          setEditing(null);
        }}
        onCancel={() => setEditing(null)}
      />
    )}
    </>
  );
}

// ---- stage 1: camera with the HUD ------------------------------------------

function CameraStage({
  shots,
  mode,
  onMode,
  onBarcode,
  barcodeCount,
  barcodeNote,
  space,
  onSpace,
  fridgeName,
  onPickFridge,
  onCaptured,
  onClose,
  onDone,
}: {
  shots: Shot[];
  mode: CaptureMode;
  onMode: (m: CaptureMode) => void;
  onBarcode: (code: string) => void;
  /** Barcodes scanned so far, known or not. */
  barcodeCount: number;
  /** The last barcode's result, shown briefly mid-screen. */
  barcodeNote: { text: string; ok: boolean } | null;
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

  const barcode = mode === "barcode";
  const full = shots.length >= MAX_SHOTS;
  const inSpace = shots.filter((s) => s.kind === "photo" && s.space === space).length;
  const receipts = shots.filter((s) => s.kind === "receipt").length;
  const modeInfo = MODES.find((m) => m.key === mode)!;
  const hint = mode === "photo" ? (SPACES.find((s) => s.key === space)?.hint ?? "") : modeInfo.hint;
  const title = full && !barcode
    ? "That's the most for one scan — tap Done"
    : mode === "photo"
      ? shotLabel(space, inSpace)
      : mode === "receipt"
        ? `Receipt ${receipts + 1}`
        : barcodeCount
          ? `${barcodeCount} scanned`
          : "Scan barcodes";
  const credits = shots.length * CREDITS_PER_SHOT;
  const canDone = shots.length > 0 || barcodeCount > 0;

  // The aiming area between the top readout and the bottom controls, shaped to the mode:
  // the whole view for shelves, a tall slip for a receipt, a strip for a barcode.
  const area: Rect = {
    x: 20,
    y: insets.top + 78,
    w: width - 40,
    h: height - insets.top - 78 - (insets.bottom + 270),
  };
  const frame: Rect =
    mode === "receipt"
      ? { x: area.x + area.w * 0.19, y: area.y, w: area.w * 0.62, h: area.h }
      : barcode
        ? { x: area.x, y: area.y + area.h / 2 - 70, w: area.w, h: 140 }
        : area;

  async function shoot() {
    if (barcode || !ready || capturing || full || !camera.current) return;
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
      allowsMultipleSelection: mode === "photo",
      selectionLimit: mode === "photo" ? room : 1,
      // Converts HEIC/PNG to a compressed JPEG, as add.tsx does for its uploads.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (res.canceled) return;
    for (const a of res.assets.slice(0, room)) onCaptured(a.uri, a.width, a.height);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <CameraView
        ref={camera}
        style={{ flex: 1 }}
        facing="back"
        onCameraReady={() => setReady(true)}
        barcodeScannerSettings={barcode ? { barcodeTypes: [...BARCODE_TYPES] } : undefined}
        onBarcodeScanned={barcode ? ({ data }) => onBarcode(data) : undefined}
      />

      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }} pointerEvents="none">
        {mode === "photo" && <HudGrid rect={frame} />}
        <HudCorners rect={frame} />
        {(barcode || !full) && <ScanLine key={mode} rect={frame} duration={barcode ? 900 : 2200} band={barcode ? 40 : 70} />}
        {barcodeNote && barcode && (
          <Animated.View
            entering={FadeIn.duration(150)}
            style={{ position: "absolute", left: 0, right: 0, top: frame.y + frame.h + 14, alignItems: "center" }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.65)", borderWidth: 1, borderColor: barcodeNote.ok ? HUD : HUD_WARN }}>
              <Ionicons name={barcodeNote.ok ? "checkmark-circle" : "help-circle"} size={15} color={barcodeNote.ok ? HUD : HUD_WARN} />
              <Text style={{ color: "white", fontSize: 12.5, fontWeight: "600" }} numberOfLines={1}>{barcodeNote.text}</Text>
            </View>
          </Animated.View>
        )}
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
            {title}
          </Text>
          {!(full && !barcode) && (
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
          <Text style={{ color: barcode ? HUD : "rgba(255,255,255,0.6)", fontSize: 11, fontWeight: "600" }}>
            {barcode ? "Free" : credits ? `${credits} credits used` : modeInfo.cost}
          </Text>
        </View>
      </View>

      {/* bottom: space chips (photo), captures, shutter / counter, done, then the mode switcher */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 12, gap: 14 }}>
        {mode === "photo" ? (
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
        ) : (
          <View style={{ height: 33 }} />
        )}
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
          {barcode ? (
            <View style={{ width: 72 }} />
          ) : (
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
          )}
          {barcode ? (
            // Barcodes add themselves: no shutter, just the running count.
            <View style={{ width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: HUD, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" }}>
              <PixelText style={{ color: "white", fontSize: 20 }}>{barcodeCount}</PixelText>
            </View>
          ) : (
            <Pressable
              onPress={shoot}
              disabled={!ready || capturing || full}
              accessibilityLabel={mode === "receipt" ? "Take receipt photo" : "Take shot"}
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
          )}
          <Pressable
            onPress={onDone}
            disabled={!canDone}
            style={{
              width: 72,
              alignItems: "center",
              paddingVertical: 10,
              borderRadius: RADIUS.sm,
              borderCurve: "continuous",
              backgroundColor: canDone ? HUD : "rgba(255,255,255,0.15)",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "700", color: canDone ? "#0a0a0c" : "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>
              Done
            </Text>
          </Pressable>
        </View>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 26 }}>
          {MODES.map((m) => {
            const on = m.key === mode;
            return (
              <Pressable
                key={m.key}
                onPress={() => {
                  if (on) return;
                  void Haptics.selectionAsync();
                  onMode(m.key);
                }}
                hitSlop={10}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <PixelText style={{ fontSize: 11, color: on ? HUD : "rgba(255,255,255,0.55)" }}>{m.label.toUpperCase()}</PixelText>
              </Pressable>
            );
          })}
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
          {shot
            ? shot.kind === "receipt"
              ? "Receipt"
              : shotLabel(shot.space, shots.slice(0, index).filter((s) => s.kind === "photo" && s.space === shot.space).length)
            : ""}
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
  unnamed,
  onNameUnnamed,
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
  onEditRow,
  edits,
  filled,
  onAutofillAll,
  autofillCount,
  filling,
  onClose,
}: {
  shots: Shot[];
  rows: ResultRow<FlatItem>[];
  unnamed: Unnamed[];
  onNameUnnamed: (key: string, name: string) => void;
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
  onEditRow: (key: string) => void;
  edits: Record<string, Draft>;
  filled: Set<string>;
  onAutofillAll: () => void;
  /** Ticked items still missing details (capped at one run). */
  autofillCount: number;
  filling: { done: number; total: number } | null;
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
  const nothingAtAll = rows.length === 0 && extras.length === 0 && unnamed.length === 0 && missing.length === 0 && pending === 0;

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
        {/* shots, with the space each was of - tap to change (receipts are always a grocery haul) */}
        {shots.length > 0 && (
        <View style={{ gap: 8 }}>
          {shots.some((s) => s.kind === "photo") && (
            <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
              Tap a shot&apos;s label if it was of something else.
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {shots.map((s) => {
              const suggested = sceneSpace(s.scene);
              const mismatch = s.kind === "photo" && s.status === "done" && suggested !== null && suggested !== s.space;
              return (
                <View key={s.id} style={{ alignItems: "center", gap: 6 }}>
                  <ShotThumb shot={s} size={56} />
                  {s.kind === "receipt" ? (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1, borderColor: hairline, backgroundColor: surface }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: ink }}>Receipt</Text>
                    </View>
                  ) : (
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
                  )}
                </View>
              );
            })}
          </ScrollView>
          {shots.some((s) => s.kind === "photo" && s.status === "done" && sceneSpace(s.scene) !== null && sceneSpace(s.scene) !== s.space) && (
            <Text style={{ color: warn, fontSize: 12 }}>A label with ? is what that photo looks like to the crew. Tap it to switch.</Text>
          )}
        </View>
        )}

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
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={sectionLabel}>New</Text>
              {filling ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <ActivityIndicator size="small" color={accent} />
                  <Text style={{ color: muted, fontSize: 12, fontWeight: "600" }}>
                    Filling {filling.done} of {filling.total}…
                  </Text>
                </View>
              ) : autofillCount > 0 ? (
                <Pressable onPress={onAutofillAll} hitSlop={8} accessibilityLabel="Autofill all" style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.sm, borderWidth: 1, borderColor: accent }}>
                  <MaterialCommunityIcons name="auto-fix" size={13} color={accent} />
                  <Text style={{ color: accent, fontSize: 12, fontWeight: "700" }}>Autofill all</Text>
                </Pressable>
              ) : null}
            </View>
            {unsure > 0 && (
              <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
                Tap anything the scan got wrong to leave it out. {unsure} marked ? {unsure === 1 ? "is" : "are"} worth a second look.
              </Text>
            )}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap }}>
              {fresh.map((r, i) => (
                <RowTile key={r.key} r={r} i={i} on={isTicked(r)} tile={tile} shot={shotById.get(r.shotId) ?? null} onToggle={onToggle} edited={edits[r.key]} autofilled={filled.has(r.key)} onEdit={() => onEditRow(r.key)} />
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

        {unnamed.length > 0 && (
          <View style={{ gap: 10 }}>
            <Text style={sectionLabel}>Name these products</Text>
            <Text style={{ color: muted, fontSize: 12.5, lineHeight: 18 }}>
              These barcodes aren&apos;t in the product database yet. Name one to add it, or leave it blank to skip.
            </Text>
            {unnamed.map((u) => (
              <View key={u.key} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <MaterialCommunityIcons name="barcode" size={22} color={faint} />
                <TextInput
                  value={u.name}
                  onChangeText={(t) => onNameUnnamed(u.key, t)}
                  placeholder={`What is ${u.code}?`}
                  placeholderTextColor={faint}
                  returnKeyType="done"
                  style={{ flex: 1, color: ink, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10, borderRadius: RADIUS.md, borderCurve: "continuous", borderWidth: 1, borderColor: u.name.trim() ? accent : hairline, backgroundColor: surface }}
                />
              </View>
            ))}
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
                <RowTile key={r.key} r={r} i={i} on={isTicked(r)} tile={tile} shot={shotById.get(r.shotId) ?? null} onToggle={onToggle} edited={edits[r.key]} autofilled={filled.has(r.key)} onEdit={() => onEditRow(r.key)} />
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
<Text style={{ color: faint, fontSize: 11.5, textAlign: "center" }}>Tap ✎ on an item to change its name, amount or date.</Text>
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
  edited,
  autofilled,
  onEdit,
}: {
  r: ResultRow<FlatItem>;
  i: number;
  on: boolean;
  tile: number;
  shot: Shot | null;
  onToggle: (r: ResultRow<FlatItem>) => void;
  /** The user's edited version, when they've changed it. */
  edited?: Draft;
  /** Filled in by "Autofill all" rather than edited by hand. */
  autofilled?: boolean;
  onEdit: () => void;
}) {
  const { surface, surface2, hairline, ink, faint, accent, onAccent, warn } = useTheme().colors;
  const doubt = r.confidence < LOW_CONFIDENCE && !edited;
  const name = edited?.name.trim() || r.name;
  const qty = edited?.qty ?? r.qty;
  const note = autofilled
    ? "Filled in"
    : edited
    ? "Edited"
    : r.space === "groceries"
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
        accessibilityLabel={name}
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
        {qty > 1 && (
          <View style={{ position: "absolute", top: tile - 26, right: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(0,0,0,0.6)" }}>
            <Text style={{ fontSize: 11, fontWeight: "800", color: "white" }}>×{qty}</Text>
          </View>
        )}
        <Pressable
          onPress={onEdit}
          hitSlop={8}
          accessibilityLabel={`Edit ${name}`}
          style={{ position: "absolute", top: tile - 30, left: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" }}
        >
          <MaterialCommunityIcons name="pencil" size={13} color="white" />
        </Pressable>
        <Text numberOfLines={1} style={{ color: on ? ink : faint, fontSize: 12.5, fontWeight: "600", marginTop: 6 }}>
          {name}
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

/** Edit one scanned item over the results, with the same card the Add screen uses. Done keeps the
 *  changes and returns to the grid; nothing leaves the scan. */
function EditRowSheet({
  draft,
  onDone,
  onRemove,
  onCancel,
}: {
  draft: Draft;
  onDone: (d: Draft) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const { height } = useWindowDimensions();
  const { accent, onAccent } = useTheme().colors;
  const store = useDraftItems(() => [draft]);
  const d = store.items[0];
  useEffect(() => {
    store.refetchLibrary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!d) return null;
  return (
    <BottomSheet visible onClose={onCancel} maxHeight={Math.round(height * 0.85)}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
        <ItemCard
          item={d}
          onChange={(p) => store.set(d.id, p)}
          onRemove={onRemove}
          onAutoFill={() => store.fillOne(d)}
          autoFilling={store.fillingId === d.id}
          onScanDate={() => store.scanDate(d)}
          scanningDate={store.scanningDateId === d.id}
          library={store.library}
          refetchLibrary={store.refetchLibrary}
        />
      </ScrollView>
      <Pressable
        onPress={() => onDone(d)}
        disabled={!d.name.trim()}
        style={{ marginTop: 10, alignItems: "center", paddingVertical: 14, borderRadius: RADIUS.sm, borderCurve: "continuous", backgroundColor: accent, opacity: d.name.trim() ? 1 : 0.5 }}
      >
        <Text style={{ fontSize: 14, fontWeight: "700", color: onAccent }}>Done</Text>
      </Pressable>
    </BottomSheet>
  );
}
