/** This deployment lacks a setting it needs to reach the backend. */
export class BackendConfigError extends Error {
  constructor(setting: string) {
    super(`${setting} is not set`);
    this.name = "BackendConfigError";
  }
}

/**
 * The backend's base URL, as this server reaches it (server only). Development
 * falls back to the local backend. A production build without `BACKEND_URL`
 * throws instead of quietly calling localhost.
 */
export function backendUrl(): string {
  const configured = process.env.BACKEND_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new BackendConfigError("BACKEND_URL");
  return "http://localhost:3001";
}
