import { randomUUID } from 'node:crypto';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { estimateCardioCalories } from './cardioCalories.js';
import { dateDaysAgo, per100g, scaleNutrients, sumNutrients, todayUtc, type Nutrients } from './domain.js';
import { searchExercises, type MuscleGroup } from './exercises.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const sourceSchema = z.enum(['ai_photo', 'ai_text', 'ai_voice', 'import']);
const idempotencySchema = z.string().min(8).max(200).describe('Stable retry key for this logical operation');
const cardioMachineSchema = z.enum(['treadmill', 'bike', 'stair_climber', 'elliptical', 'rowing', 'ski_erg', 'assault_bike', 'other']);
const cyclingEffortSchema = z.enum(['low', 'medium', 'hard', 'very_hard', 'max']);
const rowingEffortSchema = z.enum(['low', 'medium', 'hard', 'very_hard']);
const weekdaySchema = z.number().int().min(0).max(6).describe('0 = Monday ... 6 = Sunday');

function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
  };
}

function requireUser(authInfo: AuthInfo | undefined): { userId: string; token: string; clientId: string } {
  const userId = authInfo?.extra?.userId;
  if (typeof userId !== 'string' || !authInfo?.token) throw new Error('Authenticated Ateform user is required');
  return { userId, token: authInfo.token, clientId: authInfo.clientId };
}

