"use client";

import { Icon, type IconName } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { useTranslations } from "next-intl";

// ---------------------------------------------------------------------------
// ThemeToggle — the three-way Light/System/Dark control. Mounted once, in
// Settings → General (owner ruling, round 2 pass B): theme mode
// is a per-user/per-device preference a person sets rarely, not a control
// that earns a permanent spot in the sidebar. It previously also rendered
// inline in the sidebar's bottom group and, at the rail's collapsed width, as
// a single icon button that cycled the three modes — both retired with the
// move, since Settings is always full-width and never collapses.
//
// `grid grid-cols-3` (rather than the earlier `flex` + `flex-1` row) makes
// all three segments the exact width of the widest — Light/System/Dark are
// close but not equal in character count, and a flex row sized by content
// left System (the widest label) a few px wider than Light/Dark. A CSS grid
// column is sized by the track, not its content, so all three come out
// pixel-identical regardless of label length (owner ruling #2).
// ---------------------------------------------------------------------------

const MODES: ThemeMode[] = ["light", "dark", "system"];

const MODE_ICON: Record<ThemeMode, IconName> = {
  light: "sun",
  dark: "moon",
  system: "computerDesktop",
};

export function ThemeToggle() {
  const t = useTranslations("settings.appearance.themeToggle");
  const { mode, setMode } = useTheme();
  // One Tab stop; the arrow keys move the choice.
  const roving = useRovingChoice(MODES, mode, setMode);

  return (
    <div
      role="radiogroup"
      aria-label={t("ariaLabel")}
      className="grid grid-cols-3 gap-0.5 rounded-control bg-surface-inset p-1"
    >
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          {...roving.optionProps(m)}
          className={[
            "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium transition-colors duration-150",
            focusRing,
            mode === m ? "bg-surface-3 text-content" : "text-content-muted hover:text-content-secondary",
          ].join(" ")}
        >
          <Icon name={MODE_ICON[m]} className="h-3.5 w-3.5" />
          {t(m)}
        </button>
      ))}
    </div>
  );
}
