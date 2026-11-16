"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { QueryProvider } from "@/components/QueryProvider";
import { AppShell } from "@/components/shell/AppShell";
import { TargetsGate } from "@/components/targets/TargetsGate";
import { useAuth } from "@/contexts/AuthContext";
import type { ReactElement, ReactNode } from "react";

/**
 * The query cache lives inside `AuthGuard`, keyed by the signed-in user: it
 * exists only while someone is signed in, and a different user always gets a
 * new, empty one. The first-run gate sits between the query cache and the
 * shell: an account without targets sees the first-run page in its place.
 */
function UserQueryScope({ children }: { children: ReactNode }): ReactElement {
  const { user } = useAuth();
  return <QueryProvider key={user?.id ?? "anonymous"}>{children}</QueryProvider>;
}

export default function AppLayout({ children }: { children: ReactNode }): ReactElement {
  return (
    <AuthGuard>
      <UserQueryScope>
        <TargetsGate>
          <AppShell>{children}</AppShell>
        </TargetsGate>
      </UserQueryScope>
    </AuthGuard>
  );
}
