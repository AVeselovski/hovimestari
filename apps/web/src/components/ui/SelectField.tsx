import { Icon } from "@/components/Icon";
import { selectFieldChevron, selectFieldClass, selectFieldWrap } from "@/components/ui/styles";
import type { ReactElement, ReactNode, Ref, SelectHTMLAttributes } from "react";

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "size"> {
  /** Classes for the box around the select, such as its margin. The select fills the box. */
  className?: string;
  /** The `<select>` itself, for a caller that moves focus to it. */
  ref?: Ref<HTMLSelectElement>;
  children: ReactNode;
}

/**
 * The app's one select. A native `<select>`, so a phone opens its own picker,
 * drawn without the browser's arrow and with the app's chevron instead, so it
 * looks the same on every browser. Lifted from finanssi's `SelectField`,
 * without its compact variant, on Hovimestari's field recipe.
 */
export function SelectField({ className, children, ...selectProps }: SelectFieldProps): ReactElement {
  return (
    <span className={className ? `${selectFieldWrap} ${className}` : selectFieldWrap}>
      <select {...selectProps} className={selectFieldClass}>
        {children}
      </select>
      <Icon name="chevronDown" className={selectFieldChevron} />
    </span>
  );
}
