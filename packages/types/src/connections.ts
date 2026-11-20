import { z } from "zod";

// A connection is a key the user makes in Settings and gives to their own AI
// assistant, which then reads, or reads and changes, that user's data over
// MCP. Keys are made, listed and revoked under `/connections` by a signed-in
// user. A key is never accepted there.
//
// The key itself appears in exactly one answer: the one that creates it. The
// server keeps only its SHA-256 hash.

export const CONNECTION_ACCESS = ["read", "read_write"] as const;

/** The only lifetimes on offer, in days. There is no "never". */
export const CONNECTION_EXPIRY_DAYS = [7, 30, 90, 365] as const;

/** The lifetime a create gets when it names none. */
export const DEFAULT_CONNECTION_EXPIRY_DAYS = 30;

/** The lifetimes a key that can make changes may have. A forgotten one can change the log, so no year. */
export const CONNECTION_WRITE_EXPIRY_DAYS = [7, 30, 90] as const;

/** Live keys (not revoked, not expired) one user may hold. */
export const MAX_LIVE_CONNECTIONS = 10;

/** The longest connection name, in characters, after trimming. */
export const MAX_CONNECTION_NAME_LENGTH = 64;

/**
 * Control and format characters a name may not hold: NUL and the other C0 and
 * C1 controls, line breaks inside a name, bidirectional overrides and
 * isolates, zero-width spaces, word joiners, the byte order mark and the soft
 * hyphen. A name holding one could be stored invisible, reorder the text
 * around it, or never reach the database at all. Three format characters
 * are text, not tricks, and pass: the zero-width non-joiner, which Persian
 * spelling needs, the zero-width joiner, which joins emoji into one picture,
 * and the tag characters, which make flags such as Scotland's.
 */
const CONTROL_OR_FORMAT = /(?![\u200C\u200D\u{E0020}-\u{E007F}])[\p{Cc}\p{Cf}]/u;

/**
 * A character that shows: anything but white space, a format character or a
 * Hangul or braille filler, which look like nothing. A name needs one, so a
 * name made only of joiners or fillers is refused.
 */
const VISIBLE = /[^\p{White_Space}\p{Cf}\u3164\u2800\u115F\u1160\uFFA0]/u;

/** Every key starts with this, so a leaked one is recognisable at a glance. */
export const CONNECTION_KEY_PREFIX = "hovi_mcp_";

export const ConnectionAccessSchema = z.enum(CONNECTION_ACCESS);

/** `POST /connections`. Access and lifetime are set once: a key never changes them. */
export const CreateConnectionBodySchema = z
  .object({
    name: z
      .string({ error: "connection_name_required" })
      .trim()
      .min(1, { error: "connection_name_required" })
      .max(MAX_CONNECTION_NAME_LENGTH, { error: "connection_name_too_long" })
      .refine((name) => !CONTROL_OR_FORMAT.test(name) && VISIBLE.test(name), { error: "connection_name_invalid" }),
    access: ConnectionAccessSchema.default("read"),
    expiresInDays: z
      .literal([...CONNECTION_EXPIRY_DAYS], { error: "connection_expiry_invalid" })
      .default(DEFAULT_CONNECTION_EXPIRY_DAYS),
  })
  .refine((b) => b.access === "read" || (CONNECTION_WRITE_EXPIRY_DAYS as readonly number[]).includes(b.expiresInDays), {
    error: "connection_write_expiry_too_long",
    path: ["expiresInDays"],
  });

/** A connection as the list shows it. Never carries the key or its hash. */
export const ConnectionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  access: ConnectionAccessSchema,
  /** Worked out by the server on the database clock. A revoked connection is not listed. */
  status: z.enum(["active", "expired"]),
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  /** Recorded at 5-minute resolution. Null until the key is first used. */
  lastUsedAt: z.iso.datetime().nullable(),
});

/** A connection in the list, with how many changes its assistant has made. */
export const ConnectionWithChangesSchema = ConnectionSchema.extend({
  /** Every change in the record under this connection, exact. */
  changeCount: z.number().int(),
});

/**
 * A revoked connection whose assistant made changes. It is listed so its
 * record stays readable. A revoked connection that changed nothing is not.
 */
export const PastConnectionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  changeCount: z.number().int(),
  /** When its newest change was made. */
  lastChangeAt: z.iso.datetime(),
});

/**
 * `GET /connections`: the user's connections not revoked, newest first, the
 * revoked ones that made changes, newest change first, and what the server
 * offers now.
 */
export const ConnectionListSchema = z.object({
  connections: z.array(ConnectionWithChangesSchema),
  past: z.array(PastConnectionSchema),
  /** `connect`: connected AI is on. `write`: a key may also make changes. */
  availability: z.object({ connect: z.boolean(), write: z.boolean() }),
});

/** The only answer that ever holds the key. */
export const CreatedConnectionSchema = z.object({
  connection: ConnectionSchema,
  key: z.string().startsWith(CONNECTION_KEY_PREFIX),
});

export type ConnectionAccess = z.infer<typeof ConnectionAccessSchema>;
/** The body as a client sends it: `access` and `expiresInDays` may be left out. */
export type CreateConnectionBody = z.input<typeof CreateConnectionBodySchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type ConnectionWithChanges = z.infer<typeof ConnectionWithChangesSchema>;
export type PastConnection = z.infer<typeof PastConnectionSchema>;
export type ConnectionList = z.infer<typeof ConnectionListSchema>;
export type CreatedConnection = z.infer<typeof CreatedConnectionSchema>;
