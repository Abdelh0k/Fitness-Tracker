/** Pure search rules shared by the app and Edge Function. Never change nutrition or identity. */
type SearchFood = { id: string; name: string; originalName?: string; brand?: string; source: string; dataType?: string };

export function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
}

const groups: Record<string, string[]> = {
  meat: ['beef', 'chicken', 'lamb', 'turkey', 'pork', 'veal'],
  fish: ['fish', 'salmon', 'tuna', 'cod', 'sardines', 'trout'],
  vegetables: ['carrot', 'broccoli', 'spinach', 'tomato', 'potato'],
  fruit: ['apple', 'banana', 'orange', 'pear', 'grape']
};

export function matchesFood(food: SearchFood, query: string): boolean {
  const text = normalize(`${food.originalName || food.name} ${food.name} ${food.brand || ''}`);
  const q = normalize(query);
  return q.split(' ').every((token) => text.includes(token)) || !!groups[q]?.some((word) => text.split(' ').includes(word));
}

export function familiarName(value: string): string {
  const parts = value.toLowerCase().split(',').map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return value;
  // Only rewrite known category-first patterns. Keep all preparation/fat/cut qualifiers.
  const first = parts.shift()!;
  let base = first;
  if (/^(chicken|turkey|beef|pork|lamb)$/.test(first) && /^(breast|thigh|wing|leg|ground|whole)$/.test(parts[0] || '')) {
    const cut = parts.shift()!;
    base = cut === 'ground' ? `ground ${first}` : `${first} ${cut}`;
  } else if (/^(rice|bread|yogurt|yoghurt|milk|potatoes|potato|soup)$/.test(first) && /^(white|brown|whole wheat|greek|skim|sweet|chicken|tomato)$/.test(parts[0] || '')) {
    base = `${parts.shift()} ${first}`;
  }
  const details = parts.map((part) => part
    .replace(/^meat only$/, /^(chicken|turkey)$/.test(first) ? 'without skin' : 'meat only')
    .replace(/^meat and skin$/, /^(chicken|turkey)$/.test(first) ? 'with skin' : 'meat and skin')
    .replace(/^(nfs|n\.?s\.?)$/, 'not specified')
    .replace(/\bw\/o\b/g, 'without'));
  const name = base + (details.length ? `, ${details.join(', ')}` : '');
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function rankFoods<T extends SearchFood>(foods: T[], query: string): T[] {
  const q = normalize(query);
  const tokens = q.split(' ').filter(Boolean);
  const scored = foods.map((food, index) => {
    const name = normalize(food.name);
    const text = normalize(`${food.originalName || food.name} ${food.name} ${food.brand || ''}`);
    let score = 0;
    if (name === q || normalize(food.brand || '') === q) score += 200;
    if (groups[q]?.some((word) => text.split(' ').includes(word)) || tokens.every((token) => text.split(' ').includes(token))) score += 80;
    else if (matchesFood(food, query)) score += 45;
    if (name.startsWith(q + ' ')) score += 20;
    // Demote unusual foods unless the user actually asked for that kind of food.
    for (const pattern of [/baby\s?food|infant|toddler|junior/, /extender|imitation|substitute/, /organ|giblets|liver|kidney|heart/, /frankfurter|bologna|sausage|luncheon/, /soup|sauce|gravy|snack|dessert/]) {
      if (pattern.test(text) && !pattern.test(q)) score -= 100;
    }
    if (!food.brand && food.source !== 'openfoodfacts') score += 15;
    if (food.dataType === 'Survey (FNDDS)') score += 8;
    if (groups[q]?.some((word) => text.split(' ').includes(word))) score += 40;
    score -= Math.min(name.split(' ').length, 35);
    return { food, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  const seen = new Set<string>();
  return scored.filter(({ food }) => {
    // Identity only: similar labels can represent different nutrition or preparation.
    const key = `${food.source}:${food.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(({ food }) => food);
}
