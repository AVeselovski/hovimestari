import { GuestGuard } from "@/components/GuestGuard";
import { ProvidersProvider } from "@/contexts/ProvidersContext";
import { readProviders } from "@/lib/providers";
import type { ReactElement, ReactNode } from "react";

/**
 * Every page a signed-out visitor uses. It reads on the server whether this
 * deployment offers Google, so the button is right in the first paint.
 */
export default async function GuestLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const { google } = await readProviders();
  return (
    <ProvidersProvider google={google}>
      <GuestGuard>{children}</GuestGuard>
    </ProvidersProvider>
  );
}
