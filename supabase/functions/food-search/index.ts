type Nutrients = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodiumMg?: number;
  potassiumMg?: number;
  cholesterolMg?: number;
  calciumMg?: number;
  ironMg?: number;
  magnesiumMg?: number;
  phosphorusMg?: number;
  zincMg?: number;
  seleniumUg?: number;
  vitaminAUg?: number;
  vitaminCMg?: number;
  vitaminDUg?: number;
  vitaminB12Ug?: number;
  folateUg?: number;
  micronutrients?: Record<string, number | string | null>;
};

type FoodResult = {
  id: string;
  source: 'usda' | 'openfoodfacts';
  sourceId: string;
  name: string;
  brand?: string;
  servingUnit?: string;
  servingGrams?: number;
  nutrientsPer100g: Nutrients;
  _priority?: number;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const query = String(body.query || '').trim();
    if (query.length < 2) {
      return json({ foods: [] });
    }

    const [usda, openFoodFacts] = await Promise.allSettled([searchUsda(query), searchOpenFoodFacts(query)]);
    const foods = dedupe([
      ...(usda.status === 'fulfilled' ? usda.value : []),
      ...(openFoodFacts.status === 'fulfilled' ? openFoodFacts.value : [])
    ])
      .filter((food) => food.nutrientsPer100g.calories > 0 || food.nutrientsPer100g.protein > 0)
      .slice(0, 24)
      .map(({ _priority, ...food }) => food);

    return json({ foods });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function fetchUsdaPage(query: string, dataType: string[], pageSize: number): Promise<any[]> {
  const apiKey = Deno.env.get('USDA_API_KEY') || 'DEMO_KEY';
  const response = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, pageSize, dataType })
  });
  if (!response.ok) return [];
  const data = await response.json();
  return data.foods || [];
}

async function searchUsda(query: string): Promise<FoodResult[]> {
  // A single blended-dataType call isn't enough: USDA's own relevance ranking for a bare,
  // one-word ingredient query (e.g. "potato") routinely lets survey/branded/dish results
  // outrank the true generic ingredient so badly that it never even makes the page — not just
  // ranked low, absent entirely. Verified directly against the USDA API: querying "potato" with
  // all four data types returns zero Foundation/SR-Legacy raw/baked potato entries in the top 50,
  // but restricting to just Foundation/SR-Legacy for the same query surfaces them immediately,
  // since they're no longer competing against dish and branded noise. So we run that restricted
  // call in parallel with the normal broad one and merge, rather than trying to out-sort a pool
  // that never contained the reference entry to begin with.
  const [reference, broad] = await Promise.all([
    fetchUsdaPage(query, ['Foundation', 'SR Legacy'], 25),
    fetchUsdaPage(query, ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded'], 50)
  ]);

  const dataTypePriority: Record<string, number> = { Foundation: 0, 'SR Legacy': 1, 'Survey (FNDDS)': 2, Branded: 3 };
  // USDA tags every entry with its own food-group category. Demote (not remove — a search for
  // the dish itself should still surface it) prepared/composite categories below plain
  // ingredient ones, so "Potato Soup" doesn't outrank "Boiled Potato" for a "potato" search.
  const compositeCategory = /soup|sauce|gravy|baked products|fast foods|restaurant foods|meals,? entrees|side dish|snacks|sweets|desserts/i;
  return [...reference, ...broad]
    .map((food: any) => {
      const nutrients = nutrientMap(food.foodNutrients || []);
      const category = String(food.foodCategory || food.brandedFoodCategory || '');
      const isComposite = compositeCategory.test(category);
      return {
        id: `usda-${food.fdcId}`,
        source: 'usda' as const,
        sourceId: String(food.fdcId),
        name: cleanName(food.description || food.lowercaseDescription || 'USDA food'),
        brand: food.brandOwner || food.brandName || undefined,
        servingUnit: food.servingSizeUnit ? `${food.servingSize || 100} ${food.servingSizeUnit}` : '100 g',
        // Leave this undefined when USDA doesn't actually provide a serving size, rather than
        // faking "100g" here — the client uses a missing servingGrams as its signal to apply a
        // food-specific default (e.g. ~50g for one egg). Baking a fake 100 in here defeated that:
        // "1 egg" was being computed as 100g of egg, showing the raw per-100g number as if it
        // were one egg's worth.
        servingGrams: food.servingSize ? Number(food.servingSize) : undefined,
        nutrientsPer100g: nutrients,
        // Composite/prepared categories are demoted below *all* plain-ingredient results,
        // regardless of data-source tier — a Foundation-tagged dish entry (e.g. an Egg McMuffin
        // miscategorized as high-tier data) must not outrank a Survey-tier plain egg. Data-type
        // only tie-breaks within the same composite/plain group.
        _priority: (isComposite ? 100 : 0) + (dataTypePriority[food.dataType] ?? 4)
      };
    })
    .sort((a, b) => a._priority - b._priority);
}

async function searchOpenFoodFacts(query: string): Promise<FoodResult[]> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '12');
  url.searchParams.set('sort_by', 'unique_scans_n');
  url.searchParams.set('fields', 'code,product_name,brands,nutriments,serving_quantity,serving_size');

  const response = await fetch(url, {
    headers: {
      'user-agent': Deno.env.get('OPENFOODFACTS_USER_AGENT') || 'Ateform/0.1 (contact: local-dev)'
    }
  });
  if (!response.ok) return [];
  const data = await response.json();
  return (data.products || []).map((product: any) => {
    const n = product.nutriments || {};
    return {
      id: `openfoodfacts-${product.code}`,
      source: 'openfoodfacts',
      sourceId: String(product.code),
      name: cleanName(product.product_name || 'Packaged food'),
      brand: product.brands || undefined,
      servingUnit: product.serving_size || '100 g',
      servingGrams: product.serving_quantity ? Number(product.serving_quantity) : undefined,
      nutrientsPer100g: {
        calories: Math.round(Number(n['energy-kcal_100g']) || kjToKcal(Number(n.energy_100g)) || 0),
        protein: round1(Number(n.proteins_100g) || 0),
        carbs: round1(Number(n.carbohydrates_100g) || 0),
        fat: round1(Number(n.fat_100g) || 0),
        fiber: optional(Number(n.fiber_100g)),
        sugar: optional(Number(n.sugars_100g)),
        sodiumMg: optionalMg(Number(n.sodium_100g), 1000),
        potassiumMg: nutrientToMg(n, 'potassium'),
        calciumMg: nutrientToMg(n, 'calcium'),
        ironMg: nutrientToMg(n, 'iron'),
        magnesiumMg: nutrientToMg(n, 'magnesium'),
        phosphorusMg: nutrientToMg(n, 'phosphorus'),
        zincMg: nutrientToMg(n, 'zinc'),
        vitaminCMg: nutrientToMg(n, 'vitamin-c'),
        vitaminAUg: nutrientToUg(n, 'vitamin-a'),
        vitaminDUg: nutrientToUg(n, 'vitamin-d'),
        vitaminB12Ug: nutrientToUg(n, 'vitamin-b12'),
        folateUg: nutrientToUg(n, 'folates')
      }
    };
  });
}

