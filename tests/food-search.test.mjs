import assert from 'node:assert/strict';
import test from 'node:test';
import { familiarName, matchesFood, rankFoods } from '../supabase/functions/_shared/food-search.ts';

const food = (name, extra = {}) => ({ id: name, name, source: 'usda', ...extra });

test('meat search favors recognizable meat over baby food and processed products', () => {
  const results = rankFoods([
    food('Babyfood, meat sticks, junior'), food('Meat frankfurter'), food('Meat extender'),
    food('Turkey, dark meat, meat and skin, raw'), food('Beef, ground, 90% lean, cooked')
  ], 'meat');
  assert.match(results[0].name, /Turkey|Beef/);
  assert.match(results[1].name, /Turkey|Beef/);
  assert.equal(rankFoods(results, 'meat extender')[0].name, 'Meat extender');
});

test('specific preparation and brand searches outrank generic foods', () => {
  const foods = [food('Chicken breast, raw'), food('Chicken breast, cooked'), food('Chicken soup')];
  assert.equal(rankFoods(foods, 'chicken breast cooked')[0].name, 'Chicken breast, cooked');
  assert.equal(rankFoods(foods, 'chicken soup')[0].name, 'Chicken soup');
  assert.equal(rankFoods([food('Yogurt'), food('Yaourt nature', { brand: 'Jaouda', source: 'seed' })], 'Jaouda')[0].brand, 'Jaouda');
});

test('friendly labels preserve preparation, fat, cuts and unspecified details', () => {
  assert.equal(familiarName('CHICKEN, BREAST, MEAT ONLY, COOKED, ROASTED'), 'Chicken breast, without skin, cooked, roasted');
  assert.equal(familiarName('Beef, ground, 90% lean meat / 10% fat, raw'), 'Ground beef, 90% lean meat / 10% fat, raw');
  assert.equal(familiarName('Rice, white, cooked, NFS'), 'White rice, cooked, not specified');
  assert.equal(familiarName('Turkey, dark meat, meat and skin, raw'), 'Turkey, dark meat, with skin, raw');
});

test('aliases find local food, identity dedupe keeps nutritionally distinct records', () => {
  assert.ok(matchesFood(food('Chicken breast, cooked'), 'meat'));
  assert.ok(matchesFood(food('Yaourt', { brand: 'Pérli' }), 'perli'));
  const a = food('Ground beef', { id: '1', nutrientsPer100g: { calories: 100 } });
  const b = food('Ground beef', { id: '2', nutrientsPer100g: { calories: 200 } });
  assert.deepEqual(rankFoods([a, a, b], 'beef'), [a, b]);
});

test('Edge Function ranks before the 24-result cutoff and preserves nutrient values', async () => {
  let handler;
  const originalFetch = globalThis.fetch;
  globalThis.Deno = { serve: (fn) => { handler = fn; }, env: { get: () => undefined } };
  const queries = [];
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('openfoodfacts')) return Response.json({ products: [] });
    queries.push(JSON.parse(options.body));
    return Response.json({ foods: [
      ...Array.from({ length: 25 }, (_, index) => ({ fdcId: index, description: `Babyfood, meat sticks, junior ${index}`, foodNutrients: [{ nutrientId: 1008, value: 120 }] })),
      { fdcId: 99, description: 'Beef, ground, 90% lean, cooked', dataType: 'Survey (FNDDS)', foodNutrients: [{ nutrientId: 1008, value: 230 }, { nutrientId: 1003, value: 28 }] }
    ] });
  };
  try {
    await import('../supabase/functions/food-search/index.ts');
    const response = await handler(new Request('http://localhost/food-search', { method: 'POST', body: JSON.stringify({ query: 'meat' }) }));
    const { foods } = await response.json();
    assert.equal(foods.length, 24);
    assert.equal(foods[0].id, 'usda-99');
    assert.equal(foods[0].nutrientsPer100g.calories, 230);
    assert.equal(foods[0].nutrientsPer100g.protein, 28);
    assert.equal(foods[0].originalName, 'Beef, ground, 90% lean, cooked');
    assert.ok(queries.some((query) => query.query === 'beef'));
    assert.ok(queries.some((query) => query.dataType.length === 1 && query.dataType[0] === 'Survey (FNDDS)'));
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.Deno;
  }
});
