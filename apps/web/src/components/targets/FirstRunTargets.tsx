"use client";

import { AuthPage } from "@/components/auth/AuthPage";
import { focusField } from "@/components/form/focus";
import { FormError } from "@/components/form/FormError";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, btnText, formStack, sectionStart } from "@/components/ui/styles";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useKnownOffline } from "@/hooks/useKnownOffline";
import { putTargets } from "@/lib/api/targets";
import { finishFirstRun } from "@/lib/api/users";
import { connectionFailure } from "@/lib/failure";
import { afterTargetsChange } from "@/lib/invalidation";
import { isIsoDate } from "@/lib/localDate";
import type { TargetChange } from "@hovimestari/types";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, type FormEvent, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { NotAdviceNote } from "./NotAdviceNote";
import {
  EMPTY_TARGET_FIELDS,
  TARGET_FIELDS,
  firstInvalidField,
  parseTargetFields,
  type TargetField,
  type TargetFieldErrors,
} from "./targetForm";
import { TargetRangeFields, targetFieldId } from "./TargetRangeFields";

/**
 * The day the first-run page opened again returns to: the address's date
 * when it names one, else today. Read from the address itself, since the
 * page only ever opens on the Day tab's address.
 */
function returnDay(today: string): string {
  const param = new URLSearchParams(window.location.search).get("date");
  return param !== null && isIsoDate(param) ? param : today;
}

/**
 * The first-run page, in place of the tabs. The person enters their two
 * ranges, or goes on without targets. Every field starts empty: the app
 * offers no number.
 *
 * Shown by itself (no `onLeave`), for a new account: Save stores a change
 * and Continue without targets records that the first run is behind the
 * user, and the tabs follow on the same address once the targets read
 * answers again. It never goes Back, which would leave the app.
 *
 * Opened again from a day (`onLeave`), for a user with no targets: Continue
 * leaves at once, since the first run is already behind them, and a save
 * leaves once it is stored and the day it returns to has read its new
 * answer, or after a short bound, at once while offline
 * (`afterTargetsChange`). A refusal stays on the page, either way. A
 * refusal the connection explains, while the app knows it is offline, reads
 * as the forms' offline line.
 */
export function FirstRunTargets({ today, onLeave }: { today: string; onLeave?: () => void }): ReactElement {
  const t = useTranslations("targets.firstRun");
  const errors = useErrorCopy();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const idPrefix = useId();
  const continueRef = useRef<HTMLButtonElement>(null);

  const [values, setValues] = useState(EMPTY_TARGET_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<TargetFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [continuing, setContinuing] = useState(false);
  const busy = saving || continuing;
  const offline = useKnownOffline();
  const tCommon = useTranslations("common");

  /** A refusal's line: the shared offline line when the connection explains it, as in every form. */
  function refusalLine(err: unknown): string {
    return offline && connectionFailure(err) ? tCommon("offline") : errors.forError(err);
  }

  function change(field: TargetField, raw: string): void {
    setValues((prev) => ({ ...prev, [field]: raw }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const parsed = parseTargetFields(values);
    if (!parsed.ok) {
      setFieldErrors(parsed.errors);
      const first = firstInvalidField(parsed.errors);
      if (first) focusField(targetFieldId(idPrefix, first));
      return;
    }
    setFieldErrors({});
    setSaving(true);
    let saved: TargetChange;
    try {
      // Today as the server reads it in the account's time zone.
      saved = await putTargets(today, parsed.body);
    } catch (err) {
      // The fields are disabled while saving, so the browser has dropped
      // focus to the page. Enable them first, then put focus back in the
      // first field, as sign-in does. The refusal shows after, so its own
      // reveal scrolls last (FormError).
      flushSync(() => setSaving(false));
      focusField(targetFieldId(idPrefix, TARGET_FIELDS[0]));
      setFormError(refusalLine(err));
      return;
    }
    if (onLeave) {
      // Back to the day once it can open with its new answer, without
      // waiting for the other days held, and within a short bound.
      await afterTargetsChange(client, { returnTo: returnDay(today), saved });
      onLeave();
      return;
    }
    // Still busy: the tabs replace this page once the targets read again.
    await afterTargetsChange(client);
    // Still here only when that read failed. Save again sends the same change.
    setSaving(false);
  }

  async function handleContinue(): Promise<void> {
    if (busy) return;
    if (onLeave) {
      onLeave();
      return;
    }
    setFormError(null);
    setContinuing(true);
    try {
      await finishFirstRun();
    } catch (err) {
      // Disabled while it worked, so focus has dropped to the page: back on the button pressed.
      flushSync(() => setContinuing(false));
      continueRef.current?.focus();
      setFormError(refusalLine(err));
      return;
    }
    // Still busy: the tabs replace this page once the targets read again.
    await afterTargetsChange(client);
    setContinuing(false);
  }

  return (
    <AuthPage title={t("title")} titleId={`${idPrefix}-title`} focusTitle={isMobile}>
      <p className="mb-6 text-base text-ink">{t("lead")}</p>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-labelledby={`${idPrefix}-title`}
        className={formStack}
      >
        <TargetRangeFields
          idPrefix={idPrefix}
          values={values}
          onChange={change}
          errors={fieldErrors}
          autoFocus={!isMobile}
          disabled={busy}
        />
        <NotAdviceNote className={sectionStart} />
        <FormError message={formError} />
        <div>
          <button type="submit" disabled={busy} className={`w-full ${btnPrimary}`}>
            <StableLabel active={saving} idle={t("save")} busy={t("saving")} />
          </button>
          {/* The way on without targets: a plain text button under Save, never a second primary action. */}
          <button
            ref={continueRef}
            type="button"
            disabled={busy}
            onClick={() => void handleContinue()}
            className={`mt-4 w-full justify-center ${btnText}`}
          >
            <StableLabel active={continuing} idle={t("continue")} busy={t("continuing")} />
          </button>
        </div>
      </form>
    </AuthPage>
  );
}
