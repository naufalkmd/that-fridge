import { ApiError, type UpdateItemInput } from "@thatfridge/core";

/**
 * Autofill for several items at once (Inventory → Select → Autofill). Each item is one call to
 * `/items/{id}/autofill`, which fills only what's missing and charges 1 credit only when it had
 * something to estimate; it is throttled to 20 a minute, so a run is capped and stops as soon as
 * the server says no (out of credits, or throttled) instead of hammering it.
 */

/** Items per run - under the 20/min throttle, leaving room for other autofills. */
export const AUTOFILL_BATCH = 15;

const CONCURRENCY = 3;

export interface BulkAutofillResult {
  /** Items that got new details and were saved. */
  filled: number;
  /** Items that had nothing missing. */
  unchanged: number;
  /** Items that errored (other than a stop). */
  failed: number;
  /** Items never tried because the run stopped. */
  skipped: number;
  stopped: "credits" | "throttled" | null;
}

export async function runBulkAutofill(
  ids: string[],
  autofill: (id: string) => Promise<{ fields: Partial<UpdateItemInput> }>,
  save: (id: string, fields: Partial<UpdateItemInput>) => Promise<void>,
  onProgress?: (done: number) => void,
): Promise<BulkAutofillResult> {
  const result: BulkAutofillResult = { filled: 0, unchanged: 0, failed: 0, skipped: 0, stopped: null };
  let cursor = 0;
  let done = 0;

  async function worker() {
    while (result.stopped === null && cursor < ids.length) {
      const id = ids[cursor++];
      try {
        const { fields } = await autofill(id);
        if (fields && Object.keys(fields).length > 0) {
          await save(id, fields);
          result.filled += 1;
        } else {
          result.unchanged += 1;
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 402) result.stopped = "credits";
        else if (e instanceof ApiError && e.status === 429) result.stopped = "throttled";
        else result.failed += 1;
      }
      onProgress?.(++done);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker));
  result.skipped = ids.length - result.filled - result.unchanged - result.failed - (result.stopped ? 1 : 0);
  return result;
}

/** One line for the toast after a run. */
export function describeBulkAutofill(r: BulkAutofillResult): string {
  const parts = [
    r.filled ? `Filled in ${r.filled} item${r.filled === 1 ? "" : "s"}` : null,
    r.unchanged ? `${r.unchanged} already complete` : null,
    r.failed ? `${r.failed} couldn't be filled` : null,
  ].filter(Boolean);
  const head = parts.join(" · ") || "Nothing to fill in";
  if (r.stopped === "credits") return `${head}. Out of credits, so ${r.skipped + 1} weren't tried.`;
  if (r.stopped === "throttled") return `${head}. Too many at once: give it a minute, then autofill the rest.`;
  return head;
}
