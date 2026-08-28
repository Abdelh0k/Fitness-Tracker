import assert from 'node:assert/strict';
import test from 'node:test';
import { per100g, sumNutrients } from './domain.js';
import { decodeJwtPayload } from './auth.js';
import { createAteformHttpHandler } from './http.js';
import type { AppConfig } from './config.js';

const testConfig: AppConfig = {
  supabaseUrl: 'https://example.supabase.co',
  supabasePublishableKey: 'sb_publishable_test',
  publicUrl: new URL('https://mcp.example.com/mcp'),
  port: 8787,
  allowedOrigins: new Set(['https://chatgpt.com']),
};

test('per100g normalizes portion nutrients', () => {
  assert.deepEqual(per100g({ calories: 250, protein: 20, carbs: 30, fat: 5 }, 250), {
    calories: 100,
    protein: 8,
    carbs: 12,
    fat: 2,
    fiber: undefined,
    sugar: undefined,
  });
});

test('sumNutrients tolerates missing optional values', () => {
  assert.deepEqual(sumNutrients([
    { nutrients: { calories: 200, protein: 10, carbs: 20, fat: 5 } },
    { nutrients: { calories: 100, protein: 5, carbs: 10, fat: 2, fiber: 3 } },
  ]), { calories: 300, protein: 15, carbs: 30, fat: 7, fiber: 3, sugar: 0 });
});

test('decodeJwtPayload reads base64url claims', () => {
  const payload = Buffer.from(JSON.stringify({ exp: 123, client_id: 'test-client' })).toString('base64url');
  assert.deepEqual(decodeJwtPayload(`header.${payload}.signature`), { exp: 123, client_id: 'test-client' });
});

test('MCP endpoint advertises OAuth and rejects anonymous requests', async () => {
  const handler = createAteformHttpHandler(testConfig, {
    async verifyAccessToken() {
      throw new Error('The anonymous request should not reach token verification');
    },
  });
  const metadata = await handler.fetch(new Request('https://mcp.example.com/.well-known/oauth-protected-resource/mcp'));
  assert.equal(metadata.status, 200);
  assert.equal((await metadata.json() as { resource: string }).resource, 'https://mcp.example.com/mcp');

  const anonymous = await handler.fetch(new Request('https://mcp.example.com/mcp', { method: 'POST' }));
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers.get('www-authenticate') || '', /resource_metadata=/);
});
