import { useMemo, useState } from "react";
import { Check, Copy, RotateCcw, ShoppingCart } from "lucide-react";
import type { State } from "@hovi/shared";
import { buildShoppingList } from "../lib/shoppingList.js";
import { SKAUPAT_TAB_NAME, skaupatSearchUrl } from "../lib/skaupat.js";

export function ListTab({
  state,
  mutate,
  checked,
  toggleChecked,
  clearChecked,
  goPlan,
}: {
  state: State;
  mutate: (updater: (s: State) => State) => void;
  checked: Record<string, boolean>;
  toggleChecked: (key: string) => void;
  clearChecked: () => void;
  goPlan: () => void;
}): JSX.Element {
  const list = useMemo(() => buildShoppingList(state), [state]);
  const totalItems = list.reduce((sum, g) => sum + g.items.length, 0);

  const [copied, setCopied] = useState(false);

  const selectedRecipes = state.plan.selectedRecipes
    .map((pr) => state.recipes.find((r) => r.id === pr.recipeId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const copyList = async (): Promise<void> => {
    const txt = list
      .map(
        (g) =>
          `${g.label.toUpperCase()}\n${g.items
            .map((it) =>
              it.display ? `  ☐ ${it.name} — ${it.display}` : `  ☐ ${it.name}`,
            )
            .join("\n")}`,
      )
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore — clipboard may be unavailable
    }
  };

  const markCooked = (): void => {
    const now = new Date().toISOString();
    mutate((s) => {
      const ids = new Set(s.plan.selectedRecipes.map((pr) => pr.recipeId));
      return {
        ...s,
        recipes: s.recipes.map((r) =>
          ids.has(r.id) ? { ...r, lastUsed: now } : r,
        ),
        plan: { ...s.plan, selectedRecipes: [] },
      };
    });
    clearChecked();
    goPlan();
  };

  if (totalItems === 0) {
    return (
      <div className="text-center mt-16">
        <ShoppingCart
          size={48}
          strokeWidth={1}
          className="mx-auto"
          style={{ color: "var(--muted)" }}
        />
        <p className="font-display text-2xl mt-4">Lista on tyhjä</p>
        <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
          Valitse reseptejä tai vakioita.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 mt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-2xl leading-none">
            {totalItems} <span className="text-base opacity-50">tuotetta</span>
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--muted)" }}>
            {selectedRecipes.length} reseptiä
          </p>
        </div>
        <button
          onClick={() => void copyList()}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border"
          style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
        >
          {copied ? (
            <>
              <Check size={14} /> Kopioitu
            </>
          ) : (
            <>
              <Copy size={14} /> Kopioi
            </>
          )}
        </button>
      </div>

      {list.map((group) => (
        <section key={group.id}>
          <p
            className="text-[10px] uppercase tracking-[0.2em] pb-2 border-b"
            style={{ color: "var(--berry)", borderColor: "var(--rule)" }}
          >
            {group.label}
          </p>
          <ul className="mt-1 font-mono">
            {group.items.map((it) => {
              const key = `${group.id}::${it.name}`;
              const isChecked = checked[key];
              return (
                <li
                  key={key}
                  className="border-b"
                  style={{ borderColor: "var(--rule)" }}
                >
                  {/* No rel="noopener" here on purpose: per the HTML spec, named-target
                       lookup skips noopener-opened browsing contexts, so each click would
                       spawn a fresh tab in Chrome. Modern browsers still apply implicit
                       noopener to cross-origin target navigations, so security is intact. */}
                  <a
                    href={skaupatSearchUrl(it.name)}
                    target={SKAUPAT_TAB_NAME}
                    onClick={() => toggleChecked(key)}
                    className="flex items-center gap-3 py-2.5 no-underline"
                    style={{ color: "var(--ink)" }}
                  >
                    <span
                      className="w-4 h-4 rounded-sm border flex items-center justify-center shrink-0"
                      style={{
                        borderColor: "var(--ink)",
                        background: isChecked ? "var(--ink)" : "transparent",
                      }}
                    >
                      {isChecked && (
                        <Check size={11} style={{ color: "var(--paper)" }} />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm leading-tight ${isChecked ? "line-through opacity-50" : ""}`}
                      >
                        {it.name}
                      </p>
                    </div>
                    <p
                      className="text-xs tabular-nums"
                      style={{ color: "var(--muted)" }}
                    >
                      {it.display}
                    </p>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selectedRecipes.length > 0 && (
        <button
          onClick={markCooked}
          className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm border-2 border-dashed mt-6"
          style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
        >
          <RotateCcw size={16} />
          Viikko valmis — nollaa
        </button>
      )}
    </div>
  );
}
