"use client";

import { FullPageSpinner } from "@/components/FullPageSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import React, { useEffect } from "react";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/auth/sign-in");
    }
  }, [status, router]);

  if (status === "loading") {
    return <FullPageSpinner />;
  }

  if (status === "unauthenticated") {
    return null;
  }

  return <>{children}</>;
}
