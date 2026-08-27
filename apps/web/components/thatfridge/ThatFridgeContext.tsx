"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useThatFridge } from "@/lib/thatfridge/useThatFridge";

type ThatFridgeContextValue = ReturnType<typeof useThatFridge>;

const ThatFridgeContext = createContext<ThatFridgeContextValue | null>(null);

export function ThatFridgeProvider({ children }: { children: ReactNode }) {
  const value = useThatFridge();
  return <ThatFridgeContext.Provider value={value}>{children}</ThatFridgeContext.Provider>;
}

export function useThatFridgeCtx(): ThatFridgeContextValue {
  const ctx = useContext(ThatFridgeContext);
  if (!ctx) throw new Error("useThatFridgeCtx must be used within ThatFridgeProvider");
  return ctx;
}