function userClient(config: AppConfig, token: string): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabasePublishableKey, {
    accessToken: async () => token,
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function fail(error: { message: string } | null, operation: string): never {
  throw new Error(`${operation}: ${error?.message || 'unknown database error'}`);
}

async function fetchWeightKg(db: SupabaseClient, userId: string): Promise<number | undefined> {
  const { data } = await db.from('profiles').select('current_weight_kg').eq('id', userId).maybeSingle();
  return data?.current_weight_kg || undefined;
}

const mutationAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export function buildAteformServer(config: AppConfig, authInfo?: AuthInfo): McpServer {
  const { userId, token, clientId } = requireUser(authInfo);
  const db = userClient(config, token);
  const server = new McpServer(
    { name: 'ateform', version: '0.1.0' },
    {
      instructions:
        'Ateform tracks nutrition, training, cardio, steps and body progress. Photo-derived nutrition is an estimate: show the proposed items and portions to the user before calling log_meal. Never invent missing measurements. Reuse idempotency keys on retries.',
    },
  );

  server.registerTool(
    'get_today_summary',
    {
      title: 'Get daily fitness summary',
      description: 'Read nutrition, targets, strength, cardio, steps and body metrics for one Ateform day.',
      inputSchema: z.object({ date: dateSchema.optional().describe('Defaults to today in UTC') }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ date }) => {
      const logDate = date || todayUtc();
      const [profile, meals, strength, cardio, steps, body] = await Promise.all([
        db.from('profiles').select('display_name,calorie_target,protein_target_g,fat_target_g,carb_target_g,daily_steps_target').eq('id', userId).maybeSingle(),
        db.from('meal_entries').select('id,meal_type,food_snapshot,grams,nutrients,meal_source,eaten_at').eq('user_id', userId).eq('log_date', logDate).order('eaten_at'),
        db.from('strength_sessions').select('id,template_name,exercises,notes').eq('user_id', userId).eq('log_date', logDate).maybeSingle(),
        db.from('cardio_entries').select('id,type,duration_min,distance_km,calories').eq('user_id', userId).eq('log_date', logDate).order('created_at'),
        db.from('step_entries').select('steps').eq('user_id', userId).eq('log_date', logDate).maybeSingle(),
        db.from('body_metrics').select('weight_kg,waist_cm,body_fat_percent').eq('user_id', userId).eq('log_date', logDate).maybeSingle(),
      ]);
      for (const result of [profile, meals, strength, cardio, steps, body]) if (result.error) fail(result.error, 'Could not load daily summary');
      return textResult({
        date: logDate,
        profile: profile.data,
        nutrition: { totals: sumNutrients(meals.data || []), items: meals.data || [] },
        strength: strength.data,
        cardio: cardio.data || [],
        steps: steps.data?.steps || 0,
        body: body.data,
      });
    },
  );

  server.registerTool(
    'search_foods',
    {
      title: 'Search Ateform foods',
      description: 'Search Ateform nutrition sources before logging a known food or checking an AI estimate.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(120) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ query }) => {
      const { data, error } = await db.functions.invoke('food-search', { body: { query } });
      if (error) fail(error, 'Food search failed');
      return textResult({ query, results: data?.foods || data || [] });
    },
  );

  const mealItemSchema = z.object({
    name: z.string().trim().min(1).max(160),
    brand: z.string().trim().max(120).optional(),
    grams: z.number().positive().max(10_000),
    calories: z.number().nonnegative().max(20_000),
    protein_g: z.number().nonnegative().max(1_000),
    carbs_g: z.number().nonnegative().max(2_000),
    fat_g: z.number().nonnegative().max(1_000),
    fiber_g: z.number().nonnegative().max(500).optional(),
    sugar_g: z.number().nonnegative().max(1_000).optional(),
    confidence: z.number().min(0).max(1).optional(),
    original_label: z.string().trim().max(240).optional(),
  });

  server.registerTool(
    'log_meal',
    {
      title: 'Log a meal',
      description: 'Save a user-confirmed meal, including estimates inferred from a photo. Pass nutrients for each stated portion, not per 100 g.',
      inputSchema: z.object({
        log_date: dateSchema.optional(),
        eaten_at: z.string().datetime({ offset: true }).optional(),
        meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        source: sourceSchema.default('ai_photo'),
        model: z.string().trim().max(120).optional(),
        idempotency_key: idempotencySchema,
        items: z.array(mealItemSchema).min(1).max(20),
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const existing = await db.from('meal_entries').select('meal_session_id').eq('user_id', userId).eq('idempotency_key', `${input.idempotency_key}:0`).maybeSingle();
      if (existing.error) fail(existing.error, 'Could not check meal retry key');
      if (existing.data?.meal_session_id) {
        const retried = await db.from('meal_entries').select('*').eq('user_id', userId).eq('meal_session_id', existing.data.meal_session_id);
        if (retried.error) fail(retried.error, 'Could not load existing meal');
        return textResult({ created: false, idempotent_replay: true, meal_session_id: existing.data.meal_session_id, items: retried.data });
      }

      const mealSessionId = randomUUID();
      const eatenAt = input.eaten_at || new Date().toISOString();
      const rows = input.items.map((item, index) => {
        const nutrients: Nutrients = {
          calories: item.calories,
          protein: item.protein_g,
          carbs: item.carbs_g,
          fat: item.fat_g,
          fiber: item.fiber_g,
          sugar: item.sugar_g,
        };
        return {
          user_id: userId,
          log_date: input.log_date || eatenAt.slice(0, 10),
          meal_type: input.meal_type,
          meal_session_id: mealSessionId,
          food_snapshot: {
            id: `ai-${mealSessionId}-${index}`,
            name: item.name,
            brand: item.brand,
            servingGrams: item.grams,
            servingUnit: 'g',
            nutrientsPer100g: per100g(nutrients, item.grams),
            source: 'custom',
          },
          grams: item.grams,
          nutrients,
          meal_source: input.source,
          source_metadata: {
            model: input.model,
            confidence: item.confidence,
            externalClientId: clientId,
            originalLabel: item.original_label,
          },
          idempotency_key: `${input.idempotency_key}:${index}`,
          eaten_at: eatenAt,
        };
      });
      const inserted = await db.from('meal_entries').insert(rows).select('*');
      if (inserted.error) fail(inserted.error, 'Could not log meal');
      return textResult({ created: true, meal_session_id: mealSessionId, items: inserted.data, totals: sumNutrients(inserted.data || []) });
    },
  );

  server.registerTool(
    'update_meal',
    {
      title: 'Correct a meal item',
      description: 'Update a meal item after the user corrects its label, portion or nutrient estimate.',
      inputSchema: z.object({
        entry_id: z.string().uuid(),
        name: z.string().trim().min(1).max(160).optional(),
        grams: z.number().positive().max(10_000).optional(),
        calories: z.number().nonnegative().max(20_000).optional(),
        protein_g: z.number().nonnegative().max(1_000).optional(),
        carbs_g: z.number().nonnegative().max(2_000).optional(),
        fat_g: z.number().nonnegative().max(1_000).optional(),
        fiber_g: z.number().nonnegative().max(500).optional(),
        sugar_g: z.number().nonnegative().max(1_000).optional(),
        confidence: z.number().min(0).max(1).optional(),
      }),
      annotations: mutationAnnotations,
    },
    async ({ entry_id, name, grams, confidence, ...changes }) => {
      const current = await db.from('meal_entries').select('*').eq('user_id', userId).eq('id', entry_id).single();
      if (current.error) fail(current.error, 'Meal item was not found');
      const oldNutrients = current.data.nutrients as Nutrients;
      const oldGrams = Number(current.data.grams);
      const nextGrams = grams ?? oldGrams;
      const ratio = nextGrams / oldGrams;
      const nutrientChanges: Partial<Nutrients> = {
        calories: changes.calories,
        protein: changes.protein_g,
        carbs: changes.carbs_g,
        fat: changes.fat_g,
        fiber: changes.fiber_g,
        sugar: changes.sugar_g,
      };
      const nutrients = Object.fromEntries(
        ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'].map((key) => {
          const nutrientKey = key as keyof Nutrients;
          return [key, nutrientChanges[nutrientKey] ?? Number(oldNutrients[nutrientKey] || 0) * ratio];
        }),
      ) as Nutrients;
      const snapshot = { ...current.data.food_snapshot, name: name || current.data.food_snapshot.name, servingGrams: nextGrams, nutrientsPer100g: per100g(nutrients, nextGrams) };
      const metadata = { ...(current.data.source_metadata || {}), ...(confidence == null ? {} : { confidence }) };
      const updated = await db.from('meal_entries').update({ grams: nextGrams, nutrients, food_snapshot: snapshot, source_metadata: metadata }).eq('user_id', userId).eq('id', entry_id).select('*').single();
      if (updated.error) fail(updated.error, 'Could not update meal item');
      return textResult({ updated: true, item: updated.data });
    },
  );

  server.registerTool(
    'delete_meal',
    {
      title: 'Delete a meal',
      description: 'Permanently delete every item in one meal session. Requires user confirmation.',
      inputSchema: z.object({ meal_session_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ meal_session_id }) => {
      const deleted = await db.from('meal_entries').delete().eq('user_id', userId).eq('meal_session_id', meal_session_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete meal');
      return textResult({ deleted: true, meal_session_id, deleted_items: deleted.data?.length || 0 });
    },
  );

  server.registerTool(
    'delete_meal_item',
    {
      title: 'Delete one meal item',
      description: 'Remove a single food item from a meal, leaving the rest of that meal session intact.',
      inputSchema: z.object({ entry_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ entry_id }) => {
      const deleted = await db.from('meal_entries').delete().eq('user_id', userId).eq('id', entry_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete meal item');
      return textResult({ deleted: true, entry_id, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'list_meals',
    {
      title: 'List meals over a date range',
      description: 'List logged meal items between two dates (inclusive), grouped by day with per-day nutrition totals.',
      inputSchema: z.object({ from_date: dateSchema, to_date: dateSchema }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ from_date, to_date }) => {
      const { data, error } = await db
        .from('meal_entries')
        .select('id,log_date,meal_type,meal_session_id,food_snapshot,grams,nutrients,meal_source,eaten_at')
        .eq('user_id', userId)
        .gte('log_date', from_date)
        .lte('log_date', to_date)
        .order('eaten_at');
      if (error) fail(error, 'Could not list meals');
      const byDay = new Map<string, typeof data>();
      for (const item of data || []) {
        if (!byDay.has(item.log_date)) byDay.set(item.log_date, []);
        byDay.get(item.log_date)!.push(item);
      }
      const days = Array.from(byDay.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([log_date, items]) => ({ log_date, items, totals: sumNutrients(items!) }));
      return textResult({ from_date, to_date, days });
    },
  );

  const exerciseSchema = z.object({
    name: z.string().trim().min(1).max(120),
    sets: z.array(z.object({ reps: z.number().int().min(0).max(1_000), weight_kg: z.number().nonnegative().max(2_000).optional(), rir: z.number().int().min(0).max(10).optional() })).min(1).max(30),
  });

  server.registerTool(
    'log_workout',
    {
      title: 'Log strength workout',
      description: 'Create or replace the user’s strength session for a date.',
      inputSchema: z.object({
        log_date: dateSchema.optional(),
        name: z.string().trim().min(1).max(120),
        exercises: z.array(exerciseSchema).min(1).max(40),
        notes: z.string().max(2_000).optional(),
        source: sourceSchema.default('ai_text'),
        idempotency_key: idempotencySchema,
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const row = {
        user_id: userId,
        log_date: input.log_date || todayUtc(),
        template_name: input.name,
        exercises: input.exercises.map((exercise) => ({
          name: exercise.name,
          sets: exercise.sets.map((set) => ({ weightKg: set.weight_kg || 0, reps: set.reps, ...(set.rir == null ? {} : { rir: set.rir }) })),
        })),
        notes: input.notes,
        entry_source: input.source,
        source_metadata: { externalClientId: clientId },
        idempotency_key: input.idempotency_key,
      };
      const saved = await db.from('strength_sessions').upsert(row, { onConflict: 'user_id,log_date' }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not log workout');
      return textResult({ saved: true, workout: saved.data });
    },
  );

  server.registerTool(
    'delete_workout',
    {
      title: 'Delete a workout',
      description: 'Permanently delete the strength session for a date.',
      inputSchema: z.object({ log_date: dateSchema }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ log_date }) => {
      const deleted = await db.from('strength_sessions').delete().eq('user_id', userId).eq('log_date', log_date).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete workout');
      return textResult({ deleted: true, log_date, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'search_exercises',
    {
      title: 'Search the exercise library',
      description: 'Find canonical exercise names from Ateform\'s library, to use when logging a workout or building a program instead of guessing a name.',
      inputSchema: z.object({
        query: z.string().trim().min(2).max(80),
        muscle: z.enum(['chest', 'back', 'shoulders', 'legs', 'glutes', 'biceps', 'triceps', 'forearms', 'abs']).optional(),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ query, muscle }) => {
      return textResult({ query, results: searchExercises(query, muscle as MuscleGroup | undefined) });
    },
  );

  const programDaySchema = z.object({
    id: z.string().optional().describe('Omit for a new day; the server assigns one'),
    weekday: weekdaySchema,
    name: z.string().trim().min(1).max(80),
    exercises: z.array(z.string().trim().min(1).max(160)).max(40),
    is_rest_day: z.boolean().optional(),
  });

  server.registerTool(
    'list_programs',
    {
      title: 'List training programs',
      description: 'List the user\'s saved training programs (weekly push/pull/legs-style splits).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await db.from('training_programs').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (error) fail(error, 'Could not list programs');
      return textResult({ programs: data || [] });
    },
  );

  server.registerTool(
    'save_program',
    {
      title: 'Save a training program',
      description: 'Create or update (pass id) a weekly training program: a name plus one entry per day of the week with its exercise list.',
      inputSchema: z.object({
        id: z.string().uuid().optional().describe('Omit to create a new program, pass to replace an existing one\'s days'),
        name: z.string().trim().min(1).max(80),
        days: z.array(programDaySchema).min(1).max(7),
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const id = input.id || randomUUID();
      const days = input.days.map((day) => ({
        id: day.id || randomUUID(),
        weekday: day.weekday,
        name: day.name,
        exercises: day.exercises,
        ...(day.is_rest_day == null ? {} : { isRestDay: day.is_rest_day }),
      }));
      const saved = await db.from('training_programs').upsert({ id, user_id: userId, name: input.name, days }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not save program');
      return textResult({ saved: true, program: saved.data });
    },
  );

  server.registerTool(
    'delete_program',
    {
      title: 'Delete a training program',
      description: 'Permanently delete a training program.',
      inputSchema: z.object({ program_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ program_id }) => {
      const deleted = await db.from('training_programs').delete().eq('user_id', userId).eq('id', program_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete program');
      return textResult({ deleted: true, program_id, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'log_cardio',
    {
      title: 'Log cardio',
      description:
        'Log a cardio activity such as running, cycling, swimming or walking. For gym machines, pass `machine` plus its speed/incline, watts, or step rate — calories are then estimated from ACSM metabolic equations and the Compendium of Physical Activities using the user\'s current weight, instead of being guessed. Pass `calories` yourself to override.',
      inputSchema: z.object({
        log_date: dateSchema.optional(),
        type: z.string().trim().min(1).max(100).describe('Free-text label, e.g. "Treadmill run" or "Outdoor cycling"'),
        duration_min: z.number().int().min(0).max(1_440),
        distance_km: z.number().nonnegative().max(1_000).optional(),
        calories: z.number().int().nonnegative().max(20_000).optional().describe('Overrides the auto-estimate when provided'),
        machine: cardioMachineSchema.optional().describe('Enables auto-estimated calories for treadmill/bike/stair_climber/elliptical/rowing/ski_erg/assault_bike'),
        speed_kmh: z.number().positive().max(60).optional().describe('Treadmill only'),
        incline_percent: z.number().min(0).max(40).optional().describe('Treadmill only'),
        watts: z.number().positive().max(1_000).optional().describe('Bike, assault bike, or rowing'),
        step_rate: z.number().positive().max(300).optional().describe('Steps/min, stair climber only'),
        cycling_effort: cyclingEffortSchema.optional().describe('Bike/assault bike effort bucket, used when watts is unknown'),
        rowing_effort: rowingEffortSchema.optional().describe('Rowing effort bucket, used when watts is unknown'),
        source: sourceSchema.default('ai_text'),
        idempotency_key: idempotencySchema,
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const existing = await db.from('cardio_entries').select('*').eq('user_id', userId).eq('idempotency_key', input.idempotency_key).maybeSingle();
      if (existing.error) fail(existing.error, 'Could not check cardio retry key');
      if (existing.data) return textResult({ created: false, idempotent_replay: true, cardio: existing.data });

      let calories = input.calories;
      if (calories == null && input.machine) {
        const weightKg = await fetchWeightKg(db, userId);
        if (weightKg) {
          calories = estimateCardioCalories({
            machine: input.machine,
            weightKg,
            minutes: input.duration_min,
            speedKmh: input.speed_kmh,
            inclinePercent: input.incline_percent,
            watts: input.watts,
            stepRate: input.step_rate,
            cyclingEffort: input.cycling_effort,
            rowingEffort: input.rowing_effort,
          }) ?? undefined;
        }
      }

      const saved = await db.from('cardio_entries').insert({
        user_id: userId,
        log_date: input.log_date || todayUtc(),
        type: input.type,
        duration_min: input.duration_min,
        distance_km: input.distance_km,
        calories,
        machine: input.machine,
        speed_kmh: input.speed_kmh,
        incline_percent: input.incline_percent,
        watts: input.watts,
        step_rate: input.step_rate,
        entry_source: input.source,
        source_metadata: { externalClientId: clientId },
        idempotency_key: input.idempotency_key,
      }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not log cardio');
      return textResult({ created: true, cardio: saved.data, calories_estimated: input.calories == null && calories != null });
    },
  );

  server.registerTool(
    'delete_cardio',
    {
      title: 'Delete a cardio entry',
      description: 'Permanently delete one cardio entry.',
      inputSchema: z.object({ cardio_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ cardio_id }) => {
      const deleted = await db.from('cardio_entries').delete().eq('user_id', userId).eq('id', cardio_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete cardio entry');
      return textResult({ deleted: true, cardio_id, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'list_saved_cardio_sessions',
    {
      title: 'List saved cardio sessions',
      description: 'List the user\'s reusable cardio session templates (e.g. a regular treadmill routine).',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await db.from('saved_cardio_sessions').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (error) fail(error, 'Could not list saved cardio sessions');
      return textResult({ sessions: data || [] });
    },
  );

  server.registerTool(
    'save_cardio_session',
    {
      title: 'Save a reusable cardio session',
      description: 'Create or update (pass id) a named cardio session template with its machine settings, for quick reuse later.',
      inputSchema: z.object({
        id: z.string().uuid().optional().describe('Omit to create a new template, pass to update an existing one'),
        name: z.string().trim().min(1).max(80),
        machine: cardioMachineSchema,
        duration_min: z.number().int().positive().max(1_440).optional(),
        distance_km: z.number().nonnegative().max(1_000).optional(),
        speed_kmh: z.number().positive().max(60).optional(),
        incline_percent: z.number().min(0).max(40).optional(),
        watts: z.number().positive().max(1_000).optional(),
        step_rate: z.number().positive().max(300).optional(),
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const id = input.id || randomUUID();
      const saved = await db.from('saved_cardio_sessions').upsert({
        id,
        user_id: userId,
        name: input.name,
        machine: input.machine,
        duration_min: input.duration_min,
        distance_km: input.distance_km,
        speed_kmh: input.speed_kmh,
        incline_percent: input.incline_percent,
        watts: input.watts,
        step_rate: input.step_rate,
      }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not save cardio session');
      return textResult({ saved: true, session: saved.data });
    },
  );

  server.registerTool(
    'delete_saved_cardio_session',
    {
      title: 'Delete a saved cardio session',
      description: 'Permanently delete a reusable cardio session template.',
      inputSchema: z.object({ saved_session_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ saved_session_id }) => {
      const deleted = await db.from('saved_cardio_sessions').delete().eq('user_id', userId).eq('id', saved_session_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete saved cardio session');
      return textResult({ deleted: true, saved_session_id, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'log_saved_cardio_session',
    {
      title: 'Log cardio from a saved session',
      description: 'Instantiate a saved cardio session template as a logged cardio entry for a date, re-estimating calories from current bodyweight.',
      inputSchema: z.object({
        saved_session_id: z.string().uuid(),
        log_date: dateSchema.optional(),
        duration_min: z.number().int().positive().max(1_440).optional().describe('Overrides the template\'s stored duration'),
        source: sourceSchema.default('ai_text'),
        idempotency_key: idempotencySchema,
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const existing = await db.from('cardio_entries').select('*').eq('user_id', userId).eq('idempotency_key', input.idempotency_key).maybeSingle();
      if (existing.error) fail(existing.error, 'Could not check cardio retry key');
      if (existing.data) return textResult({ created: false, idempotent_replay: true, cardio: existing.data });

      const template = await db.from('saved_cardio_sessions').select('*').eq('user_id', userId).eq('id', input.saved_session_id).single();
      if (template.error) fail(template.error, 'Saved cardio session was not found');
      const minutes = input.duration_min ?? template.data.duration_min;
      if (!minutes) throw new Error('This template has no stored duration; pass duration_min');

      const weightKg = await fetchWeightKg(db, userId);
      const calories = weightKg
        ? estimateCardioCalories({
            machine: template.data.machine,
            weightKg,
            minutes,
            speedKmh: template.data.speed_kmh,
            inclinePercent: template.data.incline_percent,
            watts: template.data.watts,
            stepRate: template.data.step_rate,
          }) ?? undefined
        : undefined;

      const saved = await db.from('cardio_entries').insert({
        user_id: userId,
        log_date: input.log_date || todayUtc(),
        type: template.data.name,
        duration_min: minutes,
        distance_km: template.data.distance_km,
        calories,
        machine: template.data.machine,
        speed_kmh: template.data.speed_kmh,
        incline_percent: template.data.incline_percent,
        watts: template.data.watts,
        step_rate: template.data.step_rate,
        entry_source: input.source,
        source_metadata: { externalClientId: clientId },
        idempotency_key: input.idempotency_key,
      }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not log cardio from saved session');
      return textResult({ created: true, cardio: saved.data });
    },
  );

  server.registerTool(
    'log_steps',
    {
      title: 'Log steps',
      description: 'Create or update the step count for a date.',
      inputSchema: z.object({ log_date: dateSchema.optional(), steps: z.number().int().min(0).max(100_000) }),
      annotations: mutationAnnotations,
    },
    async ({ log_date, steps }) => {
      const saved = await db.from('step_entries').upsert(
        { user_id: userId, log_date: log_date || todayUtc(), steps },
        { onConflict: 'user_id,log_date' },
      ).select('*').single();
      if (saved.error) fail(saved.error, 'Could not log steps');
      return textResult({ saved: true, steps: saved.data });
    },
  );

  server.registerTool(
    'log_body_metric',
    {
      title: 'Log body metrics',
      description: 'Create or update weight, waist or body-fat measurements for a date.',
      inputSchema: z.object({
        log_date: dateSchema.optional(),
        weight_kg: z.number().min(30).max(300).optional(),
        waist_cm: z.number().min(30).max(250).optional(),
        body_fat_percent: z.number().min(1).max(80).optional(),
        source: sourceSchema.default('ai_text'),
      }).refine((value) => value.weight_kg != null || value.waist_cm != null || value.body_fat_percent != null, 'Provide at least one measurement'),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const { source, log_date, ...metrics } = input;
      const saved = await db.from('body_metrics').upsert({
        user_id: userId,
        log_date: log_date || todayUtc(),
        ...metrics,
        entry_source: source,
        source_metadata: { externalClientId: clientId },
      }, { onConflict: 'user_id,log_date' }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not log body metrics');
      return textResult({ saved: true, body_metric: saved.data });
    },
  );

  server.registerTool(
    'delete_body_metric',
    {
      title: 'Delete a body metric entry',
      description: 'Permanently delete the body measurements logged for a date.',
      inputSchema: z.object({ log_date: dateSchema }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ log_date }) => {
      const deleted = await db.from('body_metrics').delete().eq('user_id', userId).eq('log_date', log_date).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete body metric');
      return textResult({ deleted: true, log_date, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'get_progress_summary',
    {
      title: 'Get progress summary',
      description: 'Read body measurements and training history across a recent date range.',
      inputSchema: z.object({ days: z.number().int().min(7).max(365).default(30) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ days }) => {
      const from = dateDaysAgo(days - 1);
      const [body, strength, cardio] = await Promise.all([
        db.from('body_metrics').select('*').eq('user_id', userId).gte('log_date', from).order('log_date'),
        db.from('strength_sessions').select('log_date,template_name,exercises').eq('user_id', userId).gte('log_date', from).order('log_date'),
        db.from('cardio_entries').select('log_date,type,duration_min,distance_km,calories').eq('user_id', userId).gte('log_date', from).order('log_date'),
      ]);
      for (const result of [body, strength, cardio]) if (result.error) fail(result.error, 'Could not load progress summary');
      return textResult({ from, through: todayUtc(), days, body: body.data || [], strength: strength.data || [], cardio: cardio.data || [] });
    },
  );

  server.registerTool(
    'get_profile',
    {
      title: 'Get profile and targets',
      description: 'Read the user\'s personal details and daily nutrition/activity targets.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await db.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (error) fail(error, 'Could not load profile');
      return textResult({ profile: data });
    },
  );

  server.registerTool(
    'update_profile',
    {
      title: 'Update profile and targets',
      description: 'Update any subset of the user\'s personal details or daily targets. Only pass fields that are changing.',
      inputSchema: z.object({
        display_name: z.string().trim().min(1).max(80).optional(),
        age: z.number().int().min(13).max(100).optional(),
        gender: z.enum(['male', 'female']).optional(),
        height_cm: z.number().min(100).max(250).optional(),
        current_weight_kg: z.number().min(30).max(300).optional(),
        target_weight_kg: z.number().min(30).max(300).optional(),
        training_days_per_week: z.number().int().min(0).max(14).optional(),
        cardio_days_per_week: z.number().int().min(0).max(14).optional(),
        daily_steps_target: z.number().int().min(0).max(100_000).optional(),
        goal: z.enum(['fat_loss', 'recomp', 'muscle_gain', 'maintain']).optional(),
        experience_level: z.enum(['new', 'returning', 'intermediate', 'advanced']).optional(),
        weekly_pace: z.enum(['easy', 'steady', 'fast']).optional(),
        calorie_target: z.number().int().min(800).max(8_000).optional(),
        protein_target_g: z.number().int().min(0).max(500).optional(),
        fat_target_g: z.number().int().min(0).max(400).optional(),
        carb_target_g: z.number().int().min(0).max(1_000).optional(),
      }).refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update'),
      annotations: mutationAnnotations,
    },
    async (changes) => {
      const updated = await db.from('profiles').update(changes).eq('id', userId).select('*').single();
      if (updated.error) fail(updated.error, 'Could not update profile');
      return textResult({ updated: true, profile: updated.data });
    },
  );

  const savedMealItemSchema = z.object({
    name: z.string().trim().min(1).max(160),
    brand: z.string().trim().max(120).optional(),
    grams: z.number().positive().max(10_000),
    calories: z.number().nonnegative().max(20_000),
    protein_g: z.number().nonnegative().max(1_000),
    carbs_g: z.number().nonnegative().max(2_000),
    fat_g: z.number().nonnegative().max(1_000),
    fiber_g: z.number().nonnegative().max(500).optional(),
    sugar_g: z.number().nonnegative().max(1_000).optional(),
  });

  function buildSavedMealItem(item: z.infer<typeof savedMealItemSchema>, foodId: string) {
    const nutrients: Nutrients = {
      calories: item.calories,
      protein: item.protein_g,
      carbs: item.carbs_g,
      fat: item.fat_g,
      fiber: item.fiber_g,
      sugar: item.sugar_g,
    };
    return {
      food: {
        id: foodId,
        name: item.name,
        brand: item.brand,
        source: 'custom' as const,
        servingUnit: 'g',
        servingGrams: item.grams,
        nutrientsPer100g: per100g(nutrients, item.grams),
      },
      grams: item.grams,
    };
  }

  server.registerTool(
    'list_saved_meals',
    {
      title: 'List saved meals',
      description: 'List the user\'s reusable meal templates (e.g. "Usual breakfast").',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      const { data, error } = await db.from('saved_meals').select('*').eq('user_id', userId).order('updated_at', { ascending: false });
      if (error) fail(error, 'Could not list saved meals');
      return textResult({ meals: data || [] });
    },
  );

  server.registerTool(
    'save_meal',
    {
      title: 'Save a reusable meal',
      description: 'Create or update (pass id) a named meal template made of one or more food items, for quick reuse later.',
      inputSchema: z.object({
        id: z.string().uuid().optional().describe('Omit to create a new template, pass to replace an existing one\'s items'),
        name: z.string().trim().min(1).max(80),
        items: z.array(savedMealItemSchema).min(1).max(20),
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const id = input.id || randomUUID();
      const items = input.items.map((item, index) => buildSavedMealItem(item, `custom-${id}-${index}`));
      const saved = await db.from('saved_meals').upsert({ id, user_id: userId, name: input.name, items }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not save meal');
      return textResult({ saved: true, meal: saved.data });
    },
  );

  server.registerTool(
    'delete_saved_meal',
    {
      title: 'Delete a saved meal',
      description: 'Permanently delete a reusable meal template.',
      inputSchema: z.object({ saved_meal_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ saved_meal_id }) => {
      const deleted = await db.from('saved_meals').delete().eq('user_id', userId).eq('id', saved_meal_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete saved meal');
      return textResult({ deleted: true, saved_meal_id, found: (deleted.data?.length || 0) > 0 });
    },
  );

  server.registerTool(
    'log_saved_meal',
    {
      title: 'Log a saved meal',
      description: 'Instantiate a saved meal template as logged food entries for a date and meal type.',
      inputSchema: z.object({
        saved_meal_id: z.string().uuid(),
        log_date: dateSchema.optional(),
        eaten_at: z.string().datetime({ offset: true }).optional(),
        meal_type: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
        source: sourceSchema.default('ai_text'),
        idempotency_key: idempotencySchema,
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const existing = await db.from('meal_entries').select('meal_session_id').eq('user_id', userId).eq('idempotency_key', `${input.idempotency_key}:0`).maybeSingle();
      if (existing.error) fail(existing.error, 'Could not check meal retry key');
      if (existing.data?.meal_session_id) {
        const retried = await db.from('meal_entries').select('*').eq('user_id', userId).eq('meal_session_id', existing.data.meal_session_id);
        if (retried.error) fail(retried.error, 'Could not load existing meal');
        return textResult({ created: false, idempotent_replay: true, meal_session_id: existing.data.meal_session_id, items: retried.data });
      }

      const template = await db.from('saved_meals').select('*').eq('user_id', userId).eq('id', input.saved_meal_id).single();
      if (template.error) fail(template.error, 'Saved meal was not found');
      const templateItems = (template.data.items || []) as Array<{ food: { name: string; brand?: string; nutrientsPer100g: Nutrients }; grams: number }>;
      if (!templateItems.length) throw new Error('This saved meal has no items');

      const mealSessionId = randomUUID();
      const eatenAt = input.eaten_at || new Date().toISOString();
      const rows = templateItems.map((item, index) => ({
        user_id: userId,
        log_date: input.log_date || eatenAt.slice(0, 10),
        meal_type: input.meal_type,
        meal_session_id: mealSessionId,
        food_snapshot: item.food,
        grams: item.grams,
        nutrients: scaleNutrients(item.food.nutrientsPer100g, item.grams),
        meal_source: input.source,
        source_metadata: { externalClientId: clientId },
        idempotency_key: `${input.idempotency_key}:${index}`,
        eaten_at: eatenAt,
      }));
      const inserted = await db.from('meal_entries').insert(rows).select('*');
      if (inserted.error) fail(inserted.error, 'Could not log saved meal');
      return textResult({ created: true, meal_session_id: mealSessionId, items: inserted.data, totals: sumNutrients(inserted.data || []) });
    },
  );

  server.registerTool(
    'list_progress_photos',
    {
      title: 'List progress photos',
      description: 'List progress photos, newest first, with a temporary signed URL for each.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(30) }),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ limit }) => {
      const { data, error } = await db.from('progress_photos').select('*').eq('user_id', userId).order('log_date', { ascending: false }).limit(limit);
      if (error) fail(error, 'Could not list progress photos');
      const photos = await Promise.all(
        (data || []).map(async (row) => {
          const signed = await db.storage.from('progress-photos').createSignedUrl(row.storage_path, 60 * 60 * 24 * 7);
          return { id: row.id, log_date: row.log_date, label: row.label, url: signed.data?.signedUrl || null };
        }),
      );
      return textResult({ photos });
    },
  );

  const imageContentTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  server.registerTool(
    'upload_progress_photo',
    {
      title: 'Upload a progress photo',
      description: 'Upload a base64-encoded progress photo for a date. Only ask for this after the user has explicitly shared or attached the photo.',
      inputSchema: z.object({
        log_date: dateSchema.optional(),
        label: z.string().trim().min(1).max(80).default('Progress'),
        content_type: z.enum(['image/jpeg', 'image/png', 'image/webp']),
        image_base64: z.string().min(100).describe('Raw base64 image data, no data: URI prefix'),
      }),
      annotations: mutationAnnotations,
    },
    async ({ log_date, label, content_type, image_base64 }) => {
      const bytes = Buffer.from(image_base64, 'base64');
      if (bytes.byteLength > 8 * 1024 * 1024) throw new Error('Image is too large (max 8 MB)');
      const date = log_date || todayUtc();
      const id = randomUUID();
      const path = `${userId}/${date}/${id}.${imageContentTypes[content_type]}`;
      const upload = await db.storage.from('progress-photos').upload(path, bytes, { contentType: content_type, upsert: true });
      if (upload.error) fail(upload.error, 'Could not upload photo');
      const inserted = await db.from('progress_photos').insert({ id, user_id: userId, log_date: date, label, storage_path: path }).select('*').single();
      if (inserted.error) fail(inserted.error, 'Could not save photo record');
      const signed = await db.storage.from('progress-photos').createSignedUrl(path, 60 * 60 * 24 * 7);
      return textResult({ created: true, photo: { id, log_date: date, label, url: signed.data?.signedUrl || null } });
    },
  );

  server.registerTool(
    'delete_progress_photo',
    {
      title: 'Delete a progress photo',
      description: 'Permanently delete a progress photo.',
      inputSchema: z.object({ photo_id: z.string().uuid() }),
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
    async ({ photo_id }) => {
      const existing = await db.from('progress_photos').select('storage_path').eq('user_id', userId).eq('id', photo_id).maybeSingle();
      if (existing.error) fail(existing.error, 'Could not look up photo');
      if (!existing.data) return textResult({ deleted: false, photo_id, found: false });
      await db.storage.from('progress-photos').remove([existing.data.storage_path]);
      const deleted = await db.from('progress_photos').delete().eq('user_id', userId).eq('id', photo_id).select('id');
      if (deleted.error) fail(deleted.error, 'Could not delete photo');
      return textResult({ deleted: true, photo_id, found: true });
    },
  );

  return server;
}
