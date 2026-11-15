"use client";

import { makeQueryClient } from "@/lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import React, { useState } from "react";

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * The query cache for one signed-in user. Mounted inside `AuthGuard`, which
 * renders nothing unless signed in, so sign-out, a failed refresh and an
 * expired session all unmount it and discard the client with it. The app
 * layout keys it by user id, so another user always starts empty.
 * No cleanup effect: the query library aborts a read when its last observer
 * leaves, and the discarded client is never read again. An unmount cleanup
 * would also run under StrictMode's simulated unmount in development and
 * double every first request.
 */
export function QueryProvider({ children }: QueryProviderProps): React.ReactElement {
  const [client] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools buttonPosition="bottom-left" />}
    </QueryClientProvider>
  );
}
