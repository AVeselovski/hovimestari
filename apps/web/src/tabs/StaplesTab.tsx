import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { Staple, StapleGroup, State } from "@hovi/shared";
import { SectionHead } from "../components/SectionHead.js";
import { StapleRow } from "../components/StapleRow.js";
import { uid } from "../lib/uid.js";

export function StaplesTab({
  state,
  mutate,
}: {
  state: State;
  mutate: (updater: (s: State) => State) => void;
}): JSX.Element {
  const groups = [...state.stapleGroups].sort((a, b) => a.order - b.order);

  const toggleGroup = (id: string): void =>
    mutate((s) => ({
      ...s,
      stapleGroups: s.stapleGroups.map((g) =>
        g.id === id ? { ...g, enabled: !g.enabled } : g,
      ),
    }));

  const renameGroup = (id: string, name: string): void =>
    mutate((s) => ({
      ...s,
      stapleGroups: s.stapleGroups.map((g) => (g.id === id ? { ...g, name } : g)),
    }));

  const moveGroup = (id: string, dir: -1 | 1): void => {
    mutate((s) => {
      const sorted = [...s.stapleGroups].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((g) => g.id === id);
      const swapIdx = idx + dir;
      if (idx < 0 || swapIdx < 0 || swapIdx >= sorted.length) return s;
      const a = sorted[idx];
      const b = sorted[swapIdx];
      return {
        ...s,
        stapleGroups: s.stapleGroups.map((g) => {
          if (g.id === a.id) return { ...g, order: b.order };
          if (g.id === b.id) return { ...g, order: a.order };
          return g;
        }),
      };
    });
  };

  const deleteGroup = (id: string): void => {
    if (!window.confirm("Poista ryhmä ja kaikki sen tuotteet?")) return;
    mutate((s) => ({
      ...s,
      stapleGroups: s.stapleGroups.filter((g) => g.id !== id),
      staples: s.staples.filter((st) => st.groupId !== id),
    }));
  };

  const addGroup = (): void => {
    const name = window.prompt("Uuden ryhmän nimi?");
    if (!name) return;
    mutate((s) => {
      const maxOrder = s.stapleGroups.reduce(
        (m, g) => (g.order > m ? g.order : m),
        -1,
      );
      return {
        ...s,
        stapleGroups: [
          ...s.stapleGroups,
          { id: uid(), name, enabled: true, order: maxOrder + 1 },
        ],
      };
    });
  };

  const addStaple = (groupId: string): void =>
    mutate((s) => ({
      ...s,
      staples: [
        ...s.staples,
        {
          id: uid(),
          groupId,
          name: "Uusi tuote",
          amount: "1",
          unit: "kpl",
          category: "other",
          enabled: true,
        },
      ],
    }));

  const toggleStaple = (id: string): void =>
    mutate((s) => ({
      ...s,
      staples: s.staples.map((st) =>
        st.id === id ? { ...st, enabled: !st.enabled } : st,
      ),
    }));

  const updateStaple = (id: string, patch: Partial<Staple>): void =>
    mutate((s) => ({
      ...s,
      staples: s.staples.map((st) => (st.id === id ? { ...st, ...patch } : st)),
    }));

  const removeStaple = (id: string): void =>
    mutate((s) => ({
      ...s,
      staples: s.staples.filter((st) => st.id !== id),
    }));

  return (
    <div className="space-y-6 mt-2">
      <div className="flex items-center justify-between">
        <SectionHead>Vakiopaketit</SectionHead>
        <button
          onClick={addGroup}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
          style={{ background: "var(--ink)", color: "var(--paper)" }}
        >
          <Plus size={14} /> Uusi ryhmä
        </button>
      </div>

      {groups.map((g, i) => (
        <GroupSection
          key={g.id}
          group={g}
          isFirst={i === 0}
          isLast={i === groups.length - 1}
          items={state.staples.filter((s) => s.groupId === g.id)}
          toggleGroup={toggleGroup}
          renameGroup={renameGroup}
          moveGroup={moveGroup}
          deleteGroup={deleteGroup}
          addStaple={addStaple}
          toggleStaple={toggleStaple}
          updateStaple={updateStaple}
          removeStaple={removeStaple}
        />
      ))}
    </div>
  );
}

function GroupSection({
  group,
  isFirst,
  isLast,
  items,
  toggleGroup,
  renameGroup,
  moveGroup,
  deleteGroup,
  addStaple,
  toggleStaple,
  updateStaple,
  removeStaple,
}: {
  group: StapleGroup;
  isFirst: boolean;
  isLast: boolean;
  items: Staple[];
  toggleGroup: (id: string) => void;
  renameGroup: (id: string, name: string) => void;
  moveGroup: (id: string, dir: -1 | 1) => void;
  deleteGroup: (id: string) => void;
  addStaple: (groupId: string) => void;
  toggleStaple: (id: string) => void;
  updateStaple: (id: string, patch: Partial<Staple>) => void;
  removeStaple: (id: string) => void;
}): JSX.Element {
  return (
    <section>
      <div className="flex items-center gap-2">
        <button
          onClick={() => toggleGroup(group.id)}
          className="w-10 h-6 rounded-full p-0.5 shrink-0 transition"
          style={{
            background: group.enabled ? "var(--ink)" : "var(--rule)",
          }}
          aria-label={group.enabled ? "Poista ryhmä käytöstä" : "Ota ryhmä käyttöön"}
        >
          <div
            className="w-5 h-5 rounded-full transition"
            style={{
              background: "var(--paper)",
              transform: group.enabled ? "translateX(16px)" : "translateX(0)",
            }}
          />
        </button>
        <button
          onClick={() => {
            const next = window.prompt("Ryhmän nimi?", group.name);
            if (next && next.trim()) renameGroup(group.id, next.trim());
          }}
          className="flex-1 text-left"
        >
          <p className="font-display text-xl leading-tight">{group.name}</p>
        </button>
        <button
          onClick={() => moveGroup(group.id, -1)}
          disabled={isFirst}
          className="p-1.5 disabled:opacity-30"
          style={{ color: "var(--muted)" }}
          aria-label="Siirrä ylös"
        >
          <ChevronUp size={16} />
        </button>
        <button
          onClick={() => moveGroup(group.id, 1)}
          disabled={isLast}
          className="p-1.5 disabled:opacity-30"
          style={{ color: "var(--muted)" }}
          aria-label="Siirrä alas"
        >
          <ChevronDown size={16} />
        </button>
        <button
          onClick={() => deleteGroup(group.id)}
          className="p-1.5"
          style={{ color: "var(--muted)" }}
          aria-label="Poista ryhmä"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {items.map((s) => (
          <StapleRow
            key={s.id}
            s={s}
            toggle={toggleStaple}
            update={updateStaple}
            remove={removeStaple}
          />
        ))}
      </div>
      <button
        onClick={() => addStaple(group.id)}
        className="mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border"
        style={{ borderColor: "var(--rule)", color: "var(--ink)" }}
      >
        <Plus size={12} /> Lisää tuote
      </button>
    </section>
  );
}
