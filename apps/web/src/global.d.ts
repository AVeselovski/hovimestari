import type messages from "../messages/en.json";

// Types the message catalog: a misspelled key or namespace is a tsc error,
// not a raw key path on screen.
declare module "next-intl" {
  interface AppConfig {
    Locale: "en";
    Messages: typeof messages;
  }
}
