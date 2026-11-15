import { env as currentEnv, type Env } from "./env.js";

export interface GoogleConfig {
  clientID: string;
  clientSecret: string;
  callbackURL: string;
  linkCallbackURL: string;
}

/** The Google OAuth values, or null when this deployment runs without Google. The env schema allows all four or none. */
export function googleConfig(values: Env = currentEnv): GoogleConfig | null {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_CALLBACK_URL, GOOGLE_LINK_CALLBACK_URL } = values;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_CALLBACK_URL || !GOOGLE_LINK_CALLBACK_URL) return null;
  return {
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: GOOGLE_CALLBACK_URL,
    linkCallbackURL: GOOGLE_LINK_CALLBACK_URL,
  };
}

/** Whether sign-in with Google is configured on this deployment. */
export const googleEnabled = (values: Env = currentEnv): boolean => googleConfig(values) !== null;
