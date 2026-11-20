# Editing the web catalog from a backend task

`apps/web/messages/en.json` puts a no-break space (U+00A0) between a figure and its unit ("{value} kcal"), so a script that matches a line with a plain space fails. Anchor an insert on a line with no unit. The catalog's types come from `next typegen`: after adding a key, `tsc` alone reports "not assignable to NamespacedMessageKeys" until `pnpm --filter @hovimestari/web typecheck` regenerates them. Cost two round trips in the R3a fix batch (2026-11-20).
