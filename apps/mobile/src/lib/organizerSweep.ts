import { ApiError, type StorageLocation } from "@thatfridge/core";

/**
 * The Organizer's "is everything stored in the right place?" sweep, shared by the Organizer screen and
 * the Crew tab. Each item is checked with one AI call (`/items/suggest-details`) that costs 1 credit and is
 * throttled to 20 a minute, so a sweep is a bounded batch the user agrees to first, and it stops the moment the
 * server says no rather than guessing: unchecked items are never counted as "correct".
 */

/** Items per sweep. Under the 20/min throttle, leaving room for an Add-item autofill in the same minute. */
export const SWEEP_BATCH = 15;

/** Credits one item check costs - keep in step with CreditCost::AUTOFILL on the server. */
export const SWEEP_COST_PER_ITEM = 1;

/** How many checks run at once. */
const CONCURRENCY = 4;

export interface SweepItem {
  id: string;
  name: string;
  icon: string;
  location?: StorageLocation | null;
}

export interface SweepMove {
  id: string;
  name: string;
  icon: string;
  from: StorageLocation;
  to: StorageLocation;
}

export interface SweepResult {
  moves: SweepMove[];
  /** Items the server actually answered for. Only these count towards the tidiness tally. */
  checked: number;
  /** Items in the batch that got no answer (error, throttle, out of credits). */
  unchecked: number;
  /** Why the sweep ended early, if it did. */
  stopped: "credits" | "throttled" | null;
  /** Ids of the items that were checked, so the next sweep can carry on with the rest. */
  checkedIds: string[];
}

/** The next batch: items not yet checked this session, up to SWEEP_BATCH. When everything has been checked
 *  it starts over from the top, so "Check again" always does something. */
export function nextBatch<T extends { id: string }>(items: T[], alreadyChecked: ReadonlySet<string>, size = SWEEP_BATCH): T[] {
  const fresh = items.filter((i) => !alreadyChecked.has(i.id));
  return (fresh.length > 0 ? fresh : items).slice(0, size);
}

type Suggest = (name: string, icon: string) => Promise<{ location: StorageLocation }>;

/** Check a batch. Stops handing out new checks after a 402 (credits) or 429 (throttle). */
export async function runSweep(batch: SweepItem[], suggest: Suggest): Promise<SweepResult> {
  const moves: SweepMove[] = [];
  const checkedIds: string[] = [];
  let stopped: SweepResult["stopped"] = null;
  let cursor = 0;

  async function worker() {
    while (stopped === null && cursor < batch.length) {
      const item = batch[cursor++];
      try {
        const answer = await suggest(item.name, item.icon);
        checkedIds.push(item.id);
        const from = item.location ?? "fridge";
        if (answer.location && answer.location !== from) moves.push({ id: item.id, name: item.name, icon: item.icon, from, to: answer.location });
      } catch (e) {
        if (e instanceof ApiError && e.status === 402) stopped = "credits";
        else if (e instanceof ApiError && e.status === 429) stopped = "throttled";
        // any other failure just leaves that one item unchecked
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));
  return { moves, checked: checkedIds.length, unchecked: batch.length - checkedIds.length, stopped, checkedIds };
}
