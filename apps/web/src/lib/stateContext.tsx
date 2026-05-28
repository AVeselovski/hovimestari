import { createContext, useContext } from "react";
import type { StateStore } from "./useStateStore.js";

export type CheckedStore = {
  checked: Record<string, boolean>;
  toggleChecked: (key: string) => void;
  clearChecked: () => void;
};

export type StoreContextValue = StateStore & CheckedStore;

export const StateStoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const ctx = useContext(StateStoreContext);
  if (!ctx) throw new Error("StateStoreContext is missing");
  return ctx;
}
