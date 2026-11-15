import { Icon, type IconName } from "@/components/Icon";
import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// EmptyState — the app's one "nothing here yet" recipe
// (docs/design/ui-overhaul.md §e), replacing the bare
// `flex min-h-48 items-center justify-center` + `text-sm text-gray-500`
// paragraph repeated across nearly every list surface. Copy is always passed
// in by the caller from the message catalog — this component renders no
// strings of its own.
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
  /**
   * "default" (min-h-48 / py-8) for a standalone empty page or panel;
   * "compact" (min-h-0 / py-4) for a card slot that already has its own
   * fixed height, such as a dashboard summary card. Do not try to override
   * the sizing via `className` — Tailwind's compiled stylesheet order makes
   * a `min-h-0`/`py-4` override a no-op against the default's `min-h-48`/
   * `py-8` at equal specificity.
   */
  size?: "default" | "compact";
}

export function EmptyState({ icon, title, body, action, className, size = "default" }: EmptyStateProps): ReactElement {
  const sizeClasses = size === "compact" ? "min-h-0 py-4" : "min-h-48 py-8";
  const classes = ["flex flex-col items-center justify-center gap-2 px-4 text-center", sizeClasses, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-content-muted">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="text-sm font-medium text-content">{title}</p>
      {body && <p className="max-w-xs text-sm text-content-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
