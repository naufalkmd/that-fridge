"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { computeFoodBalanceScore, computeOrganizerScore, computeShopkeeperScore, computeWasteSaverScore } from "@/lib/thatfridge/scoring";
import { theme } from "@/lib/thatfridge/theme";
import type { NotificationKind } from "@/lib/thatfridge/types";
import type { ThatFridgeActions } from "@/lib/thatfridge/useThatFridge";
import { useThatFridgeCtx } from "./ThatFridgeContext";

type CrewId = "chef" | "guardian" | "organizer" | "shopkeeper";
type PathPoint = { leftPct: number; topPct: number };

// Each crew member wanders along `path` - a line (2+ points), ideally placed on visible
// floor with tools/walkable-path-drawer.html so the character can never end up anywhere
// else (no roam-distance-vs-sprite-size margin math needed, unlike the old fixed-box
// approach). pixel-art-source.png (scene.webp, background made transparent) is a 4-room
// floor plan: chef -> the kitchen (top-left), organizer -> the stock room (top-right),
// guardian -> the health/pharmacy room (bottom-left), shopkeeper -> the produce/grocery
// room (bottom-right). These paths were estimated from a percentage-grid overlay rather
// than drawn interactively - re-check them with the drawer tool if a crew member ever
// looks like it's clipping furniture.
// Only these kinds surface as a badge on a crew member in the room; the rest (invites,
// crew activity) live only in the notification history list.
type CountedNotificationKind = Extract<NotificationKind, "expiring" | "lowStock" | "recipe">;

const ZONES: {
  id: CrewId;
  label: string;
  color: string;
  path: PathPoint[];
  notifKind?: CountedNotificationKind;
  onClick: (a: ThatFridgeActions) => void;
}[] = [
  {
    id: "chef",
    label: "Kitchen",
    color: theme.agent.chef,
    // Drawn with tools/walkable-path-drawer.html against the scene.webp floor plan (kitchen
    // occupies the top-left room) - see the "Room layouts" comment above.
    path: [
      { leftPct: 12.4, topPct: 28.4 },
      { leftPct: 15.87, topPct: 27.65 },
      { leftPct: 30, topPct: 26.91 },
      { leftPct: 35.6, topPct: 28.4 },
      { leftPct: 47.33, topPct: 28.03 },
      { leftPct: 41.2, topPct: 29.52 },
      { leftPct: 40.13, topPct: 33.24 },
      { leftPct: 36.4, topPct: 34.36 },
      { leftPct: 35.6, topPct: 44.79 },
      { leftPct: 20.4, topPct: 45.16 },
      { leftPct: 26.53, topPct: 46.28 },
      { leftPct: 30, topPct: 50.75 },
      { leftPct: 23.6, topPct: 44.79 },
      { leftPct: 16.4, topPct: 44.05 },
      { leftPct: 12.93, topPct: 39.95 },
    ],
    notifKind: "recipe",
    onClick: (a) => a.openRecipesHub(),
  },
  {
    id: "organizer",
    label: "Organizer",
    color: theme.agent.organizer,
    // Stock Room, top-right.
    path: [
      { leftPct: 59.07, topPct: 29.89 },
      { leftPct: 71.33, topPct: 29.89 },
      { leftPct: 74.27, topPct: 31.38 },
      { leftPct: 87.33, topPct: 31.38 },
      { leftPct: 87.6, topPct: 40.32 },
      { leftPct: 77.73, topPct: 40.69 },
      { leftPct: 77.47, topPct: 33.62 },
    ],
    onClick: (a) => a.openOrganizerTab(),
  },
  {
    id: "guardian",
    label: "Guardian",
    color: theme.agent.guardian,
    // Health/pharmacy room, bottom-left.
    path: [
      { leftPct: 8.93, topPct: 77.4 },
      { leftPct: 21.73, topPct: 77.77 },
      { leftPct: 26, topPct: 74.42 },
      { leftPct: 27.87, topPct: 86.71 },
      { leftPct: 18.53, topPct: 87.08 },
      { leftPct: 18.27, topPct: 81.12 },
      { leftPct: 36.13, topPct: 80.75 },
    ],
    notifKind: "expiring",
    onClick: (a) => a.openGuardianTab(),
  },
  {
    id: "shopkeeper",
    label: "Shop",
    color: theme.agent.shopkeeper,
    // Produce/grocery room, bottom-right.
    path: [
      { leftPct: 59.76, topPct: 67.38 },
      { leftPct: 67.49, topPct: 68.13 },
      { leftPct: 68.83, topPct: 69.99 },
      { leftPct: 73.36, topPct: 69.62 },
      { leftPct: 75.49, topPct: 68.5 },
      { leftPct: 80.03, topPct: 67.75 },
      { leftPct: 84.83, topPct: 68.5 },
      { leftPct: 87.49, topPct: 73.34 },
      { leftPct: 87.76, topPct: 82.28 },
      { leftPct: 87.23, topPct: 86.38 },
      { leftPct: 83.49, topPct: 88.99 },
      { leftPct: 65.63, topPct: 88.99 },
      { leftPct: 62.16, topPct: 87.13 },
      { leftPct: 57.36, topPct: 88.24 },
      { leftPct: 57.63, topPct: 75.58 },
      { leftPct: 53.89, topPct: 74.46 },
    ],
    notifKind: "lowStock",
    onClick: (a) => a.openShoppingHub(),
  },
];

