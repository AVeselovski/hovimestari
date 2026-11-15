"use client";

import { AuthGuard } from "@/components/AuthGuard";
import { QueryProvider } from "@/components/QueryProvider";
import { useAuth } from "@/contexts/AuthContext";

/**
 * The query cache lives inside `AuthGuard`, keyed by the signed-in user: it
 * exists only while someone is signed in, and a different user always gets a
 * new, empty one.
 */
function UserQueryScope({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return <QueryProvider key={user?.id ?? "anonymous"}>{children}</QueryProvider>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <UserQueryScope>{children}</UserQueryScope>
    </AuthGuard>
  );
}
