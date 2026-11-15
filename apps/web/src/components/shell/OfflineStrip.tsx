"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";

/** One quiet line under the header while the app cannot reach the server. It never blocks the screen. */
export function OfflineStrip(): ReactElement | null {
  const t = useTranslations("shell");
  const online = useOnlineStatus();
  const { status } = useAuth();
  if (online && status !== "offline") return null;

  return (
    <p
      role="status"
      className="shrink-0 border-b border-rule bg-surface pr-[calc(var(--safe-right)+1rem)] pl-[calc(var(--safe-left)+1rem)] py-2 text-center text-sm font-medium text-ink"
    >
      {t("offline")}
    </p>
  );
}
