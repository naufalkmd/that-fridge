import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { OrganizerTally, ScoreSnapshot, UsageHistoryEntry } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// Backs the Home "Your Kitchen This Week" gauge. All three feeds are read-only on mobile —
// usage history is written when items are used up (not yet wired here), the organizer tally
// from Organizer sweeps (no mobile Organizer yet), and snapshots by a weekly backend cron.
interface KitchenScoreContextValue {
  usageHistory: UsageHistoryEntry[];
  organizerTally: OrganizerTally | null;
  scoreSnapshots: ScoreSnapshot[];
  refresh: () => Promise<void>;
}

const KitchenScoreContext = createContext<KitchenScoreContextValue | null>(null);

export function KitchenScoreProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [usageHistory, setUsageHistory] = useState<UsageHistoryEntry[]>([]);
  const [organizerTally, setOrganizerTally] = useState<OrganizerTally | null>(null);
  const [scoreSnapshots, setScoreSnapshots] = useState<ScoreSnapshot[]>([]);

  const refresh = useCallback(async () => {
    const [u, t, s] = await Promise.allSettled([
      api.getUsageHistory(),
      api.getOrganizerTally(),
      api.getScoreSnapshots(),
    ]);
    if (u.status === "fulfilled") setUsageHistory(u.value);
    if (t.status === "fulfilled") setOrganizerTally(t.value);
    if (s.status === "fulfilled") setScoreSnapshots(s.value);
  }, []);

  useEffect(() => {
    if (status === "signedIn") {
      refresh();
    } else if (status === "signedOut") {
      setUsageHistory([]);
      setOrganizerTally(null);
      setScoreSnapshots([]);
    }
  }, [status, refresh]);

  const value = useMemo(
    () => ({ usageHistory, organizerTally, scoreSnapshots, refresh }),
    [usageHistory, organizerTally, scoreSnapshots, refresh],
  );

  return <KitchenScoreContext.Provider value={value}>{children}</KitchenScoreContext.Provider>;
}

export function useKitchenScore(): KitchenScoreContextValue {
  const ctx = useContext(KitchenScoreContext);
  if (!ctx) throw new Error("useKitchenScore must be used within <KitchenScoreProvider>");
  return ctx;
}
