import type { ReactElement, ReactNode } from "react";

// ---------------------------------------------------------------------------
// EmptyState: the one "nothing here" recipe. Copy is passed in from the
// message catalog. It states the fact and asks nothing of the reader.
// ---------------------------------------------------------------------------

export interface EmptyStateProps {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, body, action, className }: EmptyStateProps): ReactElement {
  const classes = ["flex min-h-48 flex-col items-start justify-center gap-2 py-8", className].filter(Boolean).join(" ");
  return (
    <div className={classes}>
      <p className="text-lg text-ink-muted">{title}</p>
      {body && <p className="max-w-prose text-base text-ink-muted">{body}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
