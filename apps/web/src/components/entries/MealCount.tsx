"use client";

import { DecimalField } from "@/components/ui/DecimalField";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { EntryFieldError } from "./amount";

/** A saved meal entry's count of meals, with two decimals. Its line keeps two lines of room. */
export function MealCount({
  id,
  value,
  onChange,
  error,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (raw: string) => void;
  error: EntryFieldError | undefined;
  autoFocus: boolean;
}): ReactElement {
  const t = useTranslations("entries");
  const tCommon = useTranslations("common");
  const errorCopy = useErrorCopy();
  const line = error === undefined ? null : error === "digit_group" ? tCommon("digitGroup") : errorCopy.forCode(error);
  return (
    <DecimalField
      id={id}
      name="count"
      label={t("sheet.meals")}
      unit={t("amount.meals")}
      inputMode="decimal"
      enterKeyHint="done"
      autoFocus={autoFocus}
      value={value}
      onValueChange={onChange}
      invalid={error !== undefined}
      line={line}
      lineRows={2}
    />
  );
}
