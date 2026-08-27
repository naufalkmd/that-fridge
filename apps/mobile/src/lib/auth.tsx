import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CurrentUser } from "@thatfridge/core";

import { api, secureTokenStore } from "@/lib/api";

type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  user: CurrentUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, username: string, email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);

  // Restore a session from the stored token so a relaunch doesn't bounce to sign-in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await secureTokenStore.get();
      if (!token) {
        if (!cancelled) setStatus("signedOut");
        return;
      }
      try {
        const me = await api.me();
        if (cancelled) return;
        setUser(me);
        setStatus("signedIn");
      } catch {
        await secureTokenStore.clear();
        if (!cancelled) setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { user } = await api.login(email, password);
    setUser(user);
    setStatus("signedIn");
  }, []);

  const signUp = useCallback(
    async (name: string, username: string, email: string, password: string) => {
      const { user } = await api.register(name, username, email, password);
      setUser(user);
      setStatus("signedIn");
    },
    [],
  );

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.deleteAccount();
    setUser(null);
    setStatus("signedOut");
  }, []);

  const value = useMemo(
    () => ({ status, user, signIn, signUp, signOut, deleteAccount }),
    [status, user, signIn, signUp, signOut, deleteAccount],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
