/* eslint-disable @typescript-eslint/naming-convention */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE household_state (
      id          INT PRIMARY KEY DEFAULT 1,
      state       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT singleton CHECK (id = 1)
    );
  `);

  pgm.sql(`
    INSERT INTO household_state (id, state, updated_at)
    VALUES (
      1,
      '{ "recipes": [], "stapleGroups": [], "staples": [], "plan": { "selectedRecipes": [] } }'::jsonb,
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS household_state;`);
};
