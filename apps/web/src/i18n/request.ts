import { getRequestConfig } from "next-intl/server";

// ---------------------------------------------------------------------------
// The ONE place a language is decided (docs/design/i18n-message-catalog.md,
// D2/D3). English-only today (CLAUDE.md, owner decision 2026-08-21), so this
// is a constant. A future language reads from user or vault state here; no
// call site elsewhere changes.
//
// This `locale` is a THIRD, separate axis from the app's existing two: vault
// `locale` (date/currency formatting) and vault `languageLocale` (month/
// weekday names). Neither of those is touched by this file — see D3/D9.
// ---------------------------------------------------------------------------
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../../messages/en.json")).default,
}));
