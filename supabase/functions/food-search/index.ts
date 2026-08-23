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
    const foods = [
      ...(usda.status === 'fulfilled' ? usda.value : []),
      ...(openFoodFacts.status === 'fulfilled' ? openFoodFacts.value : [])
    ]
      .filter((food) => food.nutrientsPer100g.calories > 0 || food.nutrientsPer100g.protein > 0)
      .slice(0, 24);

    return json({ foods });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

async function searchUsda(query: string): Promise<FoodResult[]> {
  const apiKey = Deno.env.get('USDA_API_KEY') || 'DEMO_KEY';
  const response = await fetch('https://api.nal.usda.gov/fdc/v1/foods/search?api_key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query,
      pageSize: 12,
      dataType: ['Foundation', 'SR Legacy', 'Survey (FNDDS)', 'Branded']
    })
  });

  if (!response.ok) return [];
  const data = await response.json();
  return (data.foods || []).map((food: any) => {
    const nutrients = nutrientMap(food.foodNutrients || []);
    return {
      id: `usda-${food.fdcId}`,
      source: 'usda',
      sourceId: String(food.fdcId),
      name: cleanName(food.description || food.lowercaseDescription || 'USDA food'),
      brand: food.brandOwner || food.brandName || undefined,
      servingUnit: food.servingSizeUnit ? `${food.servingSize || 100} ${food.servingSizeUnit}` : '100 g',
      servingGrams: Number(food.servingSize) || 100,
      nutrientsPer100g: nutrients
    };
  });
}

async function searchOpenFoodFacts(query: string): Promise<FoodResult[]> {
  const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('search_simple', '1');
  url.searchParams.set('action', 'process');
  url.searchParams.set('json', '1');
  url.searchParams.set('page_size', '12');
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
      servingGrams: Number(product.serving_quantity) || 100,
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

function cleanName(value: string) {
  return value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
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
