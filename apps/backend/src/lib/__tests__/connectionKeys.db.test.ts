import { expect, it } from "@jest/globals";
import { signUp } from "../../__tests__/support/apiUser.js";
import { describeWithDb } from "../../db/__tests__/support/throwawayDb.js";

// The key path's last-use record on a real Postgres. The lookup says whether
// a use is due to be recorded, worked out in SQL on the database clock, so
// the endpoint writes only when one is. The record never lands on a revoked
// key, even when the revoke comes between the lookup and the write.

await describeWithDb("connectionKeys", (suite) => {
  async function madeKey(): Promise<{ id: string; key: string }> {
    const user = await signUp(suite.client);
    const { generateConnectionKey } = await import("../connectionKeys.js");
    const { key, hash } = generateConnectionKey();
    const { rows } = await suite.client.query(
      `INSERT INTO assistant_connections (user_id, name, key_hash, access, expires_at)
       VALUES ($1, 'Claude', $2, 'read', now() + interval '30 days') RETURNING id`,
      [user.id, hash],
    );
    return { id: rows[0].id as string, key };
  }

  async function lastUsedAt(id: string): Promise<Date | null> {
    const { rows } = await suite.client.query("SELECT last_used_at FROM assistant_connections WHERE id = $1", [id]);
    return rows[0].last_used_at as Date | null;
  }

  async function touchDue(key: string): Promise<boolean | undefined> {
    const { lookupConnectionKey } = await import("../connectionKeys.js");
    const found = await lookupConnectionKey(key);
    return found.state === "active" ? found.connection.touchDue : undefined;
  }

  it("says a use is due on a key never used, not due once recorded, and due again five minutes on", async () => {
    const { touchLastUsed } = await import("../connectionKeys.js");
    const { id, key } = await madeKey();
    expect(await touchDue(key)).toBe(true);

    await touchLastUsed(id);
    expect(await lastUsedAt(id)).not.toBeNull();
    expect(await touchDue(key)).toBe(false);

    await suite.client.query(
      "UPDATE assistant_connections SET last_used_at = now() - interval '4 minutes 59 seconds' WHERE id = $1",
      [id],
    );
    expect(await touchDue(key)).toBe(false);

    await suite.client.query(
      "UPDATE assistant_connections SET last_used_at = now() - interval '5 minutes 1 second' WHERE id = $1",
      [id],
    );
    expect(await touchDue(key)).toBe(true);
  });

  it("records no use on a key revoked between the lookup and the write", async () => {
    const { lookupConnectionKey, touchLastUsed } = await import("../connectionKeys.js");
    const { id, key } = await madeKey();
    const found = await lookupConnectionKey(key);
    expect(found.state).toBe("active");

    await suite.client.query("UPDATE assistant_connections SET revoked_at = now() WHERE id = $1", [id]);
    await touchLastUsed(id);

    expect(await lastUsedAt(id)).toBeNull();
  });
});
