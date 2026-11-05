"use client";

import { createContext, useContext, type ReactNode } from "react";

const HideCancelledContext = createContext(true);

export function HideCancelledProvider({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  return <HideCancelledContext.Provider value={hidden}>{children}</HideCancelledContext.Provider>;
}

export function useHideCancelled(): boolean {
  return useContext(HideCancelledContext);
}
