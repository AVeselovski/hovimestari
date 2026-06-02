/* eslint-disable @typescript-eslint/naming-convention */
exports.shorthands = undefined;

const KAAPISTA_GROUP = { id: "kaapista", name: "Kaapista", enabled: true, order: 2, suppress: true };
const KAAPISTA_STAPLES = [
  { id: "k-oljy",     groupId: "kaapista", name: "Öljy",      amount: 1, unit: "plo", category: "pantry", enabled: false },
  { id: "k-suola",    groupId: "kaapista", name: "Suola",     amount: 1, unit: "prk", category: "pantry", enabled: false },
  { id: "k-sokeri",   groupId: "kaapista", name: "Sokeri",    amount: 1, unit: "pss", category: "pantry", enabled: false },
  { id: "k-pippuri",  groupId: "kaapista", name: "Pippuri",   amount: 1, unit: "prk", category: "pantry", enabled: false },
  { id: "k-jauho",    groupId: "kaapista", name: "Jauho",     amount: 1, unit: "pss", category: "pantry", enabled: false },
  { id: "k-mausteet", groupId: "kaapista", name: "Mausteet",  amount: 1, unit: "prk", category: "pantry", enabled: false },
  { id: "k-etikka",   groupId: "kaapista", name: "Etikka",    amount: 1, unit: "plo", category: "pantry", enabled: false },
  { id: "k-voi",      groupId: "kaapista", name: "Voi",       amount: 1, unit: "pkt", category: "dairy",  enabled: false },
];

exports.up = async (pgm) => {
  const { rows } = await pgm.db.query(`SELECT state FROM household_state WHERE id = 1`);
  if (rows.length === 0) return;
  const state = rows[0].state;
  if (!state || typeof state !== "object") return;

  const groups = Array.isArray(state.stapleGroups) ? state.stapleGroups : [];
  const staples = Array.isArray(state.staples) ? state.staples : [];

  // (1) Backfill suppress:false on any group missing the field.
  const backfilled = groups.map((g) =>
    typeof g.suppress === "boolean" ? g : { ...g, suppress: false },
  );

  // (2) Add Kaapista group if absent; pick order = max+1 to avoid collisions.
  let nextGroups = backfilled;
  let nextStaples = staples;
  if (!backfilled.some((g) => g.id === "kaapista")) {
    const maxOrder = backfilled.reduce((m, g) => (g.order > m ? g.order : m), -1);
    nextGroups = [...backfilled, { ...KAAPISTA_GROUP, order: maxOrder + 1 }];
    nextStaples = [...staples, ...KAAPISTA_STAPLES];
  }

  const next = { ...state, stapleGroups: nextGroups, staples: nextStaples };
  await pgm.db.query(
    `UPDATE household_state SET state = $1::jsonb, updated_at = now() WHERE id = 1`,
    [JSON.stringify(next)],
  );
};

exports.down = async (pgm) => {
  const { rows } = await pgm.db.query(`SELECT state FROM household_state WHERE id = 1`);
  if (rows.length === 0) return;
  const state = rows[0].state;
  if (!state || typeof state !== "object") return;
  const groups = (state.stapleGroups ?? []).filter((g) => g.id !== "kaapista").map((g) => {
    const { suppress: _drop, ...rest } = g; // eslint-disable-line @typescript-eslint/no-unused-vars
    return rest;
  });
  const staples = (state.staples ?? []).filter((s) => s.groupId !== "kaapista");
  const next = { ...state, stapleGroups: groups, staples: staples };
  await pgm.db.query(
    `UPDATE household_state SET state = $1::jsonb, updated_at = now() WHERE id = 1`,
    [JSON.stringify(next)],
  );
};
