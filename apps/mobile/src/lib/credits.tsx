import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { CreditLedgerEntry } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface CreditsContextValue {
  /** null until first loaded. */
  balance: number | null;
  ledger: CreditLedgerEntry[];
  /** Set directly from an AI response that reported the post-charge balance. */
  setBalance: (n: number) => void;
  /** Re-fetch from the server (after a pack purchase, or when the screen opens). */
  refresh: () => Promise<void>;
}

const CreditsContext = createContext<CreditsContextValue | null>(null);

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const { user, status } = useAuth();
  // Seed from the user payload (login / me both carry `credits`) so the number is there
  // with no flash; refresh() then reconciles with the server.
  const [balance, setBalance] = useState<number | null>(
    typeof user?.credits === "number" ? user.credits : null,
  );
  const [ledger, setLedger] = useState<CreditLedgerEntry[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await api.getCredits();
      setBalance(res.balance);
      setLedger(res.ledger);
    } catch {
      // leave whatever we had
    }
  }, []);

  // Pull a fresh balance on sign-in; drop it on sign-out.
  useEffect(() => {
    if (status === "signedIn") void refresh();
    else if (status === "signedOut") {
      setBalance(null);
      setLedger([]);
    }
  }, [status, refresh]);

  const value = useMemo(
    () => ({ balance, ledger, setBalance, refresh }),
    [balance, ledger, refresh],
  );

  return <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>;
}

export function useCredits(): CreditsContextValue {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used within <CreditsProvider>");
  return ctx;
}
