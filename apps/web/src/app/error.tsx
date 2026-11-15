"use client";

import { ErrorFrame } from "@/components/ErrorFrame";
import type { ReactElement } from "react";

/** A page that failed to render. The root layout, its theme and its catalog still stand. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }): ReactElement {
  return <ErrorFrame onRetry={reset} />;
}
