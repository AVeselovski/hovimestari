import { COOKIE_MAX_AGE, COOKIE_NAME, COOKIE_PATH } from "@/app/api/auth/_constants";
import type { UserMe } from "@finanssiappis/types";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(COOKIE_NAME)?.value;

  if (!refreshToken) {
    return NextResponse.json({ message: "No refresh token" }, { status: 401 });
  }

  // Forward to backend
  let backendRes: Response;
  try {
    backendRes = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:3001"}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    cookieStore.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
    return NextResponse.json({ message: "Refresh failed" }, { status: 401 });
  }

  if (!backendRes.ok) {
    cookieStore.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
    return NextResponse.json({ message: "Refresh failed" }, { status: 401 });
  }

  const tokens = (await backendRes.json()) as { accessToken: string; refreshToken: string };

  // Roll the refresh token cookie
  cookieStore.set(COOKIE_NAME, tokens.refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
  });

  // Fetch user profile
  let user: UserMe;
  try {
    const meRes = await fetch(`${process.env.BACKEND_URL ?? "http://localhost:3001"}/api/v1/users/me`, {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });
    if (!meRes.ok) {
      throw new Error("Failed to fetch user");
    }
    user = (await meRes.json()) as UserMe;
  } catch {
    cookieStore.delete({ name: COOKIE_NAME, path: COOKIE_PATH });
    return NextResponse.json({ message: "Failed to load user" }, { status: 401 });
  }

  return NextResponse.json({ accessToken: tokens.accessToken, user });
}
