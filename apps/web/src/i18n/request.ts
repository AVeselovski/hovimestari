import { getRequestConfig } from "next-intl/server";

// The one place a language is decided. Interface copy is English, so this is
// a constant. Formatting dates and numbers for a user's locale is a separate
// matter and does not read this.
export default getRequestConfig(async () => ({
  locale: "en",
  messages: (await import("../../messages/en.json")).default,
}));
