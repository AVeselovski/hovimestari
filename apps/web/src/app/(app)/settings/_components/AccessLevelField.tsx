"use client";

import { focusRing, labelClass } from "@/components/ui/styles";
import type { ConnectionAccess } from "@hovimestari/types";
import { useTranslations } from "next-intl";
import { useId, type ReactElement } from "react";

const LEVELS: readonly ConnectionAccess[] = ["read", "read_write"];

/**
 * "Access": read only, or read and write. Two native radios drawn as option
 * cards, so the arrow keys, Space and a screen reader work as for any radio
 * group. The chosen card is in the accent, because chosen is not a status.
 * The whole card is the target. Shown only while the server makes keys that
 * can make changes. Otherwise `ReadOnlyAccessLine` stands in its place.
 */
export function AccessLevelField({
  value,
  onChange,
}: {
  value: ConnectionAccess;
  onChange: (access: ConnectionAccess) => void;
}): ReactElement {
  const t = useTranslations("settings.connectedAi.create");
  const name = useId();

  return (
    <fieldset className="m-0 min-w-0 border-0 p-0">
      <legend className={labelClass}>{t("access")}</legend>
      <div className="grid gap-2">
        {LEVELS.map((level) => {
          const chosen = value === level;
          const hintId = `${name}-${level}-hint`;
          return (
            <label
              key={level}
              data-chosen={chosen || undefined}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-control border p-3.5 transition-colors duration-150 ${
                chosen
                  ? "border-accent bg-surface-raised ring-1 ring-accent"
                  : "border-field-rule bg-surface-raised hover:border-ink"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={level}
                checked={chosen}
                onChange={() => onChange(level)}
                aria-describedby={hintId}
                className={`mt-1 size-4 shrink-0 accent-accent ${focusRing}`}
              />
              <span className="min-w-0">
                <span className={`block text-base font-semibold ${chosen ? "text-accent" : "text-ink"}`}>
                  {level === "read" ? t("readOption") : t("writeOption")}
                </span>
                <span id={hintId} className="mt-0.5 block text-sm text-ink-muted">
                  {level === "read" ? t("readHint") : t("writeHint")}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * What stands in the Access field's place while the server makes no key that
 * can make changes: one plain line, no card and nothing to choose.
 */
export function ReadOnlyAccessLine(): ReactElement {
  const t = useTranslations("settings.connectedAi.create");
  return (
    <div data-read-only-access="">
      <p className={labelClass}>{t("access")}</p>
      <p className="text-base text-ink">
        {t.rich("readOnlyLine", { strong: (chunks) => <strong className="font-semibold">{chunks}</strong> })}
      </p>
    </div>
  );
}
