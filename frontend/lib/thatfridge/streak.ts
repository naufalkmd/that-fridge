import type { ScoreSnapshot } from "./types";

// Streaks are computed from state.scoreSnapshots (backend/API.md's "Score snapshots"), written
// weekly by app:snapshot-kitchen-scores independent of whether the user opened the app - so a
// week with no row genuinely means "nothing to show," and correctly breaks the streak rather
// than being bridged over. Only the Waste Saver score gets a streak at launch, per design: a
// second one for Food Balance would dilute the "one thing to protect" feeling.
export const WASTE_STREAK_THRESHOLD = 70; // tune after seeing real score distributions

/**
 * Walks snapshots from most recent week backward, counting consecutive weeks at/above the
 * threshold. Stops at the first miss - a week below threshold breaks the streak outright,
 * exactly the "loss aversion" mechanic this is meant to create.
 */
export function computeStreak(snapshots: ScoreSnapshot[], threshold: number = WASTE_STREAK_THRESHOLD): number {
  const sorted = [...snapshots].sort((a, b) => (a.weekOf < b.weekOf ? 1 : a.weekOf > b.weekOf ? -1 : 0));
  let streak = 0;
  for (const snap of sorted) {
    if (snap.wasteScore < threshold) break;
    streak++;
  }
  return streak;
}
