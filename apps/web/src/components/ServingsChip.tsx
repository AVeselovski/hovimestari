// A dumb pill row for picking a servings count. Always offers the recipe's
// base servings plus 4/6/8; duplicates are collapsed so the row is 3 or 4 wide
// depending on whether base coincides with one of the presets.

export const FIXED_OPTIONS: readonly number[] = [4, 6, 8];

export function servingsOptions(base: number): number[] {
  const set = new Set<number>([base, ...FIXED_OPTIONS]);
  return [...set].sort((a, b) => a - b);
}

export function ServingsChip({
  base,
  value,
  onChange,
}: {
  base: number;
  value: number;
  onChange: (next: number) => void;
}): JSX.Element {
  const options = servingsOptions(base);
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Annoskoko">
      {options.map((n) => {
        const isBase = n === base;
        const isSelected = n === value;
        const label = isBase ? `${n} annosta (oletus)` : `${n} annosta`;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={label}
            aria-pressed={isSelected}
            className="text-[11px] tracking-wide px-2.5 py-1 rounded-full border inline-flex items-center gap-1"
            style={{
              borderColor: isSelected ? "var(--ink)" : "var(--rule)",
              background: isSelected ? "var(--ink)" : "var(--paper-2)",
              color: isSelected ? "var(--paper)" : "var(--ink)",
            }}
          >
            {isBase && (
              <span
                aria-hidden="true"
                className="inline-block w-1 h-1 rounded-full"
                style={{
                  background: isSelected ? "var(--paper)" : "var(--berry)",
                }}
              />
            )}
            {n} ann
          </button>
        );
      })}
    </div>
  );
}
