"use client";

import { OfflineSignedOut, SessionProblem } from "@/components/auth/SessionStates";
import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { hasKnownSession } from "@/lib/sessionMarker";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactElement, type ReactNode } from "react";

/**
 * Renders the signed-in app.
 *
 * - Offline, the shell renders only on a device with a known session, so the
 *   app opens without a network. A device that was signed out, or never
 *   signed in, sees the guest side with the offline line instead.
 * - On a server fault the session is kept and a retry is offered.
 * - A visitor without a session goes to sign-in, which brings them back to
 *   the path they opened. After signing out on this tab, it is the sign-in
 *   page the sign-out named, which may carry a note.
 */
export function AuthGuard({ children }: { children: ReactNode }): ReactElement | null {
  const { status, signedOut, afterSignOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status !== "unauthenticated") return;
    if (signedOut) {
      router.replace(afterSignOut);
      return;
    }
    const back = pathname && pathname !== "/" ? `?redirect=${encodeURIComponent(pathname)}` : "";
    router.replace(`/auth/sign-in${back}`);
  }, [status, signedOut, afterSignOut, router, pathname]);

  if (status === "loading") return <FullPageSpinner />;
  if (status === "unauthenticated") return null;
  if (status === "error") return <SessionProblem />;
  if (status === "offline" && !hasKnownSession()) return <OfflineSignedOut />;
  return <>{children}</>;
}
