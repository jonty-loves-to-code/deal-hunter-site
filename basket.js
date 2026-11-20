// Shopping-list maths for the phone site (pure functions; tests/test_basket.py runs them in node).
//
// For each list item and each store we pick, in order:
//   chosen  - the product itself (if it's from that store)
//   same    - the identical product at that store (cross-store `match` group)
//   similar - that store's cheapest comparable item: same subcategory, sharing at least half the item's
//             "type" words, and a comparable amount. Its cost is scaled to the chosen item's amount, so
//             a 400g pack is compared fairly with a 500g one.

export const STORES = ["coles", "woolworths", "aldi"];

const FILLER = new Set(["no", "the", "and", "with", "in", "of", "pack", "pk", "x", "each", "ea", "value", "size",
  "approx", "per", "kg", "g", "ml", "l", "loose", "prepacked", "punnet", "bag", "tin", "can", "jar", "bottle",
  // too generic to tell products apart (spaghetti vs penne, jasmine vs long grain), and store-brand tiers
  "pasta", "rice", "fresh", "simply", "essentials", "macro", "finest", "select"]);

export function typeWords(p) {
  if (p._tw) return p._tw;
  const brand = new Set((p.brand || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
  const words = p.name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").split(" ")
    .filter((w) => w && !/^\d/.test(w) && !FILLER.has(w) && !brand.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));
  p._tw = [...new Set(words)];
  return p._tw;
}

// store|subcategory -> products, built once.
export function makeIndex(P) {
  const idx = new Map();
  for (const p of P) {
    if (p.sub < 0) continue;
    const k = `${p.store}|${p.sub}`;
    if (!idx.has(k)) idx.set(k, []);
    idx.get(k).push(p);
  }
  return idx;
}

// What the chosen item's amount would cost if bought as product q (null if not comparable).
export function scaledCost(item, q) {
  if (item.qty && q.qty && item.qunit && item.qunit === q.qunit) {
    const ratio = q.qty / item.qty;
    if (ratio < 0.65 || ratio > 1.35) return null;
    return { cost: q.price / ratio, scaled: Math.abs(ratio - 1) > 0.001 };
  }
  // No usable pack size (e.g. produce sold each or per kg): compare on unit price.
  if (item.up && q.up && item.um && item.um === q.um) {
    return { cost: (q.up / item.up) * item.price, scaled: true };
  }
  return null;
}

function similarAt(item, idx, store, twins) {
  const words = typeWords(item);
  // Look in the item's subcategory and its twins' (stores file the same product differently).
  const subs = new Set([item.sub, ...twins.map((q) => q.sub)].filter((s) => s >= 0));
  if (!words.length || !subs.size) return null;
  let best = null;
  for (const q of [...subs].flatMap((s) => idx.get(`${store}|${s}`) || [])) {
    const qw = new Set(typeWords(q));
    // short names must match fully (peeled tomatoes != diced tomatoes); longer ones need half their words
    const need = words.length <= 2 ? words.length : Math.ceil(words.length / 2);
    if (words.filter((w) => qw.has(w)).length < need) continue;
    const c = scaledCost(item, q);
    if (c && (!best || c.cost < best.cost)) best = { p: q, kind: "similar", cost: c.cost, scaled: c.scaled };
  }
  return best;
}

// { store: {p, kind, cost, scaled} } for each store that has an option.
export function equivalents(item, M, idx, stores = STORES) {
  const twins = item.match >= 0 && M.has(item.match) ? M.get(item.match) : [item];
  const out = {};
  for (const s of stores) {
    if (item.store === s) { out[s] = { p: item, kind: "chosen", cost: item.price, scaled: false }; continue; }
    const twin = twins.find((q) => q.store === s);
    if (twin) { out[s] = { p: twin, kind: "same", cost: twin.price, scaled: false }; continue; }
    const sim = similarAt(item, idx, s, twins);
    if (sim) out[s] = sim;
  }
  return out;
}

// lines: [{item, qty}] -> per-item options, one-shop totals per store, and the cheapest split.
export function basket(lines, M, idx, stores = STORES) {
  const rows = lines.map(({ item, qty }) => {
    const options = equivalents(item, M, idx, stores);
    const ranked = Object.entries(options).sort((a, b) => a[1].cost - b[1].cost);
    return { item, qty, options, cheapest: ranked.length ? ranked[0][0] : null };
  });
  const totals = Object.fromEntries(stores.map((s) => [s, { sum: 0, n: 0 }]));
  const split = { sum: 0, byStore: Object.fromEntries(stores.map((s) => [s, { sum: 0, n: 0 }])) };
  for (const r of rows) {
    for (const [s, o] of Object.entries(r.options)) { totals[s].sum += o.cost * r.qty; totals[s].n += 1; }
    if (r.cheapest) {
      const c = r.options[r.cheapest].cost * r.qty;
      split.sum += c;
      split.byStore[r.cheapest].sum += c;
      split.byStore[r.cheapest].n += 1;
    }
  }
  return { rows, totals, split, count: rows.length };
}
