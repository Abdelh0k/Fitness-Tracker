export type AppConfig = {
  supabaseUrl: string;
  supabasePublishableKey: string;
  publicUrl: URL;
  port: number;
  allowedOrigins: Set<string>;
};

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const supabaseUrl = required(env, 'SUPABASE_URL').replace(/\/$/, '');
  const publicUrl = new URL(required(env, 'MCP_PUBLIC_URL'));
  if (publicUrl.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(publicUrl.hostname)) {
    throw new Error('MCP_PUBLIC_URL must use HTTPS outside local development');
  }

  const port = Number(env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');

  const allowedOrigins = new Set(
    (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  allowedOrigins.add(publicUrl.origin);

  return {
    supabaseUrl,
    supabasePublishableKey: required(env, 'SUPABASE_PUBLISHABLE_KEY'),
    publicUrl,
    port,
    allowedOrigins,
  };
}
