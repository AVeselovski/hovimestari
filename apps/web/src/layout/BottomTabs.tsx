import { Calendar, ChefHat, Package, ShoppingCart } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";

export function BottomTabs({ listBadge }: { listBadge: number }): JSX.Element {
  return (
    <nav
      className="fixed bottom-0 inset-x-0 border-t"
      style={{ background: "var(--paper)", borderColor: "var(--rule)" }}
    >
      <div className="grid grid-cols-4">
        <TabLink to="/" icon={Calendar} label="Suunnitelma" end />
        <TabLink to="/recipes" icon={ChefHat} label="Reseptit" end={false} />
        <TabLink to="/staples" icon={Package} label="Vakiot" end />
        <TabLink
          to="/list"
          icon={ShoppingCart}
          label="Lista"
          end
          badge={listBadge}
        />
      </div>
    </nav>
  );
}

function TabLink({
  to,
  icon: Icon,
  label,
  end,
  badge,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  end: boolean;
  badge?: number;
}): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className="py-3 flex flex-col items-center gap-0.5 relative"
    >
      {({ isActive }) => (
        <span
          className="flex flex-col items-center gap-0.5 relative w-full"
          style={{ color: isActive ? "var(--ink)" : "var(--muted)" }}
        >
          <Icon size={20} strokeWidth={isActive ? 2 : 1.5} />
          <span className="text-[10px] tracking-wide">{label}</span>
          {badge !== undefined && badge > 0 && (
            <span
              className="absolute top-0 right-1/2 translate-x-3 text-[9px] min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center"
              style={{ background: "var(--berry)", color: "var(--paper)" }}
            >
              {badge}
            </span>
          )}
        </span>
      )}
    </NavLink>
  );
}
