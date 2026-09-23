import { useCallback, useRef, useState } from "react";
import { describeError, type UpdateItemInput } from "@thatfridge/core";

import { useInventory } from "@/lib/inventory";
import type { FieldSaveStatus } from "./expandable-row";

/**
 * Wraps patchItem once instead of every row hand-rolling its own try/catch. No 402/out-of-
 * credits handling here - PATCH /items/{id} is a plain field update, never AI-credit-metered
 * (only the Calories row's Estimate/Scan actions hit credit-gated endpoints, and they handle
 * that themselves) - so the only failures this ever sees are network/validation errors.
 */
export function useFieldSave(itemId: string) {
  const { patchItem } = useInventory();
  const [status, setStatus] = useState<FieldSaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const lastPayload = useRef<UpdateItemInput | null>(null);

  const save = useCallback(
    async (data: UpdateItemInput, opts?: { then?: () => void }): Promise<boolean> => {
      lastPayload.current = data;
      setStatus("saving");
      setError(null);
      try {
        await patchItem(itemId, data);
        setStatus("idle");
        opts?.then?.();
        return true;
      } catch (e) {
        setStatus("error");
        setError(describeError(e, "Couldn't save that."));
        return false;
      }
    },
    [itemId, patchItem],
  );

  const retry = useCallback(() => {
    if (lastPayload.current) void save(lastPayload.current);
  }, [save]);

  return { status, error, save, retry };
}
