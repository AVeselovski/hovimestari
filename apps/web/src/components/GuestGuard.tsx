"use client";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { safeRedirectHere } from "@/lib/redirect";
import { useRouter } from "next/navigation";
import { useEffect, type ReactElement, type ReactNode } from "react";

/** Where the sign-in page keeps `?redirect=` across the round trip to Google. */
export const POST_LOGIN_REDIRECT_KEY = "postLoginRedirect";

/** The path to send a just-signed-in user to: `?redirect=`, then the one saved before Google, else the Day tab. */
export function postLoginPath(): string {
  let target = new URLSearchParams(window.location.search).get("redirect");
  try {
    const saved = window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
    window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
    target ??= saved;
  } catch {
    // Storage refused: only the query parameter counts.
  }
  return safeRedirectHere(target) ?? "/";
}

/** Renders a guest page. A signed-in visitor goes on into the app. */
export function GuestGuard({ children }: { children: ReactNode }): ReactElement | null {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.replace(postLoginPath());
  }, [status, router]);

  if (status === "loading") return <FullPageSpinner />;
  if (status === "authenticated") return null;
  return <>{children}</>;
}
