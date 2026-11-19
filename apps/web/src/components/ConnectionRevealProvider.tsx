"use client";

import type { Connection } from "@hovimestari/types";
import { createContext, useCallback, useContext, useMemo, useState, type ReactElement, type ReactNode } from "react";

// ---------------------------------------------------------------------------
// The reveal store: the one connection key made on this device and not yet
// confirmed copied. Settings' Connected AI section opens its key reveal
// whenever this holds a key, so the reveal outlives the section: a second
// Android back leaves Settings and unmounts the section, and the reveal opens
// again with the same key when Settings mounts again.
//
// It is React state only, inside the signed-in tree in `app/(app)/layout.tsx`,
// under the same user key as the query cache. Never `localStorage`,
// `sessionStorage`, a module global, the query cache or the mutation cache.
// So sign-out, a failed refresh and an expired session (the signed-in tree
// unmounts), another user signing in (the tree remounts under a new key), a
// reload and a killed app each drop the key with no cleanup code.
// "I have copied it" drops it too. A revoke cannot: the reveal is modal, so
// nothing on this screen can revoke while it shows, and a revoke on another
// device never reaches this one. The shown key then stops working, and the
// reveal still shows it until the person confirms.
// ---------------------------------------------------------------------------

/** A key just made, held until the person says they copied it. */
export interface ConnectionReveal {
  /** Its connection as the server answered it, which holds no key: its row once the key is copied. */
  connection: Connection;
  key: string;
}

export interface ConnectionRevealStore {
  /** The key waiting to be confirmed copied, or null. */
  reveal: ConnectionReveal | null;
  /** Holds a newly made key. It replaces any key still held. */
  show: (reveal: ConnectionReveal) => void;
  /** "I have copied it": the key is gone from the store. */
  confirm: () => void;
}

const ConnectionRevealContext = createContext<ConnectionRevealStore | null>(null);

export function ConnectionRevealProvider({ children }: { children: ReactNode }): ReactElement {
  const [reveal, setReveal] = useState<ConnectionReveal | null>(null);
  const show = useCallback((next: ConnectionReveal) => setReveal(next), []);
  const confirm = useCallback(() => setReveal(null), []);
  const store = useMemo(() => ({ reveal, show, confirm }), [reveal, show, confirm]);
  return <ConnectionRevealContext.Provider value={store}>{children}</ConnectionRevealContext.Provider>;
}

/** The reveal store. Only inside the signed-in tree, where the layout mounts the provider. */
export function useConnectionReveal(): ConnectionRevealStore {
  const store = useContext(ConnectionRevealContext);
  if (!store) throw new Error("useConnectionReveal needs ConnectionRevealProvider (app/(app)/layout.tsx)");
  return store;
}