// 56px was tuned by eye against the mobile CSS container - not the background art's
// native pixel-art-source.png resolution, which is unrelated to how big anything
// actually renders on screen. That mobile container is the 480px app-shell
// max-width (ThatFridgeApp.tsx) minus the "Your crew" section's 20px side padding
// (HomeScreen.tsx) = 440px. Expressed as a % of that instead of a fixed px value, the
// sprite stays the same size RELATIVE TO THE ROOM at any container width - mobile's
// ~440px card or desktop's ~600px one - instead of looking proportionally smaller on
// wider desktop layouts the way a fixed px size would.
const SPRITE_WIDTH_PCT = (56 / 440) * 100;

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

// A tiny 5-pip meter over each crew member's head, one pip per 20 score points, filled in
// that agent's own color - a game-HUD-style "how's this one doing" readout you get without
// having to tap through to their card. All 5 dim when there's no score yet, same as the dash
// AgentScoreCard shows for null.
const SCORE_METER_PIPS = 5;
const SCORE_METER_STEP = 100 / SCORE_METER_PIPS;

// Exported so other screens can show the same "this agent's score" pip meter this file puts
// over each walking crew member's head - one visual language wherever an agent's score needs
// a quick readout, not a different one per screen. `float`, on by default, floats the meter
// bottom-anchored above a `position:relative` parent (a crew member's head); pass `float=false`
// to render it as a plain inline chip instead, e.g. next to a score number in running text.
export function ScoreMeter({ score, color, float = true }: { score: number | null; color: string; float?: boolean }) {
  const filled = score === null ? 0 : Math.max(0, Math.min(SCORE_METER_PIPS, Math.round(score / SCORE_METER_STEP)));
  return (
    <div
      style={{
        ...(float
          ? { position: "absolute", bottom: "100%", marginBottom: 4, left: "50%", transform: "translateX(-50%)" }
          : {}),
        display: "flex",
        gap: 2.5,
        padding: "5px 6px",
        borderRadius: 4,
        background: "rgba(0,0,0,0.7)",
        border: "1px solid rgba(255,255,255,0.18)",
        boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
        zIndex: 1,
        flexShrink: 0,
      }}
    >
      {Array.from({ length: SCORE_METER_PIPS }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 6,
            height: 16,
            borderRadius: 1.5,
            background: i < filled ? color : "rgba(255,255,255,0.2)",
            boxShadow: i < filled ? `0 0 4px ${color}` : "none",
          }}
        />
      ))}
    </div>
  );
}

function TypingDots() {
  return (
    <div style={{ display: "flex", gap: 3, justifyContent: "center", padding: "3px 0" }}>
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: theme.text.faint, animation: "bounce 1.1s ease-in-out infinite" }} />
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: theme.text.faint, animation: "bounce 1.1s ease-in-out infinite .15s" }} />
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: theme.text.faint, animation: "bounce 1.1s ease-in-out infinite .3s" }} />
    </div>
  );
}

function CrewCharacter({
  zone,
  count,
  score,
  onOpenNotifications,
}: {
  zone: (typeof ZONES)[number];
  count: number;
  score: number | null;
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
        <ScoreMeter score={score} color={zone.color} />
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
            marginBottom: 40,
            left: "50%",
            transform: "translateX(-50%)",
            background: theme.bg.surface,
            border: `1.5px solid ${zone.color}`,
            borderRadius: theme.radius.sm,
            padding: "4px 8px",
            fontSize: 9,
            fontWeight: isShowingAlert ? 800 : 600,
            color: isShowingAlert ? zone.color : theme.text.primary,
            whiteSpace: "normal",
            textAlign: "center",
            width: 100,
            lineHeight: 1.25,
            zIndex: 2,
            cursor: isShowingAlert ? "pointer" : "default",
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
              background: theme.bg.surface,
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
  const pendingByKind: Record<CountedNotificationKind, number> = { expiring: 0, lowStock: 0, recipe: 0 };
  for (const event of state.notificationEvents) {
    if (event.done) continue;
    if (state.kitchenScope === "active" && event.fridgeId !== activeFridgeId) continue;
    if (event.kind === "expiring" || event.kind === "lowStock" || event.kind === "recipe") {
      pendingByKind[event.kind] += 1;
    }
  }

  // Same Kitchen Score results AgentScoreCard reads, just keyed by CrewId instead of
  // KitchenScoreResult["key"] to match ZONES above.
  const scoreByZone: Record<CrewId, number | null> = {
    chef: computeFoodBalanceScore(state).score,
    guardian: computeWasteSaverScore(state).score,
    organizer: computeOrganizerScore(state).score,
    shopkeeper: computeShopkeeperScore(state).score,
  };

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1180 / 842" }}>
      <Image src="/images/thatfridge/pixel-art-source.png" alt="Your crew's spaces" fill sizes="480px" style={{ objectFit: "contain", imageRendering: "pixelated" }} />

      {ZONES.map((zone) => {
        const count = zone.notifKind ? pendingByKind[zone.notifKind] : 0;
        return (
          <div key={zone.id} onClick={() => zone.onClick(actions)}>
            <CrewCharacter zone={zone} count={count} score={scoreByZone[zone.id]} onOpenNotifications={actions.openNotificationHistory} />
          </div>
        );
      })}
    </div>
  );
}
