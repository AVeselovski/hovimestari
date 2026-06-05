import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LayoutList,
  ListChecks,
  RotateCcw,
  ShoppingCart,
} from "lucide-react";
import type { AisleCategory, State } from "@hovi/shared";
import {
  buildShoppingList,
  buildShoppingListByRecipe,
  type RecipeShoppingSection,
  type ShoppingItem,
} from "../lib/shoppingList.js";
import { SKAUPAT_TAB_NAME, skaupatSearchUrl } from "../lib/skaupat.js";
import { capitalize } from "../lib/format.js";

type ViewMode = "aisle" | "recipe";
type ShopMode = "online" | "store";

const VIEW_MODE_KEY = "hovi:listViewMode";
const SHOP_MODE_KEY = "hovi:shopMode";
const SKAUPAT_FRONT_URL = "https://www.s-kaupat.fi/";

function loadViewMode(): ViewMode {
  if (typeof window === "undefined") return "aisle";
  const v = window.localStorage.getItem(VIEW_MODE_KEY);
  return v === "recipe" ? "recipe" : "aisle";
}

function loadShopMode(): ShopMode {
  if (typeof window === "undefined") return "online";
  const v = window.localStorage.getItem(SHOP_MODE_KEY);
  return v === "store" ? "store" : "online";
}

