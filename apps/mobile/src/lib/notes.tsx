import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { FridgeNote, FridgeNoteColor } from "@thatfridge/core";

import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

interface NotesContextValue {
  notes: FridgeNote[];
  refresh: () => Promise<void>;
  add: (fridgeId: string, text: string, color: FridgeNoteColor) => Promise<void>;
  edit: (id: string, text: string, color: FridgeNoteColor) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const NotesContext = createContext<NotesContextValue | null>(null);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const [notes, setNotes] = useState<FridgeNote[]>([]);

  const refresh = useCallback(async () => {
    try {
      setNotes(await api.listFridgeNotes());
    } catch {
      /* keep last known */
    }
  }, []);

  useEffect(() => {
    if (status === "signedIn") refresh();
    else if (status === "signedOut") setNotes([]);
  }, [status, refresh]);

  const add = useCallback(async (fridgeId: string, text: string, color: FridgeNoteColor) => {
    const note = await api.createFridgeNote(fridgeId, { text: text.trim(), color });
    setNotes((prev) => [note, ...prev]);
  }, []);

  const edit = useCallback(async (id: string, text: string, color: FridgeNoteColor) => {
    const note = await api.updateFridgeNote(id, { text: text.trim(), color });
    setNotes((prev) => prev.map((n) => (n.id === id ? note : n)));
  }, []);

  const remove = useCallback(async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    await api.deleteFridgeNote(id).catch(() => refresh());
  }, [refresh]);

  const value = useMemo(
    () => ({ notes, refresh, add, edit, remove }),
    [notes, refresh, add, edit, remove],
  );

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within <NotesProvider>");
  return ctx;
}
