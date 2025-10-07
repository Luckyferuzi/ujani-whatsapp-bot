import fs from "fs/promises";
import path from "path";

type DeliveryRules = {
  version: number;
  tiers: { km_min: number; km_max: number; fee_tzs: number }[];
  overrides?: Record<string, number>;
  surcharges?: { type: string; applies_to?: string[]; fee_tzs: number }[];
};

let RULES: DeliveryRules | null = null;

async function readJson<T = any>(...rel: string[]): Promise<T | null> {
  for (const p of rel) {
    try {
      const full = path.resolve(process.cwd(), p);
      const raw = await fs.readFile(full, "utf8");
      return JSON.parse(raw) as T;
    } catch { /* try next */ }
  }
  return null;
}

export async function loadDeliveryRules(): Promise<DeliveryRules> {
  if (RULES) return RULES;
  const r = await readJson<DeliveryRules>(
    "src/app/delivery_rules.json",
    "src/data/delivery_rules.json",
    "delivery_rules.json"
  );
  if (!r) throw new Error("delivery_rules.json not found");
  RULES = r;
  return RULES;
}

/** keyPath can be "District::Ward" or "District::Ward::Street" */
export async function quoteDelivery(distanceKm: number, keyPath?: string | null) {
  const r = await loadDeliveryRules();
  let base = 0;
  let from = "tier";

  // 1) overrides
  if (keyPath && r.overrides && (keyPath in r.overrides)) {
    base = r.overrides[keyPath]!;
    from = "override";
  } else {
    // 2) tiers
    const tier = r.tiers.find(t => distanceKm >= t.km_min && distanceKm <= t.km_max);
    base = tier ? tier.fee_tzs : r.tiers[r.tiers.length - 1].fee_tzs;
  }

  // 3) surcharges (optional; basic district apply)
  const surcharges: { type: string; fee_tzs: number }[] = [];
  if (r.surcharges?.length && keyPath) {
    const [district] = keyPath.split("::");
    for (const s of r.surcharges) {
      if (!s.applies_to || s.applies_to.includes(district)) {
        surcharges.push({ type: s.type, fee_tzs: s.fee_tzs });
      }
    }
  }

  const total = base + surcharges.reduce((a, b) => a + b.fee_tzs, 0);
  return { base_fee_tzs: base, surcharges, total_fee_tzs: total, base_from: from };
}
