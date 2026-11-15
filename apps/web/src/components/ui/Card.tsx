import { cardClass, cardPadClass, cardPadDenseClass, panelHeadClass, sectionTitle } from "@/components/ui/styles";
import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// Card and Card.Header: the panel pattern. A solid surface with a hairline
// rule, no shadow. The header's title is a small-caps section label.
// ---------------------------------------------------------------------------

export interface CardProps {
  children: ReactNode;
  className?: string;
  /** "generous" (the default) for most panels, "dense" for a panel of rows. */
  padding?: "generous" | "dense";
  /** Labels the panel as a region by its header's id. */
  labelledBy?: string;
}

function CardRoot({ children, className, padding = "generous", labelledBy }: CardProps): ReactElement {
  const padClass = padding === "dense" ? cardPadDenseClass : cardPadClass;
  const classes = [cardClass, padClass, className].filter(Boolean).join(" ");
  return (
    <section className={classes} aria-labelledby={labelledBy}>
      {children}
    </section>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  id?: string;
  action?: ReactNode;
  className?: string;
}

function CardHeader({ title, id, action, className }: CardHeaderProps): ReactElement {
  const classes = [panelHeadClass, className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <h2 id={id} className={sectionTitle}>
        {title}
      </h2>
      {action}
    </div>
  );
}

export const Card = Object.assign(CardRoot, { Header: CardHeader });
