"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { NotificationKind } from "@/lib/thatfridge/types";
import type { ThatFridgeActions } from "@/lib/thatfridge/useThatFridge";
import { useThatFridgeCtx } from "./ThatFridgeContext";

type CrewId = "chef" | "guardian" | "organizer" | "shopkeeper";
type PathPoint = { leftPct: number; topPct: number };

// Each crew member wanders along `path` - a line (2+ points) drawn directly onto
// pixel-art-source.png with tools/walkable-path-drawer.html, so as long as every
// point was drawn on visible floor, the character can never end up anywhere else
// (no roam-distance-vs-sprite-size margin math needed, unlike the old fixed-box
// approach). chef -> the mid-left counter patch, organizer -> the top-right patch,
// guardian -> the bottom-left patch, shopkeeper -> the bottom-right patch.
const ZONES: {
  id: CrewId;
  label: string;
  color: string;
  path: PathPoint[];
  notifKind?: NotificationKind;
  onClick: (a: ThatFridgeActions) => void;
}[] = [
  {
    id: "chef",
    label: "Kitchen",
    color: "#d99a2b",
    path: [
      { leftPct: 13.4, topPct: 27.11 },
      { leftPct: 37.4, topPct: 27.11 },
      { leftPct: 37.93, topPct: 29.35 },
      { leftPct: 48.33, topPct: 27.11 },
      { leftPct: 37.4, topPct: 31.96 },
      { leftPct: 37.67, topPct: 34.94 },
      { leftPct: 33.4, topPct: 42.76 },
      { leftPct: 21.4, topPct: 44.25 },
      { leftPct: 13.93, topPct: 41.27 },
      { leftPct: 30.2, topPct: 52.07 },
    ],
    notifKind: "recipe",
    onClick: (a) => a.openRecipesHub(),
  },
  {
    id: "organizer",
    label: "Organizer",
    color: "#2f6fb0",
    path: [
      { leftPct: 59, topPct: 32.14 },
      { leftPct: 61.4, topPct: 29.91 },
      { leftPct: 69.4, topPct: 30.28 },
      { leftPct: 75.27, topPct: 31.03 },
      { leftPct: 85.67, topPct: 32.14 },
      { leftPct: 86.73, topPct: 40.71 },
      { leftPct: 78.47, topPct: 41.08 },
      { leftPct: 77.67, topPct: 33.63 },
    ],
    onClick: (a) => a.openOrganizerTab(),
  },
  {
    id: "guardian",
    label: "Guardian",
    color: "#c1452e",
    path: [
      { leftPct: 9.13, topPct: 74.98 },
      { leftPct: 21.67, topPct: 75.36 },
      { leftPct: 25.67, topPct: 74.98 },
      { leftPct: 25.93, topPct: 86.53 },
      { leftPct: 20.07, topPct: 85.04 },
      { leftPct: 19.8, topPct: 80.57 },
      { leftPct: 33.4, topPct: 82.43 },
    ],
    notifKind: "expiring",
    onClick: (a) => a.openGuardianTab(),
  },
  {
    id: "shopkeeper",
    label: "Shop",
    color: "#3f8f5c",
    path: [
      { leftPct: 60.33, topPct: 67.16 },
      { leftPct: 65.93, topPct: 68.65 },
      { leftPct: 74.2, topPct: 67.91 },
      { leftPct: 80.33, topPct: 67.53 },
      { leftPct: 86.47, topPct: 72.75 },
      { leftPct: 88.07, topPct: 74.24 },
      { leftPct: 87.8, topPct: 83.92 },
      { leftPct: 84.33, topPct: 89.14 },
      { leftPct: 81.67, topPct: 90.26 },
      { leftPct: 66.2, topPct: 89.51 },
      { leftPct: 65.4, topPct: 86.53 },
      { leftPct: 58.2, topPct: 86.9 },
      { leftPct: 57.13, topPct: 75.73 },
      { leftPct: 53.93, topPct: 75.73 },
    ],
    notifKind: "lowStock",
    onClick: (a) => a.openShoppingHub(),
  },
];

