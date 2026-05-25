import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Trash2, ShoppingCart, ChefHat, Package, Dices,
  Copy, Check, X, Edit2, Calendar, Sparkles, Clock,
  ArrowLeft, RotateCcw, Coffee
} from 'lucide-react';

// ───────────────────────────────────────────────────────────
// Categories ordered by typical S-Kaupat aisle flow
// ───────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'produce',   label: 'Hedelmät & vihannekset' },
  { id: 'bakery',    label: 'Leipä & leivonnaiset' },
  { id: 'meat-fish', label: 'Liha & kala' },
  { id: 'dairy',     label: 'Maitotuotteet & munat' },
  { id: 'frozen',    label: 'Pakaste' },
  { id: 'pantry',    label: 'Kuivatuotteet & säilykkeet' },
  { id: 'drinks',    label: 'Juomat' },
  { id: 'other',     label: 'Muut' },
];
const CAT_ORDER = CATEGORIES.reduce((a, c, i) => (a[c.id] = i, a), {});

// ───────────────────────────────────────────────────────────
// Seed recipes — quick weeknight, mostly lunch-friendly
// All assumed 4 servings = 2 dinner + 2 lunch carry-over
// ───────────────────────────────────────────────────────────
const SEED_RECIPES = [
  {
    id: 'lohikeitto', name: 'Lohikeitto', time: 25, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Lohifilee', amount: '400', unit: 'g', category: 'meat-fish' },
      { name: 'Perunoita', amount: '4', unit: 'kpl', category: 'produce' },
      { name: 'Porkkana', amount: '2', unit: 'kpl', category: 'produce' },
      { name: 'Sipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Purjo', amount: '0.5', unit: 'kpl', category: 'produce' },
      { name: 'Tilli', amount: '1', unit: 'nippu', category: 'produce' },
      { name: 'Ruokakerma', amount: '2', unit: 'dl', category: 'dairy' },
      { name: 'Kalaliemikuutio', amount: '1', unit: 'kpl', category: 'pantry' },
    ],
  },
  {
    id: 'jauhelihapasta', name: 'Jauheliha-tomaattipasta', time: 20, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Naudan jauheliha', amount: '400', unit: 'g', category: 'meat-fish' },
      { name: 'Pasta (penne tai spaghetti)', amount: '400', unit: 'g', category: 'pantry' },
      { name: 'Tomaattimurska', amount: '1', unit: 'tlk', category: 'pantry' },
      { name: 'Sipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Valkosipuli', amount: '2', unit: 'kynttä', category: 'produce' },
      { name: 'Parmesan', amount: '1', unit: 'pala', category: 'dairy' },
      { name: 'Oregano (kuivattu)', amount: '1', unit: 'tl', category: 'pantry' },
    ],
  },
  {
    id: 'kookoscurry', name: 'Broileri-kookoscurry', time: 25, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Broilerin fileesuikale', amount: '400', unit: 'g', category: 'meat-fish' },
      { name: 'Kookosmaito', amount: '1', unit: 'tlk', category: 'pantry' },
      { name: 'Punainen currytahna', amount: '1', unit: 'prk', category: 'pantry' },
      { name: 'Paprika', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Sipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Basmatiriisi', amount: '3', unit: 'dl', category: 'pantry' },
      { name: 'Limetti', amount: '1', unit: 'kpl', category: 'produce' },
    ],
  },
  {
    id: 'uunilohi', name: 'Uunilohi & juurekset', time: 35, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Lohifilee', amount: '500', unit: 'g', category: 'meat-fish' },
      { name: 'Bataatti', amount: '2', unit: 'kpl', category: 'produce' },
      { name: 'Porkkana', amount: '3', unit: 'kpl', category: 'produce' },
      { name: 'Punasipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Sitruuna', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Tilli', amount: '1', unit: 'nippu', category: 'produce' },
    ],
  },
  {
    id: 'tonnikalapasta', name: 'Tonnikalapasta', time: 15, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Pasta', amount: '400', unit: 'g', category: 'pantry' },
      { name: 'Tonnikala vedessä', amount: '2', unit: 'tlk', category: 'pantry' },
      { name: 'Tomaattimurska', amount: '1', unit: 'tlk', category: 'pantry' },
      { name: 'Kapris', amount: '1', unit: 'prk', category: 'pantry' },
      { name: 'Valkosipuli', amount: '2', unit: 'kynttä', category: 'produce' },
      { name: 'Persilja', amount: '1', unit: 'nippu', category: 'produce' },
    ],
  },
  {
    id: 'kanapyttipannu', name: 'Kanapyttipannu', time: 25, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Broilerin fileesuikale', amount: '400', unit: 'g', category: 'meat-fish' },
      { name: 'Perunoita', amount: '6', unit: 'kpl', category: 'produce' },
      { name: 'Sipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Paprika', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Munia (paistettavaksi päälle)', amount: '4', unit: 'kpl', category: 'dairy' },
      { name: 'Punajuuri säilyke', amount: '1', unit: 'prk', category: 'pantry' },
    ],
  },
  {
    id: 'nuudelipannu', name: 'Aasialainen nuudelipannu', time: 20, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Munanuudelit', amount: '250', unit: 'g', category: 'pantry' },
      { name: 'Broilerin fileesuikale', amount: '300', unit: 'g', category: 'meat-fish' },
      { name: 'Parsakaali', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Porkkana', amount: '2', unit: 'kpl', category: 'produce' },
      { name: 'Soijakastike', amount: '1', unit: 'plo', category: 'pantry' },
      { name: 'Tuore inkivääri', amount: '1', unit: 'pala', category: 'produce' },
      { name: 'Valkosipuli', amount: '2', unit: 'kynttä', category: 'produce' },
    ],
  },
  {
    id: 'lihapullat', name: 'Lihapullat & muusi', time: 25, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Lihapullat (valmiit)', amount: '1', unit: 'pkt', category: 'frozen' },
      { name: 'Perunoita (muusiin)', amount: '8', unit: 'kpl', category: 'produce' },
      { name: 'Maito', amount: '2', unit: 'dl', category: 'dairy' },
      { name: 'Puolukkahillo', amount: '1', unit: 'prk', category: 'pantry' },
      { name: 'Kurkku', amount: '1', unit: 'kpl', category: 'produce' },
    ],
  },
  {
    id: 'halloumibowl', name: 'Halloumi-kvinoa-bowl', time: 20, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Halloumi', amount: '2', unit: 'pkt', category: 'dairy' },
      { name: 'Kvinoa', amount: '2', unit: 'dl', category: 'pantry' },
      { name: 'Kirsikkatomaatti', amount: '1', unit: 'rasia', category: 'produce' },
      { name: 'Kurkku', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Punasipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Sitruuna', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Tuore minttu tai persilja', amount: '1', unit: 'nippu', category: 'produce' },
    ],
  },
  {
    id: 'harkisbolo', name: 'Härkis-bolognese', time: 25, lunchFriendly: true, servings: 4,
    ingredients: [
      { name: 'Härkis', amount: '1', unit: 'pkt', category: 'frozen' },
      { name: 'Tomaattimurska', amount: '1', unit: 'tlk', category: 'pantry' },
      { name: 'Sipuli', amount: '1', unit: 'kpl', category: 'produce' },
      { name: 'Valkosipuli', amount: '2', unit: 'kynttä', category: 'produce' },
      { name: 'Pasta', amount: '400', unit: 'g', category: 'pantry' },
      { name: 'Parmesan', amount: '1', unit: 'pala', category: 'dairy' },
    ],
  },
];

