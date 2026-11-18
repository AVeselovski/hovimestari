"use client";

import { Icon } from "@/components/Icon";
import { NotAdviceNote } from "@/components/targets/NotAdviceNote";
import { TargetsSheet } from "@/components/targets/TargetsSheet";
import { Card } from "@/components/ui/Card";
import { btnSecondary, focusRing } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useSheetTarget } from "@/hooks/useSheetTarget";
import { useToday } from "@/hooks/useToday";
import { formatDay } from "@/lib/localDate";
import { targetsQuery } from "@/lib/queryOptions";
import { formatTarget } from "@/lib/targetFormat";
import type { TargetChange } from "@hovimestari/types";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState, type ReactElement, type ReactNode } from "react";

/**
 * The targets in force today, the changes still to come and, behind a
 * disclosure, the earlier ones. Every change opens the targets sheet on
 * itself, with its own targets in the fields. Change targets opens it on
 * today, with the fields empty.
 */
export function TargetsSection(): ReactElement {
  const t = useTranslations("settings.targets");
  const { status } = useAuth();
  const { data } = useQuery({ ...targetsQuery(), enabled: status === "authenticated" });
  // The app's one today (TodayProvider), so Settings and the Day tab never disagree.
  const { today: appToday } = useToday();
  const today = appToday ?? data?.today ?? "";
  const sheet = useSheetTarget();
  // Which change the open sheet edits, kept while it slides out.
  const [editing, setEditing] = useState<string | undefined>(undefined);
  const changeRef = useRef<HTMLButtonElement>(null);

  function openOn(effectiveFrom: string | undefined, opener: HTMLElement): void {
    if (sheet.isOpen) return;
    setEditing(effectiveFrom);
    sheet.open(opener);
  }

  const inForce = data?.inForce ?? null;
  const changes = data?.changes ?? [];
  const later = inForce
    ? changes.filter((c) => c.effectiveFrom > today && c.effectiveFrom !== inForce.effectiveFrom)
    : [];
  const earlier = inForce ? changes.filter((c) => c.effectiveFrom < inForce.effectiveFrom).reverse() : [];

  return (
    <Card labelledBy="settings-targets">
      <Card.Header id="settings-targets" title={t("title")} />
      {data && inForce ? (
        <>
          <ul className="-mx-2 divide-y divide-rule">
            <li>
              <ChangeRow heading={t("inForceToday")} change={inForce} onOpen={openOn} />
            </li>
            {later.map((c) => (
              <li key={c.effectiveFrom}>
                <ChangeRow heading={t("fromDate", { date: formatDay(c.effectiveFrom) })} change={c} onOpen={openOn} />
              </li>
            ))}
          </ul>
          {earlier.length > 0 && (
            <details className="group mt-2 border-t border-rule pt-2">
              <summary
                className={`-mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between rounded-control px-2 text-base font-semibold text-ink hover:bg-surface-raised ${focusRing} [&::-webkit-details-marker]:hidden`}
              >
                {t("earlier")}
                <Icon
                  name="chevronDown"
                  className="h-5 w-5 text-ink-muted transition-transform group-open:rotate-180"
                />
              </summary>
              <ul className="-mx-2 divide-y divide-rule">
                {earlier.map((c) => (
                  <li key={c.effectiveFrom}>
                    <ChangeRow
                      heading={t("fromDate", { date: formatDay(c.effectiveFrom) })}
                      change={c}
                      onOpen={openOn}
                    />
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            ref={changeRef}
            type="button"
            onClick={(e) => openOn(undefined, e.currentTarget)}
            className={`mt-5 w-full md:w-auto ${btnSecondary}`}
          >
            {t("change")}
          </button>
        </>
      ) : (
        <p className="text-base text-ink-muted">{t("unavailable")}</p>
      )}
      <NotAdviceNote className="mt-5" />

      {sheet.shown && data && (
        <TargetsSheet
          key={sheet.shown.key}
          open={sheet.isOpen}
          returnFocusTo={sheet.shown.opener}
          onClose={sheet.close}
          onSaved={() => {}}
          today={today}
          changes={data.changes}
          editing={editing}
          focusAfterRemove={() => changeRef.current}
        />
      )}
    </Card>
  );
}

/**
 * A range's figures. One that does not fit beside its label drops whole to
 * the next line, still on the right edge.
 */
const figureClass = "ml-auto text-right font-mono text-lg text-ink tabular-nums";

/**
 * The two halves of a range, "1800 to" and "2200 kcal", each never broken. A
 * range that does not fit even on a line of its own, such as "99999.9 to
 * 99999.9 kcal" at 320 wide, breaks between them and nowhere else.
 */
const part = (chunks: ReactNode): ReactElement => <span className="whitespace-nowrap">{chunks}</span>;

/** One change: its heading and its two ranges, as one button that opens it. */
function ChangeRow({
  heading,
  change,
  onOpen,
}: {
  heading: string;
  change: TargetChange;
  onOpen: (effectiveFrom: string, opener: HTMLElement) => void;
}): ReactElement {
  const tFields = useTranslations("targets.fields");
  const tRange = useTranslations("targets.range");
  const { energyKcal, proteinG } = change.ranges;
  return (
    <button
      type="button"
      onClick={(e) => onOpen(change.effectiveFrom, e.currentTarget)}
      className={`flex w-full items-center gap-3 rounded-control px-2 py-3 text-left hover:bg-surface-raised active:bg-surface-raised ${focusRing}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-muted">{heading}</span>
        <span className="mt-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-base text-ink">{tFields("calories")}</span>
          <span className={figureClass}>
            {tRange.rich("kcal", {
              lower: formatTarget(energyKcal.lower),
              upper: formatTarget(energyKcal.upper),
              part,
            })}
          </span>
        </span>
        <span className="mt-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-base text-ink">{tFields("protein")}</span>
          <span className={figureClass}>
            {tRange.rich("grams", { lower: formatTarget(proteinG.lower), upper: formatTarget(proteinG.upper), part })}
          </span>
        </span>
      </span>
      <Icon name="chevronRight" className="h-5 w-5 shrink-0 text-ink-muted" />
    </button>
  );
}
