"use client";

import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import type { BrowseLogging } from "./browseLogging";
import { LogAgainButton } from "./LogAgainButton";
import type { LogAgainItem } from "./useLogAgain";

/**
 * The "+" for one item, named for what it adds: "Log Rahka again, 200 g", "Log Hernekeitto, 1 serving" for one never
 * eaten, or "Plan Rahka, 200 g".
 */
export function AgainButton({ item, logging }: { item: LogAgainItem; logging: BrowseLogging }): ReactElement {
  const t = useTranslations("log.again");
  const { again, held, planned } = logging;
  const key = again.keyOf(item);
  const values = { name: item.name, amount: item.amount };
  return (
    <LogAgainButton
      label={planned ? t("plan", values) : item.first ? t("logFirst", values) : t("log", values)}
      busy={again.busyKey === key}
      unavailable={held || again.busyKey !== null}
      onPress={() => again.press(item)}
    />
  );
}
