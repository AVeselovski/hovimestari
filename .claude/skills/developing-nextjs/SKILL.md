---
name: developing-nextjs
description: Use this skill when working with Next.js 16 - creating pages, components, layouts, API routes, implementing proxy.ts, adding caching with Cache Components, or refactoring frontend code. This includes working with App Router patterns, Server Components, Server Actions, React 19.2 features, and Tailwind CSS v4.
---

# Next.js 16 Development

Write concise, targeted, DRY code using modern React 19 and Next.js 16 patterns.

## This repository: what applies here

Hovimestari's web app (`apps/web`) uses a narrow slice of Next.js 16. These rules override anything below.

- **No Server Actions.** Mutations go to the Express API with the in-memory bearer token, through `src/lib/api.ts` and the call files in `src/lib/api/`. Session calls go through the route handlers in `src/app/api/auth/`.
- **Signed-in pages are client components** behind `AuthGuard`, and put no user data in server-rendered HTML. The service worker caches pages, which is safe only because of this.
- **No Cache Components, no `"use cache"`, no `updateTag`, `revalidateTag` or `refresh()`.** TanStack Query owns server state.
- **No `proxy.ts` and no `middleware.ts`.** The locale is pinned in `src/i18n/request.ts`.
- **The React Compiler is off.**
- **Monorepo:** `turbopack.root` in `next.config.ts` is pinned to the repository root. Keep it.
- **No `.js` extensions on relative imports** in the web app. It uses `Bundler` resolution.
- **`next-intl` needs `transpilePackages`** in `next.config.ts`, which is also how `next/jest` learns to transform it in tests.
- **No gradients, no glass, no decorative shadows.** Colours come only from the tokens in `src/app/globals.css`.
- Every POST route handler runs `requireSameOrigin` first. See `apps/web/README.md`.

The general Next.js 16 notes follow.

## Next.js 16 Key Changes

### proxy.ts (Replaces middleware.ts)

Not used in this repository. The `middleware.ts` file is **deprecated**. Use `proxy.ts` instead:

```ts
// proxy.ts (at project root or src/)
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  // Runs on Node.js runtime (NOT Edge)
  return NextResponse.redirect(new URL("/home", request.url));
}

export const config = {
  matcher: "/api/:path*",
};
```

- `middleware.ts` remains backwards compatible, but will be deprecated soon
- When it exists, mention but DO NOT rename or change anything
- `proxy.ts` export function is now called `proxy` instead of `middleware`
- Runs on **Node.js runtime** (not Edge)
- Config flags renamed: `skipMiddlewareUrlNormalize` → `skipProxyUrlNormalize`

### Async Request APIs (Breaking)

All request APIs must be awaited:

```ts
// Next.js 16 - MUST await
const cookieStore = await cookies();
const headersList = await headers();
const draft = await draftMode();
const { slug } = await params;
const query = await searchParams;
```

### Turbopack (Default)

Turbopack is now the default bundler. No `--turbopack` flag needed.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build"
  }
}
```

- Use `--webpack` flag to opt out if needed
- Config moved from `experimental.turbopack` to top-level `turbopack`

### Cache Components

New caching model replacing `experimental.ppr`:

```ts
// next.config.ts
const nextConfig = {
  cacheComponents: true,
};
```

Use `"use cache"` directive for explicit caching:

```ts
async function getData() {
  "use cache";
  return await fetchData();
}
```

### New Caching APIs

```ts
import { updateTag, revalidateTag, refresh } from "next/cache";

// updateTag - read-your-writes semantics (Server Actions only)
export async function updateProfile(userId: string) {
  await db.update(userId);
  updateTag(`user-${userId}`); // User sees changes immediately
}

// revalidateTag - now requires cacheLife profile
revalidateTag("blog-posts", "max"); // SWR behavior with profile

// refresh - refresh uncached data (Server Actions only)
refresh();
```

### React 19.2 Features

- **View Transitions**: Animate navigation/updates
- **`useEffectEvent`**: Extract non-reactive logic from Effects
- **`<Activity>`**: Background rendering with `display: none`

### React Compiler (Stable)

```ts
// next.config.ts
const nextConfig = {
  reactCompiler: true,
};
```

Off in this repository.

### Other Breaking Changes

- **Node.js 20.9+** required (Node.js 18 dropped)
- **TypeScript 5.1+** required
- **Parallel routes** require explicit `default.js` files
- **`next lint` removed** - use ESLint directly
- **AMP support removed**
- **`next/legacy/image` deprecated** - use `next/image`
- **`images.domains` deprecated** - use `images.remotePatterns`

### next/image Defaults Changed

- `minimumCacheTTL`: 60s → 4 hours
- `imageSizes`: removed `16` from default array
- `qualities`: now `[75]` only by default
- Local images with query strings require `images.localPatterns`

## Coding Standards

### DRY & Conciseness

- Write minimal code solving the problem
- Extract repeated patterns into reusable components/hooks
- Keep files under 300 lines; split when approaching limit
- One component per file unless tightly coupled

### Next.js 16 Patterns

- Use App Router (`app/` directory) exclusively
- Server Components for the frame. Signed-in pages and anything that reads the session are client components
- Mutations go to the Express API, never through Server Actions
- Implement `loading.tsx` and `error.tsx` boundaries where a page needs them
- Use `next/image`, `next/link`, `next/font`

### Tailwind CSS v4

- Use `@import "tailwindcss"` (not v3 directives)
- Configure via `@theme` in CSS, not tailwind.config.js
- Style with the token utilities (`bg-surface`, `text-ink-muted`, `border-rule`), never a raw palette class
- Prefer CSS variables over `@apply`

### TypeScript

- Strict typing always
- Use the shared types from `@hovimestari/types` for API shapes
- Define explicit return types
- Use `as const` for string literals in unions

### Import Patterns

- Use aliases for absolute imports (e.g. `@/components/Button`)
- Group imports: external packages first, then internal modules

## Operational Guidelines

- Read existing codebase and ensure no duplicate code exists
- Make surgical, targeted changes
- Preserve existing patterns in the codebase

## Research Protocol

When encountering unfamiliar Next.js 16 APIs, use Exa and Ref MCP servers (if available) to search examples and official documentation. When unavailable, use web search tools.