const SEED_STAPLES = [
  { id: 's1', name: 'Ruisleipä', amount: '1', unit: 'pkt', category: 'bakery',  enabled: true,  weekend: false },
  { id: 's2', name: 'Kreikkalainen jogurtti', amount: '1', unit: 'iso prk', category: 'dairy', enabled: true, weekend: false },
  { id: 's3', name: 'Banaani',     amount: '6', unit: 'kpl', category: 'produce', enabled: true,  weekend: false },
  { id: 's4', name: 'Munat',       amount: '10', unit: 'kpl', category: 'dairy', enabled: true,  weekend: false },
  { id: 's5', name: 'Voi',         amount: '1', unit: 'pkt', category: 'dairy',  enabled: true,  weekend: false },
  { id: 's6', name: 'Maito',       amount: '1', unit: 'l',  category: 'dairy',  enabled: true,  weekend: false },
  { id: 's7', name: 'Kahvi',       amount: '1', unit: 'pss', category: 'pantry', enabled: false, weekend: false },
  // Weekend brunch
  { id: 'b1', name: 'Pekoni',          amount: '1', unit: 'pkt', category: 'meat-fish', enabled: true, weekend: true },
  { id: 'b2', name: 'Raakamakkara',    amount: '1', unit: 'pkt', category: 'meat-fish', enabled: true, weekend: true },
  { id: 'b3', name: 'Croissantit',     amount: '4', unit: 'kpl', category: 'bakery',    enabled: true, weekend: true },
  { id: 'b4', name: 'Pensasmustikka',  amount: '1', unit: 'rasia', category: 'produce', enabled: true, weekend: true },
  { id: 'b5', name: 'Munat (brunssiin lisää)', amount: '6', unit: 'kpl', category: 'dairy', enabled: true, weekend: true },
];

const DEFAULT_PLAN = {
  selectedRecipeIds: [],
  includeWeekendBrunch: true,
  weekendDinners: 0,
};

