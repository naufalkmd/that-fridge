import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as AppleAuthentication from "expo-apple-authentication";
import type { CurrentUser, ProfileFields } from "@thatfridge/core";

import { api, secureTokenStore } from "@/lib/api";
import { unregisterPush } from "@/lib/push";
import { track } from "@/lib/analytics";
import { hydrateOnboarding } from "@/lib/hydrateOnboarding";
import { googleSignInIdToken, googleSignOut } from "@/lib/google-auth";

// Fired once after any successful auth: replays a pre-sign-in onboarding draft to the
// server (a no-op when there's none) and beacons the funnel event. Fire-and-forget.
function afterAuth(event: string, props?: Record<string, unknown>) {
  track(event, props);
  void hydrateOnboarding();
}

type Status = "loading" | "signedOut" | "signedIn";

interface AuthContextValue {
  status: Status;
  user: CurrentUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    name: string,
    username: string,
    email: string,
    password: string,
    dataTransferConsent: boolean,
  ) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (fields: ProfileFields) => Promise<void>;
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
    afterAuth("login_completed", { method: "email" });
  }, []);

  const signUp = useCallback(
    async (
      name: string,
      username: string,
      email: string,
      password: string,
      dataTransferConsent: boolean,
    ) => {
      const { user } = await api.register(
        name,
        username,
        email,
        password,
        dataTransferConsent,
      );
      setUser(user);
      setStatus("signedIn");
      afterAuth("signup_completed", { from: "direct", method: "email" });
    },
    [],
  );

  const resetPassword = useCallback(
    async (email: string, code: string, password: string) => {
      const { user } = await api.resetPassword(email.trim(), code.trim(), password);
      setUser(user);
      setStatus("signedIn");
      afterAuth("login_completed", { method: "password_reset" });
    },
    [],
  );

  const signInWithApple = useCallback(async () => {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!cred.identityToken) throw new Error("Apple didn't return an identity token.");
    // Apple only sends the name on the very first authorization, ever.
    const name = cred.fullName
      ? [cred.fullName.givenName, cred.fullName.familyName].filter(Boolean).join(" ")
      : undefined;
    const { user } = await api.loginWithApple(cred.identityToken, name || undefined);
    setUser(user);
    setStatus("signedIn");
    afterAuth("auth_completed", { from: "direct", method: "apple" });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const idToken = await googleSignInIdToken();
    if (!idToken) return; // cancelled
    const { user } = await api.loginWithGoogle(idToken);
    setUser(user);
    setStatus("signedIn");
    afterAuth("auth_completed", { from: "direct", method: "google" });
  }, []);

  const signOut = useCallback(async () => {
    // Every cleanup step is best-effort — a failing one (offline, no push module) must
    // never strand the session as "signedIn", or the next account's providers won't
    // reload and it inherits the previous user's fridge/notes/recipes.
    await unregisterPush().catch(() => {});
    await googleSignOut().catch(() => {});
    await api.logout().catch(() => {});
    setUser(null);
    setStatus("signedOut");
  }, []);

  const updateProfile = useCallback(async (fields: ProfileFields) => {
    setUser(await api.updateProfile(fields));
  }, []);

  const deleteAccount = useCallback(async () => {
    await unregisterPush().catch(() => {});
    await api.deleteAccount(); // must succeed — the account is really being deleted
    setUser(null);
    setStatus("signedOut");
  }, []);

  const value = useMemo(
    () => ({
      status,
      user,
      signIn,
      signUp,
      resetPassword,
      signInWithApple,
      signInWithGoogle,
      signOut,
      deleteAccount,
      updateProfile,
    }),
    [
      status,
      user,
      signIn,
      signUp,
      resetPassword,
      signInWithApple,
      signInWithGoogle,
      signOut,
      deleteAccount,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
