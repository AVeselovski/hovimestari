import type messages from "../messages/en.json";

// ---------------------------------------------------------------------------
// Type safety for the message catalog (docs/design/i18n-message-catalog.md,
// D4). `typeof messages` from the plain JSON import gives the key structure,
// so a misspelled key or namespace is a `tsc` error rather than a runtime
// fallback. This is the STABLE half of D4's typing story — it does not
// depend on the experimental `createMessagesDeclaration` plugin option
// (which additionally types ICU arguments, see next.config.ts).
// ---------------------------------------------------------------------------
declare module "next-intl" {
  interface AppConfig {
    Locale: "en";
    Messages: typeof messages;
  }
}
