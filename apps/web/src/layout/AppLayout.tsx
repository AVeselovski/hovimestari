import { useCallback, useEffect, useMemo, useState } from "react";
import { Outlet, ScrollRestoration } from "react-router-dom";
import { Coffee } from "lucide-react";
import { useStateStore } from "../lib/useStateStore.js";
import { StateStoreContext } from "../lib/stateContext.js";
import { buildShoppingList } from "../lib/shoppingList.js";
import { BottomTabs } from "./BottomTabs.js";

export function AppLayout(): JSX.Element {
  const store = useStateStore();
  const { state, status, dismissConflict } = store;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggleChecked = useCallback(
    (key: string) => setChecked((c) => ({ ...c, [key]: !c[key] })),
    [],
  );
  const clearChecked = useCallback(() => setChecked({}), []);

  const ctxValue = useMemo(
    () => ({ ...store, checked, toggleChecked, clearChecked }),
    [store, checked, toggleChecked, clearChecked],
  );

  useEffect(() => {
    if (status !== "conflict") return;
    const id = setTimeout(dismissConflict, 5000);
    return () => clearTimeout(id);
  }, [status, dismissConflict]);

  const totalItems = state
    ? buildShoppingList(state).reduce((s, g) => s + g.items.length, 0)
    : 0;

  return (
    <StateStoreContext.Provider value={ctxValue}>
      <div className="min-h-screen w-full font-body bg-paper text-ink">
        <div className="fixed top-0 inset-x-0 z-40 flex flex-col">
          {status === "conflict" && (
            <div
              className="px-5 py-2 text-center text-xs"
              style={{ background: "var(--berry)", color: "var(--paper)" }}
            >
              Tila päivitetty palvelimelta.
            </div>
          )}
          {state !== null && status === "saving" && (
            <div
              className="px-5 py-2 text-center text-xs"
              style={{ background: "var(--muted)", color: "var(--paper)" }}
            >
              Tallennetaan…
            </div>
          )}
          {state !== null && status === "error" && (
            <div
              className="px-5 py-2 text-center text-xs"
              style={{ background: "var(--berry)", color: "var(--paper)" }}
            >
              Tallennus epäonnistui — yritetään uudelleen.
            </div>
          )}
        </div>

        <header className="px-5 pt-7 pb-4">
          <div className="flex items-baseline justify-between">
            <div>
              <h1
                className="font-display text-3xl leading-none tracking-tight"
                style={{ color: "var(--ink)" }}
              >
                Kauppalista<span style={{ color: "var(--berry)" }}>.</span>
              </h1>
              <p
                className="text-xs tracking-widest uppercase mt-1.5"
                style={{ color: "var(--muted)", letterSpacing: "0.15em" }}
              >
                Torstain toimitus · S-Kaupat
              </p>
            </div>
            <Coffee size={22} style={{ color: "var(--ink)" }} strokeWidth={1.5} />
          </div>
          <div
            className="mt-4 h-px"
            style={{
              background:
                "repeating-linear-gradient(to right, var(--rule) 0 4px, transparent 4px 8px)",
            }}
          />
        </header>

        <main className="px-5 pb-32">
          {state === null ? (
            <p className="mt-8 text-sm" style={{ color: "var(--muted)" }}>
              {status === "error" ? "Virhe ladattaessa tilaa." : "Ladataan…"}
            </p>
          ) : (
            <Outlet />
          )}
        </main>

        <BottomTabs listBadge={totalItems} />
        <ScrollRestoration />
      </div>
    </StateStoreContext.Provider>
  );
}
