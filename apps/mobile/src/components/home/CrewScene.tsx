import { useEffect, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";

import type { KitchenScoreResult } from "@thatfridge/core";

const SCENE = require("../../../assets/images/thatfridge/pixel-art-source.png");
const GIFS = {
  chef: require("../../../assets/images/thatfridge/chef.gif"),
  guardian: require("../../../assets/images/thatfridge/guardian.gif"),
  organizer: require("../../../assets/images/thatfridge/organizer.gif"),
  shopkeeper: require("../../../assets/images/thatfridge/shopkeeper.gif"),
} as const;

type CrewId = keyof typeof GIFS;
type PathPoint = { x: number; y: number }; // percentages 0-100

const SPRITE_WIDTH_PCT = (56 / 440) * 100;
const WALK_SPEED_PCT_PER_SEC = 7;
const MIN_STEP_S = 1.2;
const MAX_STEP_S = 4.5;
const MIN_PAUSE_MS = 700;
const MAX_PAUSE_MS = 2600;

// Paths lifted verbatim from apps/web CrewScene.tsx — each drawn against the scene.webp floor
// plan so a character never clips furniture. chef→kitchen (TL), organizer→stock room (TR),
// guardian→pharmacy (BL), shopkeeper→produce (BR).
const ZONES: {
  id: CrewId;
  scoreKey: KitchenScoreResult["key"];
  color: string;
  notifKind: "expiring" | "lowStock" | "recipe" | null;
  route: string;
  path: PathPoint[];
}[] = [
  {
    id: "chef",
    scoreKey: "balance",
    color: "#f5a623",
    notifKind: "recipe",
    route: "/eat?tab=recipes",
    path: [
      { x: 12.4, y: 28.4 }, { x: 15.87, y: 27.65 }, { x: 30, y: 26.91 }, { x: 35.6, y: 28.4 },
      { x: 47.33, y: 28.03 }, { x: 41.2, y: 29.52 }, { x: 40.13, y: 33.24 }, { x: 36.4, y: 34.36 },
      { x: 35.6, y: 44.79 }, { x: 20.4, y: 45.16 }, { x: 26.53, y: 46.28 }, { x: 30, y: 50.75 },
      { x: 23.6, y: 44.79 }, { x: 16.4, y: 44.05 }, { x: 12.93, y: 39.95 },
    ],
  },
  {
    id: "organizer",
    scoreKey: "organizer",
    color: "#3d6fe0",
    notifKind: null,
    route: "/eat?tab=organizer",
    path: [
      { x: 59.07, y: 29.89 }, { x: 71.33, y: 29.89 }, { x: 74.27, y: 31.38 }, { x: 87.33, y: 31.38 },
      { x: 87.6, y: 40.32 }, { x: 77.73, y: 40.69 }, { x: 77.47, y: 33.62 },
    ],
  },
  {
    id: "guardian",
    scoreKey: "waste",
    color: "#ff5f56",
    notifKind: "expiring",
    route: "/eat?tab=guardian",
    path: [
      { x: 8.93, y: 77.4 }, { x: 21.73, y: 77.77 }, { x: 26, y: 74.42 }, { x: 27.87, y: 86.71 },
      { x: 18.53, y: 87.08 }, { x: 18.27, y: 81.12 }, { x: 36.13, y: 80.75 },
    ],
  },
  {
    id: "shopkeeper",
    scoreKey: "shopkeeper",
    color: "#39e07f",
    notifKind: "lowStock",
    route: "/eat?tab=shopping",
    path: [
      { x: 59.76, y: 67.38 }, { x: 67.49, y: 68.13 }, { x: 68.83, y: 69.99 }, { x: 73.36, y: 69.62 },
      { x: 75.49, y: 68.5 }, { x: 80.03, y: 67.75 }, { x: 84.83, y: 68.5 }, { x: 87.49, y: 73.34 },
      { x: 87.76, y: 82.28 }, { x: 87.23, y: 86.38 }, { x: 83.49, y: 88.99 }, { x: 65.63, y: 88.99 },
      { x: 62.16, y: 87.13 }, { x: 57.36, y: 88.24 }, { x: 57.63, y: 75.58 }, { x: 53.89, y: 74.46 },
    ],
  },
];

const IDLE_LINES: Record<CrewId, string[]> = {
  chef: ["Hi, I'm your Chef!", "Let's whip something up!", "Hungry for an idea?"],
  guardian: ["Hi, I'm your Guardian!", "I keep your food safe.", "On watch, always."],
  organizer: ["Hi, I'm your Organizer!", "Everything in its place.", "Need a hand sorting?"],
  shopkeeper: ["Hi, I'm your Shopkeeper!", "Never run out again!", "Ready to restock?"],
};

function alertMessage(id: CrewId, count: number): string | null {
  if (count <= 0) return null;
  if (id === "guardian") return `${count} thing${count === 1 ? "" : "s"} to watch out for!`;
  if (id === "shopkeeper") return `${count} item${count === 1 ? "" : "s"} running low!`;
  if (id === "chef") return `${count} recipe idea${count === 1 ? "" : "s"} ready!`;
  return null;
}

const PIPS = 5;

function ScoreMeter({ score, color }: { score: number | null; color: string }) {
  const filled = score === null ? 0 : Math.max(0, Math.min(PIPS, Math.round(score / (100 / PIPS))));
  return (
    <View
      style={{
        position: "absolute",
        bottom: "100%",
        marginBottom: 3,
        alignSelf: "center",
        flexDirection: "row",
        gap: 2,
        padding: 4,
        borderRadius: 4,
        backgroundColor: "rgba(0,0,0,0.7)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.18)",
      }}
    >
      {Array.from({ length: PIPS }).map((_, i) => (
        <View
          key={i}
          style={{
            width: 4,
            height: 11,
            borderRadius: 1.5,
            backgroundColor: i < filled ? color : "rgba(255,255,255,0.2)",
          }}
        />
      ))}
    </View>
  );
}

function CrewCharacter({
  zone,
  box,
  count,
  score,
  onPress,
  onOpenAlerts,
}: {
  zone: (typeof ZONES)[number];
  box: { w: number; h: number };
  count: number;
  score: number | null;
  onPress: () => void;
  onOpenAlerts: () => void;
}) {
  const toPx = (p: PathPoint) => ({ x: (p.x / 100) * box.w, y: (p.y / 100) * box.h });
  const pos = useRef(new Animated.ValueXY(toPx(zone.path[0]))).current;
  const [facing, setFacing] = useState<1 | -1>(1);
  const [lineIndex, setLineIndex] = useState(0);

  useEffect(() => {
    if (!box.w || !box.h || zone.path.length < 2) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    let dir: 1 | -1 = 1;
    let current = toPx(zone.path[0]);

    const step = () => {
      if (cancelled) return;
      index += dir;
      if (index >= zone.path.length) {
        index = zone.path.length - 2;
        dir = -1;
      } else if (index < 0) {
        index = 1;
        dir = 1;
      }
      const nextPct = zone.path[index];
      const next = toPx(nextPct);
      const dxPct = nextPct.x - (current.x / box.w) * 100;
      const dyPct = nextPct.y - (current.y / box.h) * 100;
      const distPct = Math.sqrt(dxPct * dxPct + dyPct * dyPct);
      const dur = Math.min(MAX_STEP_S, Math.max(MIN_STEP_S, distPct / WALK_SPEED_PCT_PER_SEC));
      if (Math.abs(dxPct) > 0.5) setFacing(dxPct < 0 ? -1 : 1);
      current = next;
      Animated.timing(pos, {
        toValue: next,
        duration: dur * 1000,
        useNativeDriver: false,
      }).start(() => {
        if (cancelled) return;
        timer = setTimeout(step, MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
      });
    };

    timer = setTimeout(step, Math.random() * 1500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [box.w, box.h]);

  useEffect(() => {
    const id = setInterval(() => setLineIndex((i) => i + 1), 6500);
    return () => clearInterval(id);
  }, []);

  const alert = alertMessage(zone.id, count);
  const idle = IDLE_LINES[zone.id];
  const message = alert ?? idle[lineIndex % idle.length];
  const isAlert = !!alert;
  const spriteW = (SPRITE_WIDTH_PCT / 100) * box.w;

  return (
    <Animated.View
      style={{
        position: "absolute",
        width: spriteW,
        height: spriteW,
        left: Animated.subtract(pos.x, spriteW / 2),
        top: Animated.subtract(pos.y, spriteW),
      }}
    >
      <ScoreMeter score={score} color={zone.color} />
      <Pressable
        onPress={isAlert ? onOpenAlerts : onPress}
        style={{
          position: "absolute",
          bottom: "100%",
          marginBottom: 34,
          alignSelf: "center",
          maxWidth: 108,
          minWidth: 84,
          backgroundColor: "#131316",
          borderWidth: 1.5,
          borderColor: zone.color,
          borderRadius: 6,
          paddingVertical: 4,
          paddingHorizontal: 8,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            lineHeight: 12,
            textAlign: "center",
            fontWeight: isAlert ? "800" : "600",
            color: isAlert ? zone.color : "#eaeaec",
          }}
        >
          {message}
        </Text>
      </Pressable>
      <Pressable onPress={onPress} style={{ flex: 1, transform: [{ scaleX: facing }] }}>
        <Image source={GIFS[zone.id]} style={{ flex: 1 }} contentFit="contain" />
      </Pressable>
    </Animated.View>
  );
}

export function CrewScene({
  pendingByKind,
  scoreByKey,
}: {
  pendingByKind: Record<"expiring" | "lowStock" | "recipe", number>;
  scoreByKey: Record<KitchenScoreResult["key"], number | null>;
}) {
  const router = useRouter();
  const [box, setBox] = useState({ w: 0, h: 0 });

  const onLayout = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setBox({ w: width, h: width * (842 / 1180) });
  };

  return (
    <View
      onLayout={onLayout}
      style={{ width: "100%", aspectRatio: 1180 / 842, position: "relative" }}
    >
      <Image source={SCENE} style={{ position: "absolute", inset: 0 }} contentFit="contain" />
      {box.w > 0 &&
        ZONES.map((zone) => (
          <CrewCharacter
            key={zone.id}
            zone={zone}
            box={box}
            count={zone.notifKind ? pendingByKind[zone.notifKind] : 0}
            score={scoreByKey[zone.scoreKey]}
            onPress={() => router.navigate(zone.route as never)}
            onOpenAlerts={() => router.navigate("/notifications" as never)}
          />
        ))}
    </View>
  );
}
