import { randomUUID } from 'node:crypto';
import { McpServer, type AuthInfo } from '@modelcontextprotocol/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { AppConfig } from './config.js';
import { dateDaysAgo, per100g, sumNutrients, todayUtc, type Nutrients } from './domain.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const sourceSchema = z.enum(['ai_photo', 'ai_text', 'ai_voice', 'import']);
const idempotencySchema = z.string().min(8).max(200).describe('Stable retry key for this logical operation');

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
    'log_cardio',
    {
      title: 'Log cardio',
      description: 'Log a cardio activity such as running, cycling, swimming or walking.',
      inputSchema: z.object({
        log_date: dateSchema.optional(),
        type: z.string().trim().min(1).max(100),
        duration_min: z.number().int().min(0).max(1_440),
        distance_km: z.number().nonnegative().max(1_000).optional(),
        calories: z.number().int().nonnegative().max(20_000).optional(),
        source: sourceSchema.default('ai_text'),
        idempotency_key: idempotencySchema,
      }),
      annotations: mutationAnnotations,
    },
    async (input) => {
      const existing = await db.from('cardio_entries').select('*').eq('user_id', userId).eq('idempotency_key', input.idempotency_key).maybeSingle();
      if (existing.error) fail(existing.error, 'Could not check cardio retry key');
      if (existing.data) return textResult({ created: false, idempotent_replay: true, cardio: existing.data });
      const saved = await db.from('cardio_entries').insert({
        user_id: userId,
        log_date: input.log_date || todayUtc(),
        type: input.type,
        duration_min: input.duration_min,
        distance_km: input.distance_km,
        calories: input.calories,
        entry_source: input.source,
        source_metadata: { externalClientId: clientId },
        idempotency_key: input.idempotency_key,
      }).select('*').single();
      if (saved.error) fail(saved.error, 'Could not log cardio');
      return textResult({ created: true, cardio: saved.data });
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

  return server;
}
