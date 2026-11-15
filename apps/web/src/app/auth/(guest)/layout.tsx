"use client";

import { GuestGuard } from "@/components/GuestGuard";
import React from "react";

// Every /auth page a signed-out visitor uses. /auth/link-callback sits outside
// this group: the Google link flow returns there signed in, and the guard
// would render nothing and send the user to "/".
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <GuestGuard>{children}</GuestGuard>;
}
