// Deal rules for the phone site. Mirrors deal_hunter.deals.judge — tests/test_site.py checks they agree.
const EPS = 1e-9;

export const money = (x) => "$" + x.toFixed(2);

export function judge(price, typical, low, historyDays, r) {
  const enough = historyDays >= r.min_history_days;
  const wellBelow = enough && price <= (1 - r.well_below_pct) * typical + EPS;
  const nearLow = enough
    && price <= (1 + r.near_low_tolerance) * low + EPS
    && price <= (1 - r.near_low_min_below_typical) * typical + EPS;
  const strength = wellBelow && nearLow ? "Stock up" : (wellBelow || nearLow ? "Good" : null);
  return { wellBelow, nearLow, strength };
}

// One plain-English sentence on whether `price` is a deal for product p = {typical, low, days}.
export function explain(price, p, r) {
  if (p.days < r.min_history_days) {
    return { strength: null, text: `Only ${p.days} days of price history, too little to judge yet.` };
  }
  const { strength } = judge(price, p.typical, p.low, p.days, r);
  const pct = 1 - price / p.typical;
  const vsUsual = pct > 0.005 ? `${Math.round(pct * 100)}% below its usual ${money(p.typical)}`
    : pct < -0.005 ? `${Math.round(-pct * 100)}% above its usual ${money(p.typical)}`
    : `its usual price`;
  const vsLow = price < p.low - 0.005 ? `cheaper than anything in the last 12 months (low ${money(p.low)})`
    : price <= p.low * (1 + r.near_low_tolerance) + EPS ? `at its 12-month low (${money(p.low)})`
    : `above its 12-month low of ${money(p.low)}`;
  const verdict = strength === "Stock up" ? "A genuine deal."
    : strength === "Good" ? "A modest saving."
    : "Not a real deal.";
  return { strength, text: `${money(price)} is ${vsUsual} and ${vsLow}. ${verdict}` };
}
