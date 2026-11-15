"use client";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { isSafeRedirectPath } from "@/lib/redirect";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

interface GuestGuardProps {
  children: React.ReactNode;
}

export function GuestGuard({ children }: GuestGuardProps) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      // 1. Check URL param first (email/password flow).
      const params = new URLSearchParams(window.location.search);
      let redirectTo = params.get("redirect");

      // 2. Fall back to sessionStorage (Google OAuth flow — the redirect param
      //    is saved by the sign-in page before the full-page navigation to Google
      //    and back, because the callback URL carries no redirect param).
      if (!redirectTo) {
        redirectTo = sessionStorage.getItem("postLoginRedirect") ?? null;
        if (redirectTo) sessionStorage.removeItem("postLoginRedirect");
      }

      // Only allow relative paths to prevent open redirect attacks.
      const safePath = isSafeRedirectPath(redirectTo) ? redirectTo : "/";
      router.replace(safePath);
    }
  }, [status, router]);

  if (status === "loading") {
    return <FullPageSpinner />;
  }

  if (status === "authenticated") {
    return null;
  }

  return <>{children}</>;
}
