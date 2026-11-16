"use client";

import { Icon } from "@/components/Icon";
import { focusRing } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/**
 * The favourite star: a toggle button with a 44px target, filled and in the
 * accent while on, because a favourite is a choice the user made. Its name
 * stays "Favourite" and `aria-pressed` says whether it is on.
 */
export function FavouriteButton({ on, onToggle }: { on: boolean; onToggle: () => void }): ReactElement {
  const t = useTranslations("foods.detail");
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={t("favourite")}
      onClick={onToggle}
      className={`inline-flex size-11 shrink-0 items-center justify-center rounded-control ${on ? "text-accent" : "text-ink"} hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
    >
      <Icon name="star" filled={on} className="size-6" />
    </button>
  );
}
