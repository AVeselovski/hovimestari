import type { EntryFieldError } from "@/components/entries/amount";
import { useState } from "react";

/** A form's typed values and each field's refusal. A change clears that field's refusal. */
export function useFormFields<F extends string>(
  initial: Record<F, string>,
): {
  fields: Record<F, string>;
  errors: Partial<Record<F, EntryFieldError>>;
  setErrors: (errors: Partial<Record<F, EntryFieldError>>) => void;
  change: (field: F, value: string) => void;
} {
  const [fields, setFields] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<F, EntryFieldError>>>({});
  function change(field: F, value: string): void {
    setFields((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }
  return { fields, errors, setErrors, change };
}
