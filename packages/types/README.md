# @hovimestari/types

The Zod schemas and TypeScript types that the backend and the web app both use. The backend parses request bodies with these schemas, and both apps type the API with them, so the two sides cannot disagree about a shape.

## Usage

```ts
import { LoginBodySchema, type LoginBody, type ErrorCode } from "@hovimestari/types";
```

The apps import the package's build output in `dist/`. `pnpm build` and `pnpm dev` build it first through Turborepo. After changing a schema outside those, run `pnpm --filter @hovimestari/types build`.

## Rules

- Every schema is named `<Thing>Schema`, and its type is `<Thing>`, inferred with `z.infer`. `LoginBodySchema` gives `LoginBody`.
- A request body ends in `BodySchema`.
- A schema refusal that the web app shows names an error code as its message, with Zod 4's `error` option: `z.email({ error: "invalid_email" })`. The backend answers that code. Every code is listed in `ERROR_CODES`.
- Limits both sides enforce are exported constants in upper case, such as `MAX_PASSWORD_BYTES`.
- The package is NodeNext ESM: relative imports inside `src/` end in `.js`. Every module is re-exported from `src/index.ts`.

## Modules

```text
auth.ts      Sign-up, sign-in, refresh, Google exchange, password and account bodies, the user, the session grant and the browser session
errors.ts    ERROR_CODES, ErrorCode, ApiError and isErrorCode
```

## Tests

`src/__tests__/` holds the schema tests, on Jest 29 in native ESM mode. Run them with `pnpm --filter @hovimestari/types test`.