function itemKey(category: AisleCategory, name: string): string {
  return `${category}::${name}`;
}

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
  const aisleList = useMemo(() => buildShoppingList(state), [state]);
  const recipeSections = useMemo(
    () => buildShoppingListByRecipe(state),
    [state],
  );
  const totalItems = aisleList.reduce((sum, g) => sum + g.items.length, 0);

  const [viewMode, setViewMode] = useState<ViewMode>(() => loadViewMode());
  const [shopMode, setShopMode] = useState<ShopMode>(() => loadShopMode());
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
    }
  }, [viewMode]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SHOP_MODE_KEY, shopMode);
    }
  }, [shopMode]);

  const shopMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!shopMenuOpen) return;
    const handler = (e: MouseEvent): void => {
      if (
        shopMenuRef.current &&
        !shopMenuRef.current.contains(e.target as Node)
      ) {
        setShopMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [shopMenuOpen]);

  const selectedRecipes = state.plan.selectedRecipes
    .map((pr) => state.recipes.find((r) => r.id === pr.recipeId))
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  const copyList = async (): Promise<void> => {
    const txt =
      viewMode === "aisle"
        ? aisleList
            .map(
              (g) =>
                `${g.label.toUpperCase()}\n${g.items
                  .map((it) =>
                    it.display
                      ? `  ☐ ${capitalize(it.name)} — ${it.display}`
                      : `  ☐ ${capitalize(it.name)}`,
                  )
                  .join("\n")}`,
            )
            .join("\n\n")
        : recipeSections
            .map((sec) => {
              const heading = sec.name.toUpperCase();
              const urlLine = sec.shoppingListUrl
                ? `\n${sec.shoppingListUrl}`
                : "";
              const rows = sec.items
                .map((it) =>
                  it.display
                    ? `  ☐ ${capitalize(it.name)} — ${it.display}`
                    : `  ☐ ${capitalize(it.name)}`,
                )
                .join("\n");
              return `${heading}${urlLine}\n${rows}`;
            })
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

  const bulkCheck = (items: ShoppingItem[]): void => {
    for (const it of items) {
      const key = itemKey(it.category, it.name);
      if (!checked[key]) toggleChecked(key);
    }
  };

  const choseShopMode = (next: ShopMode): void => {
    setShopMode(next);
    setShopMenuOpen(false);
    if (next === "online") {
      // Omit "noopener" so the named target actually reuses the existing
      // hovimestari-skaupat tab (same reasoning as ShoppingRow below).
      window.open(SKAUPAT_FRONT_URL, SKAUPAT_TAB_NAME);
    }
  };

  const recipeViewEmpty = recipeSections.length === 0;
  const showEmpty = totalItems === 0 && recipeViewEmpty;

  if (showEmpty) {
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

  const shopModeLabel = shopMode === "online" ? "Verkossa" : "Kaupassa";

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
        <div className="flex items-center gap-2">
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
          <div className="relative" ref={shopMenuRef}>
            <button
              onClick={() => setShopMenuOpen((v) => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border"
              style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
              aria-haspopup="menu"
              aria-expanded={shopMenuOpen}
            >
              <ExternalLink size={14} /> {shopModeLabel}
              <ChevronDown size={12} />
            </button>
            {shopMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 mt-1 rounded-lg border z-10 min-w-[10rem]"
                style={{
                  background: "var(--paper)",
                  borderColor: "var(--rule)",
                }}
              >
                <ShopModeOption
                  label="Verkossa"
                  active={shopMode === "online"}
                  onClick={() => choseShopMode("online")}
                />
                <ShopModeOption
                  label="Kaupassa"
                  active={shopMode === "store"}
                  onClick={() => choseShopMode("store")}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex rounded-full border p-0.5 text-xs"
        style={{ borderColor: "var(--rule)" }}
        role="tablist"
      >
        <SegmentedButton
          active={viewMode === "aisle"}
          onClick={() => setViewMode("aisle")}
          icon={<LayoutList size={12} />}
          label="Per ostosryhmä"
        />
        <SegmentedButton
          active={viewMode === "recipe"}
          onClick={() => setViewMode("recipe")}
          icon={<ListChecks size={12} />}
          label="Per resepti"
        />
      </div>

      {viewMode === "aisle"
        ? aisleList.map((group) => (
            <section key={group.id}>
              <p
                className="text-[10px] uppercase tracking-[0.2em] pb-2 border-b"
                style={{ color: "var(--berry)", borderColor: "var(--rule)" }}
              >
                {group.label}
              </p>
              <ul className="mt-1 font-mono">
                {group.items.map((it) => (
                  <ShoppingRow
                    key={itemKey(it.category, it.name)}
                    item={it}
                    checked={Boolean(checked[itemKey(it.category, it.name)])}
                    onToggle={() =>
                      toggleChecked(itemKey(it.category, it.name))
                    }
                    shopMode={shopMode}
                  />
                ))}
              </ul>
            </section>
          ))
        : recipeSections.map((sec) => (
            <RecipeSectionView
              key={`${sec.kind}:${sec.id}`}
              section={sec}
              checked={checked}
              onToggleItem={(it) =>
                toggleChecked(itemKey(it.category, it.name))
              }
              onBulkCheck={() => bulkCheck(sec.items)}
              shopMode={shopMode}
            />
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

function SegmentedButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: JSX.Element;
  label: string;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      role="tab"
      aria-selected={active}
      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-full transition"
      style={{
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--paper)" : "var(--ink)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function ShopModeOption({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      role="menuitemradio"
      aria-checked={active}
      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-left"
      style={{ color: "var(--ink)" }}
    >
      <span>{label}</span>
      {active && <Check size={12} />}
    </button>
  );
}

function ShoppingRow({
  item,
  checked,
  onToggle,
  shopMode,
}: {
  item: ShoppingItem;
  checked: boolean;
  onToggle: () => void;
  shopMode: ShopMode;
}): JSX.Element {
  const inner = (
    <>
      <span
        className="w-4 h-4 rounded-sm border flex items-center justify-center shrink-0"
        style={{
          borderColor: "var(--ink)",
          background: checked ? "var(--ink)" : "transparent",
        }}
      >
        {checked && <Check size={11} style={{ color: "var(--paper)" }} />}
      </span>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm leading-tight ${checked ? "line-through opacity-50" : ""}`}
        >
          {capitalize(item.name)}
        </p>
      </div>
      <p className="text-xs tabular-nums" style={{ color: "var(--muted)" }}>
        {item.display}
      </p>
    </>
  );
  return (
    <li className="border-b" style={{ borderColor: "var(--rule)" }}>
      {shopMode === "online" ? (
        // No rel="noopener" here on purpose: per the HTML spec, named-target
        // lookup skips noopener-opened browsing contexts, so each click would
        // spawn a fresh tab in Chrome. Modern browsers still apply implicit
        // noopener to cross-origin target navigations, so security is intact.
        <a
          href={skaupatSearchUrl(item.name)}
          target={SKAUPAT_TAB_NAME}
          onClick={onToggle}
          className="flex items-center gap-3 py-2.5 no-underline w-full"
          style={{ color: "var(--ink)" }}
        >
          {inner}
        </a>
      ) : (
        <button
          onClick={onToggle}
          className="flex items-center gap-3 py-2.5 w-full text-left"
          style={{ color: "var(--ink)" }}
        >
          {inner}
        </button>
      )}
    </li>
  );
}

function RecipeSectionView({
  section,
  checked,
  onToggleItem,
  onBulkCheck,
  shopMode,
}: {
  section: RecipeShoppingSection;
  checked: Record<string, boolean>;
  onToggleItem: (it: ShoppingItem) => void;
  onBulkCheck: () => void;
  shopMode: ShopMode;
}): JSX.Element {
  const hasUrl = Boolean(section.shoppingListUrl);
  const headerClass =
    "flex items-center justify-between gap-2 pb-2 border-b w-full text-left no-underline";
  const headerStyle = {
    color: "var(--berry)",
    borderColor: "var(--rule)",
  } as const;
  const headerInner = (
    <>
      <span className="text-[10px] uppercase tracking-[0.2em]">
        {section.name}
      </span>
      {hasUrl && shopMode === "online" && <ExternalLink size={12} />}
    </>
  );

  return (
    <section>
      {hasUrl && shopMode === "online" ? (
        <a
          href={section.shoppingListUrl}
          target={SKAUPAT_TAB_NAME}
          onClick={onBulkCheck}
          className={headerClass}
          style={headerStyle}
        >
          {headerInner}
        </a>
      ) : (
        <button onClick={onBulkCheck} className={headerClass} style={headerStyle}>
          {headerInner}
        </button>
      )}
      <ul className="mt-1 font-mono">
        {section.items.map((it) => (
          <ShoppingRow
            key={itemKey(it.category, it.name)}
            item={it}
            checked={Boolean(checked[itemKey(it.category, it.name)])}
            onToggle={() => onToggleItem(it)}
            shopMode={shopMode}
          />
        ))}
      </ul>
    </section>
  );
}
