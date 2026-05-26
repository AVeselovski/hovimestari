export function Toggle({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onChange}
      className="w-full rounded-xl p-3 border flex items-center gap-3 text-left"
      style={{ background: "var(--paper-2)", borderColor: "var(--rule)" }}
    >
      <div
        className="w-10 h-6 rounded-full p-0.5 shrink-0 transition"
        style={{ background: checked ? "var(--ink)" : "var(--rule)" }}
      >
        <div
          className="w-5 h-5 rounded-full transition"
          style={{
            background: "var(--paper)",
            transform: checked ? "translateX(16px)" : "translateX(0)",
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && (
          <p className="text-[11px]" style={{ color: "var(--muted)" }}>
            {sub}
          </p>
        )}
      </div>
    </button>
  );
}
