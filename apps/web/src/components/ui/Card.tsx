import { cardClass, cardPadClass, cardPadDenseClass, panelHeadClass, sectionTitle } from "@/components/ui/styles";
import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Card / Card.Header — the panel pattern that already appears 69 times as a
// hand-rolled `rounded-xl border bg-gray-900 p-5` triplet
// (docs/design/ui-overhaul.md §e). Pages may keep composing `cardClass`
// directly where the markup is trivial; prefer this component for anything
// with a header row.
// ---------------------------------------------------------------------------

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** "generous" (default, p-6) — overview surfaces. "dense" (p-4) — table-heavy surfaces. */
  padding?: "generous" | "dense";
}

function CardRoot({ children, className, padding = "generous" }: CardProps): ReactElement {
  const padClass = padding === "dense" ? cardPadDenseClass : cardPadClass;
  const classes = [cardClass, padClass, className].filter(Boolean).join(" ");
  return <div className={classes}>{children}</div>;
}

export interface CardHeaderProps {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}

function CardHeader({ title, action, className }: CardHeaderProps): ReactElement {
  const classes = [panelHeadClass, className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <h2 className={sectionTitle}>{title}</h2>
      {action}
    </div>
  );
}

export const Card = Object.assign(CardRoot, { Header: CardHeader });
