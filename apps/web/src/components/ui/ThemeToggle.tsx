"use client";

import { Icon, type IconName } from "@/components/Icon";
import { segmentActive, segmentButton, segmentInactive, segmentedTray } from "@/components/ui/styles";
import { useTheme, type ThemeMode } from "@/contexts/ThemeContext";
import { useRovingChoice } from "@/hooks/useRovingChoice";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

// ---------------------------------------------------------------------------
// ThemeToggle: Light, Dark or the device's choice, as one radio group. The
// three segments share a grid so they are exactly equal width. One Tab stop,
// and the arrow keys move the choice. The chosen segment is the accent,
// because selection reads accent.
// ---------------------------------------------------------------------------

const MODES: ThemeMode[] = ["light", "dark", "system"];

const MODE_ICON: Record<ThemeMode, IconName> = {
  light: "sun",
  dark: "moon",
  system: "device",
};

export function ThemeToggle(): ReactElement {
  const t = useTranslations("settings.appearance.themeToggle");
  const { mode, setMode } = useTheme();
  const roving = useRovingChoice(MODES, mode, setMode);

  return (
    <div role="radiogroup" aria-label={t("ariaLabel")} className={`${segmentedTray} grid-cols-3`}>
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={mode === m}
          onClick={() => setMode(m)}
          {...roving.optionProps(m)}
          className={[
            segmentButton,
            "max-[371px]:flex-col max-[371px]:gap-0.5 max-[371px]:py-1.5",
            mode === m ? segmentActive : segmentInactive,
          ].join(" ")}
        >
          <Icon name={MODE_ICON[m]} className="h-5 w-5 shrink-0" />
          {t(m)}
        </button>
      ))}
    </div>
  );
}
