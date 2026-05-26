import type { LucideIcon } from "lucide-react";

export function TabBtn({
  icon: Icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className="py-3 flex flex-col items-center gap-0.5 relative"
      style={{ color: active ? "var(--ink)" : "var(--muted)" }}
    >
      <Icon size={20} strokeWidth={active ? 2 : 1.5} />
      <span className="text-[10px] tracking-wide">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span
          className="absolute top-1.5 right-1/2 translate-x-3 text-[9px] min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center"
          style={{ background: "var(--berry)", color: "var(--paper)" }}
        >
          {badge}
        </span>
      )}
    </button>
  );
}
