"use client";

import { api, injectAuthHandlers } from "@/lib/api";
import type { UserMe } from "@finanssiappis/types";
import { useRouter } from "next/navigation";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

function scheduleRefresh(token: string, onRefresh: () => void): ReturnType<typeof setTimeout> | null {
  try {
    const [, payload] = token.split(".");
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))) as { exp: number };
    const delay = exp * 1000 - Date.now() - 60_000;
    if (delay <= 0) return null;
    return setTimeout(onRefresh, delay);
  } catch {
    return null;
  }
}

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthContextValue {
  user: UserMe | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (accessToken: string, user: UserMe) => void;
  logout: () => Promise<void>;
  silentRefresh: () => Promise<void>;
  setAccessToken: (token: string) => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const [user, setUser] = useState<UserMe | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  // Use a ref to hold the access token so the Axios interceptor
  // always reads the current value without stale closures.
  const accessTokenRef = useRef<string | null>(null);

  // Expose a stable React state setter so consumers can subscribe to changes.
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const setAccessToken = useCallback((token: string) => {
    accessTokenRef.current = token;
    setAccessTokenState(token);
  }, []);

  // Timer ref for proactive token refresh (scheduled ~60s before expiry).
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const login = useCallback((newAccessToken: string, newUser: UserMe) => {
    accessTokenRef.current = newAccessToken;
    setAccessTokenState(newAccessToken);
    setUser(newUser);
    setStatus("authenticated");

    // Arm a proactive refresh so the token is renewed before it expires,
    // eliminating the 401 → refresh → retry round-trip on expiry boundaries.
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = scheduleRefresh(newAccessToken, () => {
      void silentRefreshRef.current();
    });
  }, []);

  const logout = useCallback(async () => {
    // Cancel any pending proactive refresh before clearing state.
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort — clear local state regardless
    }
    accessTokenRef.current = null;
    setAccessTokenState(null);
    setUser(null);
    setStatus("unauthenticated");
    router.replace("/auth/sign-in");
  }, [router]);

  const silentRefresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });

      if (!res.ok) {
        setStatus("unauthenticated");
        return;
      }

      const data = (await res.json()) as { accessToken: string; user: UserMe };
      login(data.accessToken, data.user);
    } catch {
      setStatus("unauthenticated");
    }
  }, [login]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<UserMe>("/users/me");
      setUser(res.data);
    } catch {
      // Silently ignore — a 401 here will be handled by the Axios interceptor
    }
  }, []);

  // Inject handlers into the Axios instance once on mount.
  useEffect(() => {
    injectAuthHandlers({
      getAccessToken: () => accessTokenRef.current,
      onRefreshSuccess: login,
      onLogout: logout,
    });
  }, [login, logout]);

  // Fire silent refresh once on mount to recover session.
  // silentRefresh is stable (useCallback with no deps that change), so
  // omitting it from the deps array is intentional — we only want this to
  // run once when the provider mounts.
  const silentRefreshRef = useRef(silentRefresh);
  useEffect(() => {
    silentRefreshRef.current = silentRefresh;
  }, [silentRefresh]);
  useEffect(() => {
    void silentRefreshRef.current();
  }, []);

  // Memoised: every callback above is stable, so the value only changes
  // when the user, the token or the status does.
  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      accessToken,
      status,
      login,
      logout,
      silentRefresh,
      setAccessToken,
      refreshUser,
    }),
    [user, accessToken, status, login, logout, silentRefresh, setAccessToken, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