// 48px was the original size tuned by eye against the mobile CSS container - not the
// background art's native 1186px file resolution, which is unrelated to how big
// anything actually renders on screen. That mobile container is the 480px app-shell
// max-width (ThatFridgeApp.tsx) minus the "Your crew" section's 20px side padding
// (HomeScreen.tsx) = 440px. Expressed as a % of that instead of a fixed px value, the
// sprite stays the same size RELATIVE TO THE ROOM at any container width - mobile's
// ~440px card or desktop's ~600px one - instead of looking proportionally smaller on
// wider desktop layouts the way a fixed px size would.
const SPRITE_WIDTH_PCT = (48 / 440) * 100;

// How a character walks its path: step through the points strictly in order - 1, 2,
// 3, ... N, then back down to 1, repeat - never jumping to a point out of sequence.
// Speed/pause are shared constants (not per-crew) to keep the walk tunable in one place.
const WALK_SPEED_PCT_PER_SEC = 7;
const MIN_STEP_S = 1.2;
const MAX_STEP_S = 4.5;
const MIN_PAUSE_MS = 700;
const MAX_PAUSE_MS = 2600;

// Wanders `path` forever, visiting every point in order (forward, then backward, ping-
// ponging at the ends) - never skipping ahead to an out-of-sequence point. Position is
// driven by a CSS transition (not a keyframe loop), so hop duration can vary with each
// segment's length instead of every hop taking the same fixed time.
function useWalker(path: PathPoint[]) {
  const start = path[0];
  const [pos, setPos] = useState<PathPoint>({ leftPct: start.leftPct, topPct: start.topPct });
  const [durationS, setDurationS] = useState(MIN_STEP_S);
  const [facing, setFacing] = useState<"left" | "right">("right");
  const posRef = useRef(pos);
  useEffect(() => {
    posRef.current = pos;
  }, [pos]);

  useEffect(() => {
    if (path.length < 2) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let index = 0;
    let dir: 1 | -1 = 1;

    const step = () => {
      if (cancelled) return;
      index += dir;
      if (index >= path.length) {
        index = path.length - 2;
        dir = -1;
      } else if (index < 0) {
        index = 1;
        dir = 1;
      }
      const next = path[index];
      const dx = next.leftPct - posRef.current.leftPct;
      const dy = next.topPct - posRef.current.topPct;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const dur = Math.min(MAX_STEP_S, Math.max(MIN_STEP_S, dist / WALK_SPEED_PCT_PER_SEC));
      if (Math.abs(dx) > 0.5) setFacing(dx < 0 ? "left" : "right");
      setDurationS(dur);
      setPos(next);
      timer = setTimeout(() => {
        if (cancelled) return;
        timer = setTimeout(step, MIN_PAUSE_MS + Math.random() * (MAX_PAUSE_MS - MIN_PAUSE_MS));
      }, dur * 1000);
    };

    // Stagger the first move so multiple crew members don't all set off in sync.
    timer = setTimeout(step, Math.random() * 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [path]);

  return { pos, durationS, facing };
}

const IDLE_LINES: Record<CrewId, string[]> = {
  chef: ["Hi, I'm your Chef!", "I cook delicious meals!", "Let's whip something up!", "Hungry for an idea?"],
  guardian: ["Hi, I'm your Guardian!", "I keep your food safe.", "All clear for now!", "On watch, always."],
  organizer: ["Hi, I'm your Organizer!", "Let's keep things tidy.", "Everything in its place.", "Need a hand sorting?"],
  shopkeeper: ["Hi, I'm your Shopkeeper!", "I track what you need.", "Never run out again!", "Ready to restock?"],
};

function alertMessage(id: CrewId, count: number): string | null {
  if (count <= 0) return null;
  if (id === "guardian") return `You have ${count} thing${count === 1 ? "" : "s"} to watch out for!`;
  if (id === "shopkeeper") return `${count} item${count === 1 ? "" : "s"} running low!`;
  if (id === "chef") return `${count} recipe idea${count === 1 ? "" : "s"} ready!`;
  return null;
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 3, justifyContent: "center", padding: "3px 0" }}>
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(22,50,92,0.35)", animation: "bounce 1.1s ease-in-out infinite" }} />
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(22,50,92,0.35)", animation: "bounce 1.1s ease-in-out infinite .15s" }} />
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: "rgba(22,50,92,0.35)", animation: "bounce 1.1s ease-in-out infinite .3s" }} />
    </div>
  );
}

