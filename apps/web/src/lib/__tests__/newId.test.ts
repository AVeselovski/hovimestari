import { newId } from "../newId";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Replaces `crypto.randomUUID` for one test. The property is read-only, so a spy cannot. Returns the restore. */
function withRandomUUID(value: (() => string) | undefined): () => void {
  const own = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  Object.defineProperty(crypto, "randomUUID", { value, configurable: true, writable: true });
  return () => {
    if (own) Object.defineProperty(crypto, "randomUUID", own);
    else delete (crypto as { randomUUID?: unknown }).randomUUID;
  };
}

describe("newId", () => {
  it("uses crypto.randomUUID where the browser has it", () => {
    const restore = withRandomUUID(() => "11111111-1111-4111-8111-111111111111");
    try {
      expect(newId()).toBe("11111111-1111-4111-8111-111111111111");
    } finally {
      restore();
    }
  });

  it("builds a well-formed version 4 UUID where randomUUID is missing, as over plain http on a phone", () => {
    const restore = withRandomUUID(undefined);
    try {
      expect(typeof crypto.randomUUID).toBe("undefined");
      const ids = Array.from({ length: 50 }, newId);
      for (const id of ids) expect(id).toMatch(V4);
      expect(new Set(ids).size).toBe(ids.length);
    } finally {
      restore();
    }
    expect(typeof crypto.randomUUID).toBe("function");
  });
});
