import axios, { type InternalAxiosRequestConfig } from "axios";

// ---------------------------------------------------------------------------
// The axios client for the backend API. It sends the in-memory access token
// as a bearer, and on a 401 renews the session once and retries. Calls live
// in one file per area under lib/api/, so this file stays the client alone.
//
// AuthProvider injects the handlers. Until it has, a call goes out with no
// bearer and a 401 is returned as is.
// ---------------------------------------------------------------------------

interface RetryConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

export interface AuthHandlers {
  /** The access token in memory, if any. */
  getAccessToken: () => string | null;
  /**
   * Renews the session through the refresh route handler. True when a new
   * access token is in memory. AuthProvider owns renewal: requests that hit
   * a 401 together share its one request, and it decides what a failure
   * means for the session.
   */
  renewSession: () => Promise<boolean>;
}

let handlers: AuthHandlers | null = null;

export function injectAuthHandlers(next: AuthHandlers): void {
  handlers = next;
}

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeout: 10_000,
});

api.interceptors.request.use((config) => {
  const token = handlers?.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (!axios.isAxiosError(error) || error.response?.status !== 401 || !handlers) throw error;
    const config = error.config as RetryConfig | undefined;
    if (!config || config._retry) throw error;
    config._retry = true;

    if (!(await handlers.renewSession())) throw error;

    const token = handlers.getAccessToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return api(config);
  },
);

/** Per-request options every read takes as its last argument. The query cache passes its own `signal`. */
export interface RequestOptions {
  signal?: AbortSignal;
}
