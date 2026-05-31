/* eslint-disable @typescript-eslint/naming-convention */
exports.shorthands = undefined;

// `down` resets the household_state row back to a pristine empty shape. The
// constant is used only by `down`; `up` no longer relies on string equality
// (see seed gate below — we check for an empty recipes array instead).
const EMPTY_STATE_SENTINEL =
  '{ "recipes": [], "stapleGroups": [], "staples": [], "plan": { "selectedRecipes": [] } }';

const SEED = {
  recipes: [
    {
      id: "lohikeitto",
      name: "Lohikeitto",
      time: 25,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Lohifilee", amount: 400, unit: "g", category: "meat-fish" },
        { name: "Perunoita", amount: 4, unit: "kpl", category: "produce" },
        { name: "Porkkana", amount: 2, unit: "kpl", category: "produce" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Purjo", amount: 0.5, unit: "kpl", category: "produce" },
        { name: "Tilli", amount: 1, unit: "nippu", category: "produce" },
        { name: "Ruokakerma", amount: 2, unit: "dl", category: "dairy" },
        { name: "Kalaliemikuutio", amount: 1, unit: "kpl", category: "pantry" },
      ],
    },
    {
      id: "jauhelihapasta",
      name: "Jauheliha-tomaattipasta",
      time: 20,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Naudan jauheliha", amount: 400, unit: "g", category: "meat-fish" },
        { name: "Pasta (penne tai spaghetti)", amount: 400, unit: "g", category: "pantry" },
        { name: "Tomaattimurska", amount: 1, unit: "tlk", category: "pantry" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Valkosipuli", amount: 2, unit: "kynttä", category: "produce" },
        { name: "Parmesan", amount: 1, unit: "pala", category: "dairy" },
        { name: "Oregano (kuivattu)", amount: 1, unit: "tl", category: "pantry" },
      ],
    },
    {
      id: "kookoscurry",
      name: "Broileri-kookoscurry",
      time: 25,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Broilerin fileesuikale", amount: 400, unit: "g", category: "meat-fish" },
        { name: "Kookosmaito", amount: 1, unit: "tlk", category: "pantry" },
        { name: "Punainen currytahna", amount: 1, unit: "prk", category: "pantry" },
        { name: "Paprika", amount: 1, unit: "kpl", category: "produce" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Basmatiriisi", amount: 3, unit: "dl", category: "pantry" },
        { name: "Limetti", amount: 1, unit: "kpl", category: "produce" },
      ],
    },
    {
      id: "uunilohi",
      name: "Uunilohi & juurekset",
      time: 35,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Lohifilee", amount: 500, unit: "g", category: "meat-fish" },
        { name: "Bataatti", amount: 2, unit: "kpl", category: "produce" },
        { name: "Porkkana", amount: 3, unit: "kpl", category: "produce" },
        { name: "Punasipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Sitruuna", amount: 1, unit: "kpl", category: "produce" },
        { name: "Tilli", amount: 1, unit: "nippu", category: "produce" },
      ],
    },
    {
      id: "tonnikalapasta",
      name: "Tonnikalapasta",
      time: 15,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
        { name: "Tonnikala vedessä", amount: 2, unit: "tlk", category: "pantry" },
        { name: "Tomaattimurska", amount: 1, unit: "tlk", category: "pantry" },
        { name: "Kapris", amount: 1, unit: "prk", category: "pantry" },
        { name: "Valkosipuli", amount: 2, unit: "kynttä", category: "produce" },
        { name: "Persilja", amount: 1, unit: "nippu", category: "produce" },
      ],
    },
    {
      id: "kanapyttipannu",
      name: "Kanapyttipannu",
      time: 25,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Broilerin fileesuikale", amount: 400, unit: "g", category: "meat-fish" },
        { name: "Perunoita", amount: 6, unit: "kpl", category: "produce" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Paprika", amount: 1, unit: "kpl", category: "produce" },
        { name: "Munia (paistettavaksi päälle)", amount: 4, unit: "kpl", category: "dairy" },
        { name: "Punajuuri säilyke", amount: 1, unit: "prk", category: "pantry" },
      ],
    },
    {
      id: "nuudelipannu",
      name: "Aasialainen nuudelipannu",
      time: 20,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Munanuudelit", amount: 250, unit: "g", category: "pantry" },
        { name: "Broilerin fileesuikale", amount: 300, unit: "g", category: "meat-fish" },
        { name: "Parsakaali", amount: 1, unit: "kpl", category: "produce" },
        { name: "Porkkana", amount: 2, unit: "kpl", category: "produce" },
        { name: "Soijakastike", amount: 1, unit: "plo", category: "pantry" },
        { name: "Tuore inkivääri", amount: 1, unit: "pala", category: "produce" },
        { name: "Valkosipuli", amount: 2, unit: "kynttä", category: "produce" },
      ],
    },
    {
      id: "lihapullat",
      name: "Lihapullat & muusi",
      time: 25,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Lihapullat (valmiit)", amount: 1, unit: "pkt", category: "frozen" },
        { name: "Perunoita (muusiin)", amount: 8, unit: "kpl", category: "produce" },
        { name: "Maito", amount: 2, unit: "dl", category: "dairy" },
        { name: "Puolukkahillo", amount: 1, unit: "prk", category: "pantry" },
        { name: "Kurkku", amount: 1, unit: "kpl", category: "produce" },
      ],
    },
    {
      id: "halloumibowl",
      name: "Halloumi-kvinoa-bowl",
      time: 20,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Halloumi", amount: 2, unit: "pkt", category: "dairy" },
        { name: "Kvinoa", amount: 2, unit: "dl", category: "pantry" },
        { name: "Kirsikkatomaatti", amount: 1, unit: "rasia", category: "produce" },
        { name: "Kurkku", amount: 1, unit: "kpl", category: "produce" },
        { name: "Punasipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Sitruuna", amount: 1, unit: "kpl", category: "produce" },
        { name: "Tuore minttu tai persilja", amount: 1, unit: "nippu", category: "produce" },
      ],
    },
    {
      id: "harkisbolo",
      name: "Härkis-bolognese",
      time: 25,
      servings: 4,
      category: "common",
      keepsOvernight: true,
      ingredients: [
        { name: "Härkis", amount: 1, unit: "pkt", category: "frozen" },
        { name: "Tomaattimurska", amount: 1, unit: "tlk", category: "pantry" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Valkosipuli", amount: 2, unit: "kynttä", category: "produce" },
        { name: "Pasta", amount: 400, unit: "g", category: "pantry" },
        { name: "Parmesan", amount: 1, unit: "pala", category: "dairy" },
      ],
    },
    {
      id: "nautafile-punaviini",
      name: "Naudan sisäfilepihvi punaviinikastikkeella & lohkoperunat",
      time: 45,
      servings: 4,
      category: "special",
      ingredients: [
        { name: "Naudan sisäfile", amount: 400, unit: "g", category: "meat-fish" },
        { name: "Perunoita", amount: 6, unit: "kpl", category: "produce" },
        { name: "Voi", amount: 1, unit: "pkt", category: "dairy" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Valkosipuli", amount: 2, unit: "kynttä", category: "produce" },
        { name: "Punaviini", amount: 2, unit: "dl", category: "drinks" },
        { name: "Tuore timjami", amount: 1, unit: "nippu", category: "produce" },
        { name: "Ruokakerma", amount: 1, unit: "dl", category: "dairy" },
      ],
    },
    {
      id: "linguine-vongole",
      name: "Linguine alle vongole",
      time: 30,
      servings: 4,
      category: "special",
      ingredients: [
        { name: "Linguine", amount: 400, unit: "g", category: "pantry" },
        { name: "Sinisimpukat", amount: 1, unit: "kg", category: "meat-fish" },
        { name: "Valkoviini", amount: 2, unit: "dl", category: "drinks" },
        { name: "Valkosipuli", amount: 4, unit: "kynttä", category: "produce" },
        { name: "Persilja", amount: 1, unit: "nippu", category: "produce" },
        { name: "Chili", amount: 1, unit: "kpl", category: "produce" },
        { name: "Oliiviöljy", amount: 1, unit: "plo", category: "pantry" },
        { name: "Sitruuna", amount: 1, unit: "kpl", category: "produce" },
      ],
    },
    {
      id: "tortilla-ilta",
      name: "Tortilla-ilta",
      time: 30,
      servings: 4,
      category: "special",
      ingredients: [
        { name: "Tortillat", amount: 8, unit: "kpl", category: "bakery" },
        { name: "Pulled chicken tai härkis", amount: 400, unit: "g", category: "meat-fish" },
        { name: "Salsa", amount: 1, unit: "prk", category: "pantry" },
        { name: "Avokado", amount: 2, unit: "kpl", category: "produce" },
        { name: "Limetti", amount: 1, unit: "kpl", category: "produce" },
        { name: "Korianteri", amount: 1, unit: "nippu", category: "produce" },
        { name: "Sipuli", amount: 1, unit: "kpl", category: "produce" },
        { name: "Kermaviili", amount: 1, unit: "prk", category: "dairy" },
        { name: "Juustoraaste", amount: 1, unit: "pss", category: "dairy" },
        { name: "Jalapeno-säilyke", amount: 1, unit: "prk", category: "pantry" },
      ],
    },
  ],
  stapleGroups: [
    { id: "weekly", name: "Viikkovakiot", enabled: true, order: 0 },
    { id: "brunch", name: "Brunssi", enabled: true, order: 1 },
  ],
  staples: [
    { id: "w-ruisleipa", groupId: "weekly", name: "Ruisleipä", amount: 1, unit: "pkt", category: "bakery", enabled: true },
    { id: "w-jogurtti", groupId: "weekly", name: "Kreikkalainen jogurtti", amount: 1, unit: "iso prk", category: "dairy", enabled: true },
    { id: "w-banaani", groupId: "weekly", name: "Banaani", amount: 6, unit: "kpl", category: "produce", enabled: true },
    { id: "w-munat", groupId: "weekly", name: "Munat", amount: 10, unit: "kpl", category: "dairy", enabled: true },
    { id: "w-voi", groupId: "weekly", name: "Voi", amount: 1, unit: "pkt", category: "dairy", enabled: true },
    { id: "w-maito", groupId: "weekly", name: "Maito", amount: 1, unit: "l", category: "dairy", enabled: true },
    { id: "w-kahvi", groupId: "weekly", name: "Kahvi", amount: 1, unit: "pss", category: "pantry", enabled: false },
    { id: "b-pekoni", groupId: "brunch", name: "Pekoni", amount: 1, unit: "pkt", category: "meat-fish", enabled: true },
    { id: "b-raakamakkara", groupId: "brunch", name: "Raakamakkara", amount: 1, unit: "pkt", category: "meat-fish", enabled: true },
    { id: "b-croissantit", groupId: "brunch", name: "Croissantit", amount: 4, unit: "kpl", category: "bakery", enabled: true },
    { id: "b-pensasmustikka", groupId: "brunch", name: "Pensasmustikka", amount: 1, unit: "rasia", category: "produce", enabled: true },
    { id: "b-munat", groupId: "brunch", name: "Munat lisää brunssiin", amount: 6, unit: "kpl", category: "dairy", enabled: true },
  ],
  plan: { selectedRecipes: [] },
};

exports.up = (pgm) => {
  // Only seed if the user has not added any recipes yet. This is a semantic
  // proxy for "still pristine, safe to seed" and avoids fragile string
  // equality on the JSONB blob (see review #9).
  pgm.sql(
    `UPDATE household_state
       SET state = '${JSON.stringify(SEED).replace(/'/g, "''")}'::jsonb,
           updated_at = now()
     WHERE id = 1
       AND jsonb_array_length(state->'recipes') = 0`,
  );
};

exports.down = (pgm) => {
  pgm.sql(
    `UPDATE household_state
       SET state = '${EMPTY_STATE_SENTINEL.replace(/'/g, "''")}'::jsonb,
           updated_at = now()
     WHERE id = 1`,
  );
};
