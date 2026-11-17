"use client";

import { FormError } from "@/components/form/FormError";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary } from "@/components/ui/styles";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { LogForm } from "./useLogForm";

// ---------------------------------------------------------------------------
// LogFooter: the food and meal views' pinned footer. The log block's refusal
// line, with its room kept as every form sheet's footer keeps it (and given
// to the body while the keyboard is open), then one full-width primary
// button, "Log", or "Add to plan" while Planned is chosen. The button sits
// outside the form and reaches it by its `form` attribute, and rides above
// the keyboard with the footer. It waits (`aria-disabled`, never
// `disabled`, so it keeps focus) while nothing is typed, while a log runs
// and while the app asks for today.
// ---------------------------------------------------------------------------

export function LogFooter({ form, held }: { form: LogForm; held: boolean }): ReactElement {
  const t = useTranslations("log.block");
  const waits = form.empty || form.submitting || held;
  return (
    <>
      <FormError message={form.formError} inFooter />
      <button
        type="submit"
        form={form.formId}
        data-log-submit=""
        aria-disabled={waits || undefined}
        onClick={(e) => {
          if (waits) e.preventDefault();
        }}
        className={`${btnPrimary} w-full`}
      >
        <StableLabel
          active={form.submitting}
          idle={form.status === "planned" ? t("plan") : t("log")}
          busy={t("logging")}
        />
      </button>
    </>
  );
}
