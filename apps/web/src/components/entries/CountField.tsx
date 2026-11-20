"use client";

import { DecimalField } from "@/components/ui/DecimalField";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { EntryFieldError } from "./amount";

/** What a count counts: a saved meal entry's meals, or a recipe entry's servings. */
export type CountOf = "meals" | "servings";

/**
 * A saved meal entry's count of meals, or a recipe entry's servings, with
 * two decimals. Both take the same limits and the same keyboard, so they are
 * one field with two names. Its line keeps two lines of room.
 */
export function CountField({
  id,
  of,
  value,
  onChange,
  error,
  autoFocus,
  layout,
}: {
  id: string;
  of: CountOf;
  value: string;
  onChange: (raw: string) => void;
  error: EntryFieldError | undefined;
  autoFocus: boolean;
  /** "beside" puts the label on the field's left. */
  layout?: "stacked" | "beside";
}): ReactElement {
  const t = useTranslations("entries");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const line = error === undefined ? null : error === "digit_group" ? tCommon("digitGroup") : errorCopy.forCode(error);
  return (
    <DecimalField
      id={id}
      name="count"
      label={of === "meals" ? t("sheet.meals") : t("sheet.servings")}
      unit={of === "meals" ? t("amount.meals") : t("amount.servings")}
      inputMode="decimal"
      enterKeyHint="done"
      autoFocus={autoFocus}
      value={value}
      onValueChange={onChange}
      invalid={error !== undefined}
      line={line}
      layout={layout}
    />
  );
}
