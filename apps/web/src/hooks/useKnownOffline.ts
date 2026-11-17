import { useOptionalAuth } from "@/contexts/AuthContext";
import { useOnlineStatus } from "./useOnlineStatus";

/**
 * Whether the app knows it is offline: the browser has no network, or the
 * session found the server out of reach. The shell's offline line and every
 * write that refuses to send read the same two signals. Outside an
 * `AuthProvider` only the browser's own says.
 */
export function useKnownOffline(): boolean {
  const online = useOnlineStatus();
  const auth = useOptionalAuth();
  return !online || auth?.status === "offline";
}
