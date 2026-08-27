import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { MyInvite, MyJoinRequest } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useInventory } from "@/lib/inventory";

// Cross-fridge pending actions: invites sent TO me, and join requests FOR fridges I own.
// Shown on the Notifications screen and the find-a-friend screen.
interface SocialContextValue {
  myInvites: MyInvite[];
  myJoinRequests: MyJoinRequest[];
  pendingCount: number;
  refresh: () => Promise<void>;
  acceptInvite: (id: string) => Promise<void>;
  declineInvite: (id: string) => Promise<void>;
  approveRequest: (id: string) => Promise<void>;
  declineRequest: (id: string) => Promise<void>;
}

const SocialContext = createContext<SocialContextValue | null>(null);

export function SocialProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const { refresh: refreshInventory } = useInventory();
  const [myInvites, setMyInvites] = useState<MyInvite[]>([]);
  const [myJoinRequests, setMyJoinRequests] = useState<MyJoinRequest[]>([]);

  const refresh = useCallback(async () => {
    const [inv, req] = await Promise.allSettled([api.getMyInvites(), api.getMyJoinRequests()]);
    if (inv.status === "fulfilled") setMyInvites(inv.value);
    if (req.status === "fulfilled") setMyJoinRequests(req.value);
  }, []);

  useEffect(() => {
    if (status === "signedIn") refresh();
    else if (status === "signedOut") {
      setMyInvites([]);
      setMyJoinRequests([]);
    }
  }, [status, refresh]);

  const acceptInvite = useCallback(
    async (id: string) => {
      setMyInvites((p) => p.filter((i) => i.id !== id));
      await api.approveJoinRequest(id).catch(() => refresh());
      await refreshInventory();
    },
    [refresh, refreshInventory],
  );
  const declineInvite = useCallback(
    async (id: string) => {
      setMyInvites((p) => p.filter((i) => i.id !== id));
      await api.declineJoinRequest(id).catch(() => refresh());
    },
    [refresh],
  );
  const approveRequest = useCallback(
    async (id: string) => {
      setMyJoinRequests((p) => p.filter((r) => r.id !== id));
      await api.approveJoinRequest(id).catch(() => refresh());
      await refreshInventory();
    },
    [refresh, refreshInventory],
  );
  const declineRequest = useCallback(
    async (id: string) => {
      setMyJoinRequests((p) => p.filter((r) => r.id !== id));
      await api.declineJoinRequest(id).catch(() => refresh());
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      myInvites,
      myJoinRequests,
      pendingCount: myInvites.length + myJoinRequests.length,
      refresh,
      acceptInvite,
      declineInvite,
      approveRequest,
      declineRequest,
    }),
    [myInvites, myJoinRequests, refresh, acceptInvite, declineInvite, approveRequest, declineRequest],
  );

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial(): SocialContextValue {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial must be used within <SocialProvider>");
  return ctx;
}
