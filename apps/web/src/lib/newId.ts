// ---------------------------------------------------------------------------
// A new id for an entry, a saved meal or a request, as a version 4 UUID.
//
// Browsers expose `crypto.randomUUID` only in a secure context: https, or
// localhost. A phone opening the development server over plain http from
// the machine's network address has no such function and the log sheet
// could not open. `crypto.getRandomValues` is available everywhere, so the
// same kind of id is built from it there.
// ---------------------------------------------------------------------------

const HEX = Array.from({ length: 256 }, (_, n) => n.toString(16).padStart(2, "0"));

export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // RFC 9562 variant
  const h = Array.from(bytes, (b) => HEX[b]);
  return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
}