function CrewCharacter({
  zone,
  count,
  onOpenNotifications,
}: {
  zone: (typeof ZONES)[number];
  count: number;
  onOpenNotifications: () => void;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const [typing, setTyping] = useState(false);
  const { pos, durationS, facing } = useWalker(zone.path);

  useEffect(() => {
    let typingTimer: ReturnType<typeof setTimeout>;
    let waitTimer: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      waitTimer = setTimeout(() => {
        setTyping(true);
        typingTimer = setTimeout(() => {
          setLineIndex((i) => i + 1);
          setTyping(false);
          scheduleNext();
        }, 900);
      }, 5500 + Math.random() * 3000);
    };
    scheduleNext();

    return () => {
      clearTimeout(waitTimer);
      clearTimeout(typingTimer);
    };
  }, [zone.id]);

  const alert = alertMessage(zone.id, count);
  const messages = alert ? [alert, ...IDLE_LINES[zone.id]] : IDLE_LINES[zone.id];
  const currentMessage = messages[lineIndex % messages.length];
  const isShowingAlert = !!alert && currentMessage === alert;

  return (
    <div
      style={{
        position: "absolute",
        left: `${pos.leftPct}%`,
        top: `${pos.topPct}%`,
        width: `${SPRITE_WIDTH_PCT}%`,
        aspectRatio: "1",
        // Anchor the sprite by its bottom-center ("feet") to the path point, not its
        // top-left corner - otherwise the visible character sits offset down-right
        // from the drawn line by its own size.
        transform: "translate(-50%, -100%)",
        transition: `left ${durationS}s ease-in-out, top ${durationS}s ease-in-out`,
      }}
    >
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          cursor: "pointer",
        }}
      >
        <div
          onClick={(e) => {
            if (isShowingAlert) {
              e.stopPropagation();
              onOpenNotifications();
            }
          }}
          style={{
            position: "absolute",
            bottom: "100%",
            marginBottom: 8,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            border: `1.5px solid ${zone.color}`,
            borderRadius: 10,
            padding: "4px 8px",
            fontSize: 9,
            fontWeight: isShowingAlert ? 800 : 600,
            color: isShowingAlert ? zone.color : "#16325c",
            whiteSpace: "normal",
            textAlign: "center",
            width: 100,
            lineHeight: 1.25,
            zIndex: 2,
            cursor: isShowingAlert ? "pointer" : "default",
            boxShadow: "0 4px 10px rgba(22,50,92,0.1)",
          }}
        >
          {typing ? <TypingDots /> : currentMessage}
          <div
            style={{
              position: "absolute",
              bottom: -4,
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              width: 6,
              height: 6,
              background: "#fff",
              borderRight: `1.5px solid ${zone.color}`,
              borderBottom: `1.5px solid ${zone.color}`,
            }}
          />
        </div>
        <div style={{ position: "absolute", inset: 0, transform: `scaleX(${facing === "left" ? -1 : 1})`, transition: "transform 0.2s ease" }}>
          <Image src={`/images/thatfridge/${zone.id}.gif`} alt={zone.label} fill unoptimized style={{ objectFit: "contain", imageRendering: "pixelated" }} />
        </div>
      </div>
    </div>
  );
}

// No size/scale props - every dimension here (sprite width, positions) is a % of this
// component's own container, so the crew renders at the same size relative to the room
// whether this is dropped into the ~400px mobile card or the ~600px desktop one.
export default function CrewScene() {
  const { state, actions } = useThatFridgeCtx();

  const activeFridgeId = state.fridges[state.activeFridge]?.id;
  const pendingByKind: Record<NotificationKind, number> = { expiring: 0, lowStock: 0, recipe: 0 };
  for (const event of state.notificationEvents) {
    if (event.done) continue;
    if (state.kitchenScope === "active" && event.fridgeId !== activeFridgeId) continue;
    pendingByKind[event.kind] += 1;
  }

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1186 / 849" }}>
      <Image src="/images/thatfridge/pixel-art-source.png" alt="Your crew's spaces" fill sizes="480px" style={{ objectFit: "contain", imageRendering: "pixelated" }} />

      {ZONES.map((zone) => {
        const count = zone.notifKind ? pendingByKind[zone.notifKind] : 0;
        return (
          <div key={zone.id} onClick={() => zone.onClick(actions)}>
            <CrewCharacter zone={zone} count={count} onOpenNotifications={actions.openNotificationHistory} />
          </div>
        );
      })}
    </div>
  );
}