function nutrientMap(items: any[]): Nutrients {
  const find = (...ids: number[]) => {
    for (const id of ids) {
      const item = items.find((n) => Number(n.nutrientId) === id);
      if (item) return Number(item.value) || 0;
    }
    return 0;
  };

  return {
    calories: Math.round(find(1008, 2047, 2048)),
    protein: round1(find(1003)),
    carbs: round1(find(1005, 1050)),
    fat: round1(find(1004)),
    fiber: optional(find(1079)),
    sugar: optional(find(2000, 1063)),
    sodiumMg: optional(find(1093)),
    potassiumMg: optional(find(1092)),
    cholesterolMg: optional(find(1253)),
    calciumMg: optional(find(1087)),
    ironMg: optional(find(1089)),
    magnesiumMg: optional(find(1090)),
    phosphorusMg: optional(find(1091)),
    zincMg: optional(find(1095)),
    seleniumUg: optional(find(1103)),
    vitaminAUg: optional(find(1106)),
    vitaminCMg: optional(find(1162)),
    vitaminDUg: optional(find(1114)),
    vitaminB12Ug: optional(find(1178)),
    folateUg: optional(find(1177))
  };
}

/** Collapses entries that are the same food under a different source/id, keeping the first (highest-priority) one. */
function dedupe(foods: FoodResult[]): FoodResult[] {
  const seen = new Set<string>();
  const result: FoodResult[] = [];
  for (const food of foods) {
    const key = `${food.name.toLowerCase().trim()}|${(food.brand || '').toLowerCase().trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(food);
  }
  return result;
}

/**
 * USDA descriptions are comma-separated in category-first order ("Potato, Boiled, Nfs",
 * "Soup, Potato") rather than how anyone would actually say the food's name. Strip the
 * "Nfs" ("not further specified") tag and, for the common two-part case, flip the order
 * into plain English: "Potato, Boiled, Nfs" -> "Boiled Potato", "Soup, Potato" -> "Potato Soup".
 * Three-or-more-part descriptions are left comma-joined — no single reversal rule fits those.
 */
function cleanName(value: string) {
  const titled = value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
  const segments = titled
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment && !/^n\.?s$|^nfs$/i.test(segment));
  if (segments.length === 0) return titled;
  if (segments.length === 1) return segments[0];
  if (segments.length === 2) return `${segments[1]} ${segments[0]}`;
  return segments.join(', ');
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function optional(value: number) {
  return Number.isFinite(value) && value > 0 ? round1(value) : undefined;
}

function optionalMg(value: number, multiplier = 1) {
  return Number.isFinite(value) && value > 0 ? Math.round(value * multiplier) : undefined;
}

function nutrientToMg(n: Record<string, unknown>, name: string) {
  const value = Number(n[`${name}_100g`]);
  const unit = String(n[`${name}_unit`] || '').toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (unit === 'g') return optionalMg(value, 1000);
  if (unit === 'µg' || unit === 'ug') return optionalMg(value, 0.001);
  return optional(value);
}

function nutrientToUg(n: Record<string, unknown>, name: string) {
  const value = Number(n[`${name}_100g`]);
  const unit = String(n[`${name}_unit`] || '').toLowerCase();
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (unit === 'g') return optional(value * 1000000);
  if (unit === 'mg') return optional(value * 1000);
  return optional(value);
}

function kjToKcal(kj: number) {
  return Number.isFinite(kj) && kj > 0 ? kj / 4.184 : 0;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' }
  });
}