const STORAGE_KEY = 'meal-planner-state-v1';

// ───────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 9);
const catLabel = (id) => CATEGORIES.find(c => c.id === id)?.label || 'Muut';

export default function MealPlanner() {
  const [tab, setTab] = useState('plan');
  const [recipes, setRecipes] = useState(SEED_RECIPES);
  const [staples, setStaples] = useState(SEED_STAPLES);
  const [plan, setPlan]       = useState(DEFAULT_PLAN);
  const [loaded, setLoaded]   = useState(false);
  const [editingRecipe, setEditingRecipe] = useState(null);
  const [copied, setCopied]   = useState(false);
  const [checked, setChecked] = useState({}); // shopping list checkmarks

  // Load from persistent storage on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        if (res?.value) {
          const data = JSON.parse(res.value);
          if (data.recipes) setRecipes(data.recipes);
          if (data.staples) setStaples(data.staples);
          if (data.plan)    setPlan(data.plan);
        }
      } catch (e) { /* first run, no state yet */ }
      setLoaded(true);
    })();
  }, []);

  // Persist on changes (only after initial load)
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        await window.storage.set(STORAGE_KEY, JSON.stringify({ recipes, staples, plan }));
      } catch (e) { console.error('Save failed', e); }
    })();
  }, [recipes, staples, plan, loaded]);

  // ── Recipe ops ─────────────────────────────────────
  const toggleRecipe = (id) => {
    setPlan(p => ({
      ...p,
      selectedRecipeIds: p.selectedRecipeIds.includes(id)
        ? p.selectedRecipeIds.filter(x => x !== id)
        : [...p.selectedRecipeIds, id],
    }));
  };

  const shufflePick = () => {
    const pool = recipes.filter(r => r.lunchFriendly);
    if (pool.length < 2) return;
    // Sort by lastUsed (never-used first, then oldest)
    const ranked = [...pool].sort((a, b) => {
      const ta = a.lastUsed ? new Date(a.lastUsed).getTime() : 0;
      const tb = b.lastUsed ? new Date(b.lastUsed).getTime() : 0;
      return ta - tb;
    });
    // Take the oldest 5 and pick 2 randomly for some variety
    const candidates = ranked.slice(0, Math.min(5, ranked.length));
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    setPlan(p => ({ ...p, selectedRecipeIds: shuffled.slice(0, 2).map(r => r.id) }));
  };

  const markCooked = () => {
    const now = new Date().toISOString();
    setRecipes(rs => rs.map(r => plan.selectedRecipeIds.includes(r.id) ? { ...r, lastUsed: now } : r));
    setPlan(DEFAULT_PLAN);
    setChecked({});
    setTab('plan');
  };

  const deleteRecipe = (id) => {
    if (!confirm('Poista resepti?')) return;
    setRecipes(rs => rs.filter(r => r.id !== id));
    setPlan(p => ({ ...p, selectedRecipeIds: p.selectedRecipeIds.filter(x => x !== id) }));
  };

  const saveRecipe = (recipe) => {
    if (recipe.id && recipes.find(r => r.id === recipe.id)) {
      setRecipes(rs => rs.map(r => r.id === recipe.id ? recipe : r));
    } else {
      setRecipes(rs => [...rs, { ...recipe, id: uid() }]);
    }
    setEditingRecipe(null);
  };

  // ── Staple ops ─────────────────────────────────────
  const toggleStaple = (id) =>
    setStaples(ss => ss.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s));
  const updateStaple = (id, patch) =>
    setStaples(ss => ss.map(s => s.id === id ? { ...s, ...patch } : s));
  const deleteStaple = (id) =>
    setStaples(ss => ss.filter(s => s.id !== id));
  const addStaple = (weekend) =>
    setStaples(ss => [...ss, { id: uid(), name: 'Uusi tuote', amount: '1', unit: 'kpl', category: 'other', enabled: true, weekend }]);

  // ── Build shopping list ────────────────────────────
  const shoppingList = useMemo(() => {
    const items = [];
    // Staples
    staples.forEach(s => {
      if (!s.enabled) return;
      if (s.weekend && !plan.includeWeekendBrunch) return;
      items.push({ name: s.name, amount: s.amount, unit: s.unit, category: s.category, source: s.weekend ? '🥐' : '⭐' });
    });
    // Recipe ingredients
    plan.selectedRecipeIds.forEach(rid => {
      const r = recipes.find(rr => rr.id === rid);
      if (!r) return;
      r.ingredients.forEach(ing => {
        items.push({ ...ing, source: r.name });
      });
    });
    // Merge by lower-cased name + category
    const merged = {};
    items.forEach(it => {
      const key = `${it.category}::${it.name.toLowerCase().trim()}`;
      if (merged[key]) {
        merged[key].amount = `${merged[key].amount} + ${it.amount}`;
        merged[key].sources.add(it.source);
      } else {
        merged[key] = { ...it, sources: new Set([it.source]) };
      }
    });
    // Group by category in S-Kaupat order
    const grouped = CATEGORIES.map(c => ({
      ...c,
      items: Object.values(merged).filter(it => it.category === c.id).sort((a, b) => a.name.localeCompare(b.name, 'fi')),
    })).filter(g => g.items.length > 0);
    return grouped;
  }, [plan, recipes, staples]);

  const totalItems = shoppingList.reduce((sum, g) => sum + g.items.length, 0);

  const copyList = async () => {
    const txt = shoppingList.map(g =>
      `${g.label.toUpperCase()}\n${g.items.map(it => `  ☐ ${it.name} — ${it.amount} ${it.unit}`).join('\n')}`
    ).join('\n\n');
    try {
      await navigator.clipboard.writeText(txt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* fallback omitted */ }
  };

  const selectedRecipes = plan.selectedRecipeIds.map(id => recipes.find(r => r.id === id)).filter(Boolean);

  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen w-full font-body" style={styles.app}>
      <style>{globalCSS}</style>

      {/* Header */}
      <header className="px-5 pt-7 pb-4">
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="font-display text-3xl leading-none tracking-tight" style={{color: 'var(--ink)'}}>
              Kauppalista<span style={{color: 'var(--berry)'}}>.</span>
            </h1>
            <p className="text-xs tracking-widest uppercase mt-1.5" style={{color: 'var(--muted)', letterSpacing: '0.15em'}}>
              Torstain toimitus · S-Kaupat
            </p>
          </div>
          <Coffee size={22} style={{color: 'var(--ink)'}} strokeWidth={1.5} />
        </div>
        <div className="mt-4 h-px" style={{background: 'repeating-linear-gradient(to right, var(--rule) 0 4px, transparent 4px 8px)'}} />
      </header>

      {/* Content */}
      <main className="px-5 pb-32">
        {tab === 'plan'    && <PlanTab plan={plan} setPlan={setPlan} recipes={recipes} selectedRecipes={selectedRecipes} toggleRecipe={toggleRecipe} shufflePick={shufflePick} go={setTab} />}
        {tab === 'recipes' && <RecipesTab recipes={recipes} onEdit={setEditingRecipe} onDelete={deleteRecipe} onNew={() => setEditingRecipe({ name: '', time: 20, lunchFriendly: true, servings: 4, ingredients: [] })} />}
        {tab === 'staples' && <StaplesTab staples={staples} toggleStaple={toggleStaple} updateStaple={updateStaple} deleteStaple={deleteStaple} addStaple={addStaple} />}
        {tab === 'list'    && <ListTab list={shoppingList} totalItems={totalItems} checked={checked} setChecked={setChecked} copyList={copyList} copied={copied} markCooked={markCooked} selectedRecipes={selectedRecipes} brunch={plan.includeWeekendBrunch} />}
      </main>

      {/* Edit recipe modal */}
      {editingRecipe && (
        <RecipeEditor
          initial={editingRecipe}
          onSave={saveRecipe}
          onCancel={() => setEditingRecipe(null)}
        />
      )}

      {/* Bottom tab bar */}
      <nav className="fixed bottom-0 inset-x-0 border-t" style={{background: 'var(--paper)', borderColor: 'var(--rule)'}}>
        <div className="grid grid-cols-4">
          <TabBtn icon={Calendar}    label="Suunnitelma"  active={tab === 'plan'}    onClick={() => setTab('plan')} />
          <TabBtn icon={ChefHat}     label="Reseptit"     active={tab === 'recipes'} onClick={() => setTab('recipes')} />
          <TabBtn icon={Package}     label="Vakiot"       active={tab === 'staples'} onClick={() => setTab('staples')} />
          <TabBtn icon={ShoppingCart} label="Lista" badge={totalItems} active={tab === 'list'} onClick={() => setTab('list')} />
        </div>
      </nav>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PLAN TAB
// ═══════════════════════════════════════════════════════════
function PlanTab({ plan, setPlan, recipes, selectedRecipes, toggleRecipe, shufflePick, go }) {
  const lunchFriendly = recipes.filter(r => r.lunchFriendly);
  const otherRecipes  = recipes.filter(r => !r.lunchFriendly);

  return (
    <div className="space-y-6 mt-2">
      {/* Hero / shuffle */}
      <section className="rounded-2xl p-5 relative overflow-hidden" style={{background: 'var(--ink)', color: 'var(--paper)'}}>
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-[0.2em] opacity-70">Tämän viikon valinnat</p>
          <p className="font-display text-5xl mt-1 leading-none">{selectedRecipes.length}<span className="opacity-40 text-2xl"> / 2</span></p>
          <button
            onClick={shufflePick}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm transition active:scale-95"
            style={{background: 'var(--berry)', color: 'var(--paper)'}}
          >
            <Dices size={16} />
            Arvo minulle
          </button>
        </div>
        <Sparkles size={120} className="absolute -right-6 -bottom-6 opacity-10" strokeWidth={1} />
      </section>

      {/* Selected recipes */}
      {selectedRecipes.length > 0 && (
        <section>
          <SectionHead>Valitut</SectionHead>
          <div className="space-y-2 mt-2">
            {selectedRecipes.map(r => (
              <SelectedCard key={r.id} recipe={r} onRemove={() => toggleRecipe(r.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Weekend toggles */}
      <section className="space-y-2">
        <SectionHead>Viikonloppu</SectionHead>
        <Toggle
          label="Brunssiainekset (lauantai & sunnuntai)"
          sub="Pekoni, raakamakkara, croissantit, pensasmustikka, lisää munia"
          checked={plan.includeWeekendBrunch}
          onChange={() => setPlan(p => ({ ...p, includeWeekendBrunch: !p.includeWeekendBrunch }))}
        />
      </section>

      {/* Recipe list */}
      <section>
        <SectionHead>Reseptit · Lounaaksi sopivat</SectionHead>
        <div className="grid grid-cols-2 gap-2 mt-2">
          {lunchFriendly.map(r => (
            <RecipeChip key={r.id} recipe={r} selected={plan.selectedRecipeIds.includes(r.id)} onClick={() => toggleRecipe(r.id)} />
          ))}
        </div>
        {otherRecipes.length > 0 && (
          <>
            <SectionHead className="mt-5">Muut</SectionHead>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {otherRecipes.map(r => (
                <RecipeChip key={r.id} recipe={r} selected={plan.selectedRecipeIds.includes(r.id)} onClick={() => toggleRecipe(r.id)} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* CTA to list */}
      <button
        onClick={() => go('list')}
        className="w-full py-4 rounded-2xl flex items-center justify-center gap-2 text-sm tracking-wide transition active:scale-[0.98]"
        style={{background: 'var(--ink)', color: 'var(--paper)'}}
      >
        <ShoppingCart size={18} />
        Katso kauppalista
      </button>
    </div>
  );
}

function SelectedCard({ recipe, onRemove }) {
  return (
    <div className="rounded-xl p-3 flex items-center justify-between border" style={{background: 'var(--paper-2)', borderColor: 'var(--rule)'}}>
      <div className="min-w-0">
        <p className="font-display text-lg leading-tight truncate">{recipe.name}</p>
        <p className="text-xs flex items-center gap-1 mt-0.5" style={{color: 'var(--muted)'}}>
          <Clock size={11}/> {recipe.time} min · {recipe.servings} ann
        </p>
      </div>
      <button onClick={onRemove} className="p-2 rounded-full" style={{color: 'var(--muted)'}}>
        <X size={16}/>
      </button>
    </div>
  );
}

function RecipeChip({ recipe, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left p-3 rounded-xl border transition relative"
      style={{
        background: selected ? 'var(--ink)' : 'var(--paper-2)',
        color: selected ? 'var(--paper)' : 'var(--ink)',
        borderColor: selected ? 'var(--ink)' : 'var(--rule)',
      }}
    >
      <p className="font-display text-[15px] leading-tight">{recipe.name}</p>
      <p className="text-[11px] mt-1 opacity-70 flex items-center gap-1">
        <Clock size={10}/> {recipe.time} min
      </p>
      {selected && <Check size={14} className="absolute top-2 right-2" />}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// RECIPES TAB
// ═══════════════════════════════════════════════════════════
function RecipesTab({ recipes, onEdit, onDelete, onNew }) {
  return (
    <div className="space-y-3 mt-2">
      <div className="flex items-center justify-between">
        <SectionHead>Kaikki reseptit · {recipes.length}</SectionHead>
        <button onClick={onNew} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{background: 'var(--ink)', color: 'var(--paper)'}}>
          <Plus size={14}/> Uusi
        </button>
      </div>
      {recipes.map(r => (
        <div key={r.id} className="rounded-xl p-4 border" style={{background: 'var(--paper-2)', borderColor: 'var(--rule)'}}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-lg leading-tight">{r.name}</p>
              <p className="text-xs mt-1" style={{color: 'var(--muted)'}}>
                {r.time} min · {r.servings} annosta · {r.ingredients.length} ainesta
                {r.lunchFriendly && <> · <span style={{color: 'var(--berry)'}}>sopii lounaaksi</span></>}
              </p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => onEdit(r)} className="p-2 rounded-lg" style={{color: 'var(--muted)'}}><Edit2 size={15}/></button>
              <button onClick={() => onDelete(r.id)} className="p-2 rounded-lg" style={{color: 'var(--muted)'}}><Trash2 size={15}/></button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// STAPLES TAB
// ═══════════════════════════════════════════════════════════
function StaplesTab({ staples, toggleStaple, updateStaple, deleteStaple, addStaple }) {
  const weekly  = staples.filter(s => !s.weekend);
  const weekend = staples.filter(s => s.weekend);

  return (
    <div className="space-y-6 mt-2">
      <StapleGroup
        title="Viikkovakiot"
        sub="Joka torstain toimituksessa"
        items={weekly}
        toggleStaple={toggleStaple}
        updateStaple={updateStaple}
        deleteStaple={deleteStaple}
        onAdd={() => addStaple(false)}
      />
      <StapleGroup
        title="Brunssi-vakiot"
        sub="Mukana vain kun brunssi on päällä"
        items={weekend}
        toggleStaple={toggleStaple}
        updateStaple={updateStaple}
        deleteStaple={deleteStaple}
        onAdd={() => addStaple(true)}
      />
    </div>
  );
}

function StapleGroup({ title, sub, items, toggleStaple, updateStaple, deleteStaple, onAdd }) {
  return (
    <section>
      <div className="flex items-center justify-between">
        <div>
          <SectionHead>{title}</SectionHead>
          <p className="text-[11px] mt-0.5" style={{color: 'var(--muted)'}}>{sub}</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full" style={{background: 'var(--ink)', color: 'var(--paper)'}}>
          <Plus size={14}/> Lisää
        </button>
      </div>
      <div className="mt-2 space-y-1.5">
        {items.map(s => (
          <StapleRow key={s.id} s={s} toggleStaple={toggleStaple} updateStaple={updateStaple} deleteStaple={deleteStaple} />
        ))}
      </div>
    </section>
  );
}

function StapleRow({ s, toggleStaple, updateStaple, deleteStaple }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-xl p-3 border space-y-2" style={{background: 'var(--paper-2)', borderColor: 'var(--ink)'}}>
        <input className="w-full px-3 py-2 rounded-lg border bg-transparent text-sm" style={{borderColor: 'var(--rule)'}}
          value={s.name} onChange={e => updateStaple(s.id, { name: e.target.value })} placeholder="Nimi" />
        <div className="grid grid-cols-3 gap-2">
          <input className="px-3 py-2 rounded-lg border bg-transparent text-sm" style={{borderColor: 'var(--rule)'}}
            value={s.amount} onChange={e => updateStaple(s.id, { amount: e.target.value })} placeholder="Määrä" />
          <input className="px-3 py-2 rounded-lg border bg-transparent text-sm" style={{borderColor: 'var(--rule)'}}
            value={s.unit} onChange={e => updateStaple(s.id, { unit: e.target.value })} placeholder="Yksikkö" />
          <select className="px-2 py-2 rounded-lg border bg-transparent text-xs" style={{borderColor: 'var(--rule)'}}
            value={s.category} onChange={e => updateStaple(s.id, { category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => setEditing(false)} className="flex-1 py-2 rounded-lg text-sm" style={{background: 'var(--ink)', color: 'var(--paper)'}}>Valmis</button>
          <button onClick={() => { if (confirm('Poista?')) deleteStaple(s.id); }} className="px-3 py-2 rounded-lg" style={{color: 'var(--berry)'}}><Trash2 size={15}/></button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl p-3 border flex items-center gap-3" style={{background: s.enabled ? 'var(--paper-2)' : 'transparent', borderColor: 'var(--rule)', opacity: s.enabled ? 1 : 0.5}}>
      <button onClick={() => toggleStaple(s.id)} className="w-5 h-5 rounded border flex items-center justify-center shrink-0" style={{borderColor: 'var(--ink)', background: s.enabled ? 'var(--ink)' : 'transparent'}}>
        {s.enabled && <Check size={13} style={{color: 'var(--paper)'}}/>}
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{s.name}</p>
        <p className="text-[11px]" style={{color: 'var(--muted)'}}>{s.amount} {s.unit} · {catLabel(s.category)}</p>
      </div>
      <button onClick={() => setEditing(true)} className="p-1.5" style={{color: 'var(--muted)'}}><Edit2 size={14}/></button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LIST TAB
// ═══════════════════════════════════════════════════════════
function ListTab({ list, totalItems, checked, setChecked, copyList, copied, markCooked, selectedRecipes, brunch }) {
  if (totalItems === 0) {
    return (
      <div className="text-center mt-16">
        <ShoppingCart size={48} strokeWidth={1} className="mx-auto" style={{color: 'var(--muted)'}} />
        <p className="font-display text-2xl mt-4">Lista on tyhjä</p>
        <p className="text-sm mt-2" style={{color: 'var(--muted)'}}>Valitse reseptejä tai vakioita.</p>
      </div>
    );
  }

  const toggle = (key) => setChecked(c => ({ ...c, [key]: !c[key] }));

  return (
    <div className="space-y-5 mt-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-2xl leading-none">{totalItems} <span className="text-base opacity-50">tuotetta</span></p>
          <p className="text-[11px] mt-1" style={{color: 'var(--muted)'}}>
            {selectedRecipes.length} reseptiä{brunch ? ' · brunssi mukana' : ''}
          </p>
        </div>
        <button onClick={copyList} className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-full border" style={{borderColor: 'var(--ink)', color: 'var(--ink)'}}>
          {copied ? <><Check size={14}/> Kopioitu</> : <><Copy size={14}/> Kopioi</>}
        </button>
      </div>

      {list.map(group => (
        <section key={group.id}>
          <p className="text-[10px] uppercase tracking-[0.2em] pb-2 border-b" style={{color: 'var(--berry)', borderColor: 'var(--rule)'}}>
            {group.label}
          </p>
          <ul className="mt-1 font-mono">
            {group.items.map((it, i) => {
              const key = `${group.id}::${it.name}::${i}`;
              const isChecked = checked[key];
              return (
                <li key={key} onClick={() => toggle(key)} className="flex items-center gap-3 py-2.5 border-b cursor-pointer" style={{borderColor: 'var(--rule)'}}>
                  <span className="w-4 h-4 rounded-sm border flex items-center justify-center shrink-0" style={{borderColor: 'var(--ink)', background: isChecked ? 'var(--ink)' : 'transparent'}}>
                    {isChecked && <Check size={11} style={{color: 'var(--paper)'}}/>}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight ${isChecked ? 'line-through opacity-50' : ''}`}>{it.name}</p>
                  </div>
                  <p className="text-xs tabular-nums" style={{color: 'var(--muted)'}}>{it.amount} {it.unit}</p>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {/* Mark cooked button */}
      {selectedRecipes.length > 0 && (
        <button onClick={markCooked} className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 text-sm border-2 border-dashed mt-6" style={{borderColor: 'var(--ink)', color: 'var(--ink)'}}>
          <RotateCcw size={16}/>
          Viikko valmis — nollaa
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// RECIPE EDITOR MODAL
// ═══════════════════════════════════════════════════════════
function RecipeEditor({ initial, onSave, onCancel }) {
  const [r, setR] = useState({
    ingredients: [],
    ...initial,
  });

  const updateIng = (idx, patch) => {
    setR(rr => ({ ...rr, ingredients: rr.ingredients.map((ing, i) => i === idx ? { ...ing, ...patch } : ing) }));
  };
  const addIng = () => setR(rr => ({ ...rr, ingredients: [...rr.ingredients, { name: '', amount: '', unit: '', category: 'pantry' }] }));
  const removeIng = (idx) => setR(rr => ({ ...rr, ingredients: rr.ingredients.filter((_, i) => i !== idx) }));

  const canSave = r.name.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{background: 'var(--paper)'}}>
      <header className="px-5 py-4 flex items-center justify-between border-b" style={{borderColor: 'var(--rule)'}}>
        <button onClick={onCancel} className="flex items-center gap-1 text-sm" style={{color: 'var(--ink)'}}>
          <ArrowLeft size={16}/> Takaisin
        </button>
        <p className="font-display text-lg">{initial.id ? 'Muokkaa' : 'Uusi resepti'}</p>
        <button onClick={() => canSave && onSave(r)} disabled={!canSave} className="text-sm px-3 py-1.5 rounded-full" style={{background: canSave ? 'var(--ink)' : 'var(--rule)', color: 'var(--paper)'}}>
          Tallenna
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5 pb-24">
        <Field label="Nimi">
          <input className="w-full px-3 py-2.5 rounded-lg border bg-transparent" style={{borderColor: 'var(--rule)'}}
            value={r.name} onChange={e => setR({ ...r, name: e.target.value })} placeholder="Esim. Kasviscurry"/>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Aika (min)">
            <input type="number" className="w-full px-3 py-2.5 rounded-lg border bg-transparent" style={{borderColor: 'var(--rule)'}}
              value={r.time} onChange={e => setR({ ...r, time: parseInt(e.target.value) || 0 })}/>
          </Field>
          <Field label="Annoksia">
            <input type="number" className="w-full px-3 py-2.5 rounded-lg border bg-transparent" style={{borderColor: 'var(--rule)'}}
              value={r.servings} onChange={e => setR({ ...r, servings: parseInt(e.target.value) || 0 })}/>
          </Field>
        </div>
        <label className="flex items-center gap-3">
          <button onClick={() => setR({ ...r, lunchFriendly: !r.lunchFriendly })} className="w-5 h-5 rounded border flex items-center justify-center" style={{borderColor: 'var(--ink)', background: r.lunchFriendly ? 'var(--ink)' : 'transparent'}}>
            {r.lunchFriendly && <Check size={13} style={{color: 'var(--paper)'}}/>}
          </button>
          <span className="text-sm">Sopii myös lounaaksi (kestää yön yli)</span>
        </label>

        <div>
          <div className="flex items-center justify-between mb-2">
            <SectionHead>Ainekset</SectionHead>
            <button onClick={addIng} className="text-xs px-3 py-1.5 rounded-full" style={{background: 'var(--ink)', color: 'var(--paper)'}}>
              <Plus size={12} className="inline -mt-0.5"/> Aines
            </button>
          </div>
          <div className="space-y-2">
            {r.ingredients.map((ing, i) => (
              <div key={i} className="rounded-lg border p-2 space-y-2" style={{borderColor: 'var(--rule)'}}>
                <input className="w-full px-2 py-1.5 rounded border bg-transparent text-sm" style={{borderColor: 'var(--rule)'}}
                  placeholder="Aineksen nimi" value={ing.name} onChange={e => updateIng(i, { name: e.target.value })} />
                <div className="grid grid-cols-[1fr_1fr_2fr_auto] gap-1.5">
                  <input className="px-2 py-1.5 rounded border bg-transparent text-sm" style={{borderColor: 'var(--rule)'}}
                    placeholder="Määrä" value={ing.amount} onChange={e => updateIng(i, { amount: e.target.value })} />
                  <input className="px-2 py-1.5 rounded border bg-transparent text-sm" style={{borderColor: 'var(--rule)'}}
                    placeholder="Yks." value={ing.unit} onChange={e => updateIng(i, { unit: e.target.value })} />
                  <select className="px-1 py-1.5 rounded border bg-transparent text-xs" style={{borderColor: 'var(--rule)'}}
                    value={ing.category} onChange={e => updateIng(i, { category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <button onClick={() => removeIng(i)} className="p-1.5" style={{color: 'var(--berry)'}}><X size={14}/></button>
                </div>
              </div>
            ))}
            {r.ingredients.length === 0 && (
              <p className="text-xs text-center py-4" style={{color: 'var(--muted)'}}>Ei vielä aineksia.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Shared bits
// ═══════════════════════════════════════════════════════════
function SectionHead({ children, className = '' }) {
  return <p className={`text-[10px] uppercase tracking-[0.2em] ${className}`} style={{color: 'var(--ink)'}}>{children}</p>;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.2em] block mb-1" style={{color: 'var(--muted)'}}>{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, sub, checked, onChange }) {
  return (
    <button onClick={onChange} className="w-full rounded-xl p-3 border flex items-center gap-3 text-left" style={{background: 'var(--paper-2)', borderColor: 'var(--rule)'}}>
      <div className="w-10 h-6 rounded-full p-0.5 shrink-0 transition" style={{background: checked ? 'var(--ink)' : 'var(--rule)'}}>
        <div className="w-5 h-5 rounded-full transition" style={{background: 'var(--paper)', transform: checked ? 'translateX(16px)' : 'translateX(0)'}} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {sub && <p className="text-[11px]" style={{color: 'var(--muted)'}}>{sub}</p>}
      </div>
    </button>
  );
}

function TabBtn({ icon: Icon, label, active, onClick, badge }) {
  return (
    <button onClick={onClick} className="py-3 flex flex-col items-center gap-0.5 relative" style={{color: active ? 'var(--ink)' : 'var(--muted)'}}>
      <Icon size={20} strokeWidth={active ? 2 : 1.5}/>
      <span className="text-[10px] tracking-wide">{label}</span>
      {badge > 0 && (
        <span className="absolute top-1.5 right-1/2 translate-x-3 text-[9px] min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center" style={{background: 'var(--berry)', color: 'var(--paper)'}}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════
const styles = {
  app: {
    background: 'var(--paper)',
    color: 'var(--ink)',
    minHeight: '100vh',
  },
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,400;9..144,500;9..144,700&family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
  :root {
    --paper:   #f6efe1;
    --paper-2: #efe6d2;
    --ink:     #1d2e22;
    --berry:   #a13838;
    --muted:   #7a6e58;
    --rule:    #d8c9aa;
  }
  body { font-family: 'Instrument Sans', system-ui, sans-serif; }
  .font-display { font-family: 'Fraunces', Georgia, serif; font-optical-sizing: auto; }
  .font-body    { font-family: 'Instrument Sans', system-ui, sans-serif; }
  .font-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }
  * { -webkit-tap-highlight-color: transparent; }
  input, select { font-family: inherit; color: var(--ink); }
  input:focus, select:focus { outline: 2px solid var(--ink); outline-offset: -1px; }
`;
