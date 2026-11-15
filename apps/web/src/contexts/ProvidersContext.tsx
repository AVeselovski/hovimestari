"use client";

import { createContext, useContext, type ReactElement, type ReactNode } from "react";

// Whether this deployment offers Google sign-in. The guest layout reads it
// from the backend on the server (`GET /auth/providers`) and hands it to the
// guest pages through this context, so the button and the backend agree.

const GoogleAvailableContext = createContext(false);

export function ProvidersProvider({ google, children }: { google: boolean; children: ReactNode }): ReactElement {
  return <GoogleAvailableContext.Provider value={google}>{children}</GoogleAvailableContext.Provider>;
}

export function useGoogleAvailable(): boolean {
  return useContext(GoogleAvailableContext);
}
