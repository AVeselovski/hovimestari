import { COOKIE_NAME, COOKIE_PATH } from "@/app/api/auth/_constants";
import { cookies } from "next/headers";

export async function POST(): Promise<Response> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(COOKIE_NAME)?.value;

  if (refreshToken) {
    try {
      await fetch(`${process.env.BACKEND_URL ?? "http://localhost:3001"}/api/v1/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      // Best-effort — clear cookie regardless
    }
  }

  cookieStore.delete({ name: COOKIE_NAME, path: COOKIE_PATH });

  return new Response(null, { status: 204 });
}
