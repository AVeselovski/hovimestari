import { useState } from "react";
import { Check, Edit2, Trash2 } from "lucide-react";
import type { Staple } from "@hovi/shared";
import { CATEGORIES, catLabel } from "../lib/categories.js";
import { formatRecipeAmount } from "../lib/amount.js";
import { capitalize } from "../lib/format.js";
import { AmountInput } from "./AmountInput.js";

export function StapleRow({
  s,
  toggle,
  update,
  remove,
  suppress,
}: {
  s: Staple;
  toggle: (id: string) => void;
  update: (id: string, patch: Partial<Staple>) => void;
  remove: (id: string) => void;
  suppress?: boolean;
}): JSX.Element {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div
        className="rounded-xl p-3 border space-y-2"
        style={{ background: "var(--paper-2)", borderColor: "var(--ink)" }}
      >
        <input
          className="w-full px-3 py-2 rounded-lg border bg-transparent text-sm"
          style={{ borderColor: "var(--rule)" }}
          value={s.name}
          onChange={(e) => update(s.id, { name: e.target.value })}
          placeholder="Nimi"
        />
        <div className="grid grid-cols-3 gap-2">
          <AmountInput
            value={s.amount}
            onChange={(next) => update(s.id, { amount: next })}
          />
          <input
            className="px-3 py-2 rounded-lg border bg-transparent text-sm"
            style={{ borderColor: "var(--rule)" }}
            value={s.unit}
            onChange={(e) => update(s.id, { unit: e.target.value })}
            placeholder="Yksikkö"
          />
          <select
            className="px-2 py-2 rounded-lg border bg-transparent text-xs"
            style={{ borderColor: "var(--rule)" }}
            value={s.category}
            onChange={(e) =>
              update(s.id, { category: e.target.value as Staple["category"] })
            }
          >
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setEditing(false)}
            className="flex-1 py-2 rounded-lg text-sm"
            style={{ background: "var(--ink)", color: "var(--paper)" }}
          >
            Valmis
          </button>
          <button
            onClick={() => {
              if (window.confirm("Poista?")) remove(s.id);
            }}
            className="px-3 py-2 rounded-lg"
            style={{ color: "var(--berry)" }}
            aria-label="Poista vakio"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    );
  }

  const amountText = s.amount === null ? "" : formatRecipeAmount(s.amount);

  return (
    <div
      className="rounded-xl p-3 border flex items-center gap-3"
      style={{
        background: s.enabled ? "var(--paper-2)" : "transparent",
        borderColor: "var(--rule)",
        opacity: s.enabled ? 1 : 0.5,
      }}
    >
      <button
        onClick={() => toggle(s.id)}
        className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
        style={{
          borderColor: "var(--ink)",
          background: s.enabled ? "var(--ink)" : "transparent",
        }}
        aria-label={
          suppress
            ? s.enabled
              ? "Merkitse kaapissa olevaksi"
              : "Merkitse loppuneeksi"
            : s.enabled
              ? "Poista listalta"
              : "Lisää listalle"
        }
      >
        {s.enabled && <Check size={13} style={{ color: "var(--paper)" }} />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{capitalize(s.name)}</p>
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>
          {suppress
            ? s.enabled
              ? "Loppu — osta"
              : "Kaapissa"
            : `${amountText} ${s.unit} · ${catLabel(s.category)}`}
        </p>
      </div>
      <button
        onClick={() => setEditing(true)}
        className="p-1.5"
        style={{ color: "var(--muted)" }}
        aria-label="Muokkaa vakiota"
      >
        <Edit2 size={14} />
      </button>
    </div>
  );
}

