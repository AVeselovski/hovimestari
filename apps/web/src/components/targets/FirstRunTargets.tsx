"use client";

import { DeleteAccountButton } from "@/components/account/DeleteAccountButton";
import { SignOutButton } from "@/components/account/SignOutButton";
import { AuthPage } from "@/components/auth/AuthPage";
import { focusField } from "@/components/form/focus";
import { FormError } from "@/components/form/FormError";
import { StableLabel } from "@/components/ui/StableLabel";
import { btnPrimary, btnText, btnTextDanger, formStack, sectionStart } from "@/components/ui/styles";
import { useAuth } from "@/contexts/AuthContext";
import { useErrorCopy } from "@/hooks/useErrorCopy";
import { useIsMobile } from "@/hooks/useIsMobile";
import { putTargets } from "@/lib/api/targets";
import { afterTargetsChange } from "@/lib/invalidation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useId, useState, type FormEvent, type ReactElement } from "react";
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
 * The first run: a full page, in place of the tabs, while the account has no
 * targets. The person enters their two ranges, and the tabs follow on the
 * same address once the change is saved. Every field starts empty: the app
 * offers no number.
 *
 * Signing out and deleting the account stay within reach here, so nobody
 * has to invent targets to leave.
 */
export function FirstRunTargets({ today }: { today: string }): ReactElement {
  const t = useTranslations("targets.firstRun");
  // The same line as Settings, Account, so the two never drift apart.
  const tAccount = useTranslations("settings.account");
  const errors = useErrorCopy();
  const { user } = useAuth();
  const client = useQueryClient();
  const isMobile = useIsMobile();
  const idPrefix = useId();

  const [values, setValues] = useState(EMPTY_TARGET_FIELDS);
  const [fieldErrors, setFieldErrors] = useState<TargetFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function change(field: TargetField, raw: string): void {
    setValues((prev) => ({ ...prev, [field]: raw }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (saving) return;
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
    try {
      // Today as the server reads it in the account's time zone.
      await putTargets(today, parsed.body);
    } catch (err) {
      // The fields are disabled while saving, so the browser has dropped
      // focus to the page. Enable them first, then put focus back in the
      // first field, as sign-in does. The refusal shows after, so its own
      // reveal scrolls last (FormError).
      flushSync(() => setSaving(false));
      focusField(targetFieldId(idPrefix, TARGET_FIELDS[0]));
      setFormError(errors.forError(err));
      return;
    }
    // Still busy: the tabs replace this page once the targets read again.
    await afterTargetsChange(client);
    // Still here only when that read failed. Save again sends the same change.
    setSaving(false);
  }

  return (
    <AuthPage title={t("title")} titleId={`${idPrefix}-title`}>
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
          disabled={saving}
        />
        <NotAdviceNote className={sectionStart} />
        <FormError message={formError} />
        <button type="submit" disabled={saving} className={`w-full ${btnPrimary}`}>
          <StableLabel active={saving} idle={t("save")} busy={t("saving")} />
        </button>
      </form>
      {user && (
        <div className="mt-10 border-t border-rule pt-6">
          <p className="text-base text-ink [overflow-wrap:anywhere]">
            {tAccount.rich("signedInAs", {
              email: user.email,
              strong: (chunks) => <strong className="font-semibold">{chunks}</strong>,
            })}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6">
            <SignOutButton className={btnText} />
            <DeleteAccountButton me={user} className={btnTextDanger} />
          </div>
        </div>
      )}
    </AuthPage>
  );
}
